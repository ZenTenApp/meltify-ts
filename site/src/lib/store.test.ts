/**
 * Positional tab titles and the selection defaults.
 *
 * Tabs are numbered from their place in the tree (`Key 1`, `Wallet 1.2`,
 * `Card 1.2.3`), so closing anything renumbers the rest; a key tab takes its
 * OpenSSH comment instead when the key carries one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCardDraft,
  addWalletDraft,
  commitCard,
  commitKey,
  commitWallet,
  getState,
  labelOf,
  removeCard,
  removeWallet,
  resetAll,
  selectKey,
  selectWallet,
  setDerived,
  setNodeProfile,
  type Identity,
} from './store.ts';

function identity(npub: string): Identity {
  return {
    report: { npub, pubKeyHex: 'aa'.repeat(32) } as unknown as Identity['report'],
    seedHex: '',
    elapsedMs: 0,
    source: 'test',
    subaccount: '',
    bip39Passphrase: '',
    derivedAt: 0,
  };
}

function readyKey(comment = ''): string {
  const keyId = getState().keys[0].id;
  commitKey(keyId, {
    pem: `PEM-${comment}`,
    passphrase: '',
    source: 'test',
    comment,
    identity: identity('npub1key'),
  });
  return keyId;
}

describe('tab titles', () => {
  beforeEach(() => {
    resetAll();
  });

  it('labels the empty draft tab "Add key"', () => {
    expect(labelOf(getState(), getState().keys[0].id)).toBe('Add key');
  });

  it('numbers a key, then its OpenSSH comment or npub', () => {
    const keyId = readyKey();
    expect(labelOf(getState(), keyId)).toBe('1 npub…1key');
    resetAll();
    const named = readyKey('alice@laptop');
    expect(labelOf(getState(), named)).toBe('1 alice@laptop');
  });

  it('numbers wallets and cards by their position', () => {
    const keyId = readyKey();
    const first = addWalletDraft(keyId) as string;
    commitWallet(keyId, first, 'one');
    const second = addWalletDraft(keyId) as string;
    commitWallet(keyId, second, 'two');
    expect(labelOf(getState(), first)).toBe('1.1');
    expect(labelOf(getState(), second)).toBe('1.2');

    const card = addCardDraft(keyId, second) as string;
    commitCard(keyId, second, card, '');
    expect(labelOf(getState(), card)).toBe('1.2.1');
  });

  it('appends a wallet’s npub, then its kind 0 name when it has one', () => {
    const keyId = readyKey();
    const wallet = addWalletDraft(keyId) as string;
    commitWallet(keyId, wallet, 'one');
    setDerived(wallet, identity('npub1wallet'));
    expect(labelOf(getState(), wallet)).toBe('1.1 npub…llet');
    setNodeProfile(wallet, { name: 'alice', createdAt: 1, via: 'paste', verified: false });
    expect(labelOf(getState(), wallet)).toBe('1.1 alice');
  });

  it('numbers a key’s own cards as if the empty wallet tab were wallet 1', () => {
    const keyId = readyKey();
    const card = addCardDraft(keyId, null) as string;
    commitCard(keyId, null, card, 'passphrase');
    expect(labelOf(getState(), card)).toBe('1.1.1');
  });

  it('renumbers the rest when a tab closes', () => {
    const keyId = readyKey();
    const first = addWalletDraft(keyId) as string;
    commitWallet(keyId, first, 'one');
    const second = addWalletDraft(keyId) as string;
    commitWallet(keyId, second, 'two');
    removeWallet(keyId, first);
    expect(labelOf(getState(), second)).toBe('1.1');

    const card = addCardDraft(keyId, second) as string;
    commitCard(keyId, second, card, 'one');
    const other = addCardDraft(keyId, second) as string;
    removeCard(keyId, second, card);
    expect(labelOf(getState(), other)).toBe('1.1.1');
  });
});

describe('selection defaults', () => {
  beforeEach(() => {
    resetAll();
  });

  it('returns a key to its default wallet and card tabs when selected', () => {
    const keyId = readyKey();
    const wallet = addWalletDraft(keyId) as string;
    addCardDraft(keyId, wallet);
    selectKey(keyId);
    const key = getState().keys.find((entry) => entry.id === keyId);
    expect(key?.activeWallet).toBeNull();
    expect(key?.activeCard).toBeNull();
  });

  it('returns a wallet to its default card tab when selected', () => {
    const keyId = readyKey();
    const wallet = addWalletDraft(keyId) as string;
    addCardDraft(keyId, wallet);
    selectWallet(keyId, wallet);
    expect(getState().keys[0].wallets[0].activeCard).toBeNull();
  });

  it('returns to the default tab when the selected wallet closes', () => {
    const keyId = readyKey();
    const wallet = addWalletDraft(keyId) as string;
    removeWallet(keyId, wallet);
    expect(getState().keys[0].activeWallet).toBeNull();
  });
});
