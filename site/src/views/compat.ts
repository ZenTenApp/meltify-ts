/**
 * Compat view: the exact text meltify-info prints, coloured with the binary's
 * own palette. The copy button and the .txt download stay plain — that form is
 * the byte-parity target for the Go binary.
 */

import { renderText } from 'meltify-ts';
import { ansiToNodes } from '../lib/ansi.ts';
import { copyAction } from '../lib/blocks.ts';
import { downloadText } from '../lib/download.ts';
import { el, hint, pill } from '../lib/dom.ts';
import { subscribe, type AppState } from '../lib/store.ts';
import type { Ctx } from '../app-types.ts';

export function mountCompat(_ctx: Ctx): HTMLElement {
  const root = el('div', { class: 'view' });

  const render = (state: AppState): void => {
    const identity = state.identity;
    if (identity === null) {
      root.replaceChildren(
        el('section', { class: 'card' }, [
          el('div', { class: 'empty' }, [
            el('h2', {}, ['Nothing to render']),
            el('p', { class: 'hint' }, ['Derive an identity first.']),
            el('div', { class: 'row', style: 'justify-content: center; margin-top: 14px' }, [
              el('a', { class: 'btn primary', href: '#/derive' }, ['Go to Derive']),
            ]),
          ]),
        ]),
      );
      return;
    }

    const report = identity.report;
    const plain = renderText(report, { color: false });
    const lines = plain.split('\n').length;

    root.replaceChildren(
      el('section', { class: 'card' }, [
        el('div', { class: 'row', style: 'justify-content: space-between' }, [
          el('h2', { style: 'margin: 0' }, ['meltify-info output']),
          el('div', { class: 'row tight' }, [
            copyAction(plain, 'plain meltify-info output'),
            el('button', {
              type: 'button',
              class: 'btn small',
              onclick: () => {
                downloadText('meltify-info.txt', plain);
              },
            }, ['download .txt']),
          ]),
        ]),
        hint(
          'Colours are the ones meltify-info paints on a TTY: borders in bold white, public values green, secret values red. Copy and download stay plain because that form — what the binary emits with NO_COLOR=1 or a non-TTY — is the byte-parity target.',
        ),
        el('div', { style: 'margin-top: 12px' }, [
          el('pre', { class: 'textout' }, ansiToNodes(renderText(report, { color: true }))),
        ]),
        el('div', { class: 'pills' }, [
          pill(`${lines} lines`),
          pill('plain = parity target'),
          pill('colour: meltify-info palette'),
          ...(identity.subaccount === ''
            ? []
            : [pill(`subaccount: ${identity.subaccount}`, 'ok')]),
        ]),
      ]),
    );
  };

  subscribe(render);
  return root;
}
