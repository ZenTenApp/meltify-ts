/**
 * Draft body for a wallet or a card: its private name and its public name, side
 * by side.
 *
 * Both rows are the same shape — the private name is the derivation input, the
 * public name is display only — but the byte rules differ:
 *
 *   wallet private name  the subaccount string, hashed verbatim. Never trimmed,
 *                        never normalised, because meltify-info hashes exactly
 *                        these bytes.
 *   card private name    the BIP39 passphrase. @scure/bip39 applies NFKD itself,
 *                        the same as the spec and every wallet; we add nothing.
 *
 * The form is kept mounted per draft, so tab switching does not lose typing.
 */

import { el, hint, message } from '../lib/dom.ts';

export interface NodeFormOptions {
  kind: 'wallet' | 'card';
  /** What this tab belongs to, for the headings ("this key", 'wallet “work”'). */
  parent: string;
  initialLabel: string;
  initialSecret?: string;
  /** Returns an error message, or null when the commit succeeded. */
  onSubmit(secret: string, label: string): string | null;
  onCancel(): void;
}

function looksUnusual(secret: string): string | null {
  if (secret === '') return null;
  if (/^\s|\s$/.test(secret)) {
    return 'Leading or trailing whitespace — those bytes are hashed too, so this is a different wallet from the trimmed name.';
  }
  if (/[^\x20-\x7e]/.test(secret)) {
    return 'Non-ASCII characters — hashed byte-for-byte. A composed and a decomposed accent give different wallets.';
  }
  return null;
}

export function mountNodeForm(options: NodeFormOptions): HTMLElement {
  const wallet = options.kind === 'wallet';
  const secret = el('input', {
    type: wallet ? 'text' : 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    value: options.initialSecret ?? '',
    placeholder: wallet
      ? 'private name — hashed byte-for-byte'
      : 'BIP39 passphrase (25th word), or empty',
  });
  const label = el('input', {
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    value: options.initialLabel,
    placeholder: wallet
      ? 'public name — defaults to the last 4 of the npub'
      : 'card name — defaults to the last 4 of the npub',
  });
  const reveal = el('button', { type: 'button', class: 'btn ghost small' }, ['show']);
  const create = el('button', { type: 'button', class: 'btn primary' }, [
    wallet ? 'Create wallet' : 'Create card',
  ]);
  const cancel = el('button', { type: 'button', class: 'btn ghost' }, ['Cancel']);
  const notice = el('div');
  const warn = el('div');

  const byteRule = (): HTMLElement => {
    if (wallet) {
      return hint(
        'The private name is the subaccount string: seed = SHA256(SHA256(utf8(private name)) ‖ key seed). It is hashed exactly as typed, so `work `, `work`, and `wörk` are three different wallets. The public name is display only, defaults to the last four characters of the wallet’s npub, and can be changed later.',
      );
    }
    return hint(
      'The card secret is the BIP39 passphrase, masked here and never trimmed. Leave it empty for the standard derivation — that is a real card, just the one every BIP39 wallet matches. The name is display only, defaults to the last four characters of the card’s npub, and can be changed later.',
    );
  };

  const refreshWarn = (): void => {
    if (!wallet) {
      warn.replaceChildren();
      return;
    }
    const text = looksUnusual(secret.value);
    warn.replaceChildren(...(text === null ? [] : [message(text, 'warn')]));
  };

  const toggleReveal = (): void => {
    secret.type = secret.type === 'password' ? 'text' : 'password';
    reveal.textContent = secret.type === 'text' ? 'hide' : 'show';
  };
  if (!wallet) reveal.addEventListener('click', toggleReveal);
  secret.addEventListener('input', refreshWarn);

  const submit = (): void => {
    notice.replaceChildren();
    const error = options.onSubmit(secret.value, label.value.trim());
    if (error !== null) notice.replaceChildren(message(error, 'err'));
  };

  create.addEventListener('click', submit);
  cancel.addEventListener('click', () => options.onCancel());
  for (const field of [secret, label]) {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        options.onCancel();
      }
    });
  }

  const root = el('section', { class: 'card draftcard' }, [
    el('div', { class: 'row', style: 'justify-content: space-between' }, [
      el('h2', { style: 'margin: 0' }, [
        wallet ? `New wallet in ${options.parent}` : `New card in ${options.parent}`,
      ]),
      el('span', { class: 'pill' }, ['unsaved tab']),
    ]),
    byteRule(),
    el('div', { class: 'split', style: 'margin-top: 14px' }, [
      el('label', { class: 'field' }, [
        el(
          'span',
          { class: 'label' },
          [wallet ? 'private name (required)' : 'secret (optional)'],
        ),
        el('div', { class: 'row tight' }, [secret, ...(wallet ? [] : [reveal])]),
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'label' }, [wallet ? 'public name' : 'name']),
        label,
      ]),
    ]),
    warn,
    el('div', { class: 'row' }, [create, cancel]),
    notice,
  ]);

  refreshWarn();
  queueMicrotask(() => secret.focus());
  return root;
}
