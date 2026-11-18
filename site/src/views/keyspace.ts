/**
 * One key tab's body: the key, then its wallet strip, then its card strip, with
 * a panel under each strip and the leaf panel at the bottom.
 *
 * The DOM is built once per key tab and updated in place. Draft forms are cached
 * by node id, so switching tabs or rows never loses typing.
 */

import { valueBlock } from '../lib/blocks.ts';
import { el, hint, pill, toast } from '../lib/dom.ts';
import {
  commitCard,
  commitWallet,
  removeCard,
  removeKey,
  removeWallet,
  type CardTab,
  type KeyTab,
  type WalletTab,
} from '../lib/store.ts';
import { mountKeyForm } from './keyform.ts';
import { mountNodeForm } from './nodeform.ts';
export interface KeySpace {
  root: HTMLElement;
  /** Where the shared leaf panel belongs for this key. */
  leafSlot: HTMLElement;
  /** Drops a cached draft form when its tab is closed. */
  forget(id: string): void;
  render(key: KeyTab): void;
}

export function mountKeySpace(key: KeyTab): KeySpace {
  const keySlot = el('div');
  const walletPanel = el('div');
  const cardPanel = el('div');
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
      parent: `the “${key.label}” key`,
      // A placeholder label is not a name: leave the field empty so the hint
      // about the npub suffix applies, and the first derivation can fill it in.
      initialLabel: wallet.labelAuto ? '' : wallet.label,
      initialSecret: wallet.secret,
      onSubmit: (secret, label) => {
        const error = commitWallet(key.id, wallet.id, secret, label);
        if (error === null) {
          forgetForm(wallet.id);
          toast(`Wallet “${label === '' ? wallet.label : label}” added`);
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
      parent: wallet === null ? `the “${key.label}” key` : `wallet “${wallet.label}”`,
      initialLabel: card.label,
      initialSecret: card.secret,
      onSubmit: (secret, label) => {
        const error = commitCard(key.id, walletId, card.id, secret, label);
        if (error === null) {
          forgetForm(card.id);
          toast(`Card “${label === '' ? card.label : label}” added`);
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

  const renderKey = (current: KeyTab): void => {
    if (current.status === 'draft') {
      keyForm ??= mountKeyForm(current, () => {
        forms.clear();
        keyForm = null;
      });
      keySlot.replaceChildren(keyForm);
      return;
    }
    const identity = current.identity;
    keySlot.replaceChildren(
      el('section', { class: 'card tight keycard' }, [
        el('div', { class: 'row', style: 'justify-content: space-between' }, [
          el('div', { class: 'row tight' }, [
            el('h2', { class: 'inline-title' }, ['Key']),
            pill(current.source === '' ? 'pasted key' : current.source),
            ...(identity === null ? [] : [pill(identity.report.fingerprint)]),
          ]),
          el('div', { class: 'row tight' }, [
            el('button', {
              type: 'button',
              class: 'btn ghost small',
              onclick: () => {
                removeKey(current.id);
                toast('Key tab closed');
              },
            }, ['Close key tab']),
          ]),
        ]),
        hint(
          'Wallets derived from this key appear on the row below. The green tab at the left is the empty wallet — the key’s own identity, with no subaccount.',
        ),
      ]),
    );
  };

  const renderWalletPanel = (current: KeyTab, wallet: WalletTab | null): void => {
    if (current.status !== 'ready') {
      walletPanel.replaceChildren();
      return;
    }
    if (wallet === null) {
      walletPanel.replaceChildren(
        el('section', { class: 'card tight' }, [
          hint(
            'Empty wallet selected. “+ Add wallet” names a subaccount: a different, deterministic key derived from this one, with its own cards and its own identity below. The first tab in the wallet row — this one — is the key itself.',
          ),
        ]),
      );
      return;
    }
    if (wallet.status === 'draft') {
      walletPanel.replaceChildren(walletForm(wallet));
      return;
    }
    walletPanel.replaceChildren(
      el('section', { class: 'card tight' }, [
        el('div', { class: 'row', style: 'justify-content: space-between' }, [
          el('h2', { class: 'inline-title' }, [`Wallet “${wallet.label}”`]),
          el('div', { class: 'row tight' }, [
            el('button', {
              type: 'button',
              class: 'btn ghost small',
              onclick: () => {
                forgetForm(wallet.id);
                removeWallet(current.id, wallet.id);
                toast('Wallet tab closed');
              },
            }, ['Close wallet tab']),
          ]),
        ]),
        el('div', { class: 'blocks', style: 'margin-top: 12px' }, [
          valueBlock('private name', wallet.secret, {
            masked: true,
            note: 'hashed verbatim: SHA256(SHA256(utf8(private name)) ‖ key seed) — the public name is display only',
          }),
        ]),
        hint('Cards below hold the BIP39 passphrase for this wallet. Add one per wallet you use.'),
      ]),
    );
  };

  const renderCardPanel = (current: KeyTab, wallet: WalletTab | null): void => {
    // A draft wallet has nothing to attach a card to yet; no wallet is fine — the
    // card then belongs to the key itself.
    if (wallet !== null && wallet.status !== 'ready') {
      cardPanel.replaceChildren();
      return;
    }
    const host = wallet ?? current;
    const card = host.cards.find((entry) => entry.id === host.activeCard) ?? null;
    if (card === null) {
      cardPanel.replaceChildren(
        el('section', { class: 'card tight' }, [
          hint(
            wallet === null
              ? 'Empty card selected. The panel below shows this key on its own with the standard (empty) BIP39 passphrase. Add a card to derive it with a 25th word instead: no subaccount is involved.'
              : 'Empty card selected. The panel below shows this wallet with the standard (empty) BIP39 passphrase — exactly what every wallet matches. Add a card only for a wallet that uses a 25th word; the green tab in the card row comes back here.',
          ),
        ]),
      );
      return;
    }
    if (card.status === 'draft') {
      cardPanel.replaceChildren(cardForm(wallet, card));
      return;
    }
    cardPanel.replaceChildren(
      el('section', { class: 'card tight' }, [
        el('div', { class: 'row', style: 'justify-content: space-between' }, [
          el('h2', { class: 'inline-title' }, [`Card “${card.label}”`]),
          el('div', { class: 'row tight' }, [
            el('button', {
              type: 'button',
              class: 'btn ghost small',
              onclick: () => {
                forgetForm(card.id);
                removeCard(current.id, wallet?.id ?? null, card.id);
                toast('Card tab closed');
              },
            }, ['Close card tab']),
          ]),
        ]),
        el('div', { class: 'blocks', style: 'margin-top: 12px' }, [
          card.secret === ''
            ? el('p', { class: 'hint' }, ['No passphrase: the standard BIP39 derivation.'])
            : valueBlock('bip39 passphrase', card.secret, {
                masked: true,
                note: 'the 25th word; PBKDF2 input, NFKD as per BIP39',
              }),
        ]),
      ]),
    );
  };

  const root = el('div', { class: 'view keyspace' }, [keySlot, walletPanel, cardPanel, leafSlot]);

  return {
    root,
    leafSlot,
    forget: forgetForm,
    render(current) {
      renderKey(current);
      const wallet = current.wallets.find((entry) => entry.id === current.activeWallet) ?? null;
      renderWalletPanel(current, wallet);
      renderCardPanel(current, wallet);
    },
  };
}
