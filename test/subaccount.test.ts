/**
 * Subaccount derivation and re-encryption.
 *
 * The expected seeds are recomputed here from scratch with `node:crypto`, so this
 * suite pins the *spec* (`SHA256(SHA256(utf8(label)) || seed)`) rather than the
 * implementation. Differential parity against the Go binary is M7 and is not
 * covered here.
 */

import { createHash } from 'node:crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  PassphraseRequiredError,
  SUBACCOUNT_KDF_ROUNDS,
  buildSubaccountReport,
  deriveSubaccountSeed,
  isUnprotectedKey,
  marshalOpenSSHEd25519Key,
  parseEncryptedOpenSSHKey,
} from '../src/index.js';
import { GOLDEN, GOLDEN_SEED_00_TO_1F, SUBACCOUNT_GOLDEN, SUBACCOUNT_SEEDS } from './golden/goldens.js';

/** Independent implementation of the Go derivation, via node:crypto. */
function expectedSeed(seed: Uint8Array, label: string): string {
  const labelHash = createHash('sha256').update(Buffer.from(label, 'utf8')).digest();
  return createHash('sha256').update(Buffer.concat([labelHash, Buffer.from(seed)])).digest('hex');
}

describe('deriveSubaccountSeed', () => {
  it('matches the independently computed vectors', () => {
    for (const [label, hex] of Object.entries(SUBACCOUNT_SEEDS)) {
      expect(bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, label))).toBe(hex);
      expect(bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, label))).toBe(
        expectedSeed(GOLDEN_SEED_00_TO_1F, label),
      );
    }
  });

  it('returns the source seed unchanged for an empty label', () => {
    const seed = deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, '');
    expect(bytesToHex(seed)).toBe(bytesToHex(GOLDEN_SEED_00_TO_1F));
  });

  it('is deterministic and label-sensitive', () => {
    const a = bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, 'alice'));
    const b = bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, 'alice'));
    const c = bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, 'alice '));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('hashes the label as UTF-8 bytes, not as a normalized form', () => {
    // 'é' as one code point (U+00E9) vs 'e' + combining acute (U+0065 U+0301).
    const composed = bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, 'caf\u00e9'));
    const decomposed = bytesToHex(deriveSubaccountSeed(GOLDEN_SEED_00_TO_1F, 'cafe\u0301'));
    expect(composed).toBe(expectedSeed(GOLDEN_SEED_00_TO_1F, 'caf\u00e9'));
    expect(decomposed).toBe(expectedSeed(GOLDEN_SEED_00_TO_1F, 'cafe\u0301'));
    expect(composed).not.toBe(decomposed);
  });

  it('rejects a seed that is not 32 bytes', () => {
    expect(() => deriveSubaccountSeed(new Uint8Array(31), 'alice')).toThrow(/32-byte Ed25519 seed/);
  });
});

describe('buildSubaccountReport', () => {
  const PASSPHRASE = 'test-passphrase';

  it('builds the report from the subaccount seed', () => {
    const { report, seed } = buildSubaccountReport({
      seed: GOLDEN_SEED_00_TO_1F,
      label: SUBACCOUNT_GOLDEN.label,
      passphrase: PASSPHRASE,
    });
    expect(bytesToHex(seed)).toBe(SUBACCOUNT_GOLDEN.seedHex);
    expect(report.seedHex).toBe(SUBACCOUNT_GOLDEN.seedHex);
    expect(report.mnemonic24).toBe(SUBACCOUNT_GOLDEN.mnemonic24);
    expect(report.npub).toBe(SUBACCOUNT_GOLDEN.npub);
    expect(report.pubKeyHex).toBe(SUBACCOUNT_GOLDEN.pubKeyHex);
    expect(report.addresses).toHaveLength(30);
    expect(report.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it('derives a different identity from the source key', () => {
    const { report } = buildSubaccountReport({
      seed: GOLDEN_SEED_00_TO_1F,
      label: 'alice',
      passphrase: PASSPHRASE,
    });
    expect(report.mnemonic24).not.toBe(GOLDEN.mnemonic24);
    expect(report.npub).not.toBe(GOLDEN.npub);
    expect(report.addresses[0]?.address).not.toBe(GOLDEN.bitcoin);
  });

  it('re-encodes the subaccount key with the source passphrase at rounds 1', () => {
    const { pem, keyBodyB64, seed } = buildSubaccountReport({
      seed: GOLDEN_SEED_00_TO_1F,
      label: 'alice',
      passphrase: PASSPHRASE,
    });
    expect(isUnprotectedKey(pem)).toBe(false);
    expect(pem.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);

    const parsed = parseEncryptedOpenSSHKey(pem, PASSPHRASE);
    expect(bytesToHex(parsed.seed)).toBe(bytesToHex(seed));
    expect(parsed.keyBodyB64).toBe(keyBodyB64);

    // The bcrypt round count is in the kdfoptions blob; rounds = 1 is meltify's
    // subaccount choice, so the key body must differ from a rounds-16 marshal of
    // the same seed.
    const rounds16 = marshalOpenSSHEd25519Key(seed, PASSPHRASE, { rounds: 16 });
    expect(rounds16.keyBodyB64).not.toBe(keyBodyB64);
    expect(SUBACCOUNT_KDF_ROUNDS).toBe(1);
  });

  it('produces a different key body each run (fresh salt and check bytes)', () => {
    const first = buildSubaccountReport({
      seed: GOLDEN_SEED_00_TO_1F,
      label: 'alice',
      passphrase: PASSPHRASE,
    });
    const second = buildSubaccountReport({
      seed: GOLDEN_SEED_00_TO_1F,
      label: 'alice',
      passphrase: PASSPHRASE,
    });
    expect(first.keyBodyB64).not.toBe(second.keyBodyB64);
    // ...while the identity itself is stable.
    expect(first.report.seedHex).toBe(second.report.seedHex);
    expect(first.report.npub).toBe(second.report.npub);
  });

  it('honours fixed marshalling randomness for deterministic fixtures', () => {
    const options = {
      checkBytes: Uint8Array.from([1, 2, 3, 4]),
      salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    };
    const run = () =>
      buildSubaccountReport({
        seed: GOLDEN_SEED_00_TO_1F,
        label: 'alice',
        passphrase: PASSPHRASE,
        marshal: options,
      });
    expect(run().keyBodyB64).toBe(run().keyBodyB64);

    // With the salt fixed, the kdfoptions blob is `string(salt) || uint32(rounds)`,
    // so the container must carry exactly `salt ... 00 00 00 01`.
    const der = Buffer.from(run().keyBodyB64, 'base64');
    const saltAt = der.indexOf(Buffer.from(options.salt));
    expect(saltAt).toBeGreaterThan(-1);
    expect(der.readUInt32BE(saltAt + options.salt.length)).toBe(1);
  });

  it('requires a passphrase, like meltify', () => {
    expect(() =>
      buildSubaccountReport({ seed: GOLDEN_SEED_00_TO_1F, label: 'alice', passphrase: '' }),
    ).toThrow(PassphraseRequiredError);
  });

  it('rejects an empty label rather than silently returning the source key', () => {
    expect(() =>
      buildSubaccountReport({ seed: GOLDEN_SEED_00_TO_1F, label: '', passphrase: PASSPHRASE }),
    ).toThrow(/empty label/);
  });
});
