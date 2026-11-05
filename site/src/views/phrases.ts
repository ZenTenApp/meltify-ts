/**
 * Phrase lab: the standalone conversions the core exposes — seed to phrase,
 * phrase to BIP39 seed, 25-word CryptoNote phrase to Monero/Beldex/BChat.
 * None of this needs the unlock path, so it runs on the main thread.
 */

import {
  bchatChatId,
  beldexAddressFromLegacy,
  decodeLegacyMnemonic,
  encodeLegacyMnemonic,
  mnemonic24FromSeed,
  moneroAddressFromLegacy,
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
    output.replaceChildren(
      valueBlock('melt phrase', mnemonic, { secret: true, note: '24 words, BIP39' }),
      valueBlock('sc-reduced seed', toHex(reduced), { secret: true, note: 'hex, fed to CryptoNote' }),
      valueBlock('cryptonote phrase', encodeLegacyMnemonic(reduced), {
        secret: true,
        note: '25 words',
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
      output.replaceChildren(
        valueBlock('decoded seed', toHex(reduced), { secret: true, note: 'hex, 32 bytes' }),
        valueBlock('monero primary', moneroAddressFromLegacy(phrase)),
        valueBlock('beldex primary', beldexAddressFromLegacy(phrase)),
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
    hint('25 words. Only primaries are derived; subaddresses are out of scope for meltify-info parity.'),
    el('div', { style: 'margin-top: 12px' }, [input]),
    output,
  ]);
  return { root, run };
}

export function mountPhrases(_ctx: Ctx): HTMLElement {
  const panels = [seedPanel(), phrasePanel(), legacyPanel()];
  return el('div', { class: 'view' }, panels.map((panel) => panel.root));
}
