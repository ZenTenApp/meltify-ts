/**
 * The pinned passphrase for the self-check's fixture key.
 *
 * The parity self-check builds one encrypted key from the golden seed
 * (`00..1f`) and derives it, so the browser bundle is checked against the same
 * Go vectors as the test suite. It needs a passphrase to encrypt with; this one
 * is public and fixed, because the key exists only inside the worker's memory
 * for the duration of the check and protects nothing.
 */

export const SELF_CHECK_PASSPHRASE = 'test-passphrase';

/**
 * The BIP39 passphrase for the self-check's passphrase row.
 *
 * `meltify-info` has no 25th-word flag, so no Go vector covers this path; the
 * self-check has to supply one to pin that a BIP39 passphrase moves the
 * BIP39-seeded rows and leaves the seed, the phrases, the SSH key, Monero and
 * Beldex alone. Public and fixed for the same reason as the one above.
 */
export const SELF_CHECK_BIP39_PASSPHRASE = 'test-bip39-passphrase';
