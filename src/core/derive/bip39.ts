/**
 * BIP39 helpers.
 *
 * meltify uses the raw 32-byte Ed25519 seed as BIP39 *entropy* to produce a
 * 24-word phrase (not as a mnemonic). Wallet addresses and Nostr keys are then
 * derived from that phrase's BIP39 seed.
 */

import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { MeltifyError } from '../errors.js';

/** 24-word English BIP39 phrase for a 32-byte seed used as entropy. */
export function mnemonic24FromSeed(seed: Uint8Array): string {
  if (seed.length !== 32) {
    throw new MeltifyError('derivation', `BIP39 entropy must be 32 bytes, got ${seed.length}`);
  }
  return entropyToMnemonic(seed, wordlist);
}

/** BIP39 seed (PBKDF2-HMAC-SHA512, 2048 rounds) for a phrase. */
export function seedFromMnemonic(mnemonic: string, passphrase = ''): Uint8Array {
  try {
    return mnemonicToSeedSync(mnemonic, passphrase);
  } catch (cause) {
    throw new MeltifyError('invalid-mnemonic', 'invalid mnemonic', { cause });
  }
}
