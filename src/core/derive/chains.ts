/**
 * Remaining non-EVM, non-Bitcoin chains used by `meltify-info`.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base32nopad, base58, base58xrp, bech32, bech32m } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { concatBytes } from '../bytes.js';
import { crc16Xmodem } from '../crypto/crc.js';
import { MeltifyError } from '../errors.js';
import { seedFromMnemonic } from './bip39.js';
import { bipPubkeyHash } from './btc.js';
import { slip10Ed25519Key } from './slip10.js';

/** BIP44 Bech32 at m/44'/118'/0'/0/0. */
export function cosmos(mnemonic: string, passphrase = ''): string {
  const hash = bipPubkeyHash(mnemonic, passphrase, 44, 118);
  return bech32.encode('cosmos', bech32.toWords(hash));
}

/** BIP44 XRP address at m/44'/144'/0'/0/0, Ripple alphabet, version 0x00. */
export function ripple(mnemonic: string, passphrase = ''): string {
  const hash = bipPubkeyHash(mnemonic, passphrase, 44, 144);
  const payload = concatBytes(Uint8Array.of(0x00), hash);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58xrp.encode(concatBytes(payload, checksum));
}

/** Stellar SEP-0005 Ed25519 strkey at m/44'/148'/0'. */
export function stellar(mnemonic: string, passphrase = ''): string {
  const key = slip10Ed25519Key(seedFromMnemonic(mnemonic, passphrase), [44, 148, 0]);
  const publicKey = ed25519.getPublicKey(key);
  return encodeStellarStrKey(0x30, publicKey);
}

function encodeStellarStrKey(version: number, payload: Uint8Array): string {
  const data = concatBytes(Uint8Array.of(version), payload);
  const checksum = crc16Xmodem(data);
  return base32nopad.encode(
    concatBytes(data, Uint8Array.of(checksum & 0xff, (checksum >> 8) & 0xff)),
  );
}

/** Sui Ed25519 address at m/44'/784'/0'/0'/0'. */
export function sui(mnemonic: string, passphrase = ''): string {
  const key = slip10Ed25519Key(seedFromMnemonic(mnemonic, passphrase), [44, 784, 0, 0, 0]);
  const publicKey = ed25519.getPublicKey(key);
  const payload = concatBytes(Uint8Array.of(0x00), publicKey);
  return `0x${bytesToHex(blake2b(payload, { dkLen: 32 }))}`;
}

/** BIP352 silent-payment sp1 address (bech32m). */
export function silentPayment(mnemonic: string, passphrase = ''): string {
  const seed = seedFromMnemonic(mnemonic, passphrase);
  const master = HDKey.fromMasterSeed(seed);
  const scan = master.derive("m/352'/0'/0'/1'/0").publicKey;
  const spend = master.derive("m/352'/0'/0'/0'/0").publicKey;
  if (!scan || !spend) throw new MeltifyError('derivation', 'silent payment derivation failed');
  if (scan.length !== 33 || spend.length !== 33) {
    throw new MeltifyError('derivation', 'silent payment public keys must be 33 bytes');
  }
  const data = concatBytes(scan, spend);
  // BIP352 sp1 addresses exceed bech32's default 90-character limit.
  return bech32m.encode('sp', [0, ...bech32m.toWords(data)], 1023);
}

/** SLIP-0010 Ed25519 at m/44'/501'/0'/0', base58 public key. */
export function solana(mnemonic: string, passphrase = ''): string {
  const key = slip10Ed25519Key(seedFromMnemonic(mnemonic, passphrase), [44, 501, 0, 0]);
  return base58.encode(ed25519.getPublicKey(key));
}
