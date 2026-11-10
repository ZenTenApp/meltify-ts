/**
 * Builds the structured identity report that `meltify-info` prints.
 *
 * The report is deliberately presentation-agnostic: the text renderer reproduces
 * meltify's terminal output, and a future HTML renderer can reuse the same model.
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64 } from '@scure/base';
import { deriveWalletAddresses, type LabeledAddress } from './derive/addresses.js';
import { mnemonic24FromSeed } from './derive/bip39.js';
import {
  bchatChatId,
  encodeLegacyMnemonic,
  scReduce32,
} from './derive/legacy.js';
import { nostrKeysFromMnemonic } from './derive/nostr.js';
import { sshFingerprintSha256 } from './ssh/parse.js';
import { sshEd25519PublicKeyBlob } from './ssh/wire.js';

export interface IdentityReport {
  /** Base64 of the OpenSSH private-key body (the source PEM body, or a re-encoded subaccount). */
  privateKeyBlock: string;
  seedHex: string;
  mnemonic24: string;
  /** 25-word CryptoNote legacy phrase (not printed by meltify-info, kept for reuse). */
  legacyPhrase: string;
  nsec: string;
  privKeyHex: string;
  fingerprint: string;
  publicKeyLine: string;
  npub: string;
  pubKeyHex: string;
  addresses: readonly LabeledAddress[];
  bchat: string;
}

export interface BuildIdentityReportInput {
  /** 32-byte Ed25519 seed. */
  seed: Uint8Array;
  /** Base64 of the OpenSSH private-key body to echo in the first block. */
  keyBodyB64: string;
  /**
   * BIP39 passphrase (the "25th word") for the mnemonic -> seed step. Defaults
   * to `''`, which is the standard derivation and the only one `meltify-info`
   * can produce.
   *
   * A non-empty value changes every field derived from the BIP39 seed (Nostr
   * keys and all chain addresses except Monero and Beldex) and leaves the rest
   * of the report untouched, because the seed, the phrase, the SSH key and the
   * CryptoNote phrase all come from the Ed25519 seed directly.
   */
  bip39Passphrase?: string;
}

export function buildIdentityReport(input: BuildIdentityReportInput): IdentityReport {
  const { seed, keyBodyB64, bip39Passphrase = '' } = input;
  if (seed.length !== 32) {
    throw new Error(`expected a 32-byte Ed25519 seed, got ${seed.length}`);
  }

  const mnemonic24 = mnemonic24FromSeed(seed);
  const nostr = nostrKeysFromMnemonic(mnemonic24, bip39Passphrase);
  const publicKey = ed25519.getPublicKey(seed);
  const publicKeyBlob = sshEd25519PublicKeyBlob(publicKey);

  const reducedSeed = scReduce32(seed);
  const legacyPhrase = encodeLegacyMnemonic(reducedSeed);
  const addresses = deriveWalletAddresses(mnemonic24, legacyPhrase, bip39Passphrase);

  return {
    privateKeyBlock: keyBodyB64,
    seedHex: bytesToHex(seed),
    mnemonic24,
    legacyPhrase,
    nsec: nostr.nsec,
    privKeyHex: nostr.privKeyHex,
    fingerprint: sshFingerprintSha256(publicKeyBlob),
    publicKeyLine: `ssh-ed25519 ${base64.encode(publicKeyBlob)} ${nostr.npub}`,
    npub: nostr.npub,
    pubKeyHex: nostr.pubKeyHex,
    addresses,
    bchat: bchatChatId(reducedSeed),
  };
}
