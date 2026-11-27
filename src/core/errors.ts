/**
 * Typed errors for meltify-ts.
 *
 * Messages intentionally mirror the Go meltify CLI so the future CLI adapter can
 * reproduce its stderr/exit behavior, while the library keeps structured codes.
 */

export type MeltifyErrorCode =
  | 'key-not-password-protected'
  | 'passphrase-required'
  | 'unsupported-key-type'
  | 'unsupported-kdf-rounds'
  | 'key-parse'
  | 'invalid-mnemonic'
  | 'derivation';

export class MeltifyError extends Error {
  readonly code: MeltifyErrorCode;

  constructor(code: MeltifyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MeltifyError';
    this.code = code;
  }
}

export class KeyNotPasswordProtectedError extends MeltifyError {
  constructor() {
    super(
      'key-not-password-protected',
      'key is not password-protected: keys are required to be password-protected',
    );
    this.name = 'KeyNotPasswordProtectedError';
  }
}

export class PassphraseRequiredError extends MeltifyError {
  constructor() {
    super('passphrase-required', 'passphrase is required');
    this.name = 'PassphraseRequiredError';
  }
}

export class UnsupportedKeyTypeError extends MeltifyError {
  constructor(detail: string) {
    super('unsupported-key-type', detail);
    this.name = 'UnsupportedKeyTypeError';
  }
}

/**
 * The key declares a bcrypt work factor outside the range the caller allows.
 *
 * Kept separate from `KeyParseError` so a UI can say "this key's work factor
 * is too weak or too high" instead of "this is not a valid key". The declared
 * count is unencrypted header metadata, so it is safe to show.
 */
export class UnsupportedKdfRoundsError extends MeltifyError {
  readonly declaredRounds: number;
  readonly minRounds: number;
  readonly maxRounds: number;

  constructor(declaredRounds: number, minRounds: number, maxRounds: number) {
    super(
      'unsupported-kdf-rounds',
      `key uses ${declaredRounds} bcrypt KDF rounds; accepted range is ${minRounds} to ${maxRounds}`,
    );
    this.name = 'UnsupportedKdfRoundsError';
    this.declaredRounds = declaredRounds;
    this.minRounds = minRounds;
    this.maxRounds = maxRounds;
  }
}

export class KeyParseError extends MeltifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('key-parse', message, options);
    this.name = 'KeyParseError';
  }
}
