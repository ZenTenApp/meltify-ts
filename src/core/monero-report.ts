/**
 * Builds the structured report that `meltify-monero` prints.
 *
 * Two sections, mirroring the Go binary:
 *
 *  1. the CryptoNote legacy section — 25-word seed, Monero primary address,
 *     and subaddresses `(0, 1)`…`(0, n)`;
 *  2. the Unstoppable/Cake section — the 24-word MELT phrase, the 25-word seed
 *     Cake Wallet/Unstoppable display for it, and the addresses from that seed.
 *
 * Beldex addresses ride along because the same key pair produces them and the
 * sibling `meltify-beldex` binary prints the same shape, but `meltify-monero`
 * does not render them.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { MeltifyError } from './errors.js';
import { mnemonic24FromSeed } from './derive/bip39.js';
import { cakeLegacyPhraseFromMnemonic } from './derive/cake.js';
import {
  DEFAULT_SUBADDRESS_COUNT,
  beldexAddressesFromLegacy,
  encodeLegacyMnemonic,
  moneroAddressesFromLegacy,
  scReduce32,
} from './derive/legacy.js';

/** A primary address and its `(0, n)` subaddresses. */
export interface MoneroAddressSection {
  primary: string;
  subaddresses: readonly string[];
}

export interface MoneroReport {
  seedHex: string;
  /** 25-word CryptoNote legacy phrase (the printed seed of section 1). */
  legacyPhrase: string;
  /** Monero primary address and subaddresses from the legacy phrase. */
  monero: MoneroAddressSection;
  /** Beldex primary address and subaddresses from the same legacy phrase. */
  beldex: MoneroAddressSection;
  /** 24-word MELT BIP39 phrase (the phrase Unstoppable restores). */
  mnemonic24: string;
  /** 25-word Cake/Feather seed Unstoppable shows for that 24-word phrase. */
  cakePhrase: string;
  /** Monero primary address and subaddresses from the Cake seed. */
  cake: MoneroAddressSection;
}

export interface BuildMoneroReportInput {
  /** 32-byte Ed25519 seed (the source key, or a subaccount seed). */
  seed: Uint8Array;
  /** Subaddresses to derive per section. Defaults to 9, as meltify does. */
  subaddressCount?: number;
}

export function buildMoneroReport(input: BuildMoneroReportInput): MoneroReport {
  const { seed } = input;
  const subaddressCount = input.subaddressCount ?? DEFAULT_SUBADDRESS_COUNT;
  if (seed.length !== 32) {
    throw new MeltifyError('derivation', `expected a 32-byte Ed25519 seed, got ${seed.length}`);
  }
  if (!Number.isInteger(subaddressCount) || subaddressCount < 0) {
    throw new MeltifyError(
      'derivation',
      `subaddress count must be a non-negative integer, got ${subaddressCount}`,
    );
  }

  const mnemonic24 = mnemonic24FromSeed(seed);
  const legacyPhrase = encodeLegacyMnemonic(scReduce32(seed));
  const cakePhrase = cakeLegacyPhraseFromMnemonic(mnemonic24);

  return {
    seedHex: bytesToHex(seed),
    legacyPhrase,
    monero: moneroAddressesFromLegacy(legacyPhrase, subaddressCount),
    beldex: beldexAddressesFromLegacy(legacyPhrase, subaddressCount),
    mnemonic24,
    cakePhrase,
    cake: moneroAddressesFromLegacy(cakePhrase, subaddressCount),
  };
}
