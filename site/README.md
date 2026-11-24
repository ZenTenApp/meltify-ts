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

Two nested browser-style tab strips under a strip of SSH keys, and the chrome
docked at the bottom:

| Row | Strip | Add button | Body below it |
| --- | --- | --- | --- |
| 1 | SSH key tabs | **+ Add key**, always labelled | draft tab body: file drop or paste, then a passphrase that stays disabled until the armored key validates as a protected Ed25519 key; **Add key** unlocks in the worker |
| 2 | Wallets (subaccounts) | **+ Add wallet**, always labelled | draft tab body: **private name** (the subaccount string, hashed verbatim) |
| 3 | Cards (BIP39 passphrases) | **+ Add card**, always labelled | draft tab body: **secret** (the 25th word, masked, optional) |

Tabs are numbered, never named: `1`, `1.2`, `1.2.3`, optionally followed by what
the node is called. A key shows `1 <comment>` from its OpenSSH key
(`ssh-keygen -C`), or `1 <npub…wxyz>` when it has no comment. A wallet or card
shows `1.1 <kind 0 name>`, else `1.1 <npub…wxyz>`, else just `1.1`. Numbers are
positional and derived on every render, so closing a tab renumbers the rest. An
uncommitted key tab reads **Add key**.

Rows 2 and 3 are disabled until a key exists and are hidden while a fixed
section is showing. Row 3 does not need a wallet: with the default wallet tab
selected, a card hangs off the key itself and derives the source identity with
that BIP39 passphrase, which is what `meltify-info` does when you pass a 25th
word to a key. Its cards are numbered as if that empty tab were wallet 1, so
every card title has three parts and no part is ever 0 (`1.1.2`).

The first tab of the wallet and card rows is immutable: a green dot in a tab
cell the same width as the others, carrying no text, that names the identity
*above* the row in its tooltip (`npub…wxyz - no subaccount`, `npub…wxyz - no
card`). It cannot be labelled or closed and is the way back to that identity
once wallets or cards exist. The body below the strips shows only the selected tab's content: an empty
tab shows nothing at all, a selected key shows only the leaf panel, and a
selected wallet's own panel gives way to a selected card's. Selecting a key
returns its wallet and card rows to their default tabs; selecting a wallet
returns its card row to the default tab.

Each row is its own horizontal scroller; the rows do not share a scroll
position. The first grid column is the empty/plain rail, and it is one tab wide:
keys have a blank cell there and start in the first tab column, while the wallet
and card rows keep their immutable empty tab pinned there. Selecting a tab
slides that row until the tab sits in the second column, immediately right of
the rail. Every tab is a fixed-width cell, Chrome-style: a long title truncates
with an ellipsis, and the tab never stretches. The row has enough trailing space
that even its last tab can reach the second column.

Each add button follows that row's last tab in normal flow, leaving the rest of
a wide row empty. Once the row overflows, the add button sticks to the right
edge and tabs scroll underneath it. Because the buttons follow their own rows,
they only line up vertically when those rows happen to have the same tab count.

`Self-check`, `Key tools` and `Phrase lab` are not tabs. They are buttons in the
dock, which sits at the bottom of the page and sticks to the bottom of the
viewport: brand, the three sections, the **hashatar** toggle, **wipe on tab hide**
and **Wipe now**. Keeping the chrome below the strips is what puts the first tab
flush with the top of the page, and a sticky dock keeps wipe reachable however
far you have scrolled. The first key that loads raises a one-time notice in the
dock, saying that wipe on leaving the tab is on; it offers **Turn off** and
**Got it** and does not return for the rest of the session.

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
- **A wallet tab is a subaccount, and its private name is hashed verbatim.** The
  private name is exactly the `--subaccount` string: `seed = SHA256(SHA256(utf8(private name)) ‖
  key seed)`, re-encoded with the key's passphrase at bcrypt rounds 1. The UI
  never trims it and never normalises it, because `meltify-info` hashes exactly
  these bytes — `work ` and `work` are different wallets, and the form says so
  when it sees whitespace or non-ASCII. There is no public name to type: the tab
  is numbered (`Wallet 1.2`) and a kind 0 name lives in the selected tab's panel.
- **A card tab is the BIP39 passphrase, and hiding it is the only difference.**
  Cards feed the PBKDF2 step in `buildIdentityReport({ bip39Passphrase })`, so they
  move the Nostr keys and the 28 BIP39-seeded address rows and leave the seed, the
  phrases, the SSH key, Monero and Beldex alone. `@scure/bip39` applies NFKD itself,
  so the UI adds no normalisation of its own. An empty card is a real card: the
  standard derivation, the one `meltify-info` produces.
- **Cards belong to an identity, not to a wallet.** A card list hangs off the
  selected wallet, and off the key itself when the empty wallet tab is selected:
  the passphrase applies to whatever identity is showing, and a 25th word moves
  nothing but BIP39-seeded rows, so no subaccount is needed to be a real
  derivation. The duplicate rule is scoped the same way — the same passphrase may
  exist once on a wallet and once on the key, because the seeds they act on
  differ.
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
- **Every tab carries a hashatar, behind a switch.** Key, wallet and card tabs
  draw a 14px avatar before their name, keyed on that node's whole npub, so two
  nodes that differ by one character look different. The **hashatar** toggle in
  the dock hides them, and while it is off no image is generated at all. `@hashatar/react` is a React component and this
  shell is plain DOM, so it uses the generator underneath it (`@hashatar/core`),
  paints the same 32×32 grid to a canvas, and caches the PNG as a `data:` URI —
  strips re-render on every store change, and the CSP already allows `data:`
  images. Nothing leaves the page (the generator is `js-sha256` over the string).
  A key has its npub as soon as it unlocks; a wallet or card has none until it
  derives, so its avatar appears then.
- **Kind 0 comes from relays, unverified.** Every wallet and card of a key is
  derived as soon as the key unlocks — not only the one whose tab is open —
  because each node has its own npub and therefore its own profile. When a node
  has an npub and no profile, the shell opens one subscription per relay (the CSP
  names exactly these: the kind 0 indexers `purplepag.es`, `user.kindpag.es`,
  `directory.yabu.me`, `profiles.nostr1.com`, then `relay.primal.net`,
  `relay.snort.social` and `nos.lol`) for `{"kinds":[0],"authors":[…]}`. The name
  is whatever a relay's event advertises — `display_name`, else `name`, newest
  `created_at` winning — so **nothing is verified against the npub**: any relay
  can put a name on a tab, and the tab marks that name with `?` while the panel
  says `unverified · <relay>`. A name you paste yourself is marked `paste` and
  outranks the relay's. One round, no retries, no wall-clock deadline: a round
  ends when every relay has finished (EOSE, CLOSED, an error, or sending nothing
  at all for 20 s). Nothing about the report depends on any of it, and no
  `picture` is loaded. Verification (NIP-01 id + BIP340 signature) is absent on
  purpose; NIP-01 serialises `[0, pubkey, created_at, kind, tags, content]` —
  six elements, with `kind` as its own element — should it ever come back.
- **No routing at all.** Tab selection is in-memory state, not the URL, so the
  build drops into `public_html/` or a subdirectory unchanged and a reload always
  starts from an empty **Add key** tab.

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

1. `https://nostr.box/meltify/` loads, and the badge says "keys stay local".
2. DevTools → Network shows two requests for the page itself after load. Opening a
   key adds one websocket per relay for its kind 0 profile, and nothing else.
3. Response headers include the `Content-Security-Policy` from `.htaccess`.
   cPanel needs `mod_headers` enabled (it is on standard cPanel/Apache builds).
4. Adding a wallet and a card under a key works — those need
   `crypto.getRandomValues` only for the key form, which is available over http
   too, but serve over HTTPS anyway: without a secure context the clipboard falls
   back to the legacy path.

The worker is a separate file under `assets/`. If your host blocks or mangles
module workers, the symlink-free fix is to keep `assets/` intact and confirm
`text/javascript` is served for `.js` (the `.htaccess` sets `AddType`).

## Verification

`npm run verify` includes `site:typecheck`. Beyond that, the built bundle was
booted in jsdom with a stubbed worker and driven through the real click paths:
strip order and defaults, the disabled rows below a key, section switching, key
commit, wallet/card drafts, the empty-private-name and duplicate refusals, the
whitespace warning, tab close and the global wipe. The built worker
bundle also runs against the golden seed: 46/47 self-check rows pass, the 47th
("no Buffer global") is browser-only and fails under Node by design.
