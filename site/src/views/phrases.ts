/**
 * Phrase lab: the standalone conversions the core exposes — seed to phrase,
 * phrase to BIP39 seed, 25-word CryptoNote phrase to Monero/Beldex/BChat.
 * None of this needs the unlock path, so it runs on the main thread.
 */

import {
  bchatChatId,
  beldexAddressesFromLegacy,
  buildMoneroReport,
  decodeLegacyMnemonic,
  encodeLegacyMnemonic,
  mnemonic24FromSeed,
  moneroAddressesFromLegacy,
  scReduce32,
  seedFromMnemonic,
} from 'meltify-ts';
import { valueBlock } from '../lib/blocks.ts';
import { el, hint, message } from '../lib/dom.ts';
import { parseHex, toHex } from '../lib/hex.ts';
import type { Ctx } from '../app-types.ts';

interface Panel {
  root: HTMLElement;
  run(): void;
}

/** One `0,n address` line per subaddress, as meltify-monero prints them. */
function subaddressText(subaddresses: readonly string[]): string {
  return subaddresses.map((address, index) => `0,${index + 1} ${address}`).join('\n');
}

function seedPanel(): Panel {
  const input = el('input', {
    type: 'text',
    placeholder: '32-byte seed as hex, e.g. 00…1f',
    autocomplete: 'off',
  });
  const output = el('div', { class: 'blocks', style: 'margin-top: 12px' });

  const run = (): void => {
    const seed = parseHex(input.value);
    if (seed === null) {
      output.replaceChildren(message('Not hex. Paste 64 hex characters (32 bytes).', 'err'));
      return;
    }
    if (seed.length !== 32) {
      output.replaceChildren(
        message(`Expected 32 bytes, got ${seed.length}.`, 'err'),
      );
      return;
    }
    const mnemonic = mnemonic24FromSeed(seed);
    const reduced = scReduce32(seed);
    const monero = buildMoneroReport({ seed });
    output.replaceChildren(
      valueBlock('melt phrase', mnemonic, { secret: true, note: '24 words, BIP39' }),
      valueBlock('sc-reduced seed', toHex(reduced), { secret: true, note: 'hex, fed to CryptoNote' }),
      valueBlock('cryptonote phrase', encodeLegacyMnemonic(reduced), {
        secret: true,
        note: '25 words',
      }),
      valueBlock('monero primary', monero.monero.primary, { note: 'from the 25-word seed' }),
      valueBlock('monero subaddresses', subaddressText(monero.monero.subaddresses), {
        note: `0,1-0,${monero.monero.subaddresses.length}`,
      }),
      valueBlock('cake wallet seed', monero.cakePhrase, {
        secret: true,
        note: '25 words, Unstoppable shows this phrase',
      }),
      valueBlock('cake monero primary', monero.cake.primary, { note: 'm/44\'/128\'/0\'/0/0' }),
      valueBlock('cake monero subaddresses', subaddressText(monero.cake.subaddresses), {
        note: `0,1-0,${monero.cake.subaddresses.length}`,
      }),
    );
  };

  input.addEventListener('input', run);
  const root = el('section', { class: 'card' }, [
    el('h2', {}, ['Seed → phrases']),
    hint('The raw Ed25519 seed is BIP39 entropy, not a wallet mnemonic.'),
    el('div', { style: 'margin-top: 12px' }, [input]),
    output,
  ]);
  return { root, run };
}

function phrasePanel(): Panel {
  const input = el('textarea', {
    spellcheck: 'false',
    placeholder: 'abandon amount liar … (24 words)',
  });
  const pass = el('input', { type: 'text', placeholder: 'optional BIP39 passphrase', autocomplete: 'off' });
  const output = el('div', { class: 'blocks', style: 'margin-top: 12px' });

  const run = (): void => {
    const phrase = input.value.trim().replace(/\s+/g, ' ');
    if (phrase.length === 0) {
      output.replaceChildren();
      return;
    }
    const words = phrase.split(' ');
    try {
      const seed = seedFromMnemonic(phrase, pass.value);
      output.replaceChildren(
        valueBlock('bip39 seed', toHex(seed), { secret: true, note: `${words.length} words → 64 bytes` }),
      );
    } catch {
      output.replaceChildren(message('Not a valid BIP39 mnemonic (check the words and the checksum).', 'err'));
    }
  };

  input.addEventListener('input', run);
  pass.addEventListener('input', run);

  const root = el('section', { class: 'card' }, [
    el('h2', {}, ['Phrase → BIP39 seed']),
    hint(
      'This is the PBKDF2-HMAC-SHA512 step the wallet derivations start from. A MELT phrase cannot be turned back into the Ed25519 key seed here — bring the key instead.',
    ),
    el('div', { style: 'margin-top: 12px' }, [input]),
    el('div', { style: 'margin-top: 10px' }, [pass]),
    output,
  ]);
  return { root, run };
}

function legacyPanel(): Panel {
  const input = el('textarea', {
    spellcheck: 'false',
    placeholder: '25-word CryptoNote phrase',
  });
  const output = el('div', { class: 'blocks', style: 'margin-top: 12px' });

  const run = (): void => {
    const phrase = input.value.trim().replace(/\s+/g, ' ');
    if (phrase.length === 0) {
      output.replaceChildren();
      return;
    }
    try {
      const reduced = decodeLegacyMnemonic(phrase);
      const monero = moneroAddressesFromLegacy(phrase);
      const beldex = beldexAddressesFromLegacy(phrase);
      output.replaceChildren(
        valueBlock('decoded seed', toHex(reduced), { secret: true, note: 'hex, 32 bytes' }),
        valueBlock('monero primary', monero.primary),
        valueBlock('monero subaddresses', subaddressText(monero.subaddresses), {
          note: `0,1-0,${monero.subaddresses.length}`,
        }),
        valueBlock('beldex primary', beldex.primary),
        valueBlock('beldex subaddresses', subaddressText(beldex.subaddresses), {
          note: `0,1-0,${beldex.subaddresses.length}`,
        }),
        valueBlock('bchat chat id', bchatChatId(reduced)),
        valueBlock('re-encoded phrase', encodeLegacyMnemonic(reduced), {
          secret: true,
          note: 'round-trip check',
        }),
      );
    } catch (error) {
      output.replaceChildren(
        message(
          `Not a valid CryptoNote phrase: ${error instanceof Error ? error.message : String(error)}`,
          'err',
        ),
      );
    }
  };

  input.addEventListener('input', run);
  const root = el('section', { class: 'card' }, [
    el('h2', {}, ['CryptoNote phrase → addresses']),
    hint('25 words. Prints the primaries and subaddresses 0,1-0,9 for Monero and Beldex.'),
    el('div', { style: 'margin-top: 12px' }, [input]),
    output,
  ]);
  return { root, run };
}

export function mountPhrases(_ctx: Ctx): HTMLElement {
  const panels = [seedPanel(), phrasePanel(), legacyPanel()];
  return el('div', { class: 'view' }, panels.map((panel) => panel.root));
}
