# meltify-ts

A TypeScript port of [`ZenTenApp/meltify`](https://github.com/ZenTenApp/meltify), starting
with **`meltify-info` parity**.

`meltify-info` takes one password-protected Ed25519 OpenSSH private key and prints a
deterministic identity report: the raw seed, a 24-word MELT phrase, Nostr keys, the SSH
fingerprint/public key, 30 chain addresses, and the Beldex BChat chat ID.

This package is the **isomorphic core plus its test suite**, with a small browser demo
harness under `examples/browser-demo/`. There is no CLI yet (a deliberate later milestone).
The core has no Node built-ins: it runs in Node or a browser bundle.

> **Secret material.** The report contains the raw private seed. Treat its output as a
> secret; do not log it or send it anywhere.

## Status

| Milestone | Scope | State |
|---|---|---|
| M0 | Scaffold, golden fixtures, strict TS | done |
| M1 | 24-word phrase, Nostr NIP-06, SSH fingerprint/pubkey | done |
| M2 | BIP32/SLIP-0010 chains (14 derivations, 30 labels) | done |
| M3 | CryptoNote legacy phrase, Monero/Beldex primaries, BChat ID | done |
| M4 | OpenSSH parsing (bcrypt_pbkdf, AES-256-CTR, negative cases) | done |
| M5 | Structured report + byte-compatible text renderer | done |
| M6 | `--subaccount` wired end-to-end | marshaller exists, not wired |
| M7 | Differential CI against the Go binary | not started |

## Usage

```ts
import {
  parseEncryptedOpenSSHKey,
  buildIdentityReport,
  renderText,
} from 'meltify-ts';

const pem = await readFile('~/.ssh/id_ed25519', 'utf8'); // caller supplies I/O
const parsed = parseEncryptedOpenSSHKey(pem, passphrase); // rejects unprotected keys

const report = buildIdentityReport({
  seed: parsed.seed,
  keyBodyB64: parsed.keyBodyB64,
});

console.log(renderText(report, { color: false }));
```

`buildIdentityReport` returns a presentation-agnostic `IdentityReport`
(`addresses`, `npub`/`nsec`, `fingerprint`, `publicKeyLine`, `bchat`, ...).
`renderText` reproduces meltify's terminal layout; with `color: false` it is plain text
intended to be byte-identical to Go's `NO_COLOR=1` output.

Lower-level pieces are exported too: `mnemonic24FromSeed`, `nostrKeysFromMnemonic`,
`deriveWalletAddresses`, `encodeLegacyMnemonic` / `decodeLegacyMnemonic`, `scReduce32`,
`bchatChatId`, `moneroAddressFromLegacy`, `beldexAddressFromLegacy`, and the OpenSSH
marshaller used for subaccounts.

### Error behavior

| Condition | Error | Code |
|---|---|---|
| Unencrypted key | `KeyNotPasswordProtectedError` | `key-not-password-protected` |
| Empty passphrase | `PassphraseRequiredError` | `passphrase-required` |
| RSA / non-Ed25519 | `UnsupportedKeyTypeError` | `unsupported-key-type` |
| Wrong passphrase / malformed key | `KeyParseError` | `key-parse` |

Unprotected keys are rejected on purpose, matching meltify's policy.

## Verified against the Go reference

Derivations are locked by golden vectors copied from the Go repo
(`internal/derive/golden.go`, itself captured from seedify v1.36.0):

- 24-word MELT phrase, npub/nsec/hex, and all 14 chain derivations
  (BTC, BCH, ETH+EIP-55, SOL, TRX, LTC, DOGE, ATOM, XRP, XLM, SUI, SP, TON, XMR, BDX)
- 25-word CryptoNote phrase encode/decode and `scReduce32`
- Monero and Beldex legacy primaries

Independent checks beyond the upstream goldens:

- **BChat chat ID** for seed `00..1f` is pinned to
  `bdcdd6e612dc6ac3edbc24da774bc6cfabc6c26ae7a4762b7612750329a7df1d35`,
  computed separately from the Ed25519→Montgomery map. Upstream's test derives this value
  from its own implementation, so it is not an independent pin there.
- **`scReduce32`** is cross-checked against a separate BigInt mod-L reducer.
- **OpenSSH parsing** is exercised against real `ssh-keygen` output at bcrypt rounds 1 and
  16, including unprotected, RSA, wrong-passphrase, empty-passphrase, and garbage cases.
  The parsed key's public-key blob is compared to the `.pub` fixtures.

## Architecture

```
src/core/                 isomorphic (no Node built-ins)
  ssh/{parse,marshal,wire}.ts   openssh-key-v1 container, bcrypt_pbkdf, AES-256-CTR
  crypto/{bcrypt-pbkdf,crc}.ts  vendored/adapted primitives
  derive/                       BIP39, SLIP-0010, NIP-06, chains, TON, CryptoNote
  report.ts                     structured IdentityReport
src/render/text.ts        terminal renderer (plain + ANSI)
test/                     vitest suites, golden vectors, ssh-keygen fixtures
examples/browser-demo/    click-through demo page (esbuild bundle + node:http server)
```

Only audited, zero-dependency primitives are used: `@noble/hashes`, `@noble/curves`,
`@scure/bip39`, `@scure/bip32`, `@scure/base`, `@noble/ciphers`.

## Commands

```sh
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run check:core# bundle src/index.ts with platform=neutral (proves no Node imports)
npm run build     # emit dist/ + .d.ts
npm run verify    # all of the above
npm run demo      # build + serve the browser demo on http://localhost:5173
```

### Browser demo

```sh
npm run demo
```

Open <http://localhost:5173> and click **Try a throwaway key** — it generates a
password-protected key in the tab from seed `00..1f`, decrypts it, and derives the full
report, plus a self-check panel that compares against the pinned Go vectors. See
[`examples/browser-demo/README.md`](./examples/browser-demo/README.md) for the walkthrough.
The demo bundles with `--platform=browser`, which is the practical proof that nothing in
the core reaches for Node.

## Notes and intentional deviations

- **Color output** approximates meltify's truecolor palette; ANSI byte-parity is not
  claimed. Plain (`NO_COLOR`) output is the parity target.
- **`man` / `completion` subcommands** are omitted; not relevant to the core.
- **Subaddresses** are not derived: `meltify-info` only prints Monero/Beldex primaries.
  The CryptoNote codec is structured so subaddress derivation can be added for the other
  sibling binaries later.
- **`--subaccount`**: `marshalOpenSSHEd25519Key` supports the rounds=1 re-encryption and
  deterministic test randomness, but subaccount activation is not yet exposed by the report
  API (M6).
- Only `openssh-key-v1` containers are parsed. Legacy PEM/PKCS#8 Ed25519 containers are not
  accepted; meltify's documented input is an OpenSSH-format Ed25519 key.
- `test/fixtures/` contains **throwaway test keys** with the committed passphrase
  `test-passphrase`. They protect nothing and exist only to exercise the parser.

## Attribution

Third-party code and data notices are in [`NOTICE`](./NOTICE). Upstream meltify and this
port are the repository owner's work; the vendored bcrypt/Blowfish code retains its
original BSD-3/ISC notices.
