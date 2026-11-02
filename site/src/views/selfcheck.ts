/**
 * Self-check view: re-runs the pinned Go vectors against the bundle that is
 * actually loaded here. A red row means this build diverged from meltify.
 */

import { copyText } from '../lib/clipboard.ts';
import { el, hint, pill, toast } from '../lib/dom.ts';
import { runSelfCheck } from '../lib/worker-client.ts';
import type { Ctx } from '../app-types.ts';

export function mountSelfCheck(_ctx: Ctx): HTMLElement {
  const rows = el('div', { class: 'checks' }, ['running…']);
  const meta = el('div', { class: 'pills' }, []);
  const rerun = el('button', { type: 'button', class: 'btn small' }, ['Re-run']);

  const run = async (): Promise<void> => {
    rows.replaceChildren(el('div', { class: 'hint' }, ['running…']));
    rerun.disabled = true;
    try {
      const result = await runSelfCheck();
      const failed = result.rows.filter((row) => !row.pass);
      rows.replaceChildren(
        ...result.rows.map((row) =>
          el('div', { class: row.pass ? 'ok' : 'bad' }, [
            row.pass
              ? `PASS  ${row.name}`
              : `FAIL  ${row.name}\n        expected: ${row.expected ?? ''}\n        actual:   ${row.actual ?? ''}`,
          ]),
        ),
      );
      meta.replaceChildren(
        pill(`${result.rows.length - failed.length}/${result.rows.length} passed`, failed.length === 0 ? 'ok' : 'bad'),
        pill(`${result.elapsedMs.toFixed(0)} ms`),
        pill('seed 00..1f'),
      );
    } catch (error) {
      rows.replaceChildren(
        el('div', { class: 'bad' }, [
          `ERROR  ${error instanceof Error ? error.message : String(error)}`,
        ]),
      );
      meta.replaceChildren(pill('self-check failed to run', 'bad'));
    } finally {
      rerun.disabled = false;
    }
  };

  rerun.addEventListener('click', () => {
    void run();
  });

  const root = el('section', { class: 'card' }, [
    el('div', { class: 'row', style: 'justify-content: space-between' }, [
      el('h2', { style: 'margin: 0' }, ['Parity self-check']),
      el('div', { class: 'row tight' }, [
        rerun,
        el('button', {
          type: 'button',
          class: 'btn ghost small',
          onclick: () => {
            void copyText(rows.textContent ?? '').then(
              () => toast('Copied'),
              () => toast('Copy failed', true),
            );
          },
        }, ['copy results']),
      ]),
    ]),
    hint(
      'Builds a deterministic key from seed 00..1f, decrypts it in this tab, and compares every pinned value: phrase, Nostr keys, 14 derivations, CryptoNote primaries, and the renderer line count.',
    ),
    el('div', { style: 'margin-top: 14px' }, [rows]),
    meta,
  ]);

  void run();
  return el('div', { class: 'view' }, [root]);
}
