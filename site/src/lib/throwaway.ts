/**
 * The fixed passphrase for throwaway keys.
 *
 * It is public on purpose: it is the same string the Go fixtures use, it ships
 * in this bundle either way, and a throwaway key protects nothing. The Derive
 * view shows it beside the key it opens, so the two must not drift apart —
 * both the worker (which mints the key) and the view (which labels it) read it
 * from here.
 */
export const THROWAWAY_PASSPHRASE = 'test-passphrase';

/**
 * The BIP39 passphrase filled in for throwaway runs.
 *
 * Derive requires a BIP39 passphrase like it requires a subaccount label, so the
 * throwaway flow has to supply one. It is public and fixed for the same reasons
 * as the key passphrase above: it protects nothing, and the button's job is to
 * show a working example of the real form. It is not empty on purpose — the
 * pinned throwaway identity is then a passphrase run, matching what the site
 * actually asks of users.
 */
export const THROWAWAY_BIP39_PASSPHRASE = 'test-bip39-passphrase';
