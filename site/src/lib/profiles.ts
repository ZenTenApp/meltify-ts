/**
 * Kind 0 bookkeeping for the whole tab tree.
 *
 * A relay round is per *pubkey*, but a name belongs to every *node* that
 * advertises that pubkey: a card with an empty BIP39 passphrase derives exactly
 * its parent's identity, so a wallet and its default card share one pubkey (and
 * so do a key and its default card).
 *
 * So this module answers two questions instead of pairing a pubkey with the one
 * node that happened to ask first: which pubkeys still need a round, and which
 * nodes a finished round speaks for. Answers are kept per pubkey, so a node that
 * derives after its pubkey was already answered is named from that answer rather
 * than waiting for a round that nobody will ever run.
 *
 * Nothing here touches the network; `main.ts` feeds it finished rounds.
 */

import { setNodeProfile, setProfileSearch } from './store.ts';
import type { AppState, CardTab, KeyTab, RelayAnswer, WalletTab } from './store.ts';
import type { FoundProfile } from './relays.ts';

/** Any node that can advertise a kind 0. */
export type ProfileNode = KeyTab | WalletTab | CardTab;

/** One pubkey's answered round, kept for nodes that derive afterwards. */
export interface ProfileEntry {
  profile: FoundProfile;
  /** Per-relay outcome of the round that produced it. */
  relays: RelayAnswer[];
  /** When that round started, ms since epoch. */
  at: number;
}

export interface ProfileBook {
  /** Pubkeys already put to the relays. */
  asked: Set<string>;
  /** Answers already received, per pubkey. */
  found: Map<string, ProfileEntry>;
  /** Pubkeys to ask again even though every node with them already has a name. */
  forced: Set<string>;
}

export function createProfileBook(): ProfileBook {
  return { asked: new Set(), found: new Map(), forced: new Set() };
}

/** Forgets every lookup. `wipe()` is the only caller. */
export function clearProfileBook(book: ProfileBook): void {
  book.asked.clear();
  book.found.clear();
  book.forced.clear();
}

/** Every node that advertises an npub, grouped by that pubkey, in tree order. */
export function nodesByPubkey(state: AppState): Map<string, ProfileNode[]> {
  const out = new Map<string, ProfileNode[]>();
  for (const key of state.keys) {
    const nodes: ProfileNode[] = [key, ...key.cards, ...key.wallets.flatMap((wallet) => [wallet, ...wallet.cards])];
    for (const node of nodes) {
      const pubkey = node.identity?.report.pubKeyHex;
      if (pubkey === undefined) continue;
      const list = out.get(pubkey);
      if (list === undefined) out.set(pubkey, [node]);
      else list.push(node);
    }
  }
  return out;
}

/** The pubkeys a round should ask for now: something is unnamed, or was asked again. */
export function askPubkeys(state: AppState, book: ProfileBook): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [pubkey, nodes] of nodesByPubkey(state)) {
    if (book.asked.has(pubkey) || !nodes.some((node) => node.profile === null)) continue;
    out.push(pubkey);
    seen.add(pubkey);
  }
  for (const pubkey of book.forced) {
    if (book.asked.has(pubkey) || seen.has(pubkey)) continue;
    out.push(pubkey);
  }
  return out;
}

/** Every node a round for `pubkeys` speaks for, so each one can show its progress. */
export function watching(state: AppState, pubkeys: readonly string[]): ProfileNode[] {
  const wanted = new Set(pubkeys);
  const out: ProfileNode[] = [];
  for (const [pubkey, nodes] of nodesByPubkey(state)) {
    if (wanted.has(pubkey)) out.push(...nodes);
  }
  return out;
}

/**
 * Records one pubkey's answer: every node that advertises it gets the round's
 * outcome, and the ones without a name get the name. The name is never verified,
 * so it is stored and shown as such; it also goes in the book, so a node that
 * derives afterwards is named without another round.
 */
export function recordProfile(
  state: AppState,
  book: ProfileBook,
  pubkey: string,
  found: FoundProfile | undefined,
  relays: RelayAnswer[],
  at: number,
): void {
  book.forced.delete(pubkey);
  if (found !== undefined) {
    const known = book.found.get(pubkey);
    if (known === undefined || known.profile.createdAt <= found.createdAt) {
      book.found.set(pubkey, { profile: found, relays: copyRelays(relays), at });
    }
  }
  for (const node of nodesByPubkey(state).get(pubkey) ?? []) {
    if (found !== undefined && shouldName(node, found)) name(node, found);
    setProfileSearch(node.id, {
      state: 'done',
      at,
      relays: copyRelays(relays),
      named: found !== undefined,
    });
  }
}

/**
 * Names nodes from answers already received, without a round. Returns how many
 * it named. This is what gives a card with an empty passphrase its name: its
 * pubkey was answered for the parent before the card even existed.
 */
export function applyKnownProfiles(state: AppState, book: ProfileBook): number {
  let named = 0;
  for (const [pubkey, entry] of book.found) {
    for (const node of nodesByPubkey(state).get(pubkey) ?? []) {
      if (node.profile !== null) continue;
      name(node, entry.profile);
      setProfileSearch(node.id, {
        state: 'done',
        at: entry.at,
        relays: copyRelays(entry.relays),
        named: true,
      });
      named += 1;
    }
  }
  return named;
}

/** Forgets one pubkey so "Search again" can put it back to the relays. */
export function forgetPubkey(book: ProfileBook, pubkey: string): void {
  book.asked.delete(pubkey);
  book.found.delete(pubkey);
}

/** A copy of a round's relay rows: `ProfileSearch` is UI state, so never shared. */
function copyRelays(relays: readonly RelayAnswer[]): RelayAnswer[] {
  return relays.map((relay) => ({ ...relay }));
}

/**
 * A name for a node. Nothing verified it, so `verified` is false and the tab
 * marks it; `via` is the relay host, or `paste` for a name you typed yourself.
 */
function name(node: ProfileNode, found: FoundProfile): void {
  setNodeProfile(node.id, {
    name: found.name,
    createdAt: found.createdAt,
    via: relayHost(found.via),
    verified: false,
  });
}

/**
 * True when `found` should replace what the node shows. A name you pasted is
 * yours and stays; among relay names the newest `created_at` wins.
 */
function shouldName(node: ProfileNode, found: FoundProfile): boolean {
  const current = node.profile;
  if (current === null) return true;
  if (current.via === 'paste') return false;
  return found.createdAt > current.createdAt;
}

/** The relay's host, which is what the UI shows; the scheme and path say nothing. */
export function relayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
