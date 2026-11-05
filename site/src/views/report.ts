/**
 * Report view: the full identity, split into secret and public blocks, with
 * explicit export actions. Masking is presentational only — say so in the UI.
 */

import type { IdentityReport } from 'meltify-ts';
import { copyAction, valueBlock } from '../lib/blocks.ts';
import { downloadText } from '../lib/download.ts';
import { el, hint, pill, toast } from '../lib/dom.ts';
import { clearIdentity, subscribe, type AppState, type Identity } from '../lib/store.ts';
import type { Ctx } from '../app-types.ts';

const SECRET_FIELDS = [
  'privateKeyBlock',
  'seedHex',
  'mnemonic24',
  'legacyPhrase',
  'nsec',
  'privKeyHex',
] as const satisfies readonly (keyof IdentityReport)[];

function publicSnapshot(report: IdentityReport, identity: Identity): Record<string, unknown> {
  return {
    ...(identity.subaccount === '' ? {} : { subaccount: identity.subaccount }),
    fingerprint: report.fingerprint,
    publicKeyLine: report.publicKeyLine,
    npub: report.npub,
    pubKeyHex: report.pubKeyHex,
    bchat: report.bchat,
    addresses: report.addresses,
  };
}

function redactedSnapshot(report: IdentityReport, identity: Identity): Record<string, unknown> {
  return { ...publicSnapshot(report, identity), secretFields: '[redacted]' };
}

function footer(identity: Identity): HTMLElement {
  return el('div', { class: 'pills' }, [
    pill(`source: ${identity.source}`),
    ...(identity.subaccount === '' ? [] : [pill(`subaccount: ${identity.subaccount}`)]),
    pill(`derive ${identity.elapsedMs.toFixed(1)} ms`),
    pill(`${identity.report.addresses.length} addresses`),
    pill(`derived ${new Date(identity.derivedAt).toLocaleTimeString()}`),
  ]);
}

export function mountReport(ctx: Ctx): HTMLElement {
  const root = el('div', { class: 'view' });

  const emptyState = (): HTMLElement =>
    el('section', { class: 'card' }, [
      el('div', { class: 'empty' }, [
        el('h2', {}, ['No identity yet']),
        el('p', { class: 'hint' }, ['Derive an identity from a key, or use a throwaway key.']),
        el('div', { class: 'row', style: 'justify-content: center; margin-top: 14px' }, [
          el('a', { class: 'btn primary', href: '#/derive' }, ['Go to Derive']),
        ]),
      ]),
    ]);

  const render = (state: AppState): void => {
    const identity = state.identity;
    if (identity === null) {
      root.replaceChildren(emptyState());
      return;
    }
    const report = identity.report;

    const secrets = el('section', { class: 'card' }, [
      el('h2', {}, ['Secret material']),
      hint(
        'Each field is masked until you reveal it. Masking is cosmetic — the values live unencrypted in this tab’s memory for as long as the report is loaded.',
      ),
      el('div', { class: 'blocks', style: 'margin-top: 14px' }, [
        valueBlock('private key body', report.privateKeyBlock, {
          masked: true,
          note:
            identity.subaccount === ''
              ? 'base64 of openssh-key-v1'
              : `subaccount body for “${identity.subaccount}”, bcrypt rounds 1`,
        }),
        valueBlock('ed25519 seed', report.seedHex, { masked: true, note: 'hex, 32 bytes' }),
        valueBlock('melt phrase', report.mnemonic24, { masked: true, note: '24 words' }),
        valueBlock('cryptonote phrase', report.legacyPhrase, {
          masked: true,
          note: '25 words, not printed by meltify-info',
        }),
        valueBlock('nostr secret', report.nsec, { masked: true, note: 'nsec' }),
        valueBlock('nostr private key', report.privKeyHex, { masked: true, note: 'hex' }),
      ]),
    ]);

    const publicCard = el('section', { class: 'card' }, [
      el('h2', {}, ['Public identity']),
      el('div', { class: 'blocks' }, [
        valueBlock('ssh fingerprint', report.fingerprint, { note: 'SHA256' }),
        valueBlock('public key', report.publicKeyLine, { note: 'authorized_keys form' }),
        valueBlock('nostr public', report.npub, { note: 'npub' }),
        valueBlock('nostr public key', report.pubKeyHex, { note: 'hex' }),
        valueBlock('bchat chat id', report.bchat, { note: 'beldex' }),
      ]),
      footer(identity),
    ]);

    const exportCard = el('section', { class: 'card tight' }, [
      el('h2', {}, ['Export']),
      el('div', { class: 'row' }, [
        el('button', {
          type: 'button',
          class: 'btn',
          onclick: () => {
            downloadText(
              'meltify-public.json',
              `${JSON.stringify({ generatedAt: new Date(identity.derivedAt).toISOString(), ...redactedSnapshot(report, identity) }, null, 2)}\n`,
              'application/json',
            );
            toast('Public JSON downloaded');
          },
        }, ['Download public JSON']),
        el('button', {
          type: 'button',
          class: 'btn',
          onclick: () => {
            downloadText(
              'meltify-full.json',
              `${JSON.stringify({ generatedAt: new Date(identity.derivedAt).toISOString(), source: identity.source, ...(identity.subaccount === '' ? {} : { subaccount: identity.subaccount }), report }, null, 2)}\n`,
              'application/json',
            );
            toast('Full JSON downloaded — contains the seed');
          },
        }, ['Download full JSON']),
        ...(identity.subaccountPem === undefined
          ? []
          : [
              el('button', {
                type: 'button',
                class: 'btn',
                onclick: () => {
                  downloadText('id_ed25519_subaccount', identity.subaccountPem ?? '', 'application/octet-stream');
                  toast('Subaccount key downloaded');
                },
              }, ['Download subaccount key']),
            ]),
        copyAction(
          SECRET_FIELDS.map((field) => `${field}: ${String(report[field])}`).join('\n'),
          'all secret fields',
          'copy secrets',
        ),
        el('button', {
          type: 'button',
          class: 'btn ghost',
          onclick: () => {
            clearIdentity();
            toast('Identity wiped from memory');
            ctx.go('derive');
          },
        }, ['Wipe and go to Derive']),
      ]),
      hint(
        identity.subaccount === ''
          ? 'The full export contains the raw seed and every secret. Public JSON keeps the fingerprint, npub, and addresses only.'
          : 'This report is a subaccount: the private key body is the re-encoded subaccount key, not the source key, and it keeps the source passphrase. The full export contains the derived seed and every secret.',
      ),
    ]);

    root.replaceChildren(secrets, publicCard, exportCard);
  };

  subscribe(render);
  return root;
}
