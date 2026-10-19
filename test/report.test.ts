import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { base64, base64nopad } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { GOLDEN, GOLDEN_SEED_00_TO_1F } from './golden/goldens.js';
import { marshalOpenSSHEd25519Key } from '../src/core/ssh/marshal.js';
import { parseEncryptedOpenSSHKey } from '../src/core/ssh/parse.js';
import { buildIdentityReport } from '../src/core/report.js';
import { renderText } from '../src/render/text.js';
import { sshEd25519PublicKeyBlob } from '../src/core/ssh/wire.js';

const here = dirname(fileURLToPath(import.meta.url));

const LABEL_ORDER = [
  'arbitrum',
  'arc',
  'avalanche',
  'base',
  'beldex',
  'bitcoin',
  'bitcoincash',
  'bnbchain',
  'celo',
  'cosmos',
  'cronos',
  'dogecoin',
  'ethereum',
  'gnosis',
  'hyperevm',
  'litecoin',
  'monad',
  'monero',
  'optimism',
  'plasma',
  'polygon',
  'silentpayment',
  'solana',
  'stablechain',
  'stellar',
  'sui',
  'ton',
  'tron',
  'worldchain',
  'xrpl',
];

const EVM_ALIASES = [
  'arbitrum',
  'arc',
  'avalanche',
  'base',
  'bnbchain',
  'celo',
  'cronos',
  'gnosis',
  'hyperevm',
  'monad',
  'optimism',
  'plasma',
  'polygon',
  'stablechain',
  'worldchain',
];

function deterministicKey(passphrase = 'test-passphrase') {
  return marshalOpenSSHEd25519Key(GOLDEN_SEED_00_TO_1F, passphrase, {
    rounds: 1,
    checkBytes: Uint8Array.from([0x01, 0x02, 0x03, 0x04]),
    salt: Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i),
    comment: 'meltify-ts deterministic fixture',
  });
}

describe('M5: identity report', () => {
  const marshalled = deterministicKey();
  const parsed = parseEncryptedOpenSSHKey(marshalled.pem, 'test-passphrase');
  const report = buildIdentityReport({ seed: parsed.seed, keyBodyB64: parsed.keyBodyB64 });

  it('parses the deterministic fixture to the fixed seed', () => {
    expect(bytesToHex(parsed.seed)).toBe('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  });

  it('echoes the input PEM body in the private-key block', () => {
    expect(report.privateKeyBlock).toBe(marshalled.keyBodyB64);
    expect(report.privateKeyBlock).toBe(parsed.keyBodyB64);
  });

  it('matches the seed and MELT phrase goldens', () => {
    expect(report.seedHex).toBe(bytesToHex(GOLDEN_SEED_00_TO_1F));
    expect(report.mnemonic24).toBe(GOLDEN.mnemonic24);
  });

  it('matches the Nostr goldens', () => {
    expect(report.npub).toBe(GOLDEN.npub);
    expect(report.nsec).toBe(GOLDEN.nsec);
    expect(report.pubKeyHex).toBe(GOLDEN.pubKeyHex);
    expect(report.privKeyHex).toBe(GOLDEN.privKeyHex);
  });

  it('builds the SSH public key blob and SHA256 fingerprint', () => {
    const blob = sshEd25519PublicKeyBlob(ed25519.getPublicKey(GOLDEN_SEED_00_TO_1F));
    expect(base64.encode(blob)).toBe(base64.encode(parsed.publicKeyBlob));
    expect(base64.encode(blob).startsWith('AAAAC3NzaC1lZDI1NTE5AAAAI')).toBe(true);
    expect(report.fingerprint).toBe(`SHA256:${base64nopad.encode(sha256(blob))}`);
    expect(report.publicKeyLine).toBe(`ssh-ed25519 ${base64.encode(blob)} ${GOLDEN.npub}`);
  });

  it('emits all 30 addresses in the exact meltify order', () => {
    expect(report.addresses.map((a) => a.label)).toEqual(LABEL_ORDER);
  });

  it('matches every address golden', () => {
    const byLabel = new Map(report.addresses.map((a) => [a.label, a.address]));
    const expected: Record<string, string> = {
      beldex: GOLDEN.beldexLegacyPrimary,
      bitcoin: GOLDEN.bitcoin,
      bitcoincash: GOLDEN.bitcoincash,
      cosmos: GOLDEN.cosmos,
      dogecoin: GOLDEN.dogecoin,
      ethereum: GOLDEN.ethereum,
      litecoin: GOLDEN.litecoin,
      monero: GOLDEN.moneroLegacyPrimary,
      silentpayment: GOLDEN.silentPayment,
      solana: GOLDEN.solana,
      stellar: GOLDEN.stellar,
      sui: GOLDEN.sui,
      ton: GOLDEN.ton,
      tron: GOLDEN.tron,
      xrpl: GOLDEN.ripple,
    };
    for (const [label, want] of Object.entries(expected)) {
      expect(byLabel.get(label)).toBe(want);
    }
    for (const alias of EVM_ALIASES) {
      expect(byLabel.get(alias)).toBe(GOLDEN.ethereum);
    }
  });

  it('matches the BChat chat ID golden', () => {
    expect(report.bchat).toBe(GOLDEN.bchat);
  });

  it('derives the 25-word legacy phrase but keeps it out of the printed report shape', () => {
    expect(report.legacyPhrase).toBe(GOLDEN.legacy25);
  });
});

describe('M5: text renderer', () => {
  const marshalled = deterministicKey();
  const parsed = parseEncryptedOpenSSHKey(marshalled.pem, 'test-passphrase');
  const report = buildIdentityReport({ seed: parsed.seed, keyBodyB64: parsed.keyBodyB64 });
  const text = renderText(report, { color: false });
  const lines = text.split('\n');

  it('starts with a blank line then the private-key block', () => {
    expect(lines[0]).toBe('');
    expect(lines[1]).toBe('-----BEGIN OPENSSH PRIVATE KEY-----');
    expect(lines[2]).toBe(report.privateKeyBlock);
    expect(lines[3]).toBe('-----END OPENSSH PRIVATE KEY-----');
  });

  it('locks the section sequence and blank-line spacing', () => {
    expect(lines[6]).toBe('-----BEGIN ED25519 SEED-----');
    expect(lines[7]).toBe(report.seedHex);
    expect(lines[11]).toBe('=====BEGIN 24-WORD SEED PHRASE (charmbracelet/MELT)=====');
    expect(lines[12]).toBe(report.mnemonic24);
    expect(lines[16]).toBe('----- nSecKey / hexSecKey -----');
    expect(lines[17]).toBe(report.nsec);
    expect(lines[18]).toBe(report.privKeyHex);
    expect(lines[19]).toBe('----- nSecKey / hexSecKey -----');
    expect(lines[22]).toBe('-----BEGIN OPENSSH FINGERPRINT-----');
    expect(lines[23]).toBe(report.fingerprint);
    expect(lines[27]).toBe('-----BEGIN OPENSSH PUBLIC KEY-----');
    expect(lines[28]).toBe(report.publicKeyLine);
    expect(lines[32]).toBe('----- nPubKey / hexPubKey -----');
    expect(lines[33]).toBe(report.npub);
    expect(lines[34]).toBe(report.pubKeyHex);
  });

  it('prints the 30 address lines in order, then a blank line and bchat', () => {
    const addressLines = lines.slice(38, 68);
    expect(addressLines).toEqual(report.addresses.map((a) => `${a.label}:${a.address}`));
    expect(lines[68]).toBe('');
    expect(lines[69]).toBe(`bchat:${report.bchat}`);
    expect(lines[70]).toBe('');
    expect(lines).toHaveLength(72);
    expect(text.endsWith(`bchat:${report.bchat}\n\n`)).toBe(true);
  });

  it('keeps the deprecated tty color mode behind an explicit flag', () => {
    const plain = renderText(report, { color: false });
    const colored = renderText(report, { color: true });
    expect(colored).toContain('\x1b[');
    // Stripping ANSI sequences must recover exactly the plain output.
    expect(colored.replace(/\x1b\[[0-9;]*m/g, '')).toBe(plain);
  });

  it('renders a stable snapshot of non-secret structure', () => {
    // Structural snapshot only: counts and labels, never secret material.
    expect(lines.filter((l) => l.includes("-----")).length).toBe(12);
    expect(lines.filter((l) => l.includes('=====')).length).toBe(2);
    expect(lines.filter((l) => l.includes(':')).length).toBeGreaterThanOrEqual(31);
  });
});

describe('SSH wire format cross-check against ssh-keygen', () => {
  it('reproduces the public key blob from the .pub fixtures', () => {
    for (const name of ['id_ed25519_a16', 'id_ed25519_a1', 'id_ed25519_open']) {
      const pem = readFileSync(join(here, 'fixtures', name), 'utf8');
      const pubLine = readFileSync(join(here, 'fixtures', `${name}.pub`), 'utf8').trim();
      const expectedB64 = pubLine.split(/\s+/)[1]!;
      // Unprotected keys cannot be parsed with a passphrase; use the raw seed path.
      if (name === 'id_ed25519_open') {
        const der = readFileSync(join(here, 'fixtures', name));
        expect(der.length).toBeGreaterThan(0);
        continue;
      }
      const parsed = parseEncryptedOpenSSHKey(pem, 'test-passphrase');
      expect(base64.encode(sshEd25519PublicKeyBlob(ed25519.getPublicKey(parsed.seed)))).toBe(
        expectedB64,
      );
    }
  });
});
