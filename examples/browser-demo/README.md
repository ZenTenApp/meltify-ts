# Browser demo

A single-page demo of the `meltify-ts` core. It runs entirely in the tab: no
uploads, and the derive path makes no network calls (the served page ships a
`connect-src 'none'` CSP).

## Run it

```sh
npm install          # once
npm run demo         # builds app.js with esbuild, serves on http://localhost:5173
```

Open <http://localhost:5173>. `PORT=8080 npm run demo` to change the port.

`localhost` counts as a secure context, so `crypto.getRandomValues` works and
the throwaway-key path can generate a real encrypted key in-page. Serving the
files from a plain-`http` LAN address instead would disable that button (with a
clear error) but leave the derive path working.

## What to click

### 1. Nothing to set up: "Try a throwaway key"

Builds a password-protected Ed25519 key in the browser from seed `00..1f`
(bcrypt rounds = 1, so it is fast), decrypts it, and derives the report. This
exercises the whole pipeline — bcrypt_pbkdf, AES-256-CTR, all 30 derivations —
without you needing a key on disk.

Expected values for the pinned seed:

| Field     | Value                                                              |
| --------- | ------------------------------------------------------------------ |
| seed      | `000102…1e1f`                                                       |
| phrase    | `abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live bid rhythm alien crouch range attend journey unaware` |
| bitcoin   | `bc1qslk39wvggqa0vl8nd6jckaz54dw3vk45c5w60m`                        |
| ethereum  | `0xF9297b542BDb5DA50C364f9AE4Cbe1F3933bA40F`                        |
| solana    | `5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w`                      |
| bchat     | `bdcdd6e612dc6ac3edbc24da774bc6cfabc6c26ae7a4762b7612750329a7df1d35` |
| lines     | `renderText` → 72                                                    |

Uncheck "pin seed" to get a random identity each run.

### 2. Your own key

```sh
ssh-keygen -t ed25519 -f /tmp/demo_key -C "demo"
```

Choose (or drag) `/tmp/demo_key` into the file picker, enter the passphrase,
click **Derive identity**. The real key uses bcrypt rounds 16, so expect a short
pause (tens of milliseconds) rather than the instant throwaway result.

Compare against the Go binary if you have it:

```sh
NO_COLOR=1 meltify-info --key /tmp/demo_key   # then paste the passphrase
```

The seed, phrase, npub, fingerprint, 30 addresses, and bchat line must match
exactly.

### 3. Secrets are masked by default

Seed, 24-word phrase, nsec, and the private-key block render as `•` until you
tick **reveal secrets**. `copy` still copies the real value. This is a
deliberate demo-only deviation — meltify's terminal output has no masking.

### 4. Parity self-check

The bottom panel re-runs the golden assertions on load (round-trip, phrase,
fingerprint shape, 30 addresses, BTC/ETH/SOL/bchat, 72 lines, no `Buffer`).
It should read all `PASS`. Anything red means the browser bundle diverged.

## Error paths worth trying

| Input                                   | Expected                                             |
| --------------------------------------- | ---------------------------------------------------- |
| unprotected key (`ssh-keygen` w/o pass) | `key-not-password-protected`                         |
| wrong passphrase                        | `key-parse` — incorrect passphrase or corrupt key    |
| empty passphrase                        | `passphrase-required`                                |
| RSA key                                 | `unsupported-key-type`                               |
| non-key text                            | `key-parse` — no `-----BEGIN OPENSSH PRIVATE KEY-----` |

These come from `MeltifyError` subclasses, so a host app can branch on
`error.code` instead of matching strings.

## How it is wired

`app.ts` imports `../../src/index.ts` directly, so the demo always tracks the
source rather than a stale `dist/`. `dev.mjs` bundles it with
`--platform=browser` (the same setting CI uses to prove the core has no Node
built-ins) and serves the directory with `node:http` — no dev-server dependency.

`npm run demo:build` produces `app.js` without starting a server, mostly to
inspect the bundle size (~278 KiB unminified, sourcemap included).

## Caveat

This is a demo harness, not a product UI: it has no routing, no state
management, and no secret-handling hardening beyond masking. If you build a real
front end, treat the seed as the crown jewel — it is unencrypted in memory for
the lifetime of the report object.
