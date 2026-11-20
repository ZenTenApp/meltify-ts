/**
 * Kind 0 profiles from relays.
 *
 * One round of subscriptions, no retries, no persistence: connect, ask for
 * kind 0 for a set of pubkeys, collect until `EOSE`, close. Every event is
 * checked by `nostr-event.ts` against the pubkey this page derived, so a relay
 * can withhold a profile but cannot invent one.
 *
 * There is no wall-clock cutoff for the round. A round ends when every relay
 * has finished — EOSE, CLOSED, a socket error, or that relay going completely
 * silent. Events are read, not verified: whatever name a relay's kind 0 carries
 * is used, and the UI marks it unverified.
 *
 * The transport is behind `openRelay` so the logic above it can be tested
 * without a socket (jsdom has no WebSocket).
 */

import { readKind0 } from './nostr-event.ts';

/** Fixed list: the CSP allowlist names exactly these hosts. */
export const DEFAULT_RELAYS: readonly string[] = [
  // kind 0 indexers first: they answer a profile query without a full firehose,
  // then general relays as the fallback.
  'wss://purplepag.es',
  'wss://user.kindpag.es',
  'wss://directory.yabu.me',
  'wss://profiles.nostr1.com',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nos.lol',
];

/**
 * How long one relay may send nothing at all before its socket is closed.
 *
 * This is not a deadline for the round: every frame from the relay resets it, so
 * a relay that is still talking is never cut off, and a relay that already
 * delivered an event keeps it and its counters. It exists so that a socket that
 * died without closing cannot hold the round open forever.
 */
const SILENCE_MS = 20000;

export interface RelayStatus {
  relay: string;
  /** 'ok' when it answered and EOSE arrived, otherwise why it did not. */
  state: 'ok' | 'error' | 'closed' | 'silent';
  /** Kind 0 events for a wanted author. */
  events: number;
  /** Of those, the ones with no display_name and no name. */
  nameless: number;
  detail?: string;
}

export interface FoundProfile {
  name: string;
  createdAt: number;
  /** Relay URL that served it. */
  via: string;
}

export interface ProfileResult {
  /** hex pubkey → newest name a relay advertised for it. */
  profiles: Map<string, FoundProfile>;
  relays: RelayStatus[];
}

export interface Relay {
  send(data: string): void;
  close(): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (detail?: string) => void): void;
  onError(handler: (detail?: string) => void): void;
}

/** The stock adapter: a plain WebSocket, text frames only. */
export function openRelay(url: string): Relay {
  const socket = new WebSocket(url);
  const messages: ((data: string) => void)[] = [];
  const closes: ((detail?: string) => void)[] = [];

  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'string') return;
    for (const handler of messages) handler(event.data);
  });
  socket.addEventListener('close', () => {
    for (const handler of closes) handler();
  });
  socket.addEventListener('error', () => {
    for (const handler of closes) handler('socket error');
  });

  return {
    send(data) {
      const write = (): void => socket.send(data);
      if (socket.readyState === WebSocket.OPEN) write();
      else socket.addEventListener('open', write, { once: true });
    },
    close() {
      socket.close();
    },
    onMessage(handler) {
      messages.push(handler);
    },
    onClose(handler) {
      closes.push(handler);
    },
    onError(handler) {
      closes.push(handler);
    },
  };
}

/**
 * Fetches kind 0 for each pubkey and returns the newest verified event per
 * pubkey. Never throws: relay trouble is reported in `relays`.
 */
export async function fetchProfiles(
  pubkeys: readonly string[],
  relays: readonly string[] = DEFAULT_RELAYS,
  open: (url: string) => Relay = openRelay,
): Promise<ProfileResult> {
  const wanted = new Set(pubkeys.filter((pubkey) => /^[0-9a-f]{64}$/.test(pubkey)));
  const profiles = new Map<string, FoundProfile>();
  const statuses: RelayStatus[] = [];
  if (wanted.size === 0 || relays.length === 0) return { profiles, relays: statuses };

  const sub = `meltify-profiles-${Math.random().toString(36).slice(2, 10)}`;
  const sockets: Relay[] = [];

  return await new Promise<ProfileResult>((resolve) => {
    let settled = 0;
    let done = false;

    const settle = (): void => {
      if (done || settled < relays.length) return;
      done = true;
      for (const socket of sockets) socket.close();
      resolve({ profiles, relays: statuses });
    };

    for (const url of relays) {
      const status: RelayStatus = { relay: url, state: 'ok', events: 0, nameless: 0 };
      statuses.push(status);

      // Each relay settles exactly once: EOSE, CLOSED, a socket error, or going
      // silent. Without this, closing the socket ourselves after EOSE would
      // count twice and could resolve the round while another relay is still
      // delivering events.
      let settledRelay = false;
      let silence: ReturnType<typeof setTimeout> | null = null;
      const finishRelay = (state: RelayStatus['state'], detail?: string): void => {
        if (settledRelay) return;
        settledRelay = true;
        status.state = state;
        if (detail !== undefined) status.detail = detail;
        if (silence !== null) clearTimeout(silence);
        settled += 1;
        settle();
      };

      let relay: Relay;
      try {
        relay = open(url);
      } catch (error) {
        finishRelay('error', String(error));
        continue;
      }
      sockets.push(relay);

      /** Any frame proves the socket is alive, so the silence clock restarts. */
      const alive = (): void => {
        if (silence !== null) clearTimeout(silence);
        silence = setTimeout(() => {
          finishRelay('silent', `nothing at all for ${Math.round(SILENCE_MS / 1000)} s, socket closed`);
          relay.close();
        }, SILENCE_MS);
      };
      alive();

      relay.onMessage((data) => {
        alive();
        let frame: unknown;
        try {
          frame = JSON.parse(data);
        } catch {
          return;
        }
        if (!Array.isArray(frame)) return;
        const [type, id] = frame;
        if (id !== sub) return;

        if (type === 'EVENT') {
          const raw = frame[2];
          const pubkey = (raw as { pubkey?: unknown } | null)?.pubkey;
          if (typeof pubkey !== 'string' || !wanted.has(pubkey)) return;
          // A relay was asked for kinds: [0]; anything else for that author is
          // not a profile and is not counted. Nothing here is verified.
          if ((raw as { kind?: unknown }).kind !== 0) return;
          // Counted even when it carries no name: "the event exists but has no
          // display_name" is worth being able to see.
          status.events += 1;
          const profile = readKind0(raw);
          if (profile === null) {
            status.nameless += 1;
            return;
          }
          const current = profiles.get(pubkey);
          if (current === undefined || profile.createdAt > current.createdAt) {
            profiles.set(pubkey, { ...profile, via: url });
          }
        } else if (type === 'EOSE') {
          finishRelay('ok');
          relay.close();
        } else if (type === 'CLOSED') {
          finishRelay('closed', typeof frame[2] === 'string' ? frame[2] : 'closed by relay');
        } else if (type === 'NOTICE' && typeof frame[1] === 'string' && /auth/i.test(frame[1])) {
          finishRelay('error', 'relay requires auth');
        }
      });
      relay.onClose((detail) => finishRelay(detail === undefined ? 'closed' : 'error', detail));
      relay.onError((detail) => finishRelay('error', detail ?? 'socket error'));

      // `wanted` is a Set: two nodes that derive the same npub ask once.
      relay.send(JSON.stringify(['REQ', sub, { kinds: [0], authors: [...wanted] }]));
    }
  });
}
