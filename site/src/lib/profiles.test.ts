/**
 * Kind 0 bookkeeping across the tab tree.
 *
 * The case that matters is a card with an empty BIP39 passphrase: it derives
 * exactly its parent's identity, so two nodes share one pubkey. A round is per
 * pubkey, so the answer has to reach both of them — and a node that derives
 * after the answer is in must be named from it rather than left waiting.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCardDraft,
  addWalletDraft,
  commitCard,
  commitKey,
  commitWallet,
  findNode,
  getState,
  resetAll,
  setDerived,
  setNodeProfile,
  type Identity,
} from './store.ts';
import {
  applyKnownProfiles,
  askPubkeys,
  createProfileBook,
  forgetPubkey,
  nodesByPubkey,
  recordProfile,
  watching,
} from './profiles.ts';

/** A 64-hex pubkey that is easy to read in a failure message. */
const KEY_PUB = 'aa'.repeat(32);
const WALLET_PUB = 'bb'.repeat(32);

function identity(pubKeyHex: string): Identity {
  return {
    report: { npub: `npub1${pubKeyHex.slice(0, 6)}`, pubKeyHex } as unknown as Identity['report'],
    seedHex: '',
    elapsedMs: 0,
    source: 'test',
    subaccount: '',
    bip39Passphrase: '',
    derivedAt: 0,
  };
}

function found(name: string, createdAt: number) {
  return { name, createdAt, via: 'wss://relay.example' };
}

/** A key with one committed wallet, both derived. */
function tree(): { keyId: string; walletId: string } {
  resetAll();
  const keyId = getState().keys[0].id;
  commitKey(keyId, { pem: 'PEM', passphrase: '', source: 'test', comment: '', identity: identity(KEY_PUB) });
  const walletId = addWalletDraft(keyId) as string;
  commitWallet(keyId, walletId, 'subaccount');
  setDerived(walletId, identity(WALLET_PUB));
  return { keyId, walletId };
}

/** A card on the wallet with an empty passphrase: the wallet's own identity. */
function defaultCard(keyId: string, walletId: string): string {
  const cardId = addCardDraft(keyId, walletId) as string;
  commitCard(keyId, walletId, cardId, '');
  setDerived(cardId, identity(WALLET_PUB));
  return cardId;
}

function nameOf(id: string): string | null {
  return findNode(id)?.profile?.name ?? null;
}

describe('kind 0 profiles', () => {
  beforeEach(() => {
    resetAll();
  });

  it('groups the nodes that share a pubkey', () => {
    const { keyId, walletId } = tree();
    const cardId = defaultCard(keyId, walletId);
    const groups = nodesByPubkey(getState());
    expect(groups.get(KEY_PUB)?.map((node) => node.id)).toEqual([keyId]);
    expect(groups.get(WALLET_PUB)?.map((node) => node.id)).toEqual([walletId, cardId]);
  });

  it('asks once for a pubkey that two nodes advertise', () => {
    const { keyId, walletId } = tree();
    const cardId = defaultCard(keyId, walletId);
    const book = createProfileBook();
    expect(askPubkeys(getState(), book)).toEqual([KEY_PUB, WALLET_PUB]);
    // Both nodes are watching, so the round's progress shows on both tabs.
    expect(watching(getState(), [WALLET_PUB]).map((node) => node.id)).toEqual([walletId, cardId]);
  });

  it('names every node that advertises the pubkey, not just the one that asked', () => {
    const { keyId, walletId } = tree();
    const cardId = defaultCard(keyId, walletId);
    const book = createProfileBook();
    book.asked.add(WALLET_PUB);

    recordProfile(getState(), book, WALLET_PUB, found('shared', 100), [], 1);

    expect(nameOf(walletId)).toBe('shared');
    expect(nameOf(cardId)).toBe('shared');
    expect(findNode(cardId)?.search?.named).toBe(true);
    // The key kept its own pubkey, so it is untouched.
    expect(nameOf(keyId)).toBeNull();
  });

  it('names a node that derives after its pubkey was already answered', () => {
    const { keyId, walletId } = tree();
    const book = createProfileBook();

    // The wallet is asked and answered first...
    book.asked.add(WALLET_PUB);
    recordProfile(getState(), book, WALLET_PUB, found('wallet', 100), [], 1);
    expect(nameOf(walletId)).toBe('wallet');

    // ...and only then does the default card appear with the same pubkey.
    const cardId = defaultCard(keyId, walletId);
    expect(askPubkeys(getState(), book)).not.toContain(WALLET_PUB);

    expect(applyKnownProfiles(getState(), book)).toBe(1);
    expect(nameOf(cardId)).toBe('wallet');
    expect(findNode(cardId)?.search?.named).toBe(true);
  });

  it('marks a relay name as unverified, and never moves a name back in time', () => {
    const { keyId, walletId } = tree();
    const cardId = defaultCard(keyId, walletId);
    const book = createProfileBook();

    recordProfile(getState(), book, WALLET_PUB, found('newer', 200), [], 1);
    expect(nameOf(walletId)).toBe('newer');
    expect(findNode(walletId)?.profile?.verified).toBe(false);

    // An older event arriving later does not walk the name back.
    recordProfile(getState(), book, WALLET_PUB, found('older', 100), [], 2);
    expect(nameOf(walletId)).toBe('newer');

    // A node with nothing takes the name, with no round of its own.
    const ledger = addWalletDraft(keyId) as string;
    commitWallet(keyId, ledger, 'second');
    setDerived(ledger, identity('cc'.repeat(32)));
    recordProfile(getState(), book, 'cc'.repeat(32), found('ledger', 100), [], 3);
    expect(nameOf(ledger)).toBe('ledger');
    expect(findNode(ledger)?.profile?.via).toBe('relay.example');
    // The card shares the wallet's pubkey, so it took the wallet's name.
    expect(nameOf(cardId)).toBe('newer');
  });

  it('never replaces a name the user pasted', () => {
    const { keyId, walletId } = tree();
    const cardId = defaultCard(keyId, walletId);
    setNodeProfile(cardId, { name: 'typed', createdAt: 1, via: 'paste', verified: false });
    const book = createProfileBook();

    recordProfile(getState(), book, WALLET_PUB, found('relay', 999), [], 1);

    expect(nameOf(cardId)).toBe('typed');
    expect(nameOf(walletId)).toBe('relay');
  });

  it('replaces an older verified name with a newer one', () => {
    const { walletId } = tree();
    const book = createProfileBook();
    recordProfile(getState(), book, WALLET_PUB, found('old', 100), [], 1);
    recordProfile(getState(), book, WALLET_PUB, found('new', 200), [], 2);
    expect(nameOf(walletId)).toBe('new');
    // An older event arriving late does not walk the name back.
    recordProfile(getState(), book, WALLET_PUB, found('older', 50), [], 3);
    expect(nameOf(walletId)).toBe('new');
  });

  it('re-asks a pubkey on request, even though every node has a name', () => {
    const { walletId } = tree();
    const book = createProfileBook();
    book.asked.add(WALLET_PUB);
    recordProfile(getState(), book, WALLET_PUB, found('relay', 100), [], 1);
    expect(askPubkeys(getState(), book)).toEqual([KEY_PUB]);

    forgetPubkey(book, WALLET_PUB);
    book.forced.add(WALLET_PUB);
    expect(askPubkeys(getState(), book)).toContain(WALLET_PUB);
    expect(nameOf(walletId)).toBe('relay');
  });

  it('reports nothing left to ask once every node is named', () => {
    const { keyId, walletId } = tree();
    defaultCard(keyId, walletId);
    const book = createProfileBook();
    book.asked.add(KEY_PUB);
    book.asked.add(WALLET_PUB);
    recordProfile(getState(), book, KEY_PUB, found('key', 100), [], 1);
    recordProfile(getState(), book, WALLET_PUB, found('wallet', 100), [], 1);
    expect(askPubkeys(getState(), book)).toEqual([]);
  });
});
