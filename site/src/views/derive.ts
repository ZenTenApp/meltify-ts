/**
 * Derive view: turn a password-protected Ed25519 OpenSSH key into an identity
 * report, or mint a throwaway key in-tab.
 */

import { MeltifyError, isUnprotectedKey } from 'meltify-ts';
import { copyText } from '../lib/clipboard.ts';
import { el, hint, message, toast } from '../lib/dom.ts';
import { toHex } from '../lib/hex.ts';
import { setIdentity, clearIdentity } from '../lib/store.ts';
import { deriveFromKey, deriveThrowaway, WorkerCallError } from '../lib/worker-client.ts';
import type { Ctx } from '../app-types.ts';

/** Pinned by the Go suite; "pin golden seed" makes the throwaway run reproducible. */
const GOLDEN_SEED_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const THROWAWAY_PASSPHRASE = 'test-passphrase';

const ERROR_HELP: Record<string, string> = {
  'key-not-password-protected': 'This key has no passphrase. meltify only accepts protected keys.',
  'passphrase-required': 'The passphrase is empty. Enter the key’s passphrase.',
  'unsupported-key-type': 'Only Ed25519 keys are supported (this looks like RSA or another type).',
  'key-parse': 'Wrong passphrase, or the file is not an OpenSSH-format private key.',
  'invalid-mnemonic': 'The phrase is not a valid BIP39 mnemonic.',
  'marshal-randomness': 'The browser could not supply random bytes.',
};

export function mountDerive(ctx: Ctx): HTMLElement {
  const fileInput = el('input', { type: 'file', accept: '.pem,.key,.txt,text/plain', hidden: true });
  const dropTarget = el('div', { class: 'drop', tabindex: '0', role: 'button' }, [
    el('strong', {}, ['Choose a key file']),
    el('div', {}, ['or drop id_ed25519 here — it is read locally and never uploaded']),
  ]);
  const keyText = el('textarea', {
    spellcheck: 'false',
    placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
  });
  const passphrase = el('input', {
    type: 'password',
    autocomplete: 'off',
    placeholder: 'key passphrase',
    id: 'passphrase',
  });
  const revealPass = el('button', { type: 'button', class: 'btn ghost small' }, ['show']);
  const deriveButton = el('button', { type: 'button', class: 'btn primary' }, ['Derive identity']);
  const throwawayButton = el('button', { type: 'button', class: 'btn' }, ['Try a throwaway key']);
  const pinGolden = el('input', { type: 'checkbox', checked: true });
  const notice = el('div');
  const sourceLabel = el('span', { class: 'hint' });

  const status = (text: string): void => {
    notice.replaceChildren(message(text, 'warn'));
  };
  const clearNotice = (): void => {
    notice.replaceChildren();
  };

  const showFailure = (error: unknown): void => {
    let text: string;
    if (error instanceof MeltifyError || error instanceof WorkerCallError) {
      const code = error.code ?? 'error';
      const help = ERROR_HELP[code];
      text = help === undefined ? `${code}\n${error.message}` : `${code} — ${help}\n${error.message}`;
    } else {
      text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    notice.replaceChildren(message(text, 'err'));
  };

  const applyKeyText = (text: string): void => {
    keyText.value = text.trim();
    clearNotice();
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => {
      applyKeyText(text);
      sourceLabel.textContent = file.name;
      if (isUnprotectedKey(text)) status('This file has no passphrase — meltify will reject it.');
    });
  });

  dropTarget.addEventListener('click', () => fileInput.click());
  dropTarget.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropTarget.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropTarget.classList.add('hot');
  });
  dropTarget.addEventListener('dragleave', () => dropTarget.classList.remove('hot'));
  dropTarget.addEventListener('drop', (event) => {
    event.preventDefault();
    dropTarget.classList.remove('hot');
    const file = event.dataTransfer?.files[0];
    if (file === undefined) return;
    void file.text().then((text) => {
      applyKeyText(text);
      sourceLabel.textContent = file.name;
    });
  });

  revealPass.addEventListener('click', () => {
    const showing = passphrase.type === 'text';
    passphrase.type = showing ? 'password' : 'text';
    revealPass.textContent = showing ? 'show' : 'hide';
  });

  async function derive(): Promise<void> {
    clearNotice();
    const pem = keyText.value.trim();
    if (pem.length === 0) {
      status('Paste a key, drop a file, or use “Try a throwaway key”.');
      return;
    }
    if (isUnprotectedKey(pem)) {
      showFailure(
        new MeltifyError(
          'key-not-password-protected',
          'the key is not encrypted with a passphrase',
        ),
      );
      return;
    }

    deriveButton.disabled = true;
    deriveButton.textContent = 'Deriving…';
    try {
      const result = await deriveFromKey(pem, passphrase.value);
      setIdentity({
        report: result.report,
        seedHex: result.seedHex,
        elapsedMs: result.elapsedMs,
        source: sourceLabel.textContent === '' ? 'pasted key' : sourceLabel.textContent,
        derivedAt: Date.now(),
      });
      toast('Identity derived');
      ctx.go('report');
    } catch (error) {
      clearIdentity();
      showFailure(error);
    } finally {
      deriveButton.disabled = false;
      deriveButton.textContent = 'Derive identity';
    }
  }

  async function throwaway(): Promise<void> {
    clearNotice();
    throwawayButton.disabled = true;
    throwawayButton.textContent = 'Building key…';
    try {
      let seedHex = GOLDEN_SEED_HEX;
      if (!pinGolden.checked) {
        const seed = new Uint8Array(32);
        crypto.getRandomValues(seed);
        seedHex = toHex(seed);
      }
      const result = await deriveThrowaway(seedHex, THROWAWAY_PASSPHRASE);
      keyText.value = result.pem;
      passphrase.value = THROWAWAY_PASSPHRASE;
      sourceLabel.textContent = pinGolden.checked ? 'throwaway key (seed 00..1f)' : 'throwaway key (random)';
      setIdentity({
        report: result.report,
        seedHex: result.seedHex,
        elapsedMs: result.elapsedMs,
        source: sourceLabel.textContent,
        derivedAt: Date.now(),
      });
      toast('Throwaway key derived');
      ctx.go('report');
    } catch (error) {
      showFailure(error);
    } finally {
      throwawayButton.disabled = false;
      throwawayButton.textContent = 'Try a throwaway key';
    }
  }

  deriveButton.addEventListener('click', () => {
    void derive();
  });
  throwawayButton.addEventListener('click', () => {
    void throwaway();
  });
  passphrase.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void derive();
    }
  });

  // "Open in Derive" from Key tools, and the global wipe button.
  window.addEventListener('meltify:load-key', (event) => {
    const detail = (event as CustomEvent<{ pem: string; passphrase: string }>).detail;
    keyText.value = detail.pem;
    passphrase.value = detail.passphrase;
    sourceLabel.textContent = 'newly generated key';
    clearNotice();
  });
  window.addEventListener('meltify:wipe', () => {
    keyText.value = '';
    passphrase.value = '';
    sourceLabel.textContent = '';
    clearNotice();
  });

  const header = el('div', { class: 'row', style: 'justify-content: space-between' }, [
    el('h2', { style: 'margin: 0' }, ['Derive']),
    sourceLabel,
  ]);

  const root = el('div', { class: 'view' }, [
    el('section', { class: 'card' }, [
      header,
      hint('Password-protected Ed25519 OpenSSH key (id_ed25519). The passphrase is used once, in a worker, and is never stored.'),
      el('div', { style: 'margin-top: 14px' }, [dropTarget, fileInput]),
      el('label', { class: 'field', style: 'margin-top: 14px' }, [
        el('span', { class: 'label' }, ['or paste the armored key']),
        keyText,
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'label' }, ['passphrase']),
        el('div', { class: 'row tight' }, [passphrase, revealPass]),
      ]),
      el('div', { class: 'row' }, [
        deriveButton,
        throwawayButton,
        el('label', { class: 'switch' }, [pinGolden, el('span', {}, ['pin seed 00..1f'])]),
      ]),
      notice,
    ]),
    el('section', { class: 'card tight' }, [
      el('h2', {}, ['What this does']),
      hint(
        'bcrypt_pbkdf + AES-256-CTR unlock the key, then one pass derives the MELT phrase, Nostr keys, the SSH fingerprint, 30 chain addresses, and the BChat id. All of it runs on this device.',
      ),
      el('div', { class: 'row', style: 'margin-top: 12px' }, [
        el('button', {
          type: 'button',
          class: 'btn ghost small',
          onclick: () => {
            void copyText('NO_COLOR=1 meltify-info --key /path/to/id_ed25519').then(
              () => toast('Copied'),
              () => toast('Copy failed', true),
            );
          },
        }, ['copy the meltify-info equivalent']),
        el('a', { class: 'btn ghost small', href: '#/phrases' }, ['phrase lab']),
        el('a', { class: 'btn ghost small', href: '#/keys' }, ['key tools']),
      ]),
    ]),
  ]);

  return root;
}
