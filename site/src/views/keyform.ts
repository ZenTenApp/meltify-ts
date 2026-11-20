/**
 * Key tab body for an uncommitted key draft: load a password-protected Ed25519
 * OpenSSH key, unlock it in the worker, and commit the tab.
 *
 * The passphrase is only offered once the armored key itself has been checked —
 * container parses, private section is encrypted, cipher/KDF are the supported
 * ones, and the embedded public key is Ed25519. That check needs no passphrase
 * and no worker. The field is disabled rather than hidden, so accepting a key
 * toggles it in place without moving anything.
 *
 * The form is built once per key tab and kept mounted, so switching tabs never
 * loses a pasted key. Inputs are read only on submit; the committed key and its
 * unlocked source identity live in the store.
 */

import { MeltifyError, inspectOpenSSHKey } from 'meltify-ts';
import { el, hint, message, toast } from '../lib/dom.ts';
import { commitKey, type Identity, type KeyTab } from '../lib/store.ts';
import { deriveFromKey, WorkerCallError } from '../lib/worker-client.ts';

const ERROR_HELP: Record<string, string> = {
  'key-not-password-protected': 'This key has no passphrase. meltify only accepts protected keys.',
  'passphrase-required': 'The passphrase is empty. Enter the key’s passphrase.',
  'unsupported-key-type': 'Only Ed25519 keys are supported (this looks like RSA or another type).',
  'key-parse': 'Wrong passphrase, or the file is not an OpenSSH-format private key.',
  'invalid-mnemonic': 'The phrase is not a valid BIP39 mnemonic.',
  'marshal-randomness': 'The browser could not supply random bytes.',
};

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

type KeyState = 'empty' | 'valid' | 'invalid';

interface Inspection {
  state: KeyState;
  message: string;
}

/** Why the armored key cannot be used, or the fact that it can. */
function inspectArmoredKey(pem: string): Inspection {
  const text = pem.trim();
  if (text === '') return { state: 'empty', message: '' };
  let info;
  try {
    info = inspectOpenSSHKey(text);
  } catch {
    return {
      state: 'invalid',
      message: 'Not an OpenSSH private key. Paste the armored key or drop id_ed25519.',
    };
  }
  if (!info.protected) {
    return {
      state: 'invalid',
      message: 'This key has no passphrase. meltify only accepts protected keys.',
    };
  }
  if (info.cipher !== 'aes256-ctr' || info.kdf !== 'bcrypt') {
    return {
      state: 'invalid',
      message: `Unsupported key encryption (${info.cipher}/${info.kdf}).`,
    };
  }
  if (info.keyType !== 'ssh-ed25519') {
    return {
      state: 'invalid',
      message:
        info.keyType === 'ssh-rsa'
          ? 'RSA keys are not supported. meltify only accepts Ed25519 keys.'
          : `Only Ed25519 keys are supported (got ${info.keyType}).`,
    };
  }
  return { state: 'valid', message: 'Protected Ed25519 key accepted. Enter its passphrase.' };
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
    disabled: true,
  });
  const sourceLabel = el('span', { class: 'hint' }, [key.source]);
  const revealPass = el('button', { type: 'button', class: 'btn ghost small', disabled: true }, [
    'show',
  ]);
  const addButton = el('button', { type: 'button', class: 'btn primary', disabled: true }, [
    'Add key',
  ]);
  const notice = el('div', { class: 'keynotice' });

  let keyState: KeyState = 'empty';

  const refresh = (): void => {
    const usable = keyState === 'valid';
    passphrase.disabled = !usable;
    revealPass.disabled = !usable;
    addButton.disabled = !usable || passphrase.value === '';
  };

  const setVisible = (visible: boolean): void => {
    passphrase.type = visible ? 'text' : 'password';
    revealPass.textContent = visible ? 'hide' : 'show';
  };

  const validate = (): void => {
    const result = inspectArmoredKey(keyText.value);
    keyState = result.state;
    if (result.state === 'empty') {
      notice.replaceChildren();
    } else if (result.state === 'valid') {
      notice.replaceChildren(message(result.message, 'ok'));
    } else {
      notice.replaceChildren(message(result.message, 'err'));
    }
    refresh();
  };

  const applyKeyText = (text: string): void => {
    keyText.value = text.trim();
    setVisible(false);
    validate();
  };

  keyText.addEventListener('input', validate);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => {
      applyKeyText(text);
      sourceLabel.textContent = file.name;
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
  revealPass.addEventListener('click', () => setVisible(passphrase.type === 'password'));
  passphrase.addEventListener('input', refresh);

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
      notice.replaceChildren(message('Paste a key or drop a key file.', 'warn'));
      return;
    }
    if (passphrase.value === '') {
      notice.replaceChildren(message('The passphrase is empty. Enter the key’s passphrase.', 'warn'));
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
        comment: result.comment,
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
      addButton.textContent = 'Add key';
      refresh();
    }
  }

  addButton.addEventListener('click', () => {
    void add();
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

  validate();

  return el('section', { class: 'card' }, [
    header,
    hint(
      'Password-protected Ed25519 OpenSSH key (id_ed25519). The passphrase is used once, in a worker, and is never stored outside this page’s memory. The key’s own comment, if it has one, becomes the tab title.',
    ),
    el('div', { style: 'margin-top: 14px' }, [dropTarget, fileInput]),
    el('label', { class: 'field', style: 'margin-top: 14px' }, [
      el('span', { class: 'label' }, ['or paste the armored key']),
      keyText,
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'label' }, ['passphrase']),
      el('div', { class: 'row tight' }, [passphrase, revealPass]),
    ]),
    notice,
    el('div', { class: 'row' }, [addButton]),
  ]);
}
