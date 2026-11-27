import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  decodeOpenSSHPem,
  isUnprotectedKey,
  inspectOpenSSHKey,
  parseEncryptedOpenSSHKey,
  sshFingerprintSha256,
} from '../src/core/ssh/parse.js';
import { UnsupportedKdfRoundsError } from '../src/core/errors.js';
import { base64 } from '@scure/base';
import { marshalOpenSSHEd25519Key } from '../src/core/ssh/marshal.js';
import { ed25519 } from '@noble/curves/ed25519.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('OpenSSH parsing', () => {
  it('parses a real ssh-keygen aes256-ctr/bcrypt key (rounds 16)', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8');
    const parsed = parseEncryptedOpenSSHKey(pem, 'test-passphrase');
    expect(parsed.seed).toHaveLength(32);
    expect(parsed.rounds).toBe(16);
    expect(parsed.cipher).toBe('aes256-ctr');
    expect(parsed.kdf).toBe('bcrypt');
    // The public key blob embedded in the container must match the seed.
    const expected = ed25519.getPublicKey(parsed.seed);
    expect(sshFingerprintSha256(parsed.publicKeyBlob)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(parsed.publicKeyBlob).toHaveLength(4 + 11 + 4 + 32);
    expect(parsed.publicKeyBlob.slice(-32)).toEqual(expected);
  });

  it('parses a rounds=1 fixture', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_a1'), 'utf8');
    const parsed = parseEncryptedOpenSSHKey(pem, 'test-passphrase');
    expect(parsed.rounds).toBe(1);
    expect(parsed.seed).toHaveLength(32);
  });

  it('detects protected vs unprotected keys without a passphrase', () => {
    expect(isUnprotectedKey(readFileSync(join(here, 'fixtures/id_ed25519_open'), 'utf8'))).toBe(true);
    expect(isUnprotectedKey(readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8'))).toBe(false);
  });

  it('inspects a key without its passphrase', () => {
    const protectedKey = inspectOpenSSHKey(readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8'));
    expect(protectedKey).toEqual({
      cipher: 'aes256-ctr',
      kdf: 'bcrypt',
      keyType: 'ssh-ed25519',
      protected: true,
    });
    expect(inspectOpenSSHKey(readFileSync(join(here, 'fixtures/id_ed25519_open'), 'utf8'))).toMatchObject({
      keyType: 'ssh-ed25519',
      protected: false,
    });
    expect(inspectOpenSSHKey(readFileSync(join(here, 'fixtures/id_rsa_protected'), 'utf8')).keyType).toBe(
      'ssh-rsa',
    );
    expect(() => inspectOpenSSHKey('not a key')).toThrow(/no OpenSSH private key/);
  });

  it('rejects unprotected keys', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_open'), 'utf8');
    expect(() => parseEncryptedOpenSSHKey(pem, 'whatever')).toThrow(/not password-protected/);
  });

  it('rejects a wrong passphrase', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8');
    expect(() => parseEncryptedOpenSSHKey(pem, 'wrong')).toThrow(/incorrect passphrase|corrupted/);
  });

  it('rejects an empty passphrase', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8');
    expect(() => parseEncryptedOpenSSHKey(pem, '')).toThrow(/passphrase is required/);
  });

  it('rejects garbage', () => {
    expect(() => parseEncryptedOpenSSHKey('not a key', 'x')).toThrow(/no OpenSSH private key/);
  });

  it('rejects RSA keys as unsupported', () => {
    const pem = readFileSync(join(here, 'fixtures/id_rsa_protected'), 'utf8');
    expect(() => parseEncryptedOpenSSHKey(pem, 'test-passphrase')).toThrow(/only Ed25519/);
  });

  it('round-trips a deterministic marshalled key', () => {
    const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
    const check = Uint8Array.from([1, 2, 3, 4]);
    const salt = Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i);
    const marshalled = marshalOpenSSHEd25519Key(seed, 'test-passphrase', {
      rounds: 1,
      checkBytes: check,
      salt,
      comment: 'roundtrip',
    });
    const parsed = parseEncryptedOpenSSHKey(marshalled.pem, 'test-passphrase');
    expect(parsed.seed).toEqual(seed);
    expect(parsed.comment).toBe('roundtrip');
    expect(parsed.rounds).toBe(1);
    expect(parsed.keyBodyB64).toBe(marshalled.keyBodyB64);
  });
});

describe('PEM normalisation', () => {
  it('re-encodes the decoded body canonically, matching Go pem.Decode + StdEncoding', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8');
    const parsed = parseEncryptedOpenSSHKey(pem, 'test-passphrase');
    const body = pem
      .replace('-----BEGIN OPENSSH PRIVATE KEY-----', '')
      .replace('-----END OPENSSH PRIVATE KEY-----', '')
      .replace(/\s+/g, '');
    expect(parsed.keyBodyB64).toBe(body);
  });

  it('accepts keys with non-standard line wrapping', () => {
    const pem = readFileSync(join(here, 'fixtures/id_ed25519_a1'), 'utf8');
    const body = pem
      .replace('-----BEGIN OPENSSH PRIVATE KEY-----', '')
      .replace('-----END OPENSSH PRIVATE KEY-----', '')
      .replace(/\s+/g, '');
    const rewrapped = `-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n-----END OPENSSH PRIVATE KEY-----\n`;
    const parsed = parseEncryptedOpenSSHKey(rewrapped, 'test-passphrase');
    expect(parsed.rounds).toBe(1);
    expect(parsed.seed).toHaveLength(32);
  });
});

/**
 * Rewrites the declared bcrypt rounds in an armored key without re-running the
 * KDF, so tests can build a hostile key (e.g. 2^32-1 rounds) instantly. The
 * container layout is: magic, cipher string, kdf string ("bcrypt"), then the
 * kdfoptions string = salt string (4 + 16 bytes) followed by the u32 rounds.
 */
function withDeclaredRounds(pem: string, rounds: number): string {
  const der = decodeOpenSSHPem(pem).der.slice();
  const kdfName = new TextEncoder().encode('bcrypt');
  const at = der.findIndex((_, i) => kdfName.every((b, j) => der[i + j] === b));
  if (at < 0) throw new Error('fixture has no bcrypt kdf');
  // kdf name, then u32 kdfoptions length, then u32 salt length + 16-byte salt.
  const roundsOffset = at + kdfName.length + 4 + 4 + 16;
  new DataView(der.buffer).setUint32(roundsOffset, rounds);
  const body = base64.encode(der).match(/.{1,70}/g)!.join('\n');
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

describe('bcrypt rounds bounds (opt-in)', () => {
  const a16 = readFileSync(join(here, 'fixtures/id_ed25519_a16'), 'utf8');
  const a1 = readFileSync(join(here, 'fixtures/id_ed25519_a1'), 'utf8');

  it('accepts any rounds when no range is given, as meltify does', () => {
    expect(parseEncryptedOpenSSHKey(a1, 'test-passphrase').rounds).toBe(1);
  });

  it('accepts a key at the inclusive edges of the range', () => {
    expect(parseEncryptedOpenSSHKey(a16, 'test-passphrase', { rounds: { min: 16, max: 16 } }).rounds).toBe(16);
  });

  it('rejects a key below the range and reports the declared count', () => {
    const attempt = () => parseEncryptedOpenSSHKey(a16, 'test-passphrase', { rounds: { min: 128, max: 8192 } });
    expect(attempt).toThrow(UnsupportedKdfRoundsError);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ code: 'unsupported-kdf-rounds', declaredRounds: 16, minRounds: 128, maxRounds: 8192 });
    }
  });

  it('rejects a key above the range before running bcrypt', () => {
    // 2^32-1 rounds would take days inside bcrypt; finishing at all proves the
    // check runs on header metadata first.
    const hostile = withDeclaredRounds(a16, 0xffffffff);
    expect(() =>
      parseEncryptedOpenSSHKey(hostile, 'test-passphrase', { rounds: { min: 128, max: 8192 } }),
    ).toThrow(UnsupportedKdfRoundsError);
  });

  it('checks the range before the passphrase', () => {
    // A wrong passphrase must still produce the rounds error, not a decryption error.
    expect(() => parseEncryptedOpenSSHKey(a16, 'wrong', { rounds: { min: 128, max: 8192 } })).toThrow(
      UnsupportedKdfRoundsError,
    );
  });

  it.each([
    { min: 0, max: 10 },
    { min: 10, max: 9 },
    { min: 1.5, max: 10 },
  ])('rejects an invalid range $min..$max', (range) => {
    expect(() => parseEncryptedOpenSSHKey(a16, 'test-passphrase', { rounds: range })).toThrow(RangeError);
  });
});
