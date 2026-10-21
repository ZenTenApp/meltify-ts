/**
 * Browser demo for meltify-ts.
 *
 * Bundled by `examples/browser-demo/dev.mjs` with esbuild (`--platform=browser`)
 * and served over http://localhost:5173, which is a secure context, so
 * `crypto.getRandomValues` is available for the throwaway-key path.
 */

import {
  MeltifyError,
  buildIdentityReport,
  isUnprotectedKey,
  marshalOpenSSHEd25519Key,
  parseEncryptedOpenSSHKey,
  renderText,
  type IdentityReport,
} from '../../src/index.ts';

/* ------------------------------------------------------------------ *
 * Values pinned by the Go suite (internal/derive/golden.go)
 * ------------------------------------------------------------------ */

const GOLDEN_SEED_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const GOLDEN_MNEMONIC =
  'abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live bid rhythm alien crouch range attend journey unaware';
const GOLDEN_BCHAT = 'bdcdd6e612dc6ac3edbc24da774bc6cfabc6c26ae7a4762b7612750329a7df1d35';
const GOLDEN_BITCOIN = 'bc1qslk39wvggqa0vl8nd6jckaz54dw3vk45c5w60m';
const GOLDEN_ETHEREUM = '0xF9297b542BDb5DA50C364f9AE4Cbe1F3933bA40F';
const GOLDEN_SOLANA = '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w';
const DEMO_PASSPHRASE = 'test-passphrase';

/* ------------------------------------------------------------------ *
 * Tiny DOM helpers
 * ------------------------------------------------------------------ */

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`demo markup is missing #${id}`);
  return node as T;
}

const ui = {
  keyfile: must<HTMLInputElement>('keyfile'),
  keytext: must<HTMLTextAreaElement>('keytext'),
  passphrase: must<HTMLInputElement>('passphrase'),
  derive: must<HTMLButtonElement>('derive'),
  demo: must<HTMLButtonElement>('demo'),
  pinGolden: must<HTMLInputElement>('pin-golden'),
  error: must<HTMLDivElement>('error'),
  result: must<HTMLElement>('result'),
  addressesCard: must<HTMLElement>('result-addresses'),
  reveal: must<HTMLInputElement>('reveal'),
  blocks: must<HTMLDivElement>('blocks'),
  meta: must<HTMLDivElement>('meta'),
  addresses: must<HTMLTableSectionElement>('addresses'),
  addressMeta: must<HTMLDivElement>('address-meta'),
  selfcheck: must<HTMLDivElement>('selfcheck'),
};

let current: IdentityReport | null = null;

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function mask(value: string, visible: boolean): string {
  if (visible) return value;
  return '•'.repeat(Math.min(value.length, 64));
}

function copyButton(value: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy';
  button.textContent = 'copy';
  button.title = `Copy ${label}`;
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(value).then(
      () => {
        button.textContent = 'copied';
        setTimeout(() => {
          button.textContent = 'copy';
        }, 1200);
      },
      () => {
        button.textContent = 'failed';
      },
    );
  });
  return button;
}

function block(label: string, value: string, sensitive: boolean, revealed: boolean): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = sensitive ? 'block secret' : 'block';

  const header = document.createElement('header');
  const title = document.createElement('span');
  title.textContent = label;
  header.append(title, copyButton(value, label));

  const pre = document.createElement('pre');
  const shown = sensitive ? mask(value, revealed) : value;
  pre.textContent = shown;

  wrapper.append(header, pre);
  return wrapper;
}

function renderReport(): void {
  const report = current;
  if (report === null) return;
  const revealed = ui.reveal.checked;

  ui.blocks.replaceChildren(
    block('Private key', report.privateKeyBlock, true, revealed),
    block('Seed (hex)', report.seedHex, true, revealed),
    block('MELT phrase (24 words)', report.mnemonic24, true, revealed),
    block('Nostr private (nsec)', report.nsec, true, revealed),
    block('Private key (hex)', report.privKeyHex, true, revealed),
    block('Fingerprint', report.fingerprint, false, revealed),
    block('Public key', report.publicKeyLine, false, revealed),
    block('Nostr public (npub)', report.npub, false, revealed),
  );

  ui.addresses.replaceChildren();
  for (const { label, address } of report.addresses) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = label;
    const value = document.createElement('td');
    value.className = 'addr';
    value.textContent = address;
    const actions = document.createElement('td');
    actions.append(copyButton(address, label));
    row.append(name, value, actions);
    ui.addresses.append(row);
  }

  const lines = renderText(report).split('\n').length;
  ui.meta.replaceChildren(
    pill(`${report.addresses.length} addresses`),
    pill(`bchat ${report.bchat}`),
    pill(`renderText → ${lines} lines`),
    pill('bcrypt + AES-256-CTR in-tab'),
  );
  ui.addressMeta.replaceChildren(
    pill(`first: ${report.addresses[0]?.label ?? '?'}`),
    pill(`last: ${report.addresses[report.addresses.length - 1]?.label ?? '?'}`),
  );

  ui.result.classList.add('show');
  ui.addressesCard.style.display = '';
}

function pill(text: string): HTMLElement {
  const node = document.createElement('span');
  node.className = 'pill';
  node.textContent = text;
  return node;
}

function showError(message: string): void {
  ui.error.textContent = message;
  ui.error.classList.add('show');
}

function clearError(): void {
  ui.error.textContent = '';
  ui.error.classList.remove('show');
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function describeError(error: unknown): string {
  if (error instanceof MeltifyError) {
    return `${error.code}\n${error.message}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function deriveFromKeyText(): Promise<void> {
  clearError();
  const pem = ui.keytext.value.trim();
  const passphrase = ui.passphrase.value;

  if (pem.length === 0) {
    showError('Paste a private key or choose a file first — or click “Try a throwaway key”.');
    return;
  }
  if (isUnprotectedKey(pem)) {
    showError('This key has no passphrase, and meltify requires password-protected keys.');
    return;
  }

  ui.derive.disabled = true;
  try {
    // Yield once so the button repaints as disabled before the KDF runs.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const parsed = parseEncryptedOpenSSHKey(pem, passphrase);
    current = buildIdentityReport({ seed: parsed.seed, keyBodyB64: parsed.keyBodyB64 });
    renderReport();
  } catch (error) {
    current = null;
    ui.result.classList.remove('show');
    ui.addressesCard.style.display = 'none';
    showError(describeError(error));
  } finally {
    ui.derive.disabled = false;
  }
}

function demoSeed(): Uint8Array {
  if (ui.pinGolden.checked) {
    return Uint8Array.from(GOLDEN_SEED_HEX.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  }
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

async function deriveFromThrowawayKey(): Promise<void> {
  clearError();
  ui.demo.disabled = true;
  try {
    const seed = demoSeed();
    const key = marshalOpenSSHEd25519Key(seed, DEMO_PASSPHRASE, { rounds: 1 });
    ui.keytext.value = key.pem;
    ui.passphrase.value = DEMO_PASSPHRASE;
    await deriveFromKeyText();
  } catch (error) {
    showError(describeError(error));
  } finally {
    ui.demo.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 * Self-check
 * ------------------------------------------------------------------ */

function check(
  rows: HTMLElement[],
  name: string,
  actual: unknown,
  expected: unknown,
): void {
  const pass = actual === expected;
  const row = document.createElement('div');
  row.className = pass ? 'ok' : 'bad';
  row.textContent = pass
    ? `PASS  ${name}`
    : `FAIL  ${name}\n        expected: ${String(expected)}\n        actual:   ${String(actual)}`;
  rows.push(row);
}

function runSelfCheck(): void {
  const rows: HTMLElement[] = [];
  try {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
    const key = marshalOpenSSHEd25519Key(seed, DEMO_PASSPHRASE, {
      rounds: 1,
      checkBytes: Uint8Array.from([1, 2, 3, 4]),
      salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    });
    const parsed = parseEncryptedOpenSSHKey(key.pem, DEMO_PASSPHRASE);
    const report = buildIdentityReport({ seed: parsed.seed, keyBodyB64: parsed.keyBodyB64 });

    check(rows, 'decrypted seed round-trips', report.seedHex, GOLDEN_SEED_HEX);
    check(rows, '24-word MELT phrase', report.mnemonic24, GOLDEN_MNEMONIC);
    check(rows, 'fingerprint format', /^SHA256:[A-Za-z0-9+/]{43}$/.test(report.fingerprint), true);
    check(rows, 'address count', report.addresses.length, 30);
    const byLabel = (label: string): string | undefined =>
      report.addresses.find((entry) => entry.label === label)?.address;
    check(rows, 'bitcoin', byLabel('bitcoin'), GOLDEN_BITCOIN);
    check(rows, 'ethereum', byLabel('ethereum'), GOLDEN_ETHEREUM);
    check(rows, 'solana', byLabel('solana'), GOLDEN_SOLANA);
    check(rows, 'beldex != monero', byLabel('beldex') !== byLabel('monero'), true);
    check(rows, 'bchat', report.bchat, GOLDEN_BCHAT);
    check(rows, 'renderText line count', renderText(report).split('\n').length, 72);
    check(rows, 'no Buffer global', typeof (globalThis as { Buffer?: unknown }).Buffer, 'undefined');
  } catch (error) {
    const row = document.createElement('div');
    row.className = 'bad';
    row.textContent = `ERROR  ${describeError(error)}`;
    rows.push(row);
  }
  ui.selfcheck.replaceChildren(...rows);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

ui.keyfile.addEventListener('change', () => {
  const file = ui.keyfile.files?.[0];
  if (file === undefined) return;
  void file.text().then((text) => {
    ui.keytext.value = text.trim();
    clearError();
  });
});

ui.derive.addEventListener('click', () => {
  void deriveFromKeyText();
});

ui.demo.addEventListener('click', () => {
  void deriveFromThrowawayKey();
});

ui.reveal.addEventListener('change', renderReport);

runSelfCheck();
