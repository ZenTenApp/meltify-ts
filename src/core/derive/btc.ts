/**
 * Bitcoin-family address derivation (BIP84/BIP44).
 */

import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58, bech32 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { concatBytes } from '../bytes.js';
import { MeltifyError } from '../errors.js';
import { seedFromMnemonic } from './bip39.js';

export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** Base58Check over a payload that already includes the version byte. */
export function base58Check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58.encode(concatBytes(payload, checksum));
}

/** hash160 of the compressed public key at m/<purpose>'/<coinType>'/0'/0/0. */
export function bipPubkeyHash(
  mnemonic: string,
  passphrase: string,
  purpose: number,
  coinType: number,
): Uint8Array {
  const seed = seedFromMnemonic(mnemonic, passphrase);
  const node = HDKey.fromMasterSeed(seed).derive(`m/${purpose}'/${coinType}'/0'/0/0`);
  const publicKey = node.publicKey;
  if (!publicKey) throw new MeltifyError('derivation', 'BIP32 derivation produced no public key');
  return hash160(publicKey);
}

/** Native SegWit (P2WPKH) bech32 address for a 20-byte pubkey hash. */
export function segwitAddress(hrp: string, pubkeyHash: Uint8Array): string {
  return bech32.encode(hrp, [0, ...bech32.toWords(pubkeyHash)]);
}

/** BIP84 P2WPKH at m/84'/0'/0'/0/0. */
export function bitcoinNativeSegwit(mnemonic: string, passphrase = ''): string {
  return segwitAddress('bc', bipPubkeyHash(mnemonic, passphrase, 84, 0));
}

/** BIP84 P2WPKH at m/84'/2'/0'/0/0. */
export function litecoin(mnemonic: string, passphrase = ''): string {
  return segwitAddress('ltc', bipPubkeyHash(mnemonic, passphrase, 84, 2));
}

/** BIP44 P2PKH at m/44'/3'/0'/0/0 (version 0x1e). */
export function dogecoin(mnemonic: string, passphrase = ''): string {
  return base58Check(concatBytes(Uint8Array.of(0x1e), bipPubkeyHash(mnemonic, passphrase, 44, 3)));
}
