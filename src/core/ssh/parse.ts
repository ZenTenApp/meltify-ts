/**
 * OpenSSH private-key parsing.
 *
 * Supports the modern `openssh-key-v1` container with either an unencrypted
 * (`none`) or aes256-ctr/bcrypt private section. meltify requires a
 * password-protected key, so unencrypted keys are rejected with the same
 * semantics as the Go implementation: parse without a passphrase first, and if
 * that succeeds the key is unprotected.
 */

import { ctr } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base64, base64nopad } from '@scure/base';
import { bytesEqual, bytesToUtf8 } from '../bytes.js';
import { bcryptPbkdf } from '../crypto/bcrypt-pbkdf.js';
import {
  KeyNotPasswordProtectedError,
  KeyParseError,
  MeltifyError,
  PassphraseRequiredError,
  UnsupportedKeyTypeError,
} from '../errors.js';
import { SshReader } from './wire.js';

const AUTH_MAGIC = 'openssh-key-v1\0';
const CIPHER_NONE = 'none';
const CIPHER_AES256CTR = 'aes256-ctr';
const KDF_BCRYPT = 'bcrypt';
const AES_BLOCK_SIZE = 16;
const AES_KEY_SIZE = 32;
const BCRYPT_SALT_SIZE = 16;

export interface ParsedOpenSSHKey {
  /** The 32-byte Ed25519 seed. */
  seed: Uint8Array;
  /** Base64 of the decoded PEM body; exactly what meltify prints in its first block. */
  keyBodyB64: string;
  comment: string;
  cipher: string;
  kdf: string;
  /** bcrypt rounds, or 0 for an unencrypted key. */
  rounds: number;
  /** The SSH wire-format public key blob. */
  publicKeyBlob: Uint8Array;
}

/** Decodes an armored OpenSSH private key into its raw `openssh-key-v1` body. */
export function decodeOpenSSHPem(input: string | Uint8Array): { der: Uint8Array; b64: string } {
  const text = typeof input === 'string' ? input : bytesToUtf8(input);
  const match = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)-----END OPENSSH PRIVATE KEY-----/.exec(
    text,
  );
  if (!match) {
    throw new KeyParseError('could not parse key: no OpenSSH private key PEM block found');
  }
  const b64 = match[1]!.replace(/\s+/g, '');
  let der: Uint8Array;
  try {
    der = base64.decode(b64);
  } catch (cause) {
    throw new KeyParseError('could not parse key: invalid base64 in OpenSSH PEM block', { cause });
  }
  // Go re-encodes the decoded block with StdEncoding, so normalise rather than
  // trusting the input's line wrapping.
  return { der, b64: base64.encode(der) };
}

interface OuterContainer {
  cipher: string;
  kdf: string;
  kdfOptions: Uint8Array;
  publicKeyBlob: Uint8Array;
  privateSection: Uint8Array;
}

function readContainer(der: Uint8Array): OuterContainer {
  const reader = new SshReader(der);
  const magic = bytesToUtf8(reader.bytes(AUTH_MAGIC.length));
  if (magic !== AUTH_MAGIC) {
    throw new KeyParseError('could not parse key: not an openssh-key-v1 container');
  }
  const cipher = bytesToUtf8(reader.string());
  const kdf = bytesToUtf8(reader.string());
  const kdfOptions = reader.string();
  const numKeys = reader.u32();
  if (numKeys !== 1) {
    throw new KeyParseError(`could not parse key: expected 1 key, found ${numKeys}`);
  }
  const publicKeyBlob = reader.string();
  const privateSection = reader.string();
  return { cipher, kdf, kdfOptions, publicKeyBlob, privateSection };
}

interface PrivateSection {
  seed: Uint8Array;
  comment: string;
  publicKey: Uint8Array;
  keyType: string;
}

function parsePrivateSection(plain: Uint8Array): PrivateSection {
  const reader = new SshReader(plain);
  const check1 = reader.u32();
  const check2 = reader.u32();
  if (check1 !== check2) {
    throw new KeyParseError(
      'could not parse key with passphrase: incorrect passphrase or corrupted key',
    );
  }
  const keyType = bytesToUtf8(reader.string());
  if (keyType !== 'ssh-ed25519') {
    const detail = keyType === 'ssh-rsa' ? ' (RSA keys are not supported by meltify)' : '';
    throw new UnsupportedKeyTypeError(
      `only Ed25519 SSH keys are supported (got ${keyType})${detail}`,
    );
  }
  const publicKey = reader.string();
  const privateKey = reader.string();
  const comment = bytesToUtf8(reader.string());
  const padding = reader.rest();
  for (let i = 0; i < padding.length; i++) {
    if (padding[i] !== ((i + 1) & 0xff)) {
      throw new KeyParseError('could not parse key: invalid OpenSSH padding');
    }
  }
  if (publicKey.length !== 32 || privateKey.length !== 64) {
    throw new KeyParseError(
      `could not parse key: unexpected Ed25519 key sizes (public ${publicKey.length}, private ${privateKey.length})`,
    );
  }
  const seed = privateKey.slice(0, 32);
  if (!bytesEqual(privateKey.subarray(32), publicKey)) {
    throw new KeyParseError('could not parse key: Ed25519 public key does not match private key');
  }
  return { seed, comment, publicKey: Uint8Array.from(publicKey), keyType };
}

function decryptPrivateSection(
  container: OuterContainer,
  passphrase: string,
): { seed: Uint8Array; comment: string; publicKey: Uint8Array; keyType: string } {
  const opts = new SshReader(container.kdfOptions);
  const salt = opts.string();
  const rounds = opts.u32();
  if (salt.length !== BCRYPT_SALT_SIZE) {
    throw new KeyParseError(`could not parse key: unexpected bcrypt salt length ${salt.length}`);
  }
  const key = bcryptPbkdf(
    utf8ToBytes(passphrase),
    salt,
    rounds,
    AES_KEY_SIZE + AES_BLOCK_SIZE,
  );
  const aesKey = key.subarray(0, AES_KEY_SIZE);
  const iv = key.subarray(AES_KEY_SIZE, AES_KEY_SIZE + AES_BLOCK_SIZE);
  let plain: Uint8Array;
  try {
    plain = ctr(aesKey, iv).decrypt(container.privateSection);
  } catch (cause) {
    throw new KeyParseError('could not parse key with passphrase: decryption failed', { cause });
  }
  return parsePrivateSection(plain);
}

/**
 * Returns true when the armored key is unencrypted.
 *
 * Mirrors meltify's `rejectUnprotectedKey`: it does not need a passphrase to
 * decide, and it throws for malformed keys instead of guessing.
 */
export function isUnprotectedKey(input: string | Uint8Array): boolean {
  const { der } = decodeOpenSSHPem(input);
  return readContainer(der).cipher === CIPHER_NONE;
}

/**
 * Parses a password-protected Ed25519 OpenSSH private key.
 *
 * Throws `KeyNotPasswordProtectedError` for unencrypted keys,
 * `PassphraseRequiredError` for an empty passphrase, and `KeyParseError` for
 * wrong passphrases or malformed input.
 */
export function parseEncryptedOpenSSHKey(
  input: string | Uint8Array,
  passphrase: string,
): ParsedOpenSSHKey {
  const { der, b64 } = decodeOpenSSHPem(input);
  const container = readContainer(der);

  if (container.cipher === CIPHER_NONE) {
    throw new KeyNotPasswordProtectedError();
  }
  if (passphrase.length === 0) {
    throw new PassphraseRequiredError();
  }
  if (container.cipher !== CIPHER_AES256CTR || container.kdf !== KDF_BCRYPT) {
    throw new MeltifyError(
      'key-parse',
      `could not parse key: unsupported cipher/kdf ${container.cipher}/${container.kdf}`,
    );
  }

  const opts = new SshReader(container.kdfOptions);
  opts.string();
  const rounds = opts.u32();

  const parsed = decryptPrivateSection(container, passphrase);
  return {
    seed: parsed.seed,
    keyBodyB64: b64,
    comment: parsed.comment,
    cipher: container.cipher,
    kdf: container.kdf,
    rounds,
    publicKeyBlob: container.publicKeyBlob,
  };
}

/** OpenSSH SHA256 fingerprint: "SHA256:" + unpadded base64 of SHA-256(blob). */
export function sshFingerprintSha256(publicKeyBlob: Uint8Array): string {
  return `SHA256:${base64nopad.encode(sha256(publicKeyBlob))}`;
}
