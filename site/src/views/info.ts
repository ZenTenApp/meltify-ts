/**
 * Leaf Info tab: the defining secret of the deepest selected node.
 *
 * A key shows its SSH passphrase, a wallet its private name, and a card its
 * BIP39 passphrase. Only the private name follows the Settings switch; the key
 * and card values keep their own per-field reveal buttons.
 */

import { valueBlock } from '../lib/blocks.ts';
import { el, hint } from '../lib/dom.ts';
import type { LeafInfo } from '../lib/store.ts';

export interface InfoView {
  root: HTMLElement;
  render(info: LeafInfo | null, showPrivateName: boolean): void;
}

const empty = (): HTMLElement =>
  el('section', { class: 'card' }, [
    el('div', { class: 'empty' }, [
      el('h2', {}, ['No node selected']),
      el('p', { class: 'hint' }, ['Select a key, wallet or card to see its defining value.']),
    ]),
  ]);

export function mountInfo(): InfoView {
  const root = el('div', { class: 'view' });

  const render = (info: LeafInfo | null, showPrivateName: boolean): void => {
    if (info === null) {
      root.replaceChildren(empty());
      return;
    }

    let block: HTMLElement;
    let description: string;
    if (info.kind === 'wallet' && info.wallet !== null) {
      block = info.wallet.secret === ''
        ? hint('No private name yet.')
        : valueBlock('private name', info.wallet.secret, {
            secret: true,
            masked: !showPrivateName,
            note: 'the subaccount string, hashed verbatim',
          });
      description = 'The wallet private name is the subaccount string. Settings can show it without a reveal step.';
    } else if (info.kind === 'card' && info.card !== null) {
      block = info.card.secret === ''
        ? hint('No BIP39 passphrase: the standard derivation.')
        : valueBlock('bip39 passphrase', info.card.secret, {
            masked: true,
            note: 'the 25th word; PBKDF2 input, NFKD as per BIP39',
          });
      description = 'The card passphrase is the BIP39 25th word used for this identity.';
    } else {
      block = info.key.passphrase === ''
        ? hint('No key passphrase recorded.')
        : valueBlock('key passphrase', info.key.passphrase, {
            masked: true,
            note: 'decrypts the OpenSSH key; held in memory for this tab',
          });
      description = 'The key passphrase unlocks the OpenSSH key. It is not the wallet private name or the card passphrase.';
    }

    root.replaceChildren(
      el('section', { class: 'card' }, [
        el('h2', {}, ['Info']),
        hint(description),
        el('div', { class: 'blocks', style: 'margin-top: 14px' }, [block]),
      ]),
    );
  };

  render(null, false);
  return { root, render };
}
