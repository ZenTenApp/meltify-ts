/**
 * meltify-ts — public API.
 *
 * The core is isomorphic (no Node built-ins); callers provide the armored key
 * text and passphrase, and get back a structured report or rendered text.
 */

export { MeltifyError, KeyNotPasswordProtectedError, PassphraseRequiredError, UnsupportedKeyTypeError, KeyParseError } from './core/errors.js';
export {
  parseEncryptedOpenSSHKey,
  decodeOpenSSHPem,
  isUnprotectedKey,
  sshFingerprintSha256,
  type ParsedOpenSSHKey,
} from './core/ssh/parse.js';
export {
  marshalOpenSSHEd25519Key,
  MeltifyRandomnessError,
  type MarshalOptions,
  type MarshalledOpenSSHKey,
} from './core/ssh/marshal.js';
export { buildIdentityReport, type IdentityReport, type BuildIdentityReportInput } from './core/report.js';
export { renderText, type RenderTextOptions } from './render/text.js';

export { mnemonic24FromSeed, seedFromMnemonic } from './core/derive/bip39.js';
export { nostrKeysFromMnemonic, type NostrKeys } from './core/derive/nostr.js';
export {
  encodeLegacyMnemonic,
  decodeLegacyMnemonic,
  scReduce32,
  bchatChatId,
  moneroAddressFromLegacy,
  beldexAddressFromLegacy,
  cryptonoteAddressFromLegacy,
  type CryptonotePublicKeys,
} from './core/derive/legacy.js';
export { deriveWalletAddresses, type LabeledAddress } from './core/derive/addresses.js';
