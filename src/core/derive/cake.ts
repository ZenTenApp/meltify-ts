/**
 * Cake Wallet / Unstoppable Wallet Monero keys from a BIP39 phrase.
 *
 * `meltify-monero` prints a second section for the 24-word MELT phrase: the
 * 25-word seed Cake Wallet and Unstoppable display for that phrase, and the
 * Monero addresses derived from it. The pipeline differs from the CryptoNote
 * legacy one:
 *
 *   1. BIP39 seed = PBKDF2-HMAC-SHA512(mnemonic, "mnemonic" + passphrase)
 *   2. BIP32 secp256k1 path m/44'/128'/account'/0/0
 *   3. read the 32-byte private key as little-endian and reduce modulo the
 *      Ed25519 group order — no Keccak (unlike Ledger, which hashes first)
 *
 * The reduced 32-byte spend key is then encoded as a 25-word CryptoNote phrase
 * and fed through the ordinary legacy derivation, which is what makes the
 * printed seed match what a wallet restoring that phrase shows.
 */

import { HDKey } from '@scure/bip32';
import { MeltifyError } from '../errors.js';
import { seedFromMnemonic } from './bip39.js';
import { encodeLegacyMnemonic, scReduce32 } from './legacy.js';

/** Cake Wallet's Monero account path (Unstoppable matches it at account 0). */
export const CAKE_MONERO_COIN_TYPE = 128;

export function cakeDerivationPath(account = 0): string {
  return `m/44'/${CAKE_MONERO_COIN_TYPE}'/${account}'/0/0`;
}

/**
 * 32-byte Monero spend key Cake/Unstoppable derive from a BIP39 mnemonic.
 *
 * `scReduce32` is the little-endian read-and-reduce step, so the result is
 * byte-identical to CakeWalletStyleConverter.reduceECKey.
 */
export function cakeSpendKeyFromMnemonic(
  mnemonic: string,
  bip39Passphrase = '',
  account = 0,
): Uint8Array {
  const seed = seedFromMnemonic(mnemonic, bip39Passphrase);
  const path = cakeDerivationPath(account);
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey) {
    throw new MeltifyError('derivation', `Cake Wallet derivation produced no private key at ${path}`);
  }
  return scReduce32(node.privateKey);
}

/** The 25-word CryptoNote phrase Cake/Unstoppable show for a BIP39 mnemonic. */
export function cakeLegacyPhraseFromMnemonic(
  mnemonic: string,
  bip39Passphrase = '',
  account = 0,
): string {
  return encodeLegacyMnemonic(cakeSpendKeyFromMnemonic(mnemonic, bip39Passphrase, account));
}
