/**
 * Tab tree: one tab per SSH key, each key holds wallet tabs (subaccounts), each
 * wallet holds card tabs (BIP39 passphrases). The *leaf* of the active path —
 * the deepest selected node — is the identity the report shows.
 *
 * Everything is in memory only and is never persisted. `resetAll()` returns the
 * app to the same state as a fresh load: one empty key draft, selected.
 */

import type { IdentityReport } from 'meltify-ts';

/** A derived identity. Unchanged shape from the single-identity version. */
export interface Identity {
  report: IdentityReport;
  seedHex: string;
  /** Wall time of the key-unlock + derive in the worker. */
  elapsedMs: number;
  /** Where it came from, for the status line. */
  source: string;
  /** Subaccount label the report was derived for; '' when it is the source key. */
  subaccount: string;
  /**
   * BIP39 passphrase the report was derived with; '' when it was left empty (the
   * standard derivation).
   */
  bip39Passphrase: string;
  /** Re-encoded subaccount PEM (same passphrase, bcrypt rounds 1); absent for the source key. */
  subaccountPem?: string;
  derivedAt: number;
}

/** `draft` = named but not committed; `ready` = has everything it needs to derive. */
export type NodeStatus = 'draft' | 'ready';

/**
 * A kind 0 profile for a node: the name its own key advertises, when it was
 * signed, and where this page got it. `verified` means the event's signature was
 * checked against the node's pubkey; a pasted one never is.
 */
export interface Profile {
  name: string;
  /** kind 0 `created_at`, seconds. */
  createdAt: number;
  /** Relay host that served it, or 'paste'. */
  via: string;
  verified: boolean;
}

/** One relay's answer in the last kind 0 round. */
export interface RelayAnswer {
  relay: string;
  state: 'ok' | 'error' | 'closed' | 'silent';
  /** Kind 0 events it sent for a wanted author. */
  events: number;
  /** Of those, the ones that carried no display_name and no name. */
  nameless: number;
  detail?: string;
}

/** What the last kind 0 lookup for a node returned, per relay. */
export interface ProfileSearch {
  state: 'searching' | 'done';
  /** When the round started, ms since epoch. */
  at: number;
  relays: RelayAnswer[];
  /** True when a verified kind 0 with a display name was found for this node. */
  named: boolean;
}

interface NodeBase {
  id: string;
  status: NodeStatus;
  /** Derived identity for this node, or null until derivation finishes. */
  identity: Identity | null;
  deriving: boolean;
  /** Last derivation failure, shown in the leaf panel. */
  error: string | null;
  /** Profile this node's key advertises, once a relay or a paste has supplied it. */
  profile: Profile | null;
  /** The last kind 0 lookup's outcome, so the panel can show where it looked. */
  search: ProfileSearch | null;
}

export interface CardTab extends NodeBase {
  /** BIP39 passphrase, verbatim. Empty is legal: it means the standard derivation. */
  secret: string;
}

export interface WalletTab extends NodeBase {
  /**
   * Private name: the subaccount string, hashed byte-for-byte. It is the
   * derivation input, never trimmed and never normalised.
   */
  secret: string;
  cards: CardTab[];
  activeCard: string | null;
}

export interface KeyTab extends NodeBase {
  pem: string;
  passphrase: string;
  /** Filename, or 'pasted key'. Shown in the leaf header, never in a tab. */
  source: string;
  /**
   * Comment from inside the OpenSSH key (`ssh-keygen -C`). When it is not empty
   * it is the key tab's title; otherwise the tab is numbered like the rest.
   */
  comment: string;
  wallets: WalletTab[];
  activeWallet: string | null;
  /**
   * Cards on the key itself, for the tab with no subaccount. A BIP39 passphrase
   * applies to whichever identity is selected, and `meltify-info` can derive the
   * key with a 25th word without any subaccount, so the key needs its own list.
   */
  cards: CardTab[];
  activeCard: string | null;
}

export type SectionId = 'selfcheck' | 'keytools' | 'phrases';

export interface AppState {
  /** Which top-row tab is showing: a fixed section, or the active key's body. */
  section: SectionId | 'key';
  keys: KeyTab[];
  activeKey: string | null;
}

export interface LeafInfo {
  key: KeyTab;
  wallet: WalletTab | null;
  card: CardTab | null;
  /** The node whose identity the report should show. */
  node: KeyTab | WalletTab | CardTab;
  kind: 'key' | 'wallet' | 'card';
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

type Listener = (state: AppState) => void;

const listeners = new Set<Listener>();
let nextId = 1;

function nid(prefix: string): string {
  const id = `${prefix}${nextId}`;
  nextId += 1;
  return id;
}

function draftKey(pem = '', passphrase = '', source = ''): KeyTab {
  return {
    id: nid('k'),
    pem,
    passphrase,
    source,
    comment: '',
    status: 'draft',
    identity: null,
    deriving: false,
    error: null,
    profile: null,
    search: null,
    wallets: [],
    activeWallet: null,
    cards: [],
    activeCard: null,
  };
}

export function initialState(): AppState {
  const key = draftKey();
  return { section: 'key', keys: [key], activeKey: key.id };
}

let state: AppState = initialState();

export function getState(): AppState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener(state);
}

function update(mutate: (draft: AppState) => void): void {
  mutate(state);
  emit();
}

function findKey(id: string): KeyTab | undefined {
  return state.keys.find((key) => key.id === id);
}

/** Every node that carries derivation state, so status helpers stay in one place. */
export function findNode(id: string): KeyTab | WalletTab | CardTab | undefined {
  for (const key of state.keys) {
    if (key.id === id) return key;
    const keyCard = key.cards.find((entry) => entry.id === id);
    if (keyCard !== undefined) return keyCard;
    for (const wallet of key.wallets) {
      if (wallet.id === id) return wallet;
      const card = wallet.cards.find((entry) => entry.id === id);
      if (card !== undefined) return card;
    }
  }
  return undefined;
}

export function activeKey(state: AppState): KeyTab | null {
  return state.keys.find((key) => key.id === state.activeKey) ?? null;
}

/**
 * Deepest node on the active path. A ready key with no wallet shows the source
 * identity — or, if a card is selected on the key itself, the source identity
 * with that BIP39 passphrase. A wallet with no card shows the subaccount
 * identity.
 */
export function leafOf(appState: AppState): LeafInfo | null {
  const key = activeKey(appState);
  if (key === null) return null;
  const wallet = key.wallets.find((entry) => entry.id === key.activeWallet) ?? null;
  if (wallet === null) {
    const card = key.cards.find((entry) => entry.id === key.activeCard) ?? null;
    if (card === null) return { key, wallet: null, card: null, node: key, kind: 'key' };
    return { key, wallet: null, card, node: card, kind: 'card' };
  }
  const card = wallet.cards.find((entry) => entry.id === wallet.activeCard) ?? null;
  if (card === null) return { key, wallet, card: null, node: wallet, kind: 'wallet' };
  return { key, wallet, card, node: card, kind: 'card' };
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/**
 * Tabs are positional, not named: `1`, `1.2`, `1.2.3`, optionally followed by
 * what the node is called — a key's own OpenSSH comment or npub, a wallet's or
 * card's kind 0 name or npub. Numbers are derived from the tree every time they
 * are drawn, so closing a tab renumbers the rest.
 */
function keyNumber(state: AppState, keyId: string): string {
  return String(state.keys.findIndex((key) => key.id === keyId) + 1);
}

/** `1 npub…wxyz`, or just `1` when there is nothing to append. */
function numbered(number: string, detail: string): string {
  const trimmed = detail.trim();
  return trimmed === '' ? number : `${number} ${trimmed}`;
}

/** What a wallet or card shows after its number: kind 0 name, npub, or nothing. */
function nodeDetail(node: KeyTab | WalletTab | CardTab): string {
  const name = node.profile?.name.trim() ?? '';
  if (name !== '') return name;
  const npub = node.identity?.report.npub ?? '';
  return npub === '' ? '' : npubTag(npub);
}

export function keyLabel(state: AppState, key: KeyTab): string {
  if (key.status === 'draft') return 'Add key';
  const npub = key.identity?.report.npub ?? '';
  const npubDetail = npub === '' ? '' : npubTag(npub);
  const detail = key.comment.trim() !== '' ? key.comment : npubDetail;
  return numbered(keyNumber(state, key.id), detail);
}

export function walletLabel(state: AppState, keyId: string, walletId: string): string {
  const key = state.keys.find((entry) => entry.id === keyId);
  const wallet = key?.wallets.find((entry) => entry.id === walletId);
  if (key === undefined || wallet === undefined) return 'Wallet';
  const index = key.wallets.findIndex((entry) => entry.id === walletId) + 1;
  return numbered(`${keyNumber(state, keyId)}.${index}`, nodeDetail(wallet));
}

/**
 * A card hangs off a wallet, or off the key itself when the empty wallet tab is
 * selected. The key's own cards are numbered as if that empty tab were wallet 1,
 * so every card number has three parts and no part is ever 0.
 */
export function cardLabel(
  state: AppState,
  keyId: string,
  walletId: string | null,
  cardId: string,
): string {
  const key = state.keys.find((entry) => entry.id === keyId);
  if (key === undefined) return 'Card';
  const host = walletId === null ? key : key.wallets.find((entry) => entry.id === walletId);
  if (host === undefined) return 'Card';
  const walletPart =
    walletId === null ? 1 : key.wallets.findIndex((entry) => entry.id === walletId) + 1;
  const card = host.cards.find((entry) => entry.id === cardId);
  if (card === undefined) return 'Card';
  const index = host.cards.indexOf(card) + 1;
  return numbered(`${keyNumber(state, keyId)}.${walletPart}.${index}`, nodeDetail(card));
}

/** The label of any node, by id; '' when the node is gone. */
export function labelOf(state: AppState, id: string): string {
  for (const key of state.keys) {
    if (key.id === id) return keyLabel(state, key);
    if (key.cards.some((card) => card.id === id)) return cardLabel(state, key.id, null, id);
    for (const wallet of key.wallets) {
      if (wallet.id === id) return walletLabel(state, key.id, wallet.id);
      if (wallet.cards.some((card) => card.id === id)) return cardLabel(state, key.id, wallet.id, id);
    }
  }
  return '';
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

export function selectSection(id: SectionId): void {
  update((draft) => {
    draft.section = id;
  });
}

export function selectKey(id: string): void {
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === id);
    if (key === undefined) return;
    draft.section = 'key';
    draft.activeKey = id;
    // A key opens on its defaults: the empty wallet tab, and the empty card tab.
    key.activeWallet = null;
    key.activeCard = null;
  });
}

export function selectWallet(keyId: string, walletId: string | null): void {
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined) return;
    key.activeWallet = walletId;
    // A wallet opens on its default card tab, whatever it showed last time.
    if (walletId === null) {
      key.activeCard = null;
      return;
    }
    const wallet = key.wallets.find((entry) => entry.id === walletId);
    if (wallet !== undefined) wallet.activeCard = null;
  });
}

export function selectCard(keyId: string, walletId: string | null, cardId: string | null): void {
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined) return;
    const host = walletId === null ? key : key.wallets.find((entry) => entry.id === walletId);
    if (host === undefined) return;
    host.activeCard = cardId;
  });
}

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

/**
 * Selects the existing key draft, or opens a new one. Only one key draft exists
 * at a time: a second blank form is never useful.
 */
export function newKeyDraft(pem = '', passphrase = '', source = ''): string {
  const existing = state.keys.find((key) => key.status === 'draft');
  if (existing !== undefined) {
    update((draft) => {
      const key = draft.keys.find((entry) => entry.id === existing.id);
      if (key === undefined) return;
      if (pem !== '') key.pem = pem;
      if (passphrase !== '') key.passphrase = passphrase;
      if (source !== '') key.source = source;
      draft.section = 'key';
      draft.activeKey = key.id;
    });
    return existing.id;
  }
  const key = draftKey(pem, passphrase, source);
  update((draft) => {
    draft.keys.push(key);
    draft.section = 'key';
    draft.activeKey = key.id;
  });
  return key.id;
}

export interface CommitKeyInput {
  pem: string;
  passphrase: string;
  source: string;
  /** Comment from inside the key; '' when it carries none. */
  comment: string;
  identity: Identity;
}

/** Commits a key draft. Returns an error message, or null on success. */
export function commitKey(id: string, input: CommitKeyInput): string | null {
  const pem = input.pem.trim();
  const duplicate = state.keys.find(
    (key) => key.id !== id && key.status === 'ready' && key.pem.trim() === pem,
  );
  if (duplicate !== undefined) {
    return `That key is already open in the “${labelOf(state, duplicate.id)}” tab.`;
  }
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === id);
    if (key === undefined) return;
    key.pem = input.pem;
    key.passphrase = input.passphrase;
    key.source = input.source;
    key.comment = input.comment;
    key.status = 'ready';
    key.identity = input.identity;
    key.error = null;
  });
  return null;
}

export interface KeyTemplateInput {
  /** Private name for the ready wallet. */
  walletSecret: string;
  /** BIP39 passphrase for the ready card under that wallet. */
  cardSecret: string;
}

/**
 * Adds a ready wallet and card to a freshly committed key, as though both forms
 * had been submitted. The key itself stays selected so its leaf panel opens.
 */
export function applyKeyTemplate(keyId: string, input: KeyTemplateInput): void {
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined || key.status !== 'ready') return;
    if (key.wallets.length > 0 || key.cards.length > 0) return;

    const card: CardTab = {
      id: nid('c'),
      secret: input.cardSecret,
      status: 'ready',
      identity: null,
      deriving: false,
      error: null,
      profile: null,
      search: null,
    };
    const wallet: WalletTab = {
      id: nid('w'),
      secret: input.walletSecret,
      status: 'ready',
      identity: null,
      deriving: false,
      error: null,
      profile: null,
      search: null,
      cards: [card],
      activeCard: null,
    };
    key.wallets.push(wallet);
    // The key tab stays selected; the template only populates the rows below it.
    key.activeWallet = null;
    key.activeCard = null;
  });
}

/**
 * How a tab writes an npub it has no name for: `npub…wxyz`.
 *
 * It is the tail, not the head: every npub is bech32 with the human-readable
 * prefix `npub`, so the first four characters are the same string for every key,
 * wallet and card and would label them all "npub". The tail is also the part
 * clients quote when they shorten an npub. Tooltips and the default tabs use it;
 * tab titles are numbers.
 */
export function npubTag(npub: string): string {
  return npub.length < 4 ? npub : `npub…${npub.slice(-4)}`;
}

export function setProfileSearch(id: string, search: ProfileSearch | null): void {
  update(() => {
    const node = findNode(id);
    if (node !== undefined) node.search = search;
  });
}

/** Sets or clears a node's kind 0 profile. Tab titles are positional, never names. */
export function setNodeProfile(id: string, profile: Profile | null): void {
  update(() => {
    const node = findNode(id);
    if (node !== undefined) node.profile = profile;
  });
}

/** Removes a key tab. The last key is replaced by a fresh draft, as in a browser. */
export function removeKey(id: string): void {
  update((draft) => {
    const index = draft.keys.findIndex((key) => key.id === id);
    if (index === -1) return;
    draft.keys.splice(index, 1);
    if (draft.keys.length === 0) {
      const key = draftKey();
      draft.keys.push(key);
      draft.activeKey = key.id;
      draft.section = 'key';
      return;
    }
    if (draft.activeKey === id) {
      const next = draft.keys[Math.min(index, draft.keys.length - 1)];
      draft.activeKey = next?.id ?? null;
      draft.section = 'key';
      // The replacement key opens on its defaults, like any other selection.
      if (next !== undefined) {
        next.activeWallet = null;
        next.activeCard = null;
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * Wallets
 * ------------------------------------------------------------------ */

export function addWalletDraft(keyId: string): string | null {
  const key = findKey(keyId);
  if (key === undefined || key.status !== 'ready') return null;
  const existing = key.wallets.find((wallet) => wallet.status === 'draft');
  if (existing !== undefined) {
    selectWallet(keyId, existing.id);
    return existing.id;
  }
  const wallet: WalletTab = {
    id: nid('w'),
    secret: '',
    status: 'draft',
    identity: null,
    deriving: false,
    error: null,
    profile: null,
    search: null,
    cards: [],
    activeCard: null,
  };
  update((draft) => {
    draft.keys.find((entry) => entry.id === keyId)?.wallets.push(wallet);
    const parent = draft.keys.find((entry) => entry.id === keyId);
    if (parent !== undefined) parent.activeWallet = wallet.id;
  });
  return wallet.id;
}

export function commitWallet(keyId: string, walletId: string, secret: string): string | null {
  const key = findKey(keyId);
  const wallet = key?.wallets.find((entry) => entry.id === walletId);
  if (key === undefined || wallet === undefined) return 'That tab is gone.';
  if (secret === '') {
    return 'The private name is required. With no name there is no subaccount — that identity is the key itself.';
  }
  const duplicate = key.wallets.find(
    (entry) => entry.id !== walletId && entry.status === 'ready' && entry.secret === secret,
  );
  if (duplicate !== undefined) {
    return `A wallet with that private name already exists in this key (“${walletLabel(state, keyId, duplicate.id)}”). Private names are hashed byte-for-byte, so even invisible whitespace counts.`;
  }
  update((draft) => {
    const target = draft.keys
      .find((entry) => entry.id === keyId)
      ?.wallets.find((entry) => entry.id === walletId);
    if (target === undefined) return;
    target.secret = secret;
    target.status = 'ready';
    target.error = null;
  });
  return null;
}

export function removeWallet(keyId: string, walletId: string): void {
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined) return;
    key.wallets = key.wallets.filter((entry) => entry.id !== walletId);
    // Closing the selected wallet returns to the key's defaults.
    if (key.activeWallet === walletId) key.activeWallet = null;
  });
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

/**
 * Where a card lives. Cards hang off a wallet, or off the key itself when no
 * wallet is selected: the same passphrase applies to whichever identity is
 * showing, and it needs no subaccount to be a real derivation.
 */
interface CardHost {
  cards: CardTab[];
  activeCard: string | null;
  /** `null` for the key's own cards. */
  walletId: string | null;
  /** What the duplicate message calls the owner: "this wallet" / "this key". */
  noun: string;
}

function cardHost(keyId: string, walletId: string | null): CardHost | undefined {
  const key = findKey(keyId);
  if (key === undefined) return undefined;
  if (walletId === null) {
    return key.status === 'ready'
      ? { cards: key.cards, activeCard: key.activeCard, walletId: null, noun: 'key' }
      : undefined;
  }
  const wallet = key.wallets.find((entry) => entry.id === walletId);
  if (wallet === undefined || wallet.status !== 'ready') return undefined;
  return { cards: wallet.cards, activeCard: wallet.activeCard, walletId, noun: 'wallet' };
}

export function addCardDraft(keyId: string, walletId: string | null): string | null {
  const host = cardHost(keyId, walletId);
  if (host === undefined) return null;
  const existing = host.cards.find((card) => card.status === 'draft');
  if (existing !== undefined) {
    selectCard(keyId, walletId, existing.id);
    return existing.id;
  }
  const card: CardTab = {
    id: nid('c'),
    secret: '',
    status: 'draft',
    identity: null,
    deriving: false,
    error: null,
    profile: null,
    search: null,
  };
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined) return;
    const target = walletId === null ? key : key.wallets.find((entry) => entry.id === walletId);
    if (target === undefined) return;
    target.cards.push(card);
    target.activeCard = card.id;
  });
  return card.id;
}

export function commitCard(
  keyId: string,
  walletId: string | null,
  cardId: string,
  secret: string,
): string | null {
  const host = cardHost(keyId, walletId);
  if (host === undefined) return 'That tab is gone.';
  const duplicate = host.cards.find(
    (entry) => entry.id !== cardId && entry.status === 'ready' && entry.secret === secret,
  );
  if (duplicate !== undefined) {
    const label = cardLabel(state, keyId, walletId, duplicate.id);
    return secret === ''
      ? `This ${host.noun} already has a card with no passphrase (“${label}”).`
      : `A card with that passphrase already exists on this ${host.noun} (“${label}”).`;
  }
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined) return;
    const target = walletId === null ? key : key.wallets.find((entry) => entry.id === walletId);
    const card = target?.cards.find((entry) => entry.id === cardId);
    if (target === undefined || card === undefined) return;
    card.secret = secret;
    card.status = 'ready';
    card.error = null;
  });
  return null;
}

export function removeCard(keyId: string, walletId: string | null, cardId: string): void {
  update((draft) => {
    const key = draft.keys.find((entry) => entry.id === keyId);
    if (key === undefined) return;
    const target = walletId === null ? key : key.wallets.find((entry) => entry.id === walletId);
    if (target === undefined) return;
    target.cards = target.cards.filter((entry) => entry.id !== cardId);
    // Closing the selected card returns to that row's default tab.
    if (target.activeCard === cardId) target.activeCard = null;
  });
}

/* ------------------------------------------------------------------ *
 * Node status
 * ------------------------------------------------------------------ */

export function setDeriving(id: string, value: boolean): void {
  update(() => {
    const node = findNode(id);
    if (node !== undefined) node.deriving = value;
  });
}

export function setDerived(id: string, identity: Identity): void {
  update(() => {
    const node = findNode(id);
    if (node === undefined) return;
    node.identity = identity;
    node.error = null;
    node.deriving = false;
  });
}

export function setError(id: string, message: string | null): void {
  update(() => {
    const node = findNode(id);
    if (node === undefined) return;
    node.error = message;
    node.deriving = false;
  });
}

export function resetAll(): void {
  state = initialState();
  emit();
}
