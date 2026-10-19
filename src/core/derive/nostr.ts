/**
 * NIP-06 Nostr keys from a BIP39 mnemonic.
 *
 * meltify derives secp256k1 keys at m/44'/1237'/0'/0/0 (tyler-smith/go-bip32),
 * takes the BIP340 x-only public key, and NIP-19 bech32-encodes both halves.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { bech32 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { MeltifyError } from '../errors.js';
import { seedFromMnemonic } from './bip39.js';

export const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";

export interface NostrKeys {
  npub: string;
  nsec: string;
  pubKeyHex: string;
  privKeyHex: string;
}

export function nostrKeysFromMnemonic(mnemonic: string, passphrase = ''): NostrKeys {
  const seed = seedFromMnemonic(mnemonic, passphrase);
  const node = HDKey.fromMasterSeed(seed).derive(NOSTR_DERIVATION_PATH);
  const privKey = node.privateKey;
  if (!privKey) throw new MeltifyError('derivation', 'NIP-06 derivation produced no private key');

  const pubKey = schnorr.getPublicKey(privKey);
  return {
    npub: bech32.encode('npub', bech32.toWords(pubKey)),
    nsec: bech32.encode('nsec', bech32.toWords(privKey)),
    pubKeyHex: bytesToHex(pubKey),
    privKeyHex: bytesToHex(privKey),
  };
}
