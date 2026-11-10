import { describe, it, expect } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils.js';
import { GOLDEN, GOLDEN_SEED_00_TO_1F } from './golden/goldens.js';
import { marshalOpenSSHEd25519Key } from '../src/core/ssh/marshal.js';
import { parseEncryptedOpenSSHKey } from '../src/core/ssh/parse.js';
import { buildIdentityReport } from '../src/core/report.js';
import { buildSubaccountReport } from '../src/core/subaccount.js';
import { seedFromMnemonic } from '../src/core/derive/bip39.js';
import type { LabeledAddress } from '../src/core/derive/addresses.js';

/**
 * The optional BIP39 passphrase (the "25th word") is a site requirement, but it
 * lives in the core so the site does not have to re-implement the derivation.
 *
 * Two things are worth pinning: the PBKDF2 step itself against the official
 * BIP39 vector (non-circular), and the blast radius of the passphrase — which
 * values move and which cannot.
 */

const BIP39_VECTOR = {
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  passphrase: 'TREZOR',
  seed: 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
};

const PASSPHRASE = 'test-bip39-passphrase';

function reportFor(bip39Passphrase: string) {
  const key = marshalOpenSSHEd25519Key(GOLDEN_SEED_00_TO_1F, 'test-passphrase', {
    rounds: 1,
    checkBytes: Uint8Array.from([0x01, 0x02, 0x03, 0x04]),
    salt: Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i),
    comment: 'meltify-ts deterministic fixture',
  });
  const parsed = parseEncryptedOpenSSHKey(key.pem, 'test-passphrase');
  return buildIdentityReport({
    seed: parsed.seed,
    keyBodyB64: parsed.keyBodyB64,
    bip39Passphrase,
  });
}

const addressOf = (
  report: { readonly addresses: readonly LabeledAddress[] },
  label: string,
): string | undefined => report.addresses.find((entry) => entry.label === label)?.address;

describe('BIP39 passphrase', () => {
  it('matches the official BIP39 PBKDF2 vector', () => {
    expect(bytesToHex(seedFromMnemonic(BIP39_VECTOR.mnemonic, BIP39_VECTOR.passphrase))).toBe(
      BIP39_VECTOR.seed,
    );
  });

  it('defaults to no passphrase, matching the Go goldens', () => {
    const omitted = reportFor('');
    expect(omitted.npub).toBe(GOLDEN.npub);
    expect(omitted.nsec).toBe(GOLDEN.nsec);
    expect(addressOf(omitted, 'bitcoin')).toBe(GOLDEN.bitcoin);
    expect(addressOf(omitted, 'ethereum')).toBe(GOLDEN.ethereum);
  });

  it('moves every BIP39-seeded value', () => {
    const plain = reportFor('');
    const withPass = reportFor(PASSPHRASE);

    expect(withPass.npub).not.toBe(plain.npub);
    expect(withPass.nsec).not.toBe(plain.nsec);
    expect(withPass.pubKeyHex).not.toBe(plain.pubKeyHex);
    expect(withPass.privKeyHex).not.toBe(plain.privKeyHex);
    expect(withPass.publicKeyLine).not.toBe(plain.publicKeyLine);

    const bip39Labels = [
      'bitcoin',
      'bitcoincash',
      'litecoin',
      'dogecoin',
      'silentpayment',
      'ethereum',
      'cosmos',
      'xrpl',
      'stellar',
      'solana',
      'sui',
      'ton',
      'tron',
    ];
    for (const label of bip39Labels) {
      expect(addressOf(withPass, label), label).not.toBe(addressOf(plain, label));
    }
  });

  it('leaves the seed, phrases, SSH key and CryptoNote rows untouched', () => {
    const plain = reportFor('');
    const withPass = reportFor(PASSPHRASE);

    expect(withPass.seedHex).toBe(plain.seedHex);
    expect(withPass.mnemonic24).toBe(plain.mnemonic24);
    expect(withPass.legacyPhrase).toBe(plain.legacyPhrase);
    expect(withPass.privateKeyBlock).toBe(plain.privateKeyBlock);
    expect(withPass.fingerprint).toBe(plain.fingerprint);
    expect(withPass.bchat).toBe(plain.bchat);
    expect(withPass.bchat).toBe(GOLDEN.bchat);
    expect(addressOf(withPass, 'monero')).toBe(GOLDEN.moneroLegacyPrimary);
    expect(addressOf(withPass, 'beldex')).toBe(GOLDEN.beldexLegacyPrimary);
  });

  it('is deterministic and pinned', () => {
    const a = reportFor(PASSPHRASE);
    const b = reportFor(PASSPHRASE);
    expect(a).toEqual(b);
    expect(a.npub).toBe('npub15hyfawanrteamgq3ppxwcgm0hwvm7tcg0e6glwwr6q4n0xmz9tvqvnhe0m');
    expect(addressOf(a, 'bitcoin')).toBe('bc1q74taletqe9dvsgu994tqrs3gxtka0r7qyxq2nt');
    expect(addressOf(a, 'ethereum')).toBe('0x457628d9FB2D0E1278375adf49c471B691e10580');
  });

  it('treats distinct passphrases as distinct derivations', () => {
    expect(reportFor('a').npub).not.toBe(reportFor('A').npub);
    // Trailing spaces are part of the passphrase, per BIP39.
    expect(reportFor('a').npub).not.toBe(reportFor('a ').npub);
  });

  it('carries through to subaccount reports', () => {
    const key = marshalOpenSSHEd25519Key(GOLDEN_SEED_00_TO_1F, 'test-passphrase', {
      rounds: 1,
      checkBytes: Uint8Array.from([0x01, 0x02, 0x03, 0x04]),
      salt: Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i),
    });
    const parsed = parseEncryptedOpenSSHKey(key.pem, 'test-passphrase');
    const withoutPass = buildSubaccountReport({
      seed: parsed.seed,
      label: 'alice',
      passphrase: 'test-passphrase',
      marshal: {
        checkBytes: Uint8Array.from([0x01, 0x02, 0x03, 0x04]),
        salt: Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i),
      },
    });
    const withPass = buildSubaccountReport({
      seed: parsed.seed,
      label: 'alice',
      passphrase: 'test-passphrase',
      bip39Passphrase: PASSPHRASE,
      marshal: {
        checkBytes: Uint8Array.from([0x01, 0x02, 0x03, 0x04]),
        salt: Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i),
      },
    });

    // The subaccount seed and key are decided before BIP39 gets involved.
    expect(bytesToHex(withPass.seed)).toBe(bytesToHex(withoutPass.seed));
    expect(withPass.pem).toBe(withoutPass.pem);
    expect(withPass.report.mnemonic24).toBe(withoutPass.report.mnemonic24);
    expect(withPass.report.npub).not.toBe(withoutPass.report.npub);
    expect(addressOf(withPass.report, 'bitcoin')).not.toBe(addressOf(withoutPass.report, 'bitcoin'));
  });
});
