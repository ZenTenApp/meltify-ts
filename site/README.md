# meltify site

The production front end for `meltify-ts`: a static page that unlocks a
password-protected Ed25519 OpenSSH key in the browser and shows the full
identity report. No server, no uploads, no analytics.

```
site/
  index.html            app shell (asset placeholders filled at build time)
  src/
    main.ts             hash router, tabs, global wipe
    app-types.ts        TabId + view context
    lib/                dom, clipboard, download, hex, store, worker client, value blocks
    views/              derive, report, chains, compat, phrases, keys, selfcheck
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

## What each tab does

| Tab | Feature |
| --- | --- |
| Derive | File drop or paste, passphrase, optional subaccount label, throwaway key (pinned seed `00..1f` or random; its fixed `test-passphrase` is filled in and shown) |
| Report | Secret + public blocks, per-field reveal, public/full JSON export, subaccount key download, wipe |
| Chains | 30 labeled addresses grouped by family, filter, CSV export |
| meltify-info | `renderText` output in meltify-info's own colours, `.txt` download (plain form is the parity target) |
| Phrase lab | seed → MELT/CryptoNote phrase, phrase → BIP39 seed, 25-word phrase → Monero/Beldex/BChat |
| Key tools | Marshal a new password-protected key (rounds 1 or 16) and hand it to Derive |
| Self-check | Re-runs the pinned Go vectors against the loaded bundle |

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
- **Subaccounts are a label on Derive, not a tab.** Filling in the subaccount
  label derives the child identity in the same worker call and re-encodes the key
  with the same passphrase at bcrypt rounds 1, exactly like `meltify-info
  --subaccount`. Every other tab then shows the subaccount's identity, the
  Report footer names the label, and the Report export offers the re-encoded
  subaccount key. An empty label is the source key. The label itself is not
  secret, and it is the only thing that has to be remembered to get the
  subaccount back.
- **Colour means secrecy.** A `valueBlock` marked `secret` paints red, matching
  the binary's private-value colour; anything unmasked is green. The
  meltify-info tab reuses `renderText({ color: true })` and converts its SGR
  sequences to spans (`lib/ansi.ts`), so the palette is never duplicated here.
- **Clipboard has a fallback.** `navigator.clipboard` needs a secure context;
  the legacy `execCommand` path keeps copy working over plain http on a LAN.
- **Hash routing only.** No rewrite rules needed, so the build drops into
  `public_html/` or a subdirectory unchanged.

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

The links in `index.html` are relative and routing is hash-only, so no build
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
4. **Try a throwaway key** works — it needs `crypto.getRandomValues`, which is
   available over http too, but serve over HTTPS anyway: without a secure
   context the clipboard falls back to the legacy path.

The worker is a separate file under `assets/`. If your host blocks or mangles
module workers, the symlink-free fix is to keep `assets/` intact and confirm
`text/javascript` is served for `.js` (the `.htaccess` sets `AddType`).

## Verification

`npm run verify` includes `site:typecheck`. Beyond that, the build was checked
by booting the bundle in jsdom (7 views mount, worker URL resolves) and by
running the built worker bundle against the golden seed: 31/32 self-check rows
pass, the 32nd ("no Buffer global") is browser-only and fails under Node by
design.
