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
}

export function buildIdentityReport(input: BuildIdentityReportInput): IdentityReport {
  const { seed, keyBodyB64 } = input;
  if (seed.length !== 32) {
    throw new Error(`expected a 32-byte Ed25519 seed, got ${seed.length}`);
  }

  const mnemonic24 = mnemonic24FromSeed(seed);
  const nostr = nostrKeysFromMnemonic(mnemonic24);
  const publicKey = ed25519.getPublicKey(seed);
  const publicKeyBlob = sshEd25519PublicKeyBlob(publicKey);

  const reducedSeed = scReduce32(seed);
  const legacyPhrase = encodeLegacyMnemonic(reducedSeed);
  const addresses = deriveWalletAddresses(mnemonic24, legacyPhrase);

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
