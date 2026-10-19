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

export class KeyParseError extends MeltifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('key-parse', message, options);
    this.name = 'KeyParseError';
  }
}
