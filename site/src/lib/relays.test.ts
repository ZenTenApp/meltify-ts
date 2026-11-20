/**
 * One kind 0 round, driven through the `open` seam instead of a socket.
 *
 * Nothing is verified any more, so these tests pin the round mechanics and the
 * reading of what a relay sent: a name appears even when the event's id is not
 * the one this page would compute, a round is never cut off by a wall clock
 * while a relay is still talking, and a socket that has died cannot hold the
 * round open forever.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProfiles, type Relay } from './relays.ts';

const PUBKEY = 'aa'.repeat(32);
const URL = 'wss://relay.example';

/** The shape a relay serves: id and sig here are deliberately not canonical. */
function kind0(content: string, createdAt: number, kind = 0): Record<string, unknown> {
  return {
    id: 'ff'.repeat(32),
    pubkey: PUBKEY,
    created_at: createdAt,
    kind,
    tags: [['display_name', content]],
    content,
    sig: 'ee'.repeat(64),
  };
}

interface Fake {
  relay: Relay;
  /** What the relay was asked for (the REQ frame). */
  sent: string[];
  /** Deliver one frame. */
  push(frame: unknown): void;
  /** The socket dropped. */
  drop(): void;
  closed: boolean;
}

function fakeRelay(): Fake {
  const messages: ((data: string) => void)[] = [];
  const closes: ((detail?: string) => void)[] = [];
  const fake: Fake = {
    sent: [],
    closed: false,
    relay: {
      send: (data) => fake.sent.push(data),
      close: () => {
        fake.closed = true;
      },
      onMessage: (handler) => messages.push(handler),
      onClose: (handler) => closes.push(handler),
      onError: (handler) => closes.push(handler),
    },
    push: (frame) => {
      const text = typeof frame === 'string' ? frame : JSON.stringify(frame);
      for (const handler of messages) handler(text);
    },
    drop: () => {
      fake.closed = true;
      for (const handler of closes) handler();
    },
  };
  return fake;
}

/** The subscription id the round chose, taken from its own REQ frame. */
function subOf(fake: Fake): string {
  return (JSON.parse(fake.sent[0] ?? '[]') as [string, string])[1];
}

function openWith(fakes: readonly Fake[]): () => Relay {
  let index = 0;
  return () => fakes[index++]?.relay ?? fakeRelay().relay;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchProfiles', () => {
  it('takes the name a relay sent, whatever its id or signature looks like', async () => {
    const fake = fakeRelay();
    const run = fetchProfiles([PUBKEY], [URL], openWith([fake]));
    await Promise.resolve();
    fake.push(['EVENT', subOf(fake), kind0('{"display_name":"cld2-test"}', 100)]);
    fake.push(['EOSE', subOf(fake)]);
    const result = await run;

    expect(result.profiles.get(PUBKEY)).toEqual({ name: 'cld2-test', createdAt: 100, via: URL });
    expect(result.relays[0]?.state).toBe('ok');
    expect(result.relays[0]?.events).toBe(1);
  });

  it('uses display_name, falls back to name, and ignores other kinds', async () => {
    const fake = fakeRelay();
    const run = fetchProfiles([PUBKEY], [URL], openWith([fake]));
    await Promise.resolve();
    const sub = subOf(fake);
    fake.push(['EVENT', sub, kind0('{"display_name":"","name":"fallback"}', 100)]);
    // A kind 1 for the same author is not a profile and is not counted.
    fake.push(['EVENT', sub, kind0('{"display_name":"not a profile"}', 200, 1)]);
    fake.push(['EOSE', sub]);
    const result = await run;

    expect(result.profiles.get(PUBKEY)?.name).toBe('fallback');
    expect(result.relays[0]?.events).toBe(1);
    expect(result.relays[0]?.nameless).toBe(0);
  });

  it('counts an event with no name but keeps looking', async () => {
    const fake = fakeRelay();
    const run = fetchProfiles([PUBKEY], [URL], openWith([fake]));
    await Promise.resolve();
    const sub = subOf(fake);
    fake.push(['EVENT', sub, kind0('{"about":"no name here"}', 300)]);
    fake.push(['EVENT', sub, kind0('{"name":"named"}', 100)]);
    fake.push(['EOSE', sub]);
    const result = await run;

    expect(result.profiles.get(PUBKEY)?.name).toBe('named');
    expect(result.relays[0]?.nameless).toBe(1);
  });

  it('keeps the newest created_at across relays, naming the relay that served it', async () => {
    const older = fakeRelay();
    const newer = fakeRelay();
    const run = fetchProfiles([PUBKEY], ['wss://old', 'wss://new'], openWith([older, newer]));
    await Promise.resolve();
    older.push(['EVENT', subOf(older), kind0('{"name":"old"}', 100)]);
    older.push(['EOSE', subOf(older)]);
    newer.push(['EVENT', subOf(newer), kind0('{"name":"new"}', 200)]);
    newer.push(['EOSE', subOf(newer)]);
    const result = await run;

    expect(result.profiles.get(PUBKEY)).toEqual({ name: 'new', createdAt: 200, via: 'wss://new' });
  });

  it('ends the round when a relay drops without EOSE', async () => {
    const fake = fakeRelay();
    const run = fetchProfiles([PUBKEY], [URL], openWith([fake]));
    await Promise.resolve();
    fake.push(['EVENT', subOf(fake), kind0('{"name":"x"}', 100)]);
    fake.drop();
    const result = await run;

    expect(result.relays[0]?.state).toBe('closed');
    expect(result.relays[0]?.events).toBe(1);
  });

  it('closes a relay that has gone completely silent, keeping what it delivered', async () => {
    vi.useFakeTimers();
    const fake = fakeRelay();
    const run = fetchProfiles([PUBKEY], [URL], openWith([fake]));
    await Promise.resolve();
    fake.push(['EVENT', subOf(fake), kind0('{"name":"slow"}', 100)]);

    await vi.advanceTimersByTimeAsync(19_000);
    expect(fake.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(1_500);
    const result = await run;

    expect(result.relays[0]?.state).toBe('silent');
    expect(result.profiles.get(PUBKEY)?.name).toBe('slow');
    expect(fake.closed).toBe(true);
  });

  it('restarts the silence clock on every frame', async () => {
    vi.useFakeTimers();
    const fake = fakeRelay();
    const run = fetchProfiles([PUBKEY], [URL], openWith([fake]));
    await Promise.resolve();
    const sub = subOf(fake);

    // A relay trickling NOTICEs is alive, however slow it is about EOSE.
    for (let step = 0; step < 4; step += 1) {
      await vi.advanceTimersByTimeAsync(15_000);
      fake.push(['NOTICE', 'still working']);
    }
    expect(fake.closed).toBe(false);

    fake.push(['EVENT', sub, kind0('{"name":"slow"}', 100)]);
    fake.push(['EOSE', sub]);
    const result = await run;
    expect(result.profiles.get(PUBKEY)?.name).toBe('slow');
  });
});
