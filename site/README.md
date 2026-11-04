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
| Derive | File drop or paste, passphrase, throwaway key (pinned seed `00..1f` or random) |
| Report | Secret + public blocks, reveal toggle, public/full JSON export, wipe |
| Chains | 30 labeled addresses grouped by family, filter, CSV export |
| meltify-info | `renderText` output, ANSI toggle, `.txt` download (plain form is the parity target) |
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
- **Masking is cosmetic.** Seed, phrase, nsec, and the private-key body render as
  bullets until revealed, but they are plain strings in memory — same caveat as
  the terminal tool.
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
subdirectory of an existing cPanel application's document root — for example
`public_html/meltify/`, served at `https://your-domain/meltify/`. Do not upload
into the document root itself: the `.htaccess` here sets a site-wide CSP and
year-long `immutable` caching for every `.js`/`.css` beneath it, which would
break whatever else lives there.

The links in `index.html` are relative and routing is hash-only, so no build
change is needed for the subdirectory and no rewrite rules are involved.

### From GitHub Actions

`.github/workflows/deploy.yml` builds, gates, and syncs `site/dist/` over FTPS.
Prerequisites, all outside the repo:

- An FTP user whose home directory (chroot) can see `public_html/` — the main
  cPanel account, or an FTP account with its directory set to `public_html`.
- Repository secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`.
- Optional repository variable `SITE_URL` (absolute URL of the deployed
  directory). When set, a post-deploy smoke test fetches the page and asserts
  the CSP header is present.

The workflow's `SERVER_DIR` is allowlisted to exactly that one subdirectory and
the upload uses `dangerous-clean-slate`, so that directory must belong to this
site alone.

Then check:

1. `https://your-domain/meltify/` loads, and the badge says "offline by policy".
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
