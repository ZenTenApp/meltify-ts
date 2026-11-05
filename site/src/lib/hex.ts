/** Hex helpers. Deliberately local: the site only needs these two. */

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Returns null when the input is not clean hex or not an even length. */
export function parseHex(input: string): Uint8Array | null {
  const text = input.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (text.length === 0 || text.length % 2 !== 0 || /[^0-9a-f]/i.test(text)) return null;
  const out = new Uint8Array(text.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}
