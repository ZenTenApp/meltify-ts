/**
 * One key tab's body: whatever the deepest selected tab derives, and the leaf
 * panel under it. Only the selected section has content — selecting a key shows
 * no panel of its own, selecting the empty wallet or card tab shows nothing,
 * and a wallet's panel disappears while one of its cards is selected.
 *
 * The DOM is built once per key tab and updated in place. Draft forms are cached
 * by node id, so switching tabs or rows never loses typing.
 */

import { valueBlock } from '../lib/blocks.ts';
import { el, hint, toast } from '../lib/dom.ts';
import {
  commitCard,
  commitWallet,
  getState,
  labelOf,
  removeCard,
  removeWallet,
  type CardTab,
  type KeyTab,
  type WalletTab,
} from '../lib/store.ts';
import { mountKeyForm } from './keyform.ts';
import { mountNodeForm } from './nodeform.ts';
import type { Ctx } from '../app-types.ts';
export interface KeySpace {
  root: HTMLElement;
  /** Where the shared leaf panel belongs for this key. */
  leafSlot: HTMLElement;
  /** Drops a cached draft form when its tab is closed. */
  forget(id: string): void;
  /** Focuses a draft's secret field, e.g. after its Add button was pressed. */
  focusSecret(id: string): void;
  render(key: KeyTab): void;
}

export function mountKeySpace(key: KeyTab, ctx: Ctx): KeySpace {
  const panel = el('div');
  const leafSlot = el('div');

  /** Draft forms, one per node id, kept alive across re-renders. */
  const forms = new Map<string, HTMLElement>();
  let keyForm: HTMLElement | null = null;

  const forgetForm = (id: string): void => {
    forms.delete(id);
  };

  const walletForm = (wallet: WalletTab): HTMLElement => {
    const cached = forms.get(wallet.id);
    if (cached !== undefined) return cached;
    const form = mountNodeForm({
      kind: 'wallet',
      parent: `the “${labelOf(getState(), key.id)}” key`,
      initialSecret: wallet.secret,
      onSubmit: (secret) => {
        const error = commitWallet(key.id, wallet.id, secret);
        if (error === null) {
          forgetForm(wallet.id);
          toast(`${labelOf(getState(), wallet.id)} added`);
        }
        return error;
      },
      onCancel: () => {
        forgetForm(wallet.id);
        removeWallet(key.id, wallet.id);
      },
    });
    forms.set(wallet.id, form);
    return form;
  };

  const cardForm = (wallet: WalletTab | null, card: CardTab): HTMLElement => {
    const cached = forms.get(card.id);
    if (cached !== undefined) return cached;
    const walletId = wallet?.id ?? null;
    const form = mountNodeForm({
      kind: 'card',
      parent: wallet === null ? `the “${labelOf(getState(), key.id)}” key` : labelOf(getState(), wallet.id),
      initialSecret: card.secret,
      onSubmit: (secret) => {
        const error = commitCard(key.id, walletId, card.id, secret);
        if (error === null) {
          forgetForm(card.id);
          toast(`${labelOf(getState(), card.id)} added`);
        }
        return error;
      },
      onCancel: () => {
        forgetForm(card.id);
        removeCard(key.id, walletId, card.id);
      },
    });
    forms.set(card.id, form);
    return form;
  };

  const renderWallet = (wallet: WalletTab): HTMLElement => {
    if (wallet.status === 'draft') return walletForm(wallet);
    return el('section', { class: 'card tight' }, [
      el('h2', { class: 'inline-title' }, [labelOf(getState(), wallet.id)]),
      el('div', { class: 'blocks', style: 'margin-top: 12px' }, [
        valueBlock('private name', wallet.secret, {
          secret: true,
          masked: !ctx.showPrivateName(),
          note: 'hashed verbatim: SHA256(SHA256(utf8(private name)) ‖ key seed)',
        }),
      ]),
      hint('Cards below hold the BIP39 passphrase for this wallet. Add one per wallet you use.'),
    ]);
  };

  const renderCard = (wallet: WalletTab | null, card: CardTab): HTMLElement => {
    if (card.status === 'draft') return cardForm(wallet, card);
    return el('section', { class: 'card tight' }, [
      el('h2', { class: 'inline-title' }, [labelOf(getState(), card.id)]),
      el('div', { class: 'blocks', style: 'margin-top: 12px' }, [
        card.secret === ''
          ? el('p', { class: 'hint' }, ['No passphrase: the standard BIP39 derivation.'])
          : valueBlock('bip39 passphrase', card.secret, {
              masked: true,
              note: 'the 25th word; PBKDF2 input, NFKD as per BIP39',
            }),
      ]),
    ]);
  };

  /** The one panel the selected tab earns; `null` when it shows no content. */
  const selectedPanel = (current: KeyTab): HTMLElement | null => {
    if (current.status === 'draft') {
      keyForm ??= mountKeyForm(current, () => {
        forms.clear();
        keyForm = null;
      });
      return keyForm;
    }
    const wallet = current.wallets.find((entry) => entry.id === current.activeWallet) ?? null;
    if (wallet === null) {
      const card = current.cards.find((entry) => entry.id === current.activeCard) ?? null;
      return card === null ? null : renderCard(null, card);
    }
    if (wallet.status === 'draft') return renderWallet(wallet);
    const card = wallet.cards.find((entry) => entry.id === wallet.activeCard) ?? null;
    return card === null ? renderWallet(wallet) : renderCard(wallet, card);
  };

  const root = el('div', { class: 'view keyspace' }, [panel, leafSlot]);

  return {
    root,
    leafSlot,
    forget: forgetForm,
    focusSecret(id) {
      forms.get(id)?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    },
    render(current) {
      const content = selectedPanel(current);
      if (content === null) {
        if (panel.firstChild !== null) panel.replaceChildren();
        return;
      }
      // Keep the mounted node when it is already showing: replacing it would
      // blur a focused secret field on every store update (derivations, profiles).
      if (panel.firstChild !== content) panel.replaceChildren(content);
    },
  };
}
