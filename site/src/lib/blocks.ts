/** Shared value display: masked secret blocks, copy actions, download buttons. */

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
  secret?: boolean;
  revealed?: boolean;
  /** Right-aligned metadata in the header, e.g. a length or a chain note. */
  note?: string;
}

/** A titled, monospaced value block with a copy button. */
export function valueBlock(
  label: string,
  value: string,
  options: BlockOptions = {},
): HTMLElement {
  const secret = options.secret === true;
  const revealed = options.revealed === true;
  const shown = secret && !revealed ? maskValue(value) : value;

  const meta: (Node | string)[] = [label];
  if (options.note !== undefined) meta.push(` · ${options.note}`);

  return el('div', { class: secret ? 'block secret' : 'block' }, [
    el('header', {}, [
      el('span', {}, meta),
      el('span', { class: 'actions' }, [copyAction(value, label)]),
    ]),
    el('pre', {}, [shown]),
  ]);
}
