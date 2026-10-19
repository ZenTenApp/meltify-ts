/**
 * OpenSSH private-key marshalling.
 *
 * Needed to re-encrypt a derived subaccount key with the source passphrase, and
 * to build deterministic encrypted fixtures in tests. The wire layout matches
 * `ssh.MarshalPrivateKeyWithPassphrase`, except the bcrypt round count is
 * caller-controlled (meltify forces rounds = 1 for subaccounts).
 */

import { ctr } from '@noble/ciphers/aes.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base64 } from '@scure/base';
import { concatBytes } from '../bytes.js';
import { bcryptPbkdf } from '../crypto/bcrypt-pbkdf.js';
import { KeyParseError } from '../errors.js';
import { sshEd25519PublicKeyBlob, sshString, sshStringUtf8, uint32BE } from './wire.js';

const AUTH_MAGIC = 'openssh-key-v1\0';
const AES_BLOCK_SIZE = 16;
const AES_KEY_SIZE = 32;
const SALT_SIZE = 16;

export interface MarshalOptions {
  /** bcrypt KDF rounds. OpenSSH's own default is 16; meltify uses 1 for subaccounts. */
  rounds?: number;
  comment?: string;
  /** Source of randomness; defaults to a WebCrypto/Node-compatible getRandomValues. */
  rng?: (length: number) => Uint8Array;
  /** Fixed 4-byte OpenSSH check value (tests only). */
  checkBytes?: Uint8Array;
  /** Fixed 16-byte bcrypt salt (tests only). */
  salt?: Uint8Array;
}

function defaultRng(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } })
    .crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new MeltifyRandomnessError();
  }
  cryptoObj.getRandomValues(out);
  return out;
}

export class MeltifyRandomnessError extends Error {
  constructor() {
    super('no secure random source available (expected globalThis.crypto.getRandomValues)');
    this.name = 'MeltifyRandomnessError';
  }
}

function pad(block: Uint8Array, blockSize: number): Uint8Array {
  // Mirrors generateOpenSSHPaddingForKDF: append byte 1..n until aligned, and
  // append nothing when already aligned.
  const padLen = (blockSize - (block.length % blockSize)) % blockSize;
  const out = new Uint8Array(block.length + padLen);
  out.set(block);
  for (let i = 0; i < padLen; i++) out[block.length + i] = i + 1;
  return out;
}

export interface MarshalledOpenSSHKey {
  /** Full armored PEM text. */
  pem: string;
  /** Raw `openssh-key-v1` body bytes. */
  der: Uint8Array;
  /** Base64 of `der`, i.e. what meltify prints in the private-key block. */
  keyBodyB64: string;
}

/**
 * Marshals a 32-byte Ed25519 seed as a password-protected OpenSSH private key.
 */
export function marshalOpenSSHEd25519Key(
  seed: Uint8Array,
  passphrase: string,
  options: MarshalOptions = {},
): MarshalledOpenSSHKey {
  if (seed.length !== 32) {
    throw new KeyParseError(`expected a 32-byte Ed25519 seed, got ${seed.length}`);
  }
  if (passphrase.length === 0) {
    throw new KeyParseError('passphrase is required to marshal an encrypted key');
  }
  const rounds = options.rounds ?? 16;
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new KeyParseError(`bcrypt rounds must be at least 1, got ${rounds}`);
  }
  const rng = options.rng ?? defaultRng;
  const comment = options.comment ?? '';
  const check = options.checkBytes ?? rng(4);
  const salt = options.salt ?? rng(SALT_SIZE);
  if (check.length !== 4) throw new KeyParseError('checkBytes must be 4 bytes');
  if (salt.length !== SALT_SIZE) throw new KeyParseError(`salt must be ${SALT_SIZE} bytes`);

  const publicKey = ed25519.getPublicKey(seed);
  const privateKey = concatBytes(seed, publicKey);

  const privateBlock = concatBytes(
    uint32BE(((check[0]! << 24) | (check[1]! << 16) | (check[2]! << 8) | check[3]!) >>> 0),
    uint32BE(((check[0]! << 24) | (check[1]! << 16) | (check[2]! << 8) | check[3]!) >>> 0),
    sshStringUtf8('ssh-ed25519'),
    sshString(publicKey),
    sshString(privateKey),
    sshStringUtf8(comment),
  );
  const paddedBlock = pad(privateBlock, AES_BLOCK_SIZE);

  const derived = bcryptPbkdf(
    utf8ToBytes(passphrase),
    salt,
    rounds,
    AES_KEY_SIZE + AES_BLOCK_SIZE,
  );
  const encrypted = ctr(derived.subarray(0, AES_KEY_SIZE), derived.subarray(AES_KEY_SIZE)).encrypt(
    paddedBlock,
  );

  const kdfOptions = concatBytes(sshString(salt), uint32BE(rounds));
  const publicKeyBlob = sshEd25519PublicKeyBlob(publicKey);

  const der = concatBytes(
    utf8ToBytes(AUTH_MAGIC),
    sshStringUtf8('aes256-ctr'),
    sshStringUtf8('bcrypt'),
    sshString(kdfOptions),
    uint32BE(1),
    sshString(publicKeyBlob),
    sshString(encrypted),
  );

  const b64 = base64.encode(der);
  const wrapped = b64.match(/.{1,70}/g)?.join('\n') ?? b64;
  const pem = `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrapped}\n-----END OPENSSH PRIVATE KEY-----\n`;
  return { pem, der, keyBodyB64: b64 };
}
