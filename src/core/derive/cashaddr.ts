/**
 * Bitcoin Cash CashAddr encoding.
 *
 * meltify returns the payload only (no `bitcoincash:` prefix), so the report can
 * print `bitcoincash:<payload>`.
 */

import { bech32 } from '@scure/base';
import { bipPubkeyHash } from './btc.js';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

function prefixExpand(prefix: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < prefix.length; i++) out.push(prefix.charCodeAt(i) & 31);
  out.push(0);
  return out;
}

function polymod(values: readonly number[]): bigint {
  let c = 1n;
  for (const d of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0n; i < 5n; i++) {
      if ((c0 >> i) & 1n) c ^= GENERATORS[Number(i)]!;
    }
  }
  return c;
}

/** CashAddr payload (starts with "q"), no prefix. */
export function encodeCashAddr(prefix: string, version: number, hash: Uint8Array): string {
  const payload = new Uint8Array(1 + hash.length);
  payload[0] = version;
  payload.set(hash, 1);
  const data5 = bech32.toWords(payload);

  const values = [...prefixExpand(prefix), ...data5, 0, 0, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1n;
  const checksum: number[] = [];
  for (let i = 0; i < 8; i++) {
    checksum.push(Number((mod >> BigInt(5 * (8 - 1 - i))) & 31n));
  }

  let out = '';
  for (const v of data5) out += CHARSET[v]!;
  for (const v of checksum) out += CHARSET[v]!;
  return out;
}

/** BIP44 P2PKH CashAddr at m/44'/145'/0'/0/0. */
export function bitcoinCash(mnemonic: string, passphrase = ''): string {
  return encodeCashAddr('bitcoincash', 0, bipPubkeyHash(mnemonic, passphrase, 44, 145));
}
