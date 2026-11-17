# meltify site

The production front end for `meltify-ts`: a static page that unlocks a
password-protected Ed25519 OpenSSH key in the browser and shows the full
identity report. No server, no uploads, no analytics.

```
site/
  index.html            app shell (asset placeholders filled at build time)
  src/
    main.ts             shell: three tab strips, body routing, derive driver, wipe
    app-types.ts        shell context for the fixed section views
    lib/                dom, clipboard, download, hex, store (tab tree), tabstrip,
                        worker client, value blocks
    views/              keyform, keyspace, leaf, report, chains, compat, phrases, keys,
                        selfcheck
    worker/entry.ts     derive worker (bcrypt/AES + all derivations)
    styles/main.css
  public/.htaccess      CSP + caching for Apache/cPanel (copied into dist)
  build.mjs             esbuild build → site/dist/
  serve.mjs             static server with the same CSP as .htaccess
```

The site imports the library through the `meltify-ts` alias (`src/index.ts`), so
it always compiles against the current source, never a stale `dist/`.

## Commands

```sh
npm run site:dev        # build (dev) + serve on http://localhost:5174
npm run site:build      # minified, hashed assets → site/dist/
npm run site:serve      # serve the last build
npm run site:typecheck  # tsc -p site/tsconfig.json
PORT=8080 npm run site:serve
```

`site/dist/` is the deployable artifact: `index.html`, `assets/` (hashed, immutable),
and `.htaccess`.

## Layout

Three nested browser-style tab strips, in order:

| Row | Strip | `+` behaviour | Body below it |
| --- | --- | --- | --- |
| 1 | Fixed sections (Self-check, Key tools, Phrase lab) │ SSH key tabs | opens a key draft tab; labelled `+` only when there is nothing yet — the draft tab itself reads **Add SSH Key** and is selected on load | key form: file drop or paste, passphrase, tab name; **Add SSH key** unlocks in the worker. *Try a throwaway key* uses the pinned seed `00..1f` or a random one |
| 2 | Wallets (subaccounts) | `+ Add wallet` on an empty row, `+` after that | draft tab body: **secret** (the subaccount string, hashed verbatim) and **name** |
| 3 | Cards (BIP39 passphrases) | `+ Add card` / `+` | draft tab body: **secret** (the 25th word, masked, optional) and **name** |

Rows 2 and 3 are disabled until a key exists and are hidden while a fixed
section is showing. Each of those rows starts with an immutable **empty tab**:
unlabelled, green, not closable and not renameable. It is the node *above* the
row — the key with no wallet on row 2, the wallet with no card (the standard,
empty BIP39 passphrase) on row 3 — and selecting it is how you get back to that
identity once wallets or cards exist. Everything you type lives in the body
under the strip, never inside a tab. Double-click a committed tab to rename
it — the label only, never the secret.

The deepest selected tab is the **leaf**, and the leaf's identity is the panel at
the bottom: Report / Chains / meltify-info. A key with no wallet shows the source
identity; a wallet with no card shows the subaccount with the standard (empty)
BIP39 passphrase. Derivations are lazy — a leaf derives when it is selected and
is cached on its tab.

No duplicates: keys are deduplicated by PEM text, wallets by the subaccount
string (byte-for-byte), cards by the passphrase. A refused duplicate leaves the
draft tab open with the reason.

## Design notes

- **The seed never touches the main thread's hot path.** Unlock + derive run in
  a module worker (`worker/entry.ts`); bcrypt at rounds 16 is visible jank on a
  phone otherwise.
- **Nothing persists.** No localStorage, no cookies, no network: the served page
  ships `connect-src 'none'`, and "wipe on tab hide" (default on) drops the
  report when the tab is backgrounded.
- **Masking is cosmetic and per field.** Seed, phrase, nsec, and the private-key
  body each carry their own reveal button on the Report tab, but they are plain
  strings in memory — same caveat as the terminal tool.
- **A wallet tab is a subaccount, and its secret is hashed verbatim.** The wallet
  secret is exactly the `--subaccount` string: `seed = SHA256(SHA256(utf8(secret)) ‖
  key seed)`, re-encoded with the key's passphrase at bcrypt rounds 1. The UI never
  trims it and never normalises it, because `meltify-info` hashes exactly these
  bytes — `work ` and `work` are different wallets, and the form says so when it
  sees whitespace or non-ASCII. The wallet *name* is display only and can be
  changed at any time.
- **A card tab is the BIP39 passphrase, and hiding it is the only difference.**
  Cards feed the PBKDF2 step in `buildIdentityReport({ bip39Passphrase })`, so they
  move the Nostr keys and the 28 BIP39-seeded address rows and leave the seed, the
  phrases, the SSH key, Monero and Beldex alone. `@scure/bip39` applies NFKD itself,
  so the UI adds no normalisation of its own. An empty card is a real card: the
  standard derivation, the one `meltify-info` produces.
- **The BIP39 passphrase is optional too, and recommended the same way.** It is fed
  to the PBKDF2 step in `buildIdentityReport({ bip39Passphrase })`, so it moves the
  Nostr keys and the 28 BIP39-seeded address rows and leaves the seed, the phrases,
  the SSH key, Monero and Beldex alone. Empty is the standard derivation, the one
  `meltify-info` produces, so an empty run does reproduce the binary's addresses; a
  filled one does not, and the UI says so rather than hiding it. The public JSON
  export marks a set passphrase `[set — not exported]` (and omits the marker when it
  is empty) while the full export includes it, because the addresses cannot be
  reproduced without it.
- **Colour means secrecy.** A `valueBlock` marked `secret` paints red, matching
  the binary's private-value colour; anything unmasked is green. The
  meltify-info tab reuses `renderText({ color: true })` and converts its SGR
  sequences to spans (`lib/ansi.ts`), so the palette is never duplicated here.
  The empty wallet and empty card tabs borrow that green: they hold no secret,
  and with no label they cannot name one.
- **Clipboard has a fallback.** `navigator.clipboard` needs a secure context;
  the legacy `execCommand` path keeps copy working over plain http on a LAN.
- **No routing at all.** Tab selection is in-memory state, not the URL, so the
  build drops into `public_html/` or a subdirectory unchanged and a reload always
  starts from an empty **Add SSH Key** tab.

## Deploying to cPanel

```sh
npm ci
npm run site:build
```

Upload the contents of `site/dist/` (including the dotfile `.htaccess`) into a
subdirectory of an existing cPanel application's document root — here
`public_html/meltify/` on `nostr.box`, served at `https://nostr.box/meltify/`.
Do not upload into the document root itself: the `.htaccess` here sets a
site-wide CSP and year-long `immutable` caching for every `.js`/`.css` beneath
it, which would break whatever else lives there.

The links in `index.html` are relative and there is no routing, so no build
change is needed for the subdirectory and no rewrite rules are involved.

The canonical URL ends in a slash: `https://nostr.box/meltify/`. Relative asset
links only resolve correctly from there, so `/meltify` must 301 to it — which is
what `DirectorySlash On` in `.htaccess` restores on hosts that disable it (they
otherwise answer the bare form with 404).

### From GitHub Actions

`.github/workflows/release.yml` runs a semantic-release pipeline, in the same
shape as NostrBox Kinds: Conventional Commit types decide whether a release is
due, and the bundle is built, gated, synced to the server, and verified live
**before** the tag is published. A `docs`/`chore`-only push to `master` stops
after the dry run and deploys nothing.

The transport is SFTP, not FTP. The cPanel account has SSH keys but no shell,
which rules out rsync (`rsync` needs to run its own binary on the far side), so
`lftp mirror` does the directory sync over SFTP: recursive, with `--delete` and
the `.well-known`/`cgi-bin` excludes. Two passes on purpose — new hashed assets
land first, the new `index.html` and the deletions last, so the page is never
briefly pointing at assets that are not there yet.

Prerequisites, all outside the repo:

- A deploy account with SFTP access to `public_html/` on `nostr.box`.
- Repository secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`,
  `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (and `MATRIX_ACCESS_TOKEN` for the
  notification). `DEPLOY_KNOWN_HOSTS` must be generated with
  `ssh-keyscan $DEPLOY_HOST` — an entry is keyed by the exact host string, and
  hashed entries from a local `~/.ssh/known_hosts` will not match.
- `DEPLOY_PATH` must be exactly `public_html/meltify`. The workflow refuses any
  other value: `--delete` makes that directory this site's alone, and
  `public_html` would delete `nostr.box` itself.

Then check:

1. `https://nostr.box/meltify/` loads, and the badge says "offline by policy".
2. DevTools → Network shows exactly two requests after load (no third parties).
3. Response headers include the `Content-Security-Policy` from `.htaccess`.
   cPanel needs `mod_headers` enabled (it is on standard cPanel/Apache builds).
4. **Try a throwaway key** works, and so does adding a wallet and a card under
   it — those need `crypto.getRandomValues`, which is available over http too, but
   serve over HTTPS anyway: without a secure context the clipboard falls back to
   the legacy path.

The worker is a separate file under `assets/`. If your host blocks or mangles
module workers, the symlink-free fix is to keep `assets/` intact and confirm
`text/javascript` is served for `.js` (the `.htaccess` sets `AddType`).

## Verification

`npm run verify` includes `site:typecheck`. Beyond that, the built bundle was
booted in jsdom with a stubbed worker and driven through the real click paths:
strip order and defaults, the disabled rows below a key, section switching, key
commit, wallet/card drafts, the empty-secret and duplicate refusals, the
whitespace warning, tab rename, tab close and the global wipe. The built worker
bundle also runs against the golden seed: 46/47 self-check rows pass, the 47th
("no Buffer global") is browser-only and fails under Node by design.
