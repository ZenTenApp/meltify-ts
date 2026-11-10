/**
 * Derive worker.
 *
 * Everything that runs a KDF or a full derivation happens here so the main
 * thread stays responsive: bcrypt at rounds 16 on a phone is visible jank, and
 * a separate thread also keeps the seed out of the render path.
 */

import {
  MeltifyError,
  buildIdentityReport,
  buildSubaccountReport,
  decodeLegacyMnemonic,
  encodeLegacyMnemonic,
  marshalOpenSSHEd25519Key,
  parseEncryptedOpenSSHKey,
  renderText,
  scReduce32,
  type IdentityReport,
} from 'meltify-ts';
import { GOLDEN, GOLDEN_SEED_00_TO_1F, SUBACCOUNT_GOLDEN } from '../../../test/golden/goldens.ts';
import { parseHex, toHex } from '../lib/hex.ts';
import { THROWAWAY_BIP39_PASSPHRASE, THROWAWAY_PASSPHRASE } from '../lib/throwaway.ts';
import type {
  CheckRow,
  SerializedError,
  WorkerRequest,
  WorkerResponse,
  WorkerResult,
} from './protocol.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  try {
    const result = run(request);
    scope.postMessage({ id: request.id, ok: true, ...result });
  } catch (error) {
    scope.postMessage({ id: request.id, ok: false, error: serialize(error) });
  }
};

function run(request: WorkerRequest): WorkerResult {
  switch (request.op) {
    case 'derive': {
      const started = performance.now();
      const parsed = parseEncryptedOpenSSHKey(request.pem, request.passphrase);
      const label = request.subaccount ?? '';
      if (label === '') {
        const report = buildIdentityReport({
          seed: parsed.seed,
          keyBodyB64: parsed.keyBodyB64,
          bip39Passphrase: request.bip39Passphrase,
        });
        return {
          op: 'derive',
          report,
          seedHex: toHex(parsed.seed),
          subaccount: '',
          bip39Passphrase: request.bip39Passphrase,
          elapsedMs: performance.now() - started,
        };
      }
      // Subaccount: same derivation and re-encryption (rounds = 1, source
      // passphrase) as `meltify-info --subaccount`.
      const sub = buildSubaccountReport({
        seed: parsed.seed,
        label,
        passphrase: request.passphrase,
        bip39Passphrase: request.bip39Passphrase,
      });
      return {
        op: 'derive',
        report: sub.report,
        seedHex: toHex(sub.seed),
        subaccount: label,
        bip39Passphrase: request.bip39Passphrase,
        pem: sub.pem,
        elapsedMs: performance.now() - started,
      };
    }
    case 'throwaway': {
      const started = performance.now();
      const seed = parseHex(request.seedHex);
      if (seed === null || seed.length !== 32) throw new Error('throwaway seed must be 32 hex bytes');
      // rounds = 1: this key protects nothing, it exists to be decrypted in-page.
      const key = marshalOpenSSHEd25519Key(seed, request.passphrase, { rounds: 1 });
      const parsed = parseEncryptedOpenSSHKey(key.pem, request.passphrase);
      const label = request.subaccount ?? '';
      if (label === '') {
        const report = buildIdentityReport({
          seed: parsed.seed,
          keyBodyB64: parsed.keyBodyB64,
          bip39Passphrase: request.bip39Passphrase,
        });
        return {
          op: 'throwaway',
          report,
          seedHex: toHex(parsed.seed),
          pem: key.pem,
          subaccount: '',
          bip39Passphrase: request.bip39Passphrase,
          elapsedMs: performance.now() - started,
        };
      }
      const sub = buildSubaccountReport({
        seed: parsed.seed,
        label,
        passphrase: request.passphrase,
        bip39Passphrase: request.bip39Passphrase,
      });
      return {
        op: 'throwaway',
        report: sub.report,
        seedHex: toHex(sub.seed),
        pem: key.pem,
        subaccount: label,
        bip39Passphrase: request.bip39Passphrase,
        elapsedMs: performance.now() - started,
      };
    }
    case 'marshal': {
      const started = performance.now();
      const seed = parseHex(request.seedHex);
      if (seed === null || seed.length !== 32) throw new Error('seed must be 32 hex bytes');
      const key = marshalOpenSSHEd25519Key(seed, request.passphrase, { rounds: request.rounds });
      return {
        op: 'marshal',
        pem: key.pem,
        keyBodyB64: key.keyBodyB64,
        elapsedMs: performance.now() - started,
      };
    }
    case 'selfcheck':
      return selfCheck();
  }
}

function serialize(error: unknown): SerializedError {
  if (error instanceof MeltifyError) {
    return { name: error.name, message: error.message, code: error.code };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}

/* ------------------------------------------------------------------ *
 * Parity self-check: the browser bundle against the pinned Go vectors.
 * ------------------------------------------------------------------ */

function selfCheck(): WorkerResult {
  const started = performance.now();
  const rows: CheckRow[] = [];
  const check = (name: string, actual: unknown, expected: unknown): void => {
    const pass = Object.is(actual, expected);
    rows.push(
      pass
        ? { name, pass }
        : { name, pass, expected: String(expected), actual: String(actual) },
    );
  };

  try {
    const seed = GOLDEN_SEED_00_TO_1F;
    const key = marshalOpenSSHEd25519Key(seed, THROWAWAY_PASSPHRASE, {
      rounds: 1,
      checkBytes: Uint8Array.from([1, 2, 3, 4]),
      salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    });
    const parsed = parseEncryptedOpenSSHKey(key.pem, THROWAWAY_PASSPHRASE);
    check('decrypted seed round-trips', toHex(parsed.seed), toHex(seed));
    check('key body echoed verbatim', parsed.keyBodyB64, key.keyBodyB64);

    const report = buildIdentityReport({ seed: parsed.seed, keyBodyB64: parsed.keyBodyB64 });
    check('24-word MELT phrase', report.mnemonic24, GOLDEN.mnemonic24);
    check('nostr npub', report.npub, GOLDEN.npub);
    check('nostr nsec', report.nsec, GOLDEN.nsec);
    check('nostr pubkey hex', report.pubKeyHex, GOLDEN.pubKeyHex);
    check('nostr privkey hex', report.privKeyHex, GOLDEN.privKeyHex);
    check('fingerprint format', /^SHA256:[A-Za-z0-9+/]{43}$/.test(report.fingerprint), true);
    check('address count', report.addresses.length, 30);

    const byLabel = (label: string): string | undefined =>
      report.addresses.find((entry) => entry.label === label)?.address;
    const addressIn = (source: IdentityReport, label: string): string | undefined =>
      source.addresses.find((entry) => entry.label === label)?.address;
    const pinned: Record<string, string> = {
      bitcoin: GOLDEN.bitcoin,
      bitcoincash: GOLDEN.bitcoincash,
      ethereum: GOLDEN.ethereum,
      solana: GOLDEN.solana,
      tron: GOLDEN.tron,
      litecoin: GOLDEN.litecoin,
      dogecoin: GOLDEN.dogecoin,
      cosmos: GOLDEN.cosmos,
      stellar: GOLDEN.stellar,
      xrpl: GOLDEN.ripple,
      sui: GOLDEN.sui,
      silentpayment: GOLDEN.silentPayment,
      ton: GOLDEN.ton,
    };
    for (const [label, expected] of Object.entries(pinned)) {
      check(label, byLabel(label), expected);
    }

    check('legacy 25-word phrase', report.legacyPhrase, GOLDEN.legacy25);
    check('scReduce32', toHex(scReduce32(seed)), GOLDEN.reducedSeedHex);
    check(
      'legacy phrase decodes',
      toHex(decodeLegacyMnemonic(report.legacyPhrase)),
      GOLDEN.reducedSeedHex,
    );
    check(
      'legacy phrase re-encodes',
      encodeLegacyMnemonic(decodeLegacyMnemonic(GOLDEN.legacy25)),
      GOLDEN.legacy25,
    );
    check('monero primary', byLabel('monero'), GOLDEN.moneroLegacyPrimary);
    check('beldex primary', byLabel('beldex'), GOLDEN.beldexLegacyPrimary);
    check('beldex differs from monero', byLabel('beldex') !== byLabel('monero'), true);
    check('bchat chat id', report.bchat, GOLDEN.bchat);
    check('renderText line count', renderText(report).split('\n').length, 72);

    // BIP39 passphrase path (optional, but the site recommends one). Nothing in the Go vectors
    // covers it — meltify-info has no such flag — so these rows pin the two
    // things that matter: the passphrase moves the BIP39-seeded values, and it
    // leaves the seed, the phrases, the SSH key and the CryptoNote rows alone.
    const withPassphrase = buildIdentityReport({
      seed: parsed.seed,
      keyBodyB64: parsed.keyBodyB64,
      bip39Passphrase: THROWAWAY_BIP39_PASSPHRASE,
    });
    check('bip39 passphrase: 24-word phrase unchanged', withPassphrase.mnemonic24, GOLDEN.mnemonic24);
    check(
      'bip39 passphrase: fingerprint unchanged',
      withPassphrase.fingerprint,
      report.fingerprint,
    );
    check(
      'bip39 passphrase: cryptonote phrase unchanged',
      withPassphrase.legacyPhrase,
      GOLDEN.legacy25,
    );
    check(
      'bip39 passphrase: monero unchanged',
      addressIn(withPassphrase, 'monero'),
      GOLDEN.moneroLegacyPrimary,
    );
    check(
      'bip39 passphrase: beldex unchanged',
      addressIn(withPassphrase, 'beldex'),
      GOLDEN.beldexLegacyPrimary,
    );
    check('bip39 passphrase: bchat unchanged', withPassphrase.bchat, GOLDEN.bchat);
    check('bip39 passphrase: npub moves', withPassphrase.npub !== report.npub, true);
    check('bip39 passphrase: nsec moves', withPassphrase.nsec !== report.nsec, true);
    check(
      'bip39 passphrase: bitcoin moves',
      addressIn(withPassphrase, 'bitcoin') !== GOLDEN.bitcoin,
      true,
    );
    check(
      'bip39 passphrase: bitcoin pinned',
      addressIn(withPassphrase, 'bitcoin'),
      'bc1q74taletqe9dvsgu994tqrs3gxtka0r7qyxq2nt',
    );
    check(
      'bip39 passphrase: npub pinned',
      withPassphrase.npub,
      'npub15hyfawanrteamgq3ppxwcgm0hwvm7tcg0e6glwwr6q4n0xmz9tvqvnhe0m',
    );
    check('no Buffer global', typeof (globalThis as { Buffer?: unknown }).Buffer, 'undefined');

    // Subaccount: derived seed and the downstream fields pinned for label 'alice'.
    const source = parseEncryptedOpenSSHKey(key.pem, THROWAWAY_PASSPHRASE);
    const sub = buildSubaccountReport({
      seed: source.seed,
      label: SUBACCOUNT_GOLDEN.label,
      passphrase: THROWAWAY_PASSPHRASE,
    });
    check('subaccount seed', toHex(sub.seed), SUBACCOUNT_GOLDEN.seedHex);
    check('subaccount 24-word MELT phrase', sub.report.mnemonic24, SUBACCOUNT_GOLDEN.mnemonic24);
    check('subaccount npub', sub.report.npub, SUBACCOUNT_GOLDEN.npub);
    const subparsed = parseEncryptedOpenSSHKey(sub.pem, THROWAWAY_PASSPHRASE);
    check('subaccount key round-trips', toHex(subparsed.seed), SUBACCOUNT_GOLDEN.seedHex);
  } catch (error) {
    rows.push({
      name: 'self-check threw',
      pass: false,
      expected: 'no error',
      actual: error instanceof Error ? error.message : String(error),
    });
  }

  return { op: 'selfcheck', rows, elapsedMs: performance.now() - started };
}
