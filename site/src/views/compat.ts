/**
 * Compat view: the exact text meltify-info prints, with and without ANSI color.
 * Plain output is the byte-parity target for the Go binary.
 */

import { renderText } from 'meltify-ts';
import { copyAction } from '../lib/blocks.ts';
import { downloadText } from '../lib/download.ts';
import { el, hint, pill } from '../lib/dom.ts';
import { subscribe, type AppState } from '../lib/store.ts';
import type { Ctx } from '../app-types.ts';

export function mountCompat(_ctx: Ctx): HTMLElement {
  const root = el('div', { class: 'view' });
  let color = false;

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
    const text = color ? renderText(report, { color: true }) : plain;
    const lines = plain.split('\n').length;

    const colorToggle = el('input', { type: 'checkbox', checked: color });
    colorToggle.addEventListener('change', () => {
      color = colorToggle.checked;
      render(state);
    });

    root.replaceChildren(
      el('section', { class: 'card' }, [
        el('div', { class: 'row', style: 'justify-content: space-between' }, [
          el('h2', { style: 'margin: 0' }, ['meltify-info output']),
          el('div', { class: 'row tight' }, [
            el('label', { class: 'switch' }, [colorToggle, el('span', {}, ['ANSI color'])]),
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
          'This is what meltify-info prints. With NO_COLOR=1 (or a non-TTY) the Go binary emits the plain form, which is byte-identical to the copy button above.',
        ),
        el('div', { style: 'margin-top: 12px' }, [el('pre', { class: 'textout' }, [text])]),
        el('div', { class: 'pills' }, [
          pill(`${lines} lines`),
          pill('plain = parity target'),
          pill(color ? 'color: on (approximate palette)' : 'color: off'),
        ]),
      ]),
    );
  };

  subscribe(render);
  return root;
}
