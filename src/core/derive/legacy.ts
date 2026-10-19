/**
 * CryptoNote legacy seed, Monero/Beldex addresses, and the Beldex BChat chat ID.
 *
 * The 25-word CryptoNote phrase encodes scReduce32(raw Ed25519 seed). Monero and
 * Beldex spend/view keys come from that reduced seed; the BChat chat ID instead
 * uses the standard Ed25519 public key of the reduced seed, converted to a
 * Curve25519 u-coordinate and tagged 0xBD.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58xmr } from '@scure/base';
import {
  bigIntToBytesLE,
  bytesToBigIntLE,
  bytesToHexLower,
  concatBytes,
  modInverse,
  readUint32LE,
  writeUint32LE,
} from '../bytes.js';
import { crc32IEEE } from '../crypto/crc.js';
import { MeltifyError } from '../errors.js';
import { moneroEnglish } from './monero-wordlist.js';

const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;
const FIELD_PRIME = 2n ** 255n - 19n;
const WORD_SET_LEN = moneroEnglish.length; // 1626
const MNEMONIC_LEN = 25;
const PREFIX_LEN = 3;

export const MONERO_PRIMARY_PREFIX = Uint8Array.of(0x12);
export const BELDEX_MAINNET_PREFIX = Uint8Array.of(0xd1, 0x01);

/** Reduces a 32-byte little-endian integer modulo the Ed25519 group order. */
export function scReduce32(input: Uint8Array): Uint8Array {
  if (input.length !== 32) {
    throw new MeltifyError('derivation', `scReduce32 expects 32 bytes, got ${input.length}`);
  }
  return bigIntToBytesLE(bytesToBigIntLE(input) % CURVE_ORDER, 32);
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function findWordIndex(word: string): number {
  let low = 0;
  let high = WORD_SET_LEN - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const candidate = moneroEnglish[mid]!;
    if (candidate === word) return mid;
    if (candidate < word) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

function checksumWordIndex(words: readonly string[]): number {
  let con = '';
  for (let i = 0; i < MNEMONIC_LEN - 1; i++) con += words[i]!.slice(0, PREFIX_LEN);
  return crc32IEEE(utf8ToBytes(con)) % (MNEMONIC_LEN - 1);
}

/** Encodes a 32-byte reduced seed as a 25-word CryptoNote English phrase. */
export function encodeLegacyMnemonic(seed: Uint8Array): string {
  if (seed.length !== 32) {
    throw new MeltifyError('derivation', `legacy mnemonic seed must be 32 bytes, got ${seed.length}`);
  }
  const words: string[] = [];
  for (let group = 0; group < 8; group++) {
    const value = readUint32LE(seed, group * 4);
    const w1 = value % WORD_SET_LEN;
    const w2 = (Math.floor(value / WORD_SET_LEN) + w1) % WORD_SET_LEN;
    const w3 = (Math.floor(Math.floor(value / WORD_SET_LEN) / WORD_SET_LEN) + w2) % WORD_SET_LEN;
    words.push(moneroEnglish[w1]!, moneroEnglish[w2]!, moneroEnglish[w3]!);
  }
  words.push(words[checksumWordIndex(words)]!);
  return words.join(' ');
}

/** Decodes and checksum-validates a 25-word CryptoNote English phrase. */
export function decodeLegacyMnemonic(phrase: string): Uint8Array {
  const words = phrase.trim().split(/\s+/);
  if (words.length !== MNEMONIC_LEN) {
    throw new MeltifyError('invalid-mnemonic', 'invalid mnemonic');
  }
  if (words[words.length - 1] !== words[checksumWordIndex(words)]) {
    throw new MeltifyError('invalid-mnemonic', 'invalid mnemonic');
  }

  const seed = new Uint8Array(32);
  for (let group = 0; group < 8; group++) {
    const indices = [0, 1, 2].map((offset) => {
      const index = findWordIndex(words[group * 3 + offset]!);
      if (index < 0) throw new MeltifyError('invalid-mnemonic', 'invalid mnemonic');
      return index;
    });
    const values = [
      indices[0]!,
      WORD_SET_LEN * mod(indices[1]! - indices[0]!, WORD_SET_LEN),
      WORD_SET_LEN * WORD_SET_LEN * mod(indices[2]! - indices[1]!, WORD_SET_LEN),
    ];
    let sum = 0;
    for (const value of values) sum = (sum + (value >>> 0)) >>> 0;
    writeUint32LE(seed, group * 4, sum);
  }
  return seed;
}

export interface CryptonotePublicKeys {
  spendPub: Uint8Array;
  viewPub: Uint8Array;
}

/** Spend/view public keys for a legacy phrase, matching go-monero's FullKeyPair. */
export function cryptonotePublicKeysFromLegacy(phrase: string): CryptonotePublicKeys {
  const spendPriv = decodeLegacyMnemonic(phrase);
  const spendScalar = bytesToBigIntLE(spendPriv);
  if (spendScalar >= CURVE_ORDER) {
    throw new MeltifyError('derivation', 'legacy seed is not a canonical Ed25519 scalar');
  }
  const spendPub = ed25519.Point.BASE.multiply(spendScalar).toBytes();
  const viewPriv = scReduce32(keccak_256(spendPriv));
  const viewPub = ed25519.Point.BASE.multiply(bytesToBigIntLE(viewPriv)).toBytes();
  return { spendPub, viewPub };
}

/** CryptoNote address for a legacy phrase and network prefix. */
export function cryptonoteAddressFromLegacy(phrase: string, prefix: Uint8Array): string {
  const { spendPub, viewPub } = cryptonotePublicKeysFromLegacy(phrase);
  const data = concatBytes(prefix, spendPub, viewPub);
  const checksum = keccak_256(data).slice(0, 4);
  return base58xmr.encode(concatBytes(data, checksum));
}

export function moneroAddressFromLegacy(phrase: string): string {
  return cryptonoteAddressFromLegacy(phrase, MONERO_PRIMARY_PREFIX);
}

export function beldexAddressFromLegacy(phrase: string): string {
  return cryptonoteAddressFromLegacy(phrase, BELDEX_MAINNET_PREFIX);
}

/**
 * Beldex BChat chat ID: hex(0xBD || X25519 public key) of the reduced seed.
 *
 * The X25519 key is the standard Ed25519 public key of the reduced seed mapped
 * to its Montgomery u-coordinate, exactly as libsodium's
 * crypto_sign_ed25519_pk_to_curve25519 does.
 */
export function bchatChatId(reducedSeed: Uint8Array): string {
  if (reducedSeed.length !== 32) {
    throw new MeltifyError('derivation', `BChat seed must be 32 bytes, got ${reducedSeed.length}`);
  }
  const publicKey = ed25519.getPublicKey(reducedSeed);
  // Edwards compressed encoding stores y in the low 255 bits; the sign of x is
  // the top bit, which the Montgomery map does not use.
  const yBytes = Uint8Array.from(publicKey);
  yBytes[31] = yBytes[31]! & 0x7f;
  const y = bytesToBigIntLE(yBytes);
  const denominator = (1n - y + FIELD_PRIME) % FIELD_PRIME;
  const u = ((1n + y) * modInverse(denominator, FIELD_PRIME)) % FIELD_PRIME;
  return `bd${bytesToHexLower(bigIntToBytesLE(u, 32))}`;
}
