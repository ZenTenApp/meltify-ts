/**
 * App shell.
 *
 * Three tab strips — SSH keys, wallets, cards — plus a fixed row of sections
 * (self-check, key tools, phrase lab) inside the key strip. The deepest
 * selected tab is the *leaf*, and the leaf's identity is what the panel at the
 * bottom renders.
 *
 * Every view is built once and updated in place: switching tabs never loses
 * typed input, and nothing survives a reload (there is no storage anywhere).
 */

import './styles/main.css';
import { must, toast } from './lib/dom.ts';
import {
  activeKey,
  addCardDraft,
  addWalletDraft,
  getState,
  leafOf,
  newKeyDraft,
  removeCard,
  removeKey,
  removeWallet,
  renameNode,
  resetAll,
  selectCard,
  selectWallet,
  selectKey,
  findNode,
  npubTag,
  selectSection,
  setProfileSearch,
  setDerived,
  setDeriving,
  setError,
  subscribe,
  type AppState,
  type CardTab,
  type Identity,
  type KeyTab,
  type LeafInfo,
  type SectionId,
  type WalletTab,
} from './lib/store.ts';
import { hashatarImage } from './lib/hashatar.ts';
import {
  applyKnownProfiles,
  askPubkeys,
  clearProfileBook,
  createProfileBook,
  forgetPubkey,
  recordProfile,
  watching,
} from './lib/profiles.ts';
import { DEFAULT_RELAYS, fetchProfiles } from './lib/relays.ts';
import { createStrip } from './lib/tabstrip.ts';
import { deriveFromKey } from './lib/worker-client.ts';
import { mountKeySpace, type KeySpace } from './views/keyspace.ts';
import { mountLeaf, type LeafPanel } from './views/leaf.ts';
import { mountKeys } from './views/keys.ts';
import { mountPhrases } from './views/phrases.ts';
import { mountSelfCheck } from './views/selfcheck.ts';
import type { Ctx } from './app-types.ts';

/**
 * Ids for the immutable empty tab at the left of the wallet and card rows. They
 * are not store nodes: selecting one means "this key with no wallet" or "this
 * wallet with no card" (the standard, empty BIP39 passphrase).
 */
const EMPTY_WALLET = 'none:wallet';
const EMPTY_CARD = 'none:card';

function main(): void {
  const stripHost = must<HTMLElement>('#strips');
  const body = must<HTMLElement>('#views');

  /** Draw the hashatar before tab names. Session-only, like every other switch. */
  let showHashatar = true;

  const majorStrip = createStrip();
  const walletStrip = createStrip();
  const cardStrip = createStrip();
  stripHost.append(majorStrip.root, walletStrip.root, cardStrip.root);

  const spaces = new Map<string, KeySpace>();
  const sectionViews = new Map<SectionId, HTMLElement>();
  const inFlight = new Set<string>();

  const ctx: Ctx = {
    section: (id) => selectSection(id),
    newKey: (pem, passphrase) => {
      newKeyDraft(pem ?? '', passphrase ?? '');
    },
    wipe: () => wipe('Wiped from memory'),
    searchProfiles: (nodeId) => searchProfilesAgain(nodeId),
  };

  const leaf: LeafPanel = mountLeaf(ctx);

  const SECTION_BUTTONS: readonly { id: SectionId; element: HTMLButtonElement }[] = [
    { id: 'selfcheck', element: must<HTMLButtonElement>('#sec-selfcheck') },
    { id: 'keytools', element: must<HTMLButtonElement>('#sec-keytools') },
    { id: 'phrases', element: must<HTMLButtonElement>('#sec-phrases') },
  ];
  for (const entry of SECTION_BUTTONS) {
    entry.element.addEventListener('click', () => selectSection(entry.id));
  }

  const sectionMounts: Record<SectionId, () => HTMLElement> = {
    selfcheck: () => mountSelfCheck(ctx),
    keytools: () => mountKeys(ctx),
    phrases: () => mountPhrases(ctx),
  };

  function spaceFor(key: KeyTab): KeySpace {
    const existing = spaces.get(key.id);
    if (existing !== undefined) return existing;
    const space = mountKeySpace(key, ctx);
    spaces.set(key.id, space);
    return space;
  }

  function showSection(id: SectionId): void {
    for (const space of spaces.values()) space.root.hidden = true;
    let view = sectionViews.get(id);
    if (view === undefined) {
      view = sectionMounts[id]();
      sectionViews.set(id, view);
      body.append(view);
    }
    for (const [other, node] of sectionViews) node.hidden = other !== id;
  }

  function showKey(key: KeyTab): void {
    for (const node of sectionViews.values()) node.hidden = true;
    const space = spaceFor(key);
    for (const [id, node] of spaces) node.root.hidden = id !== key.id;
    if (space.root.parentElement !== body) body.append(space.root);
    space.render(key);
    space.leafSlot.replaceChildren();
    if (key.status === 'ready') space.leafSlot.append(leaf.root);
  }

  async function ensureDerived(state: AppState): Promise<void> {
    const info = leafOf(state);
    if (info === null) return;
    await deriveOne(info);
  }

  /** Nodes whose derivation was attempted, so a failure never loops. */
  const attempted = new Set<string>();
  let pumping = false;

  /**
   * Every wallet and card of every ready key that still has no identity. The
   * kind 0 lookup needs each node's own npub, so they are derived on the way to
   * it rather than only when a tab is selected.
   */
  function pendingDerivations(state: AppState): LeafInfo[] {
    const out: LeafInfo[] = [];
    const push = (
      key: KeyTab,
      wallet: WalletTab | null,
      card: CardTab | null,
      node: KeyTab | WalletTab | CardTab,
      kind: LeafInfo['kind'],
    ): void => {
      if (node.status !== 'ready' || node.identity !== null || node.deriving) return;
      if (inFlight.has(node.id) || attempted.has(node.id)) return;
      out.push({ key, wallet, card, node, kind });
    };
    for (const key of state.keys) {
      if (key.status !== 'ready') continue;
      for (const card of key.cards) push(key, null, card, card, 'card');
      for (const wallet of key.wallets) {
        push(key, wallet, null, wallet, 'wallet');
        for (const card of wallet.cards) push(key, wallet, card, card, 'card');
      }
    }
    return out;
  }

  /** Running derivations, so the pump can wait out ones it did not start. */
  const running = new Map<string, Promise<void>>();

  /**
   * Walks the rest of the tree one derivation at a time, then asks for profiles.
   * It waits for the leaf's derivation too, so the whole set goes out in one
   * round instead of one round per node.
   */
  async function pumpDerivations(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const next = pendingDerivations(getState())[0];
        if (next !== undefined) {
          await deriveOne(next);
          continue;
        }
        if (running.size > 0) {
          await Promise.all([...running.values()]);
          continue;
        }
        break;
      }
    } finally {
      pumping = false;
      fetchMissingProfiles();
    }
  }

  function deriveOne(info: LeafInfo): Promise<void> {
    const node = info.node;
    if (node.status !== 'ready' || node.identity !== null || node.deriving) return Promise.resolve();
    if (inFlight.has(node.id)) return running.get(node.id) ?? Promise.resolve();

    inFlight.add(node.id);
    attempted.add(node.id);
    setDeriving(node.id, true);
    const work = (async (): Promise<void> => {
      try {
        const result = await deriveFromKey(
          info.key.pem,
          info.key.passphrase,
          info.kind === 'card' ? info.card?.secret ?? '' : '',
          info.kind === 'key' ? '' : info.wallet?.secret ?? '',
        );
        setDerived(node.id, identityOf(info, result));
      } catch (error) {
        setError(node.id, errorText(error));
      } finally {
        inFlight.delete(node.id);
        running.delete(node.id);
      }
    })();
    running.set(node.id, work);
    return work;
  }

  function identityOf(info: LeafInfo, result: Awaited<ReturnType<typeof deriveFromKey>>): Identity {
    return {
      report: result.report,
      seedHex: result.seedHex,
      elapsedMs: result.elapsedMs,
      source: info.key.source === '' ? info.key.label : info.key.source,
      subaccount: info.kind === 'key' ? '' : info.wallet?.secret ?? '',
      bip39Passphrase: info.kind === 'card' ? info.card?.secret ?? '' : '',
      ...(result.pem === undefined ? {} : { subaccountPem: result.pem }),
      derivedAt: Date.now(),
    };
  }

  function errorText(error: unknown): string {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code;
      return code === undefined ? error.message : `${code} — ${error.message}`;
    }
    return String(error);
  }

  /**
   * A key, wallet or card hashatar, keyed on the node's whole npub so any
   * difference shows. There is no npub until that node has derived, and the strip
   * simply draws nothing until then.
   */
  function hashatarIcon(identity: Identity | null): string | undefined {
    if (identity === null || !showHashatar) return undefined;
    return hashatarImage(identity.report.npub) ?? undefined;
  }

  /**
   * Hover text for a node's kind 0. Every node — key, wallet, card — has its own
   * npub and therefore its own lookup, so every tab can answer this.
   */
  function profileTitle(node: KeyTab | WalletTab | CardTab): string {
    const profile = node.profile;
    if (profile !== null) {
      const how = profile.verified
        ? `verified via ${profile.via}`
        : profile.via === 'paste'
          ? 'pasted'
          : `unverified via ${profile.via}`;
      return `kind 0: ${profile.name} (${how})`;
    }
    const search = node.search;
    if (search === null) return 'kind 0: not searched yet';
    if (search.state === 'searching') return `kind 0: asking ${DEFAULT_RELAYS.length} relays…`;
    return `kind 0: nothing found (${search.relays.length} relays)`;
  }

  /**
   * What a tab draws next to its label: '…' while its lookup runs, '?' when the
   * name it shows came from an event that did not verify.
   */
  function profileMark(node: KeyTab | WalletTab | CardTab): string | undefined {
    if (node.search?.state === 'searching') return '…';
    const profile = node.profile;
    return profile !== null && !profile.verified && profile.via !== 'paste' ? '?' : undefined;
  }

  /** Hover text for a key tab: the label, the full npub, and its wallet count. */
  function keyTitle(key: KeyTab): string {
    if (key.status === 'draft') return 'Uncommitted key tab';
    const npub = key.identity === null ? '' : ` · ${key.identity.report.npub}`;
    const wallets = `${key.wallets.length} wallet${key.wallets.length === 1 ? '' : 's'}`;
    return `${key.label} — ${wallets}${npub} · ${profileTitle(key)}`;
  }

  /** The name the default tab of the card row gives the node above it. */
  function defaultTabTitle(identity: Identity | null): string {
    const tag = identity === null ? 'no npub' : npubTag(identity.report.npub);
    return `${tag} - no card`;
  }

  function renderWalletStrip(key: KeyTab | null): void {
    walletStrip.root.hidden = key === null;
    if (key === null) return;
    const ready = key.status === 'ready';
    const wallets = key.wallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.label,
      draft: wallet.status === 'draft',
      icon: hashatarIcon(wallet.identity),
      mark: wallet.deriving ? '·' : profileMark(wallet),
      title:
        wallet.status === 'draft'
          ? `${wallet.label} (unsaved)`
          : `${wallet.label} — ${wallet.cards.length} card${wallet.cards.length === 1 ? '' : 's'} · ${profileTitle(wallet)}`,
    }));
    walletStrip.render({
      label: 'Wallets',
      variant: 'sub',
      fill: true,
      tabs: [
        {
          id: EMPTY_WALLET,
          // No visible text: the tab is a finger-sized dot. The label it would
          // have carried stays in the tooltip (and the aria-label).
          label: '',
          plain: true,
          title:
            key.identity === null
              ? 'no subaccount'
              : `${npubTag(key.identity.report.npub)} - no subaccount`,
        },
        ...wallets,
      ],
      activeId: key.activeWallet ?? EMPTY_WALLET,
      addLabel: wallets.length === 0 ? '+ Add wallet' : '+',
      addTitle: 'Add wallet',
      disabled: !ready,
      disabledNote: ready ? undefined : 'add a key first',
      onSelect: (id) => selectWallet(key.id, id === EMPTY_WALLET ? null : id),
      onAdd: () => {
        addWalletDraft(key.id);
      },
      onClose: (id) => {
        if (id === EMPTY_WALLET) return;
        spaces.get(key.id)?.forget(id);
        removeWallet(key.id, id);
      },
      onRename: (id, label) => {
        if (id !== EMPTY_WALLET) renameNode(id, label);
      },
    });
  }

  function renderCardStrip(key: KeyTab | null, wallet: WalletTab | null): void {
    cardStrip.root.hidden = key === null;
    if (key === null) return;
    // Cards hang off the selected wallet, or off the key itself when no wallet is
    // selected. Only a draft wallet blocks them.
    const host = wallet ?? key;
    const walletId = wallet?.id ?? null;
    const ready = key.status === 'ready' && (wallet === null || wallet.status === 'ready');
    const cards = host.cards;
    const cardTabs = cards.map((card) => ({
      id: card.id,
      label: card.label,
      draft: card.status === 'draft',
      icon: hashatarIcon(card.identity),
      mark: card.deriving ? '·' : profileMark(card),
      title:
        card.status !== 'ready'
          ? `${card.label} (unsaved)`
          : `${card.secret === '' ? `${card.label} — no passphrase` : `${card.label} — passphrase set`} · ${profileTitle(card)}`,
    }));
    cardStrip.render({
      label: 'Cards',
      variant: 'minor',
      fill: true,
      tabs: [
        {
          id: EMPTY_CARD,
          label: '',
          plain: true,
          title: defaultTabTitle(host.identity),
        },
        ...cardTabs,
      ],
      activeId: host.activeCard ?? EMPTY_CARD,
      addLabel: cardTabs.length === 0 ? '+ Add card' : '+',
      addTitle: 'Add card',
      disabled: !ready,
      disabledNote: !ready
        ? key.status === 'ready'
          ? 'create the wallet first'
          : 'add a key first'
        : undefined,
      onSelect: (id) => {
        selectCard(key.id, walletId, id === EMPTY_CARD ? null : id);
      },
      onAdd: () => {
        addCardDraft(key.id, walletId);
      },
      onClose: (id) => {
        if (id === EMPTY_CARD) return;
        spaces.get(key.id)?.forget(id);
        removeCard(key.id, walletId, id);
      },
      onRename: (id, label) => {
        if (id !== EMPTY_CARD) renameNode(id, label);
      },
    });
  }

  /** What has been asked and answered, per pubkey, across the whole tree. */
  const profileBook = createProfileBook();
  /** Guards the synchronous planning pass only: naming nodes emits and re-enters. */
  let planning = false;

  /**
   * Sends one round of kind 0 subscriptions for every pubkey still missing a
   * name, and names every node that advertises it. A round is per pubkey, but a
   * name belongs to each node with that pubkey: a card with an empty passphrase
   * is its parent's identity, so both get the answer.
   *
   * Rounds may overlap. A relay that is slow to finish holds only its own round,
   * never the next one: the pubkeys it is asking are already marked asked, so a
   * later pass asks for the new ones and leaves it alone.
   */
  function fetchMissingProfiles(): void {
    if (planning || pumping) return;
    planning = true;
    try {
      const state = getState();
      // A node that derived after its pubkey was answered is named from that
      // answer. No round can run for it — the pubkey was already asked.
      applyKnownProfiles(state, profileBook);
      const pubkeys = askPubkeys(state, profileBook);
      if (pubkeys.length === 0) return;
      const started = Date.now();
      for (const pubkey of pubkeys) profileBook.asked.add(pubkey);
      const ids = watching(state, pubkeys).map((node) => node.id);
      for (const id of ids) {
        setProfileSearch(id, { state: 'searching', at: started, relays: [], named: false });
      }
      void fetchProfiles(pubkeys)
        .then((result) => {
          const relays = result.relays;
          for (const pubkey of pubkeys) {
            recordProfile(getState(), profileBook, pubkey, result.profiles.get(pubkey), relays, started);
          }
        })
        .catch((error: unknown) => {
          for (const id of ids) {
            setProfileSearch(id, {
              state: 'done',
              at: started,
              relays: [
                {
                  relay: 'websocket',
                  state: 'error',
                  events: 0,
                  nameless: 0,
                  detail: String(error),
                },
              ],
              named: false,
            });
          }
        })
        .finally(() => {
          // A derivation that finished while this round was in flight may need a
          // round of its own; this is a no-op when nothing is missing.
          fetchMissingProfiles();
        });
    } finally {
      planning = false;
    }
  }

  /** Re-runs the lookup for one node, forgetting that it was already asked. */
  function searchProfilesAgain(nodeId: string): void {
    const node = findNode(nodeId);
    const pubkey = node?.identity?.report.pubKeyHex;
    if (node === undefined || pubkey === undefined) return;
    forgetPubkey(profileBook, pubkey);
    // Every node with this pubkey may already have a name, so ask anyway.
    profileBook.forced.add(pubkey);
    setProfileSearch(node.id, null);
    fetchMissingProfiles();
  }

  function render(state: AppState): void {
    const keys = state.keys;
    const activeId = state.section === 'key' ? state.activeKey : null;
    for (const entry of SECTION_BUTTONS) {
      const on = state.section === entry.id;
      entry.element.classList.toggle('dock__link--on', on);
      if (on) entry.element.setAttribute('aria-current', 'page');
      else entry.element.removeAttribute('aria-current');
    }

    majorStrip.render({
      label: 'SSH keys and sections',
      variant: 'major',
      fill: true,
      activeId,
      addLabel: '+',
      addTitle: 'Add SSH key',
      tabs: keys.map((key) => ({
        id: key.id,
        label: key.label,
        draft: key.status === 'draft',
        icon: hashatarIcon(key.identity),
        mark: key.deriving ? '·' : profileMark(key),
        title: keyTitle(key),
      })),
      onSelect: (id) => selectKey(id),
      onAdd: () => {
        newKeyDraft();
      },
      onClose: (id) => {
        const space = spaces.get(id);
        if (space !== undefined) {
          space.root.remove();
          spaces.delete(id);
        }
        removeKey(id);
      },
      onRename: (id, label) => renameNode(id, label),
    });

    if (state.section !== 'key') {
      renderWalletStrip(null);
      renderCardStrip(null, null);
      showSection(state.section);
      return;
    }
    const key = activeKey(state);
    if (key === null) return;
    const wallet = key.wallets.find((entry) => entry.id === key.activeWallet) ?? null;
    renderWalletStrip(key);
    renderCardStrip(key, wallet);
    showKey(key);
    const info = leafOf(state);
    leaf.render(info, info?.node.identity ?? null);
    void ensureDerived(state);
    void pumpDerivations();
  }

  function wipe(message: string): void {
    for (const space of spaces.values()) space.root.remove();
    spaces.clear();
    for (const view of sectionViews.values()) view.remove();
    sectionViews.clear();
    leaf.root.remove();
    clearProfileBook(profileBook);
    resetAll();
    toast(message);
  }

  const hashatarToggle = must<HTMLInputElement>('#hashatar');
  hashatarToggle.addEventListener('change', () => {
    showHashatar = hashatarToggle.checked;
    render(getState());
  });

  subscribe(render);

  // Auto-clear: a hidden tab must not keep any key, wallet or card in memory.
  const autoclear = must<HTMLInputElement>('#autoclear');
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && autoclear.checked) {
      const dirty = getState().keys.some((key) => key.status === 'ready' || key.wallets.length > 0);
      if (dirty) wipe('Wiped — tab was hidden');
    }
  });

  must<HTMLButtonElement>('#wipe').addEventListener('click', () => {
    const dirty = getState().keys.some((key) => key.status === 'ready' || key.wallets.length > 0);
    wipe(dirty ? 'Every key, wallet and card wiped from memory' : 'Nothing loaded');
  });

  window.addEventListener('meltify:wipe', () => wipe('Wiped from memory'));
}

main();
