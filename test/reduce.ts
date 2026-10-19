/**
 * Test-only BigInt mod-L reducer used to cross-check scReduce32 without
 * reusing the implementation under test.
 */
export const CURVE_ORDER =
  2n ** 252n + 27742317777372353535851937790883648493n;

export function reduce(input: Uint8Array): Uint8Array {
  let n = 0n;
  for (let i = input.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(input[i]!);
  let r = n % CURVE_ORDER;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(r & 0xffn);
    r >>= 8n;
  }
  return out;
}
