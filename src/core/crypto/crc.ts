/**
 * CRC helpers used by the CryptoNote mnemonic checksum and Stellar strkey.
 */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32/ISO-HDLC (IEEE 802.3), the checksum Go's hash/crc32.ChecksumIEEE computes. */
export function crc32IEEE(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc = CRC32_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** CRC-16/XMODEM, used by Stellar strkey and TON address encoding. */
export function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}
