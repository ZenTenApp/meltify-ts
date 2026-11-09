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
