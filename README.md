# meltify-ts

A TypeScript port of [`ZenTenApp/meltify`](https://github.com/ZenTenApp/meltify), starting
with **`meltify-info` parity**.

`meltify-info` takes one password-protected Ed25519 OpenSSH private key and prints a
deterministic identity report: the raw seed, a 24-word MELT phrase, Nostr keys, the SSH
fingerprint/public key, 30 chain addresses, and the Beldex BChat chat ID.

This package is the **isomorphic core plus its test suite**, with a small browser demo
harness under `examples/browser-demo/` and the production front end under `site/`.
There is no CLI yet (a deliberate later milestone). The core has no Node built-ins: it
runs in Node or a browser bundle.

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
| M6 | `--subaccount` wired end-to-end | done (core + site) |
| M7 | Differential CI against the Go binary | not started |
| M8 | Monero subaddresses + Unstoppable/Cake section (`meltify-monero` parity) | done (core + site) |

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

For a subaccount (`meltify-info --subaccount <label>`), use `buildSubaccountReport`:

```ts
import { buildSubaccountReport } from 'meltify-ts';

const sub = buildSubaccountReport({ seed: parsed.seed, label: 'work', passphrase });
console.log(renderText(sub.report, { color: false })); // sub.report, sub.seed, sub.pem
```

### BIP39 passphrase (optional in the core, required in the site)

Both report builders take an optional `bip39Passphrase` — the "25th word" fed to the
PBKDF2 step that turns the 24 words into the BIP39 seed. It defaults to `''`, which is the
standard derivation and the only one `meltify-info` can produce, so every golden vector is
unchanged.

```ts
buildIdentityReport({ seed: parsed.seed, keyBodyB64: parsed.keyBodyB64, bip39Passphrase });
buildSubaccountReport({ seed: parsed.seed, label: 'work', passphrase, bip39Passphrase });
```

A non-empty value moves the Nostr keys and all 28 BIP39-seeded address rows. It cannot move
the seed, the 24-word phrase, the CryptoNote phrase, the SSH key/fingerprint, Monero,
Beldex, or the BChat id — those never touch a BIP39 seed. Note what that means for a report:
the passphrase makes the same 24 words restore to a *different* wallet elsewhere, while the
25-word Monero phrase still stands on its own.

Lower-level pieces are exported too: `mnemonic24FromSeed`, `nostrKeysFromMnemonic`,
`deriveWalletAddresses`, `encodeLegacyMnemonic` / `decodeLegacyMnemonic`, `scReduce32`,
`bchatChatId`, `moneroAddressFromLegacy`, `beldexAddressFromLegacy`,
`moneroAddressesFromLegacy` / `beldexAddressesFromLegacy` (primary + subaddresses),
`cakeSpendKeyFromMnemonic` / `cakeLegacyPhraseFromMnemonic`, `deriveSubaccountSeed`, and the
OpenSSH marshaller used for subaccounts.

### Monero output (`meltify-monero` parity)

`buildMoneroReport` + `renderMoneroText` reproduce the sibling `meltify-monero` binary: the
CryptoNote legacy section (25-word seed, primary address, subaddresses `0,1`…`0,9`) and the
Unstoppable/Cake section (the 24-word MELT phrase, the 25-word seed Cake Wallet/Unstoppable
display for it, and the `4…` addresses from that seed).

```ts
import { buildMoneroReport, renderMoneroText } from 'meltify-ts';

// `seed` is the source key's seed, or a subaccount seed from deriveSubaccountSeed.
const monero = buildMoneroReport({ seed: parsed.seed });
console.log(renderMoneroText(monero, { color: false }));

monero.monero.subaddresses; // ['89JZ…', …] (0,1)…(0,9)
monero.cakePhrase;          // 25-word Cake/Feather seed
monero.beldex;              // same keys, Beldex primaries + subaddresses
```

`subaddressCount` overrides the 9 subaddresses per section. The Cake spend key comes from
BIP39 → `m/44'/128'/account'/0/0` reduced mod `l` with no Keccak, so the printed 25-word seed is
what Unstoppable shows for the MELT phrase — not the CryptoNote legacy seed printed above it.
The report also carries the Beldex primary address and its subaddresses, the way
`meltify-beldex` prints them; `renderMoneroText` prints Monero only, matching `meltify-monero`.

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
- Monero and Beldex legacy primaries, their `(0,1)` subaddresses, and the Cake Wallet
  spend key / 25-word seed / primary / `(0,1)` subaddress
- The full `meltify-monero` terminal text: `test/golden/monero-reference.txt` is the output of
  the built Go binary under `NO_COLOR=1` for seed `00..1f`, and `renderMoneroText` is diffed
  against it byte for byte rather than against its own snapshot

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
  derive/                       BIP39, SLIP-0010, NIP-06, chains, TON, CryptoNote, Cake
  report.ts                     structured IdentityReport
  monero-report.ts              structured MoneroReport (meltify-monero)
src/render/text.ts        terminal renderer (plain + ANSI)
src/render/monero-text.ts meltify-monero renderer (divider, subaddress blocks)
test/                     vitest suites, golden vectors, ssh-keygen fixtures
examples/browser-demo/    click-through demo page (esbuild bundle + node:http server)
site/                     production front end → static artifact in site/dist/
  src/worker/entry.ts     unlock + derive in a module worker
  public/.htaccess        CSP and caching for cPanel/Apache deploys
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
npm run site:dev  # build + serve the production site on http://localhost:5174
npm run site:build# static artifact in site/dist/ (what you upload to a host)
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

### Site

`site/` is the deployable front end: static files, no server, `site/dist/` is the
artifact. See [`site/README.md`](./site/README.md) for the tab-by-tab feature map,
the worker/secret-handling design, and the cPanel deployment steps (the CSP ships
as `site/public/.htaccess`).

### Releasing

`master` releases itself. `.github/workflows/release.yml` analyses Conventional
Commit types (`feat` → minor, `fix` → patch, breaking → major) and does nothing
at all for a `docs`/`chore`-only push. When a release is due it builds
`site/dist/`, syncs it to `https://nostr.box/meltify/` over SFTP, verifies the
live page, and only then tags `vX.Y.Z` and publishes the GitHub Release with the
bundle tarball attached. `CHANGELOG.md` and the version in `package.json` are
written by semantic-release, so do not edit either by hand.

## Notes and intentional deviations

- **Color output** approximates meltify's truecolor palette; ANSI byte-parity is not
  claimed. Plain (`NO_COLOR`) output is the parity target.
- **`man` / `completion` subcommands** are omitted; not relevant to the core.
- **Subaddresses** are derived by `moneroAddressesFromLegacy` / `beldexAddressesFromLegacy` and
  printed by `renderMoneroText`; `meltify-info`'s own output still lists only the primaries, so
  `renderText` is unchanged.
- **`--subaccount`** is exposed by the library and the site:
  `deriveSubaccountSeed(seed, label)` is the pure derivation, and
  `buildSubaccountReport({ seed, label, passphrase })` returns the report with the
  private-key block set to the re-encoded subaccount body. Matching meltify, the label is
  hashed as UTF-8 (`SHA256(SHA256(utf8(label)) ‖ seed)`), an empty label means "no
  subaccount", a passphrase is required, and the re-encryption keeps the source passphrase
  at bcrypt rounds 1 — so the PEM body differs on every run while the derived identity does
  not. The label is not printed anywhere, as upstream.
- Only `openssh-key-v1` containers are parsed. Legacy PEM/PKCS#8 Ed25519 containers are not
  accepted; meltify's documented input is an OpenSSH-format Ed25519 key.
- **The site requires a BIP39 passphrase; the library and `meltify-info` do not.** Upstream
  has no such flag, so a site report no longer reproduces `meltify-info`'s address rows:
  the fingerprint, the 24 words, the CryptoNote phrase and the Monero/Beldex/BChat rows
  still match, and the chain addresses do not. That is a deliberate site policy — it makes
  "which passphrase does this wallet use?" an explicit, answered question instead of a
  silent assumption — not parity with the Go binary. The core keeps `''` as its default so
  the differential suite and every golden stay valid.
- `test/fixtures/` contains **throwaway test keys** with the committed passphrase
  `test-passphrase`. They protect nothing and exist only to exercise the parser.

## Attribution

Third-party code and data notices are in [`NOTICE`](./NOTICE). Upstream meltify and this
port are the repository owner's work; the vendored bcrypt/Blowfish code retains its
original BSD-3/ISC notices.
