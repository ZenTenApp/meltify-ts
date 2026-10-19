/**
 * SSH wire-format binary reader/writer.
 *
 * SSH encodes integers as big-endian uint32 and byte strings as a uint32 length
 * followed by that many bytes. Everything here is Uint8Array-based so it runs in
 * Node and the browser.
 */

import { utf8ToBytes } from '@noble/hashes/utils.js';
import { bytesToUtf8, concatBytes } from '../bytes.js';
import { KeyParseError } from '../errors.js';

export class SshReader {
  private offset = 0;

  constructor(private readonly buf: Uint8Array) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  get position(): number {
    return this.offset;
  }

  u32(): number {
    this.need(4);
    const b = this.buf;
    const o = this.offset;
    this.offset += 4;
    return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  }

  bytes(n: number): Uint8Array {
    if (!Number.isInteger(n) || n < 0) {
      throw new KeyParseError(`could not parse key: invalid field length ${n}`);
    }
    this.need(n);
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  /** Length-prefixed SSH string. */
  string(): Uint8Array {
    return this.bytes(this.u32());
  }

  stringUtf8(): string {
    return bytesToUtf8(this.string());
  }

  rest(): Uint8Array {
    const out = this.buf.subarray(this.offset);
    this.offset = this.buf.length;
    return out;
  }

  private need(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new KeyParseError(
        `could not parse key: truncated, needed ${n} byte(s) at offset ${this.offset}`,
      );
    }
  }
}

export function uint32BE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

export function sshString(data: Uint8Array): Uint8Array {
  return concatBytes(uint32BE(data.length), data);
}

export function sshStringUtf8(text: string): Uint8Array {
  return sshString(utf8ToBytes(text));
}

/** The SSH wire-format public key blob for an Ed25519 key. */
export function sshEd25519PublicKeyBlob(publicKey: Uint8Array): Uint8Array {
  return concatBytes(sshStringUtf8('ssh-ed25519'), sshString(publicKey));
}
