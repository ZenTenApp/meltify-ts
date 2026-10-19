/**
 * TON Wallet V4R2 address derivation.
 *
 * Ported from meltify `internal/derive/ton.go`, including its hand-rolled cell
 * hashing and the published Wallet V4R2 code-cell hash. This is the TEP-0003
 * multichain-mnemonic scheme (SLIP-0010 at m/44'/607'/0'), not TON's native
 * PBKDF2 KDF.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64urlnopad } from '@scure/base';
import { concatBytes } from '../bytes.js';
import { MeltifyError } from '../errors.js';
import { crc16Xmodem } from '../crypto/crc.js';
import { seedFromMnemonic } from './bip39.js';
import { slip10Ed25519Key } from './slip10.js';

const TON_V4R2_WALLET_ID = 698983191; // 0x29a9a317
const TON_V4R2_CODE_DEPTH = 7;
const TON_UQ_TAG = 0x51; // non-bounceable, mainnet
const TON_STATE_INIT_BITS = 5;
const TON_STATE_INIT_PADDED = 0x34;
const TON_DATA_BIT_LEN = 321;
const TON_DATA_CELL_BYTES = 41;
const TON_WALLET_ID_OFFSET = 4;
const TON_PUBKEY_OFFSET = 8;
const TON_PUBKEY_END = 40;
const TON_DATA_PAD_OFFSET = 40;
const TON_DATA_PAD_BYTE = 0x40;
const TON_ADDR_BYTES = 36;
const TON_ADDR_BODY_BYTES = 34;
const TON_CRC_OFFSET = 34;

/** Published Wallet V4R2 code cell hash. */
const TON_V4R2_CODE_HASH = Uint8Array.from([
  0xfe, 0xb5, 0xff, 0x68, 0x20, 0xe2, 0xff, 0x0d, 0x94, 0x83, 0xe7, 0xe0, 0xd6, 0x2c, 0x81, 0x7d,
  0x84, 0x67, 0x89, 0xfb, 0x4a, 0xe5, 0x80, 0xc8, 0x78, 0x86, 0x6d, 0x95, 0x9d, 0xab, 0xd5, 0xc0,
]);

interface TonRef {
  hash: Uint8Array;
  depth: number;
}

function tonHashCell(bitLen: number, data: Uint8Array, refs: readonly TonRef[]): Uint8Array {
  const d1 = refs.length;
  const d2 = Math.floor(bitLen / 8) + Math.ceil(bitLen / 8);
  const parts: Uint8Array[] = [Uint8Array.of(d1, d2), data];
  for (const ref of refs) {
    parts.push(Uint8Array.of((ref.depth >> 8) & 0xff, ref.depth & 0xff));
  }
  for (const ref of refs) parts.push(ref.hash);
  return sha256(concatBytes(...parts));
}

function tonV4R2DataHash(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== TON_PUBKEY_END - TON_PUBKEY_OFFSET) {
    throw new MeltifyError('derivation', `TON Ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }
  const raw = new Uint8Array(TON_DATA_CELL_BYTES);
  raw[TON_WALLET_ID_OFFSET] = (TON_V4R2_WALLET_ID >>> 24) & 0xff;
  raw[TON_WALLET_ID_OFFSET + 1] = (TON_V4R2_WALLET_ID >>> 16) & 0xff;
  raw[TON_WALLET_ID_OFFSET + 2] = (TON_V4R2_WALLET_ID >>> 8) & 0xff;
  raw[TON_WALLET_ID_OFFSET + 3] = TON_V4R2_WALLET_ID & 0xff;
  raw.set(publicKey, TON_PUBKEY_OFFSET);
  raw[TON_DATA_PAD_OFFSET] = TON_DATA_PAD_BYTE;
  return tonHashCell(TON_DATA_BIT_LEN, raw, []);
}

function tonV4R2AccountId(publicKey: Uint8Array): Uint8Array {
  const dataHash = tonV4R2DataHash(publicKey);
  return tonHashCell(TON_STATE_INIT_BITS, Uint8Array.of(TON_STATE_INIT_PADDED), [
    { hash: TON_V4R2_CODE_HASH, depth: TON_V4R2_CODE_DEPTH },
    { hash: dataHash, depth: 0 },
  ]);
}

export function encodeTonV4R2UQ(publicKey: Uint8Array): string {
  const accountId = tonV4R2AccountId(publicKey);
  const payload = new Uint8Array(TON_ADDR_BYTES);
  payload[0] = TON_UQ_TAG;
  payload.set(accountId, 2);
  const crc = crc16Xmodem(payload.subarray(0, TON_ADDR_BODY_BYTES));
  payload[TON_CRC_OFFSET] = (crc >> 8) & 0xff;
  payload[TON_CRC_OFFSET + 1] = crc & 0xff;
  return base64urlnopad.encode(payload);
}

/** TON Wallet V4R2 non-bounceable mainnet address from a BIP39 mnemonic. */
export function ton(mnemonic: string, passphrase = ''): string {
  const key = slip10Ed25519Key(seedFromMnemonic(mnemonic, passphrase), [44, 607, 0]);
  return encodeTonV4R2UQ(ed25519.getPublicKey(key));
}
