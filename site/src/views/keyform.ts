/**
 * Key tab body for an uncommitted key draft: load a password-protected Ed25519
 * OpenSSH key, unlock it in the worker, and commit the tab.
 *
 * The form is built once per key tab and kept mounted, so switching tabs never
 * loses a pasted key. Inputs are read only on submit; the committed key and its
 * unlocked source identity live in the store.
 */

import { MeltifyError, isUnprotectedKey } from 'meltify-ts';
import { el, hint, message, toast } from '../lib/dom.ts';
import { toHex } from '../lib/hex.ts';
import { commitKey, type Identity, type KeyTab } from '../lib/store.ts';
import { THROWAWAY_PASSPHRASE } from '../lib/throwaway.ts';
import { deriveFromKey, deriveThrowaway, WorkerCallError } from '../lib/worker-client.ts';

/** Pinned by the Go suite; "pin golden seed" makes the throwaway run reproducible. */
const GOLDEN_SEED_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

const ERROR_HELP: Record<string, string> = {
  'key-not-password-protected': 'This key has no passphrase. meltify only accepts protected keys.',
  'passphrase-required': 'The passphrase is empty. Enter the key’s passphrase.',
  'unsupported-key-type': 'Only Ed25519 keys are supported (this looks like RSA or another type).',
  'key-parse': 'Wrong passphrase, or the file is not an OpenSSH-format private key.',
  'invalid-mnemonic': 'The phrase is not a valid BIP39 mnemonic.',
  'marshal-randomness': 'The browser could not supply random bytes.',
};

/**
 * A malformed PEM makes `isUnprotectedKey` throw. Let the worker produce the
 * real error instead of crashing the click handler.
 */
function looksUnprotected(pem: string): boolean {
  try {
    return isUnprotectedKey(pem);
  } catch {
    return false;
  }
}

interface DerivedResult {
  report: Identity['report'];
  seedHex: string;
  elapsedMs: number;
}

function failureText(error: unknown): string {
  if (error instanceof MeltifyError || error instanceof WorkerCallError) {
    const code = error.code ?? 'error';
    const help = ERROR_HELP[code];
    return help === undefined ? `${code}\n${error.message}` : `${code} — ${help}\n${error.message}`;
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function mountKeyForm(key: KeyTab, onCommitted: (id: string) => void): HTMLElement {
  const fileInput = el('input', { type: 'file', accept: '.pem,.key,.txt,text/plain', hidden: true });
  const dropTarget = el('div', { class: 'drop', tabindex: '0', role: 'button' }, [
    el('strong', {}, ['Choose a key file']),
    el('div', {}, ['or drop id_ed25519 here — it is read locally and never uploaded']),
  ]);
  const keyText = el('textarea', {
    spellcheck: 'false',
    placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
    value: key.pem,
  });
  const passphrase = el('input', {
    type: 'password',
    autocomplete: 'off',
    placeholder: 'key passphrase',
    value: key.passphrase,
  });
  const name = el('input', {
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'optional tab name — defaults to the file name',
  });
  const sourceLabel = el('span', { class: 'hint' }, [key.source]);
  const revealPass = el('button', { type: 'button', class: 'btn ghost small' }, ['show']);
  const note = el('p', { class: 'hint tight', hidden: true }, [
    `Throwaway key passphrase: ${THROWAWAY_PASSPHRASE} — fixed and public, shown so you can reproduce the run.`,
  ]);
  const addButton = el('button', { type: 'button', class: 'btn primary' }, ['Add SSH key']);
  const throwawayButton = el('button', { type: 'button', class: 'btn' }, ['Try a throwaway key']);
  const pinGolden = el('input', { type: 'checkbox', checked: true });
  const notice = el('div');

  const setVisible = (visible: boolean): void => {
    passphrase.type = visible ? 'text' : 'password';
    revealPass.textContent = visible ? 'hide' : 'show';
  };

  const applyKeyText = (text: string): void => {
    keyText.value = text.trim();
    note.hidden = true;
    setVisible(false);
    notice.replaceChildren();
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => {
      applyKeyText(text);
      sourceLabel.textContent = file.name;
      name.placeholder = file.name;
      if (looksUnprotected(text)) {
        notice.replaceChildren(message('This file has no passphrase — meltify will reject it.', 'warn'));
      }
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
      name.placeholder = file.name;
    });
  });
  revealPass.addEventListener('click', () => setVisible(passphrase.type === 'password'));

  const identityOf = (result: DerivedResult, source: string): Identity => ({
    report: result.report,
    seedHex: result.seedHex,
    elapsedMs: result.elapsedMs,
    source,
    subaccount: '',
    bip39Passphrase: '',
    derivedAt: Date.now(),
  });

  async function add(): Promise<void> {
    notice.replaceChildren();
    const pem = keyText.value.trim();
    if (pem.length === 0) {
      notice.replaceChildren(message('Paste a key, drop a file, or use “Try a throwaway key”.', 'warn'));
      return;
    }
    if (looksUnprotected(pem)) {
      notice.replaceChildren(
        message(
          'key-not-password-protected — this key has no passphrase. meltify only accepts protected keys.',
          'err',
        ),
      );
      return;
    }

    addButton.disabled = true;
    addButton.textContent = 'Unlocking…';
    try {
      const result = await deriveFromKey(pem, passphrase.value, '', '');
      const source = sourceLabel.textContent === '' ? 'pasted key' : sourceLabel.textContent;
      const identity = identityOf(result, source);
      const error = commitKey(key.id, {
        pem,
        passphrase: passphrase.value,
        source,
        label: name.value.trim(),
        identity,
      });
      if (error !== null) {
        notice.replaceChildren(message(error, 'err'));
        return;
      }
      toast('Key tab added');
      onCommitted(key.id);
    } catch (error) {
      notice.replaceChildren(message(failureText(error), 'err'));
    } finally {
      addButton.disabled = false;
      addButton.textContent = 'Add SSH key';
    }
  }

  async function throwaway(): Promise<void> {
    notice.replaceChildren();
    throwawayButton.disabled = true;
    throwawayButton.textContent = 'Building key…';
    try {
      let seedHex = GOLDEN_SEED_HEX;
      if (!pinGolden.checked) {
        const seed = new Uint8Array(32);
        crypto.getRandomValues(seed);
        seedHex = toHex(seed);
      }
      const result = await deriveThrowaway(seedHex, THROWAWAY_PASSPHRASE, '', '');
      keyText.value = result.pem;
      passphrase.value = THROWAWAY_PASSPHRASE;
      note.hidden = false;
      setVisible(true);
      const source = pinGolden.checked ? 'throwaway key (seed 00..1f)' : 'throwaway key (random)';
      sourceLabel.textContent = source;
      const error = commitKey(key.id, {
        pem: result.pem,
        passphrase: THROWAWAY_PASSPHRASE,
        source,
        label: name.value.trim(),
        identity: identityOf(result, source),
      });
      if (error !== null) {
        notice.replaceChildren(message(error, 'err'));
        return;
      }
      toast('Throwaway key added');
      onCommitted(key.id);
    } catch (error) {
      notice.replaceChildren(message(failureText(error), 'err'));
    } finally {
      throwawayButton.disabled = false;
      throwawayButton.textContent = 'Try a throwaway key';
    }
  }

  addButton.addEventListener('click', () => {
    void add();
  });
  throwawayButton.addEventListener('click', () => {
    void throwaway();
  });
  passphrase.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void add();
    }
  });

  const header = el('div', { class: 'row', style: 'justify-content: space-between' }, [
    el('h2', { style: 'margin: 0' }, ['Add an SSH key']),
    sourceLabel,
  ]);

  return el('section', { class: 'card' }, [
    header,
    hint(
      'Password-protected Ed25519 OpenSSH key (id_ed25519). The passphrase is used once, in a worker, and is never stored outside this page’s memory.',
    ),
    el('div', { style: 'margin-top: 14px' }, [dropTarget, fileInput]),
    el('label', { class: 'field', style: 'margin-top: 14px' }, [
      el('span', { class: 'label' }, ['or paste the armored key']),
      keyText,
    ]),
    el('div', { class: 'split' }, [
      el('label', { class: 'field' }, [
        el('span', { class: 'label' }, ['passphrase']),
        el('div', { class: 'row tight' }, [passphrase, revealPass]),
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'label' }, ['tab name (optional)']),
        name,
      ]),
    ]),
    note,
    el('div', { class: 'row' }, [
      addButton,
      throwawayButton,
      el('label', { class: 'switch' }, [pinGolden, el('span', {}, ['pin seed 00..1f'])]),
    ]),
    notice,
  ]);
}
