import { describe, it, expect } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils.js';
import { GOLDEN, GOLDEN_SEED_00_TO_1F } from './golden/goldens.js';
import { mnemonic24FromSeed } from '../src/core/derive/bip39.js';
import { nostrKeysFromMnemonic } from '../src/core/derive/nostr.js';
import { ethereumAddress, toChecksumAddress, tronAddress } from '../src/core/derive/evm.js';
import {
  bitcoinNativeSegwit,
  dogecoin,
  litecoin,
} from '../src/core/derive/btc.js';
import { bitcoinCash } from '../src/core/derive/cashaddr.js';
import { cosmos, ripple, silentPayment, solana, stellar, sui } from '../src/core/derive/chains.js';
import { ton } from '../src/core/derive/ton.js';
import { reduce } from './reduce.js';
import {
  bchatChatId,
  beldexAddressFromLegacy,
  decodeLegacyMnemonic,
  encodeLegacyMnemonic,
  moneroAddressFromLegacy,
  scReduce32,
} from '../src/core/derive/legacy.js';

describe('M1: seed -> mnemonic, Nostr, SSH identity', () => {
  it('derives the 24-word MELT phrase from the raw seed as BIP39 entropy', () => {
    expect(mnemonic24FromSeed(GOLDEN_SEED_00_TO_1F)).toBe(GOLDEN.mnemonic24);
  });

  it('derives NIP-06 Nostr keys', () => {
    const keys = nostrKeysFromMnemonic(GOLDEN.mnemonic24);
    expect(keys.npub).toBe(GOLDEN.npub);
    expect(keys.nsec).toBe(GOLDEN.nsec);
    expect(keys.pubKeyHex).toBe(GOLDEN.pubKeyHex);
    expect(keys.privKeyHex).toBe(GOLDEN.privKeyHex);
  });
});

describe('M2: BIP32/SLIP-0010 chains', () => {
  const m = GOLDEN.mnemonic24;
  const cases: Array<[string, string, string]> = [
    ['bitcoin', bitcoinNativeSegwit(m), GOLDEN.bitcoin],
    ['bitcoincash', bitcoinCash(m), GOLDEN.bitcoincash],
    ['ethereum', ethereumAddress(m), GOLDEN.ethereum],
    ['solana', solana(m), GOLDEN.solana],
    ['tron', tronAddress(m), GOLDEN.tron],
    ['litecoin', litecoin(m), GOLDEN.litecoin],
    ['dogecoin', dogecoin(m), GOLDEN.dogecoin],
    ['cosmos', cosmos(m), GOLDEN.cosmos],
    ['stellar', stellar(m), GOLDEN.stellar],
    ['xrpl', ripple(m), GOLDEN.ripple],
    ['sui', sui(m), GOLDEN.sui],
    ['silentpayment', silentPayment(m), GOLDEN.silentPayment],
    ['ton', ton(m), GOLDEN.ton],
  ];

  for (const [name, got, want] of cases) {
    it(`${name} matches the Go golden`, () => {
      expect(got).toBe(want);
    });
  }

  it('EIP-55 checksums the Ethereum address', () => {
    const lower = GOLDEN.ethereum.toLowerCase().slice(2);
    expect(toChecksumAddress(Uint8Array.from(Buffer.from(lower, 'hex')))).toBe(GOLDEN.ethereum);
  });
});

describe('M3: CryptoNote legacy seed and Beldex/BChat', () => {
  it('scReduce32 (raw seed) matches the Go reduced seed', () => {
    expect(bytesToHex(scReduce32(GOLDEN_SEED_00_TO_1F))).toBe(GOLDEN.reducedSeedHex);
  });

  it('agrees with a BigInt mod-L reference reducer', () => {
    for (let i = 0; i < 20; i++) {
      const seed = Uint8Array.from({ length: 32 }, (_, j) => (i * 37 + j * 11) & 0xff);
      expect(bytesToHex(scReduce32(seed))).toBe(bytesToHex(reduce(seed)));
    }
  });

  it('encodes the 25-word legacy phrase', () => {
    const reduced = scReduce32(GOLDEN_SEED_00_TO_1F);
    expect(encodeLegacyMnemonic(reduced)).toBe(GOLDEN.legacy25);
  });

  it('decodes the 25-word legacy phrase back to the reduced seed', () => {
    expect(bytesToHex(decodeLegacyMnemonic(GOLDEN.legacy25))).toBe(GOLDEN.reducedSeedHex);
  });

  it('round-trips 200 random reduced seeds through the phrase codec', () => {
    for (let i = 0; i < 200; i++) {
      const seed = Uint8Array.from({ length: 32 }, (_, j) => (i * 97 + j * 29 + 7) & 0xff);
      const reduced = scReduce32(seed);
      expect(bytesToHex(decodeLegacyMnemonic(encodeLegacyMnemonic(reduced)))).toBe(
        bytesToHex(reduced),
      );
    }
  });

  it('rejects a phrase with a bad checksum word', () => {
    const words = GOLDEN.legacy25.split(' ');
    words[24] = words[0]!;
    expect(() => decodeLegacyMnemonic(words.join(' '))).toThrow(/invalid mnemonic/);
  });

  it('derives the Monero legacy primary address', () => {
    expect(moneroAddressFromLegacy(GOLDEN.legacy25)).toBe(GOLDEN.moneroLegacyPrimary);
  });

  it('derives the Beldex legacy primary address', () => {
    expect(beldexAddressFromLegacy(GOLDEN.legacy25)).toBe(GOLDEN.beldexLegacyPrimary);
  });

  it('derives the BChat chat ID from the reduced seed', () => {
    expect(bchatChatId(scReduce32(GOLDEN_SEED_00_TO_1F))).toBe(GOLDEN.bchat);
  });
});
