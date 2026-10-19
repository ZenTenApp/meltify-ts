/**
 * EVM and Tron address derivation.
 *
 * Both use the same secp256k1 keccak payload; Tron wraps it as a Base58Check
 * address with the 0x41 mainnet prefix.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { concatBytes } from '../bytes.js';
import { MeltifyError } from '../errors.js';
import { seedFromMnemonic } from './bip39.js';

/** 20-byte keccak256 address payload at m/44'/<coinType>'/0'/0/0. */
export function evmAddressPayload(
  mnemonic: string,
  passphrase: string,
  coinType: number,
): Uint8Array {
  const seed = seedFromMnemonic(mnemonic, passphrase);
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/${coinType}'/0'/0/0`);
  const compressed = node.publicKey;
  if (!compressed) throw new MeltifyError('derivation', 'EVM derivation produced no public key');
  const uncompressed = secp256k1.Point.fromBytes(compressed).toBytes(false);
  return keccak_256(uncompressed.subarray(1)).slice(-20);
}

/** EIP-55 mixed-case checksum address. */
export function toChecksumAddress(payload: Uint8Array): string {
  if (payload.length !== 20) {
    throw new MeltifyError('derivation', `EVM address payload must be 20 bytes, got ${payload.length}`);
  }
  const lower = bytesToHex(payload);
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const nibble = parseInt(hash[i]!, 16);
    out += nibble >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
  }
  return out;
}

export function ethereumAddress(mnemonic: string, passphrase = ''): string {
  return toChecksumAddress(evmAddressPayload(mnemonic, passphrase, 60));
}

export function tronAddress(mnemonic: string, passphrase = ''): string {
  const payload = evmAddressPayload(mnemonic, passphrase, 195);
  const withPrefix = concatBytes(Uint8Array.of(0x41), payload);
  const checksum = sha256(sha256(withPrefix)).slice(0, 4);
  return base58.encode(concatBytes(withPrefix, checksum));
}
