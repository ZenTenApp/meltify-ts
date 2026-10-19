/**
 * SLIP-0010 Ed25519 hierarchical derivation.
 *
 * Ported from meltify's `deriveEd25519Key`: the master node is
 * HMAC-SHA512(key = "ed25519 seed"), and every path element is hardened.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { writeUint32BE } from '../bytes.js';

const HARDENED_OFFSET = 0x80000000;

export function slip10Ed25519Key(seed: Uint8Array, path: readonly number[]): Uint8Array {
  let digest = hmac(sha512, utf8ToBytes('ed25519 seed'), seed);
  let key = digest.slice(0, 32);
  let chainCode = digest.slice(32);

  for (const index of path) {
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(key, 1);
    writeUint32BE(data, 33, (index + HARDENED_OFFSET) >>> 0);
    digest = hmac(sha512, chainCode, data);
    key = digest.slice(0, 32);
    chainCode = digest.slice(32);
  }

  return key;
}
