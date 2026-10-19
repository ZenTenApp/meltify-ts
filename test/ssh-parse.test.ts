import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isUnprotectedKey, parseEncryptedOpenSSHKey, sshFingerprintSha256 } from '../src/core/ssh/parse.js';
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
