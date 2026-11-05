/** Shared value display: masked secret blocks, copy/reveal actions, download buttons. */

import { copyText } from './clipboard.ts';
import { el, toast } from './dom.ts';

export function copyAction(value: string, label: string, text = 'copy'): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'btn ghost small', title: `Copy ${label}` }, [
    text,
  ]);
  button.addEventListener('click', () => {
    void copyText(value).then(
      () => {
        button.textContent = 'copied';
        window.setTimeout(() => {
          button.textContent = text;
        }, 1200);
        toast('Copied');
      },
      () => {
        button.textContent = 'copy failed';
        window.setTimeout(() => {
          button.textContent = text;
        }, 1600);
        toast('Copy failed', true);
      },
    );
  });
  return button;
}

export function maskValue(value: string): string {
  return '•'.repeat(Math.min(Math.max(value.length, 8), 64));
}

export interface BlockOptions {
  /** Secret material: rendered in the private (red) colour. */
  secret?: boolean;
  /** Hide the value behind this field's own reveal button. Implies `secret`. */
  masked?: boolean;
  /** Right-aligned metadata in the header, e.g. a length or a chain note. */
  note?: string;
}

/** A titled, monospaced value block with copy (and, when masked, reveal) actions. */
export function valueBlock(
  label: string,
  value: string,
  options: BlockOptions = {},
): HTMLElement {
  const masked = options.masked === true;
  const secret = options.secret === true || masked;
  const hidden = maskValue(value);

  const pre = el('pre', { class: masked ? 'masked' : undefined }, [masked ? hidden : value]);

  const actions = el('span', { class: 'actions' });
  if (masked) {
    let shown = false;
    const reveal = el('button', {
      type: 'button',
      class: 'btn ghost small',
      title: `Reveal ${label}`,
      'aria-pressed': 'false',
    }, ['reveal']);
    reveal.addEventListener('click', () => {
      shown = !shown;
      pre.textContent = shown ? value : hidden;
      pre.classList.toggle('masked', !shown);
      reveal.textContent = shown ? 'hide' : 'reveal';
      reveal.title = `${shown ? 'Hide' : 'Reveal'} ${label}`;
      reveal.setAttribute('aria-pressed', shown ? 'true' : 'false');
    });
    actions.append(reveal);
  }
  actions.append(copyAction(value, label));

  const meta: (Node | string)[] = [label];
  if (options.note !== undefined) meta.push(` · ${options.note}`);

  return el('div', { class: secret ? 'block secret' : 'block' }, [
    el('header', {}, [el('span', {}, meta), actions]),
    pre,
  ]);
}
