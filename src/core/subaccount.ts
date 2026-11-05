/**
 * Subaccounts.
 *
 * `meltify --subaccount <label>` (and `meltify-info -s`) derives a different,
 * deterministic Ed25519 key from the source key and an arbitrary label string,
 * then re-encodes that key with the source passphrase at bcrypt rounds = 1. The
 * label itself is never printed; everything that follows (phrase, Nostr keys,
 * addresses, BChat id) is derived from the subaccount seed as usual.
 *
 * Derivation, matching Go's `sshkey.DeriveSubaccountKey` byte for byte:
 *
 *   derivedSeed = SHA256( SHA256(utf8(label)) || sourceSeed )
 *
 * An empty label is not a subaccount: Go's `ActivateSubaccount` returns early,
 * so this returns the source seed unchanged.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { concatBytes } from './bytes.js';
import { PassphraseRequiredError } from './errors.js';
import { buildIdentityReport, type IdentityReport } from './report.js';
import { marshalOpenSSHEd25519Key, type MarshalOptions } from './ssh/marshal.js';

/** bcrypt rounds meltify forces for subaccount keys (`openSSHBcryptKDFRounds`). */
export const SUBACCOUNT_KDF_ROUNDS = 1;

/**
 * Deterministic subaccount seed for `label`. Seed is returned unchanged when
 * `label` is empty, matching meltify's no-op.
 */
export function deriveSubaccountSeed(seed: Uint8Array, label: string): Uint8Array {
  if (seed.length !== 32) {
    throw new Error(`expected a 32-byte Ed25519 seed, got ${seed.length}`);
  }
  if (label === '') return seed;
  const labelHash = sha256(utf8ToBytes(label));
  return sha256(concatBytes(labelHash, seed));
}

export interface BuildSubaccountReportInput {
  /** 32-byte Ed25519 seed of the *source* key. */
  seed: Uint8Array;
  /** Subaccount label. Empty means "no subaccount". */
  label: string;
  /** The source key's passphrase, reused verbatim for the subaccount key. */
  passphrase: string;
  /** Marshal overrides; tests use fixed salt/check bytes. Rounds are fixed at 1, as in meltify. */
  marshal?: Pick<MarshalOptions, 'rng' | 'checkBytes' | 'salt'>;
}

export interface SubaccountReport {
  report: IdentityReport;
  /** The 32-byte seed the report was built from. */
  seed: Uint8Array;
  /** Re-encoded, password-protected OpenSSH PEM for the subaccount key. */
  pem: string;
  /** Base64 of the PEM body, as printed in the report's private-key block. */
  keyBodyB64: string;
}

/**
 * Builds the identity report for a subaccount, with the private-key block set
 * to the re-encoded subaccount body (meltify-info's behavior under `-s`).
 */
export function buildSubaccountReport(input: BuildSubaccountReportInput): SubaccountReport {
  const { seed, label, passphrase, marshal } = input;
  if (label === '') {
    throw new Error('label must not be empty: an empty label is not a subaccount');
  }
  if (passphrase.length === 0) {
    throw new PassphraseRequiredError();
  }

  const derivedSeed = deriveSubaccountSeed(seed, label);
  const key = marshalOpenSSHEd25519Key(derivedSeed, passphrase, {
    ...marshal,
    rounds: SUBACCOUNT_KDF_ROUNDS,
  });
  const report = buildIdentityReport({ seed: derivedSeed, keyBodyB64: key.keyBodyB64 });
  return { report, seed: derivedSeed, pem: key.pem, keyBodyB64: key.keyBodyB64 };
}
