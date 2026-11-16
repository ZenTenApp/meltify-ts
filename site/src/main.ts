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
  selectSection,
  setDerived,
  setDeriving,
  setError,
  subscribe,
  type AppState,
  type Identity,
  type KeyTab,
  type LeafInfo,
  type SectionId,
  type WalletTab,
} from './lib/store.ts';
import { createStrip } from './lib/tabstrip.ts';
import { deriveFromKey } from './lib/worker-client.ts';
import { mountKeySpace, type KeySpace } from './views/keyspace.ts';
import { mountLeaf, type LeafPanel } from './views/leaf.ts';
import { mountKeys } from './views/keys.ts';
import { mountPhrases } from './views/phrases.ts';
import { mountSelfCheck } from './views/selfcheck.ts';
import type { Ctx } from './app-types.ts';

const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'selfcheck', label: 'Self-check' },
  { id: 'keytools', label: 'Key tools' },
  { id: 'phrases', label: 'Phrase lab' },
];

function main(): void {
  const stripHost = must<HTMLElement>('#strips');
  const body = must<HTMLElement>('#views');

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
  };

  const leaf: LeafPanel = mountLeaf(ctx);

  const sectionMounts: Record<SectionId, () => HTMLElement> = {
    selfcheck: () => mountSelfCheck(ctx),
    keytools: () => mountKeys(ctx),
    phrases: () => mountPhrases(ctx),
  };

  function spaceFor(key: KeyTab): KeySpace {
    const existing = spaces.get(key.id);
    if (existing !== undefined) return existing;
    const space = mountKeySpace(key);
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
    const node = info.node;
    if (node.status !== 'ready' || node.identity !== null || node.deriving) return;
    if (inFlight.has(node.id)) return;

    inFlight.add(node.id);
    setDeriving(node.id, true);
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
    }
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

  function renderWalletStrip(key: KeyTab | null): void {
    walletStrip.root.hidden = key === null;
    if (key === null) return;
    const ready = key.status === 'ready';
    const tabs = key.wallets.map((wallet) => ({
      id: wallet.id,
      label: wallet.label,
      draft: wallet.status === 'draft',
      mark: wallet.deriving ? '·' : undefined,
      title:
        wallet.status === 'draft'
          ? `${wallet.label} (unsaved)`
          : `${wallet.label} — ${wallet.cards.length} card${wallet.cards.length === 1 ? '' : 's'}`,
    }));
    walletStrip.render({
      label: 'Wallets',
      variant: 'sub',
      tabs,
      activeId: key.activeWallet,
      addLabel: tabs.length === 0 ? '+ Add wallet' : '+',
      addTitle: 'Add wallet',
      disabled: !ready,
      disabledNote: ready ? undefined : 'add a key first',
      onSelect: (id) => selectWallet(key.id, id),
      onAdd: () => {
        addWalletDraft(key.id);
      },
      onClose: (id) => {
        spaces.get(key.id)?.forget(id);
        removeWallet(key.id, id);
      },
      onRename: (id, label) => renameNode(id, label),
    });
  }

  function renderCardStrip(key: KeyTab | null, wallet: WalletTab | null): void {
    cardStrip.root.hidden = key === null;
    if (key === null) return;
    const ready = key.status === 'ready' && wallet !== null && wallet.status === 'ready';
    const cards = wallet?.cards ?? [];
    const tabs = cards.map((card) => ({
      id: card.id,
      label: card.label,
      draft: card.status === 'draft',
      mark: card.deriving ? '·' : undefined,
      title:
        card.status !== 'ready'
          ? `${card.label} (unsaved)`
          : card.secret === ''
            ? `${card.label} — no passphrase`
            : `${card.label} — passphrase set`,
    }));
    cardStrip.render({
      label: 'Cards',
      variant: 'minor',
      tabs,
      activeId: wallet?.activeCard ?? null,
      addLabel: tabs.length === 0 ? '+ Add card' : '+',
      addTitle: 'Add card',
      disabled: !ready,
      disabledNote: !ready
        ? wallet === null
          ? 'pick a wallet first'
          : 'create the wallet first'
        : undefined,
      onSelect: (id) => {
        if (wallet !== null) selectCard(key.id, wallet.id, id);
      },
      onAdd: () => {
        if (wallet !== null) addCardDraft(key.id, wallet.id);
      },
      onClose: (id) => {
        spaces.get(key.id)?.forget(id);
        if (wallet !== null) removeCard(key.id, wallet.id, id);
      },
      onRename: (id, label) => renameNode(id, label),
    });
  }

  function render(state: AppState): void {
    const keys = state.keys;
    const activeId = state.section === 'key' ? state.activeKey : `section:${state.section}`;

    majorStrip.render({
      label: 'SSH keys and sections',
      variant: 'major',
      activeId,
      addLabel: '+',
      addTitle: 'Add SSH key',
      tabs: [
        ...SECTIONS.map((entry) => ({
          id: `section:${entry.id}`,
          label: entry.label,
          section: true,
        })),
        ...keys.map((key, index) => ({
          id: key.id,
          label: key.label,
          draft: key.status === 'draft',
          mark: key.deriving ? '·' : undefined,
          title:
            key.status === 'draft'
              ? 'Uncommitted key tab'
              : `${key.label} — ${key.wallets.length} wallets`,
          dividerBefore: index === 0,
        })),
      ],
      onSelect: (id) => {
        if (id.startsWith('section:')) selectSection(id.slice('section:'.length) as SectionId);
        else selectKey(id);
      },
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
  }

  function wipe(message: string): void {
    for (const space of spaces.values()) space.root.remove();
    spaces.clear();
    for (const view of sectionViews.values()) view.remove();
    sectionViews.clear();
    leaf.root.remove();
    resetAll();
    toast(message);
  }

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
