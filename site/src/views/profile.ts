/**
 * The kind 0 panel for one node — a key, a wallet or a card.
 *
 * Every node carries its own npub: a wallet's private name and a card's BIP39
 * passphrase each move it, so every node gets its own lookup. This panel is
 * therefore rendered wherever a node is described — under the key, under the
 * wallet, under the card — because a lookup nobody shows looks exactly like a
 * lookup that never ran.
 *
 * Nothing here is verified against the npub: the name is whatever the relay's
 * kind 0 advertises, and it is labelled unverified wherever it appears. A name
 * you paste is marked `paste`, which outranks the relay's.
 */

import { el, message, pill, toast } from '../lib/dom.ts';
import { DEFAULT_RELAYS } from '../lib/relays.ts';
import { setNodeProfile, type RelayAnswer } from '../lib/store.ts';
import type { ProfileNode } from '../lib/profiles.ts';
import type { Ctx } from '../app-types.ts';

/** Relay lines stay short: host only. */
function relayLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The one-line answer: did the relays produce a name for this npub? */
function outcome(search: { named: boolean; relays: readonly RelayAnswer[] }): string {
  const events = search.relays.reduce((sum, relay) => sum + relay.events, 0);
  const asked = search.relays.length;
  if (search.named) return 'A name came back. It is not verified — see the note below.';
  if (events === 0) {
    return `No kind 0 event came back for this npub — ${asked} relay${asked === 1 ? '' : 's'} asked. This identity has never published one.`;
  }
  return 'A kind 0 event came back but it has no display_name or name.';
}

/** What `Profile.via` means in words. */
function viaText(profile: { verified: boolean; via: string }): string {
  if (profile.verified) return `verified · ${profile.via}`;
  return profile.via === 'paste' ? 'pasted · not verified' : `unverified · ${profile.via}`;
}

export function profilePanel(node: ProfileNode, ctx: Ctx): HTMLElement {
  const profile = node.profile;
  const search = node.search;
  const npub = node.identity?.report.npub ?? '';
  const body = el('div');

  body.append(
    el('p', { class: 'hint tight' }, [
      'Kind 0 is looked up for this node’s own npub: ',
      el('span', { class: 'mono' }, [npub === '' ? 'not derived yet' : npub]),
    ]),
    el('p', { class: 'hint tight' }, [`Relays: ${DEFAULT_RELAYS.map(relayLabel).join(', ')}.`]),
  );

  if (search === null) {
    body.append(
      message(
        npub === ''
          ? 'Not asked yet: this node has no npub until its derivation finishes.'
          : 'Not asked yet: no relay round has run for this npub.',
        'warn',
      ),
    );
  } else if (search.state === 'searching') {
    body.append(
      el('div', { class: 'msg' }, [
        el('span', { class: 'busy' }),
        `Asking ${DEFAULT_RELAYS.length} relays for kind 0…`,
      ]),
    );
  } else {
    const rows = search.relays.map((relay) => {
      const bits = [` · ${relay.state}`];
      if (relay.events > 0) bits.push(` · ${relay.events} event${relay.events === 1 ? '' : 's'}`);
      if (relay.nameless > 0) bits.push(` · ${relay.nameless} without a name`);
      if (relay.detail !== undefined) bits.push(` · ${relay.detail}`);
      return el('li', {}, [
        el('span', { class: relay.state === 'ok' ? 'ok' : 'dim' }, [relayLabel(relay.relay)]),
        bits.join(''),
      ]);
    });
    body.append(el('div', { class: 'hint' }, [outcome(search)]), el('ul', { class: 'relaylist' }, rows));
  }

  if (profile !== null) {
    const when = new Date(profile.createdAt * 1000).toISOString().slice(0, 10);
    body.append(
      el('div', { class: 'row tight', style: 'flex-wrap: wrap; margin-top: 8px' }, [
        pill(`profile: ${profile.name}`),
        pill(viaText(profile)),
        pill(`signed ${when}`),
        el('button', {
          type: 'button',
          class: 'btn ghost small',
          onclick: () => {
            setNodeProfile(node.id, null);
            toast('Profile cleared — the tab goes back to its npub');
          },
        }, ['Clear']),
      ]),
    );
  }

  const input = el('textarea', {
    class: 'k0',
    spellcheck: 'false',
    placeholder: '{ "display_name": "…", "name": "…" }',
  });
  const notice = el('div');
  const paste = (): void => {
    notice.replaceChildren();
    const text = input.value.trim();
    if (text === '') {
      setNodeProfile(node.id, null);
      toast('Profile cleared');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      notice.replaceChildren(message(`That is not JSON: ${String(error)}`, 'err'));
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      notice.replaceChildren(message('Kind 0 content is a JSON object.', 'err'));
      return;
    }
    const content = parsed as { display_name?: unknown; name?: unknown };
    const name = [content.display_name, content.name].find(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    );
    if (name === undefined) {
      notice.replaceChildren(message('No display_name or name in that object.', 'warn'));
      return;
    }
    setNodeProfile(node.id, {
      name: name.trim(),
      createdAt: Math.floor(Date.now() / 1000),
      via: 'paste',
      verified: false,
    });
    toast(`Tab renamed to “${name.trim()}”`);
  };

  body.append(
    el('div', { style: 'margin-top: 10px' }, [
      el('div', { class: 'row tight' }, [
        el('button', {
          type: 'button',
          class: 'btn ghost small',
          onclick: () => ctx.searchProfiles(node.id),
        }, ['Search again']),
        search === null ? el('span', { class: 'hint' }, ['not searched yet']) : '',
      ]),
      el('p', { class: 'hint tight' }, [
        'Or paste the content of a kind 0 event to override what the relays returned.',
      ]),
      el('div', { style: 'margin-top: 8px' }, [input]),
      el('div', { class: 'row', style: 'margin-top: 8px' }, [
        el('button', { type: 'button', class: 'btn ghost small', onclick: paste }, ['Use display name']),
      ]),
      notice,
    ]),
  );

  const summary =
    profile !== null
      ? `Kind 0 profile — “${profile.name}” (${profile.via === 'paste' ? 'pasted' : 'unverified'})`
      : search === null
        ? 'Kind 0 profile — not searched yet'
        : search.state === 'searching'
          ? 'Kind 0 profile — searching relays…'
          : `Kind 0 profile — ${search.named ? 'found' : 'nothing found'} (${search.relays.length} relays)`;

  // Open until the node has a name: a lookup that found nothing has to say so
  // out loud, and a collapsed box would look exactly like nothing happened.
  const settled = profile !== null && search !== null && search.state === 'done';

  return el('details', { class: 'k0box', open: !settled }, [el('summary', {}, [summary]), body]);
}
