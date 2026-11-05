/**
 * Key tools: mint a password-protected OpenSSH Ed25519 key from a seed, the
 * marshal path meltify uses for subaccounts. The generated key is downloadable
 * and can be pushed straight into the Derive form.
 */

import { valueBlock } from '../lib/blocks.ts';
import { downloadText } from '../lib/download.ts';
import { el, hint, message, toast } from '../lib/dom.ts';
import { parseHex, toHex } from '../lib/hex.ts';
import { marshalKey } from '../lib/worker-client.ts';
import type { Ctx } from '../app-types.ts';

export function mountKeys(ctx: Ctx): HTMLElement {
  const seed = el('input', {
    type: 'text',
    placeholder: '32-byte seed hex (leave empty for a fresh random seed)',
    autocomplete: 'off',
  });
  const passphrase = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'new passphrase' });
  const confirm = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'repeat passphrase' });
  const rounds = el('select', {}, [
    el('option', { value: '16', selected: true }, ['bcrypt rounds 16 (OpenSSH default)']),
    el('option', { value: '1' }, ['bcrypt rounds 1 (fast, throwaway only)']),
  ]);
  const generate = el('button', { type: 'button', class: 'btn primary' }, ['Generate key']);
  const output = el('div');

  const run = async (): Promise<void> => {
    output.replaceChildren();
    const pass = passphrase.value;
    if (pass.length === 0) {
      output.replaceChildren(message('A passphrase is required; meltify rejects unprotected keys.', 'err'));
      return;
    }
    if (pass !== confirm.value) {
      output.replaceChildren(message('The two passphrases differ.', 'err'));
      return;
    }

    let seedHex = seed.value.trim();
    if (seedHex === '') {
      const fresh = new Uint8Array(32);
      crypto.getRandomValues(fresh);
      seedHex = toHex(fresh);
      seed.value = seedHex;
    } else {
      const parsed = parseHex(seedHex);
      if (parsed === null || parsed.length !== 32) {
        output.replaceChildren(message('Seed must be 64 hex characters (32 bytes), or empty for random.', 'err'));
        return;
      }
      seedHex = toHex(parsed);
    }

    generate.disabled = true;
    generate.textContent = 'Generating…';
    try {
      const result = await marshalKey(seedHex, pass, rounds.value === '1' ? 1 : 16);
      output.replaceChildren(
        el('div', { class: 'blocks', style: 'margin-top: 14px' }, [
          valueBlock('private key', result.pem, { note: `bcrypt rounds ${rounds.value}` }),
          valueBlock('key body', result.keyBodyB64, { note: 'base64 of openssh-key-v1' }),
        ]),
        el('div', { class: 'row', style: 'margin-top: 12px' }, [
          el('button', {
            type: 'button',
            class: 'btn',
            onclick: () => {
              downloadText('id_ed25519', result.pem, 'application/octet-stream');
              toast('Key downloaded');
            },
          }, ['Download id_ed25519']),
          el('button', {
            type: 'button',
            class: 'btn',
            onclick: () => {
              window.dispatchEvent(
                new CustomEvent('meltify:load-key', {
                  detail: { pem: result.pem, passphrase: pass },
                }),
              );
              toast('Loaded into Derive');
              ctx.go('derive');
            },
          }, ['Open in Derive']),
          el('span', { class: 'hint' }, [`marshalled in ${result.elapsedMs.toFixed(0)} ms`]),
        ]),
      );
    } catch (error) {
      output.replaceChildren(
        message(error instanceof Error ? `${error.name}: ${error.message}` : String(error), 'err'),
      );
    } finally {
      generate.disabled = false;
      generate.textContent = 'Generate key';
    }
  };

  generate.addEventListener('click', () => {
    void run();
  });

  const randomButton = el('button', {
    type: 'button',
    class: 'btn ghost small',
    onclick: () => {
      const fresh = new Uint8Array(32);
      crypto.getRandomValues(fresh);
      seed.value = toHex(fresh);
      output.replaceChildren();
    },
  }, ['random seed']);

  return el('div', { class: 'view' }, [
    el('section', { class: 'card' }, [
      el('h2', {}, ['Create a password-protected key']),
      hint(
        'This is the same marshaller meltify uses for subaccounts: aes256-ctr + bcrypt over an openssh-key-v1 container.',
      ),
      el('label', { class: 'field', style: 'margin-top: 14px' }, [
        el('span', { class: 'label' }, ['seed']),
        el('div', { class: 'row tight' }, [seed, randomButton]),
      ]),
      el('div', { class: 'split' }, [
        el('label', { class: 'field' }, [
          el('span', { class: 'label' }, ['passphrase']),
          passphrase,
        ]),
        el('label', { class: 'field' }, [
          el('span', { class: 'label' }, ['confirm passphrase']),
          confirm,
        ]),
      ]),
      el('label', { class: 'field' }, [el('span', { class: 'label' }, ['kdf rounds']), rounds]),
      el('div', { class: 'row' }, [generate]),
      output,
    ]),
    el('section', { class: 'card tight' }, [
      el('h2', {}, ['Before you generate']),
      hint(
        'The seed and passphrase stay in this tab, and the downloaded key is the only artifact that survives. Anything derived here is a real key: write it somewhere safe, then wipe this page.',
      ),
      el('div', { class: 'row', style: 'margin-top: 12px' }, [
        el('a', { class: 'btn ghost small', href: '#/derive' }, ['derive, or derive a subaccount']),
      ]),
    ]),
  ]);
}
