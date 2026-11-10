/**
 * Chains view: the 30 labeled addresses, grouped by derivation family and
 * filterable, with CSV export.
 */

import { buildMoneroReport } from 'meltify-ts';
import { copyAction } from '../lib/blocks.ts';
import { downloadText } from '../lib/download.ts';
import { el, hint, pill, toast } from '../lib/dom.ts';
import { parseHex } from '../lib/hex.ts';
import { subscribe, type AppState } from '../lib/store.ts';
import type { Ctx } from '../app-types.ts';

/** The 14 derivations, arranged into the families the report flattens alphabetically. */
const GROUPS: readonly { title: string; labels: readonly string[] }[] = [
  {
    title: 'EVM · one address, 16 chain labels',
    labels: [
      'arbitrum',
      'arc',
      'avalanche',
      'base',
      'bnbchain',
      'celo',
      'cronos',
      'ethereum',
      'gnosis',
      'hyperevm',
      'monad',
      'optimism',
      'plasma',
      'polygon',
      'stablechain',
      'worldchain',
    ],
  },
  {
    title: 'Bitcoin family',
    labels: ['bitcoin', 'bitcoincash', 'litecoin', 'dogecoin', 'silentpayment'],
  },
  { title: 'Cosmos', labels: ['cosmos'] },
  { title: 'XRPL', labels: ['xrpl'] },
  { title: 'Stellar', labels: ['stellar'] },
  { title: 'Solana', labels: ['solana'] },
  { title: 'Sui', labels: ['sui'] },
  { title: 'TON', labels: ['ton'] },
  { title: 'Tron', labels: ['tron'] },
  { title: 'Monero · CryptoNote legacy phrase', labels: ['monero'] },
  { title: 'Beldex · CryptoNote legacy phrase', labels: ['beldex'] },
];

interface AddressRow {
  label: string;
  address: string;
}

interface AddressGroup {
  title: string;
  rows: readonly AddressRow[];
}

/**
 * The Monero outputs meltify-info does not list: the `(0, n)` subaddresses of the
 * legacy phrase and the whole Cake Wallet / Unstoppable set. Derived here on the
 * main thread from the report's seed — the worker payload stays meltify-info's.
 */
function moneroGroups(seedHex: string): AddressGroup[] {
  const seed = parseHex(seedHex);
  if (seed === null || seed.length !== 32) return [];
  const monero = buildMoneroReport({ seed });
  const subaddressRows = (subaddresses: readonly string[], prefix: string): AddressRow[] =>
    subaddresses.map((address, index) => ({ label: `${prefix} (0,${index + 1})`, address }));

  return [
    {
      title: 'Monero · subaddresses from the 25-word legacy seed',
      rows: subaddressRows(monero.monero.subaddresses, 'monero'),
    },
    {
      title: "Monero · Cake/Unstoppable (BIP39 m/44'/128'/0'/0/0)",
      rows: [
        { label: 'monero cake', address: monero.cake.primary },
        ...subaddressRows(monero.cake.subaddresses, 'monero cake'),
      ],
    },
  ];
}

/** CSV-quote a field when it could otherwise break the row. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvOf(rows: readonly AddressRow[]): string {
  return `label,address\n${rows.map((row) => `${csvField(row.label)},${csvField(row.address)}`).join('\n')}\n`;
}

export function mountChains(_ctx: Ctx): HTMLElement {
  const root = el('div', { class: 'view' });

  const render = (state: AppState): void => {
    const identity = state.identity;
    if (identity === null) {
      root.replaceChildren(
        el('section', { class: 'card' }, [
          el('div', { class: 'empty' }, [
            el('h2', {}, ['No addresses yet']),
            el('p', { class: 'hint' }, ['Derive an identity first.']),
            el('div', { class: 'row', style: 'justify-content: center; margin-top: 14px' }, [
              el('a', { class: 'btn primary', href: '#/derive' }, ['Go to Derive']),
            ]),
          ]),
        ]),
      );
      return;
    }

    const addresses = identity.report.addresses;
    // meltify-info's 30 labels first, then the meltify-monero outputs.
    const groups: AddressGroup[] = [
      ...GROUPS.map((group) => ({
        title: group.title,
        rows: group.labels
          .map((label) => addresses.find((entry) => entry.label === label))
          .filter((entry): entry is AddressRow => entry !== undefined),
      })),
      ...moneroGroups(identity.report.seedHex),
    ];
    const allRows = groups.flatMap((group) => group.rows);
    const extraRows = allRows.length - addresses.length;
    const filter = el('input', {
      type: 'text',
      placeholder: 'filter by label or address',
      autocomplete: 'off',
    });
    const body = el('tbody');

    const draw = (): void => {
      const needle = filter.value.trim().toLowerCase();
      const rows: HTMLElement[] = [];
      let shown = 0;

      for (const group of groups) {
        const members = group.rows.filter(
          (entry) =>
            needle === '' ||
            entry.label.includes(needle) ||
            entry.address.toLowerCase().includes(needle),
        );
        if (members.length === 0) continue;

        rows.push(
          el('tr', { class: 'grouprow' }, [
            el('td', { colspan: 3 }, [`${group.title} · ${members.length}`]),
          ]),
        );
        for (const entry of members) {
          shown += 1;
          rows.push(
            el('tr', {}, [
              el('td', { class: 'name' }, [entry.label]),
              el('td', { class: 'value' }, [entry.address]),
              el('td', { class: 'act' }, [copyAction(entry.address, entry.label)]),
            ]),
          );
        }
      }

      if (rows.length === 0) {
        rows.push(el('tr', {}, [el('td', { colspan: 3, class: 'name' }, ['no matches'])]));
      }
      body.replaceChildren(...rows);
      counter.textContent = `${shown} of ${allRows.length} shown`;
    };

    filter.addEventListener('input', draw);

    const counter = el('span', { class: 'hint' }, ['']);
    const table = el('div', { class: 'tablewrap', style: 'max-height: 62vh; overflow-y: auto' }, [
      el('table', {}, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', {}, ['label']),
            el('th', {}, ['address']),
            el('th', {}, ['']),
          ]),
        ]),
        body,
      ]),
    ]);

    const card = el('section', { class: 'card' }, [
      el('div', { class: 'row', style: 'justify-content: space-between; align-items: flex-start' }, [
        el('h2', { style: 'margin: 0' }, ['Addresses']),
        el('div', { class: 'row tight' }, [
          el('button', {
            type: 'button',
            class: 'btn small',
            onclick: () => {
              downloadText('meltify-addresses.csv', csvOf(allRows), 'text/csv;charset=utf-8');
              toast('CSV downloaded');
            },
          }, ['download CSV']),
          copyAction(csvOf(allRows), 'address CSV', 'copy CSV'),
        ]),
      ]),
      hint(
        'Order and labels match meltify-info exactly. Monero and Beldex come from the 25-word CryptoNote phrase derived from the sc-reduced seed; every EVM label shares one address. Below the 30 labels: the Monero subaddresses and the Cake/Unstoppable set meltify-monero prints, derived from the same seed.',
      ),
      el('div', { class: 'row tight', style: 'margin-top: 12px' }, [filter, counter]),
      el('div', { style: 'margin-top: 12px' }, [table]),
      el('div', { class: 'pills' }, [
        pill(`${addresses.length} labels`),
        pill('14 derivations'),
        pill('11 families'),
        ...(extraRows === 0 ? [] : [pill(`+${extraRows} monero rows`)]),
      ]),
    ]);

    root.replaceChildren(card);
    draw();
  };

  subscribe(render);
  return root;
}
