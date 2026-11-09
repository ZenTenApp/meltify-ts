/**
 * `meltify-monero` parity: subaddresses, the Unstoppable/Cake section, and the
 * byte-exact terminal layout.
 *
 * Goldens come from the Go reference (`internal/derive/golden.go`) and, for the
 * rendered text, from running the built Go binary on a key with seed 00..1f
 * under `NO_COLOR=1` — `test/golden/monero-reference.txt` is that output
 * verbatim, so the renderer is diffed against the binary, not against itself.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex } from '@noble/hashes/utils.js';
import { GOLDEN, GOLDEN_SEED_00_TO_1F } from './golden/goldens.js';
import {
  DEFAULT_SUBADDRESS_COUNT,
  MONERO_PRIMARY_PREFIX,
  MONERO_SUBADDRESS_PREFIX,
  beldexAddressesFromLegacy,
  cryptonoteSubaddressFromLegacy,
  decodeLegacyMnemonic,
  moneroAddressFromLegacy,
  moneroAddressesFromLegacy,
} from '../src/core/derive/legacy.js';
import { cakeLegacyPhraseFromMnemonic, cakeSpendKeyFromMnemonic } from '../src/core/derive/cake.js';
import { buildMoneroReport } from '../src/core/monero-report.js';
import { renderMoneroText } from '../src/render/monero-text.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('Monero subaddresses', () => {
  it('derives the (0,1) subaddress pinned by the Go suite', () => {
    const monero = moneroAddressesFromLegacy(GOLDEN.legacy25);
    expect(monero.primary).toBe(GOLDEN.moneroLegacyPrimary);
    expect(monero.subaddresses).toHaveLength(DEFAULT_SUBADDRESS_COUNT);
    expect(monero.subaddresses[0]).toBe(GOLDEN.moneroLegacySub0);
  });

  it('derives the Beldex (0,1) subaddress pinned by the Go suite', () => {
    const beldex = beldexAddressesFromLegacy(GOLDEN.legacy25);
    expect(beldex.primary).toBe(GOLDEN.beldexLegacyPrimary);
    expect(beldex.subaddresses[0]).toBe(GOLDEN.beldexLegacySub0);
  });

  it('matches the single-subaddress helper and rejects (0,0)', () => {
    expect(
      cryptonoteSubaddressFromLegacy(GOLDEN.legacy25, MONERO_SUBADDRESS_PREFIX, 0, 1),
    ).toBe(GOLDEN.moneroLegacySub0);
    expect(() =>
      cryptonoteSubaddressFromLegacy(GOLDEN.legacy25, MONERO_SUBADDRESS_PREFIX, 0, 0),
    ).toThrow(/primary address/);
  });

  it('keeps the subaddress prefix distinct from the primary prefix', () => {
    expect(bytesToHex(MONERO_PRIMARY_PREFIX)).toBe('12');
    expect(bytesToHex(MONERO_SUBADDRESS_PREFIX)).toBe('2a');
    // Different prefix, different address — same underlying keys.
    expect(moneroAddressFromLegacy(GOLDEN.legacy25)).not.toBe(GOLDEN.moneroLegacySub0);
  });

  it('honours a subaddress count of zero', () => {
    expect(moneroAddressesFromLegacy(GOLDEN.legacy25, 0)).toEqual({
      primary: GOLDEN.moneroLegacyPrimary,
      subaddresses: [],
    });
  });
});

describe('Cake Wallet / Unstoppable keys', () => {
  it('derives the pinned Cake spend key, phrase, primary, and subaddress', () => {
    expect(bytesToHex(cakeSpendKeyFromMnemonic(GOLDEN.mnemonic24))).toBe(GOLDEN.cakeSpendKeyHex);
    expect(cakeLegacyPhraseFromMnemonic(GOLDEN.mnemonic24)).toBe(GOLDEN.cake25);

    // No Keccak on the Cake path: the spend key is the printed phrase's seed.
    expect(bytesToHex(decodeLegacyMnemonic(GOLDEN.cake25))).toBe(GOLDEN.cakeSpendKeyHex);

    const cake = moneroAddressesFromLegacy(GOLDEN.cake25);
    expect(cake.primary).toBe(GOLDEN.cakePrimary);
    expect(cake.subaddresses[0]).toBe(GOLDEN.cakeSub0);
  });

  it('is a different identity from the CryptoNote legacy seed', () => {
    expect(GOLDEN.cake25).not.toBe(GOLDEN.legacy25);
    expect(GOLDEN.cakePrimary).not.toBe(GOLDEN.moneroLegacyPrimary);
  });
});

describe('meltify-monero report', () => {
  const report = buildMoneroReport({ seed: GOLDEN_SEED_00_TO_1F });

  it('carries both sections and the Beldex sibling set', () => {
    expect(report.legacyPhrase).toBe(GOLDEN.legacy25);
    expect(report.mnemonic24).toBe(GOLDEN.mnemonic24);
    expect(report.cakePhrase).toBe(GOLDEN.cake25);
    expect(report.monero.primary).toBe(GOLDEN.moneroLegacyPrimary);
    expect(report.cake.primary).toBe(GOLDEN.cakePrimary);
    expect(report.beldex.primary).toBe(GOLDEN.beldexLegacyPrimary);
    expect(report.monero.subaddresses).toHaveLength(DEFAULT_SUBADDRESS_COUNT);
  });

  it('rejects a bad seed or subaddress count', () => {
    expect(() => buildMoneroReport({ seed: new Uint8Array(31) })).toThrow(/32-byte/);
    expect(() => buildMoneroReport({ seed: GOLDEN_SEED_00_TO_1F, subaddressCount: -1 })).toThrow(
      /non-negative/,
    );
  });

  it('renders byte-identically to the Go binary under NO_COLOR', () => {
    const reference = readFileSync(join(here, 'golden', 'monero-reference.txt'), 'utf8');
    expect(renderMoneroText(report)).toBe(reference);
  });

  it('omits subaddress blocks when the count is zero', () => {
    const bare = renderMoneroText(
      buildMoneroReport({ seed: GOLDEN_SEED_00_TO_1F, subaddressCount: 0 }),
    );
    expect(bare).not.toContain('subaddress 0,1');
    expect(bare).not.toContain('MONERO ADDRESSES FROM');
    expect(bare).toContain('-----BEGIN MONERO PRIMARY ADDRESS-----');
  });
});
