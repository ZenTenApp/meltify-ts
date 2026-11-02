/**
 * Chains view: the 30 labeled addresses, grouped by derivation family and
 * filterable, with CSV export.
 */

import { copyAction } from '../lib/blocks.ts';
import { downloadText } from '../lib/download.ts';
import { el, hint, pill, toast } from '../lib/dom.ts';
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

function csvOf(rows: readonly { label: string; address: string }[]): string {
  return `label,address\n${rows.map((row) => `${row.label},${row.address}`).join('\n')}\n`;
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

      for (const group of GROUPS) {
        const members = group.labels
          .map((label) => addresses.find((entry) => entry.label === label))
          .filter((entry): entry is { label: string; address: string } => entry !== undefined)
          .filter(
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
      counter.textContent = `${shown} of ${addresses.length} shown`;
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
              downloadText('meltify-addresses.csv', csvOf(addresses), 'text/csv;charset=utf-8');
              toast('CSV downloaded');
            },
          }, ['download CSV']),
          copyAction(csvOf(addresses), 'address CSV', 'copy CSV'),
        ]),
      ]),
      hint(
        'Order and labels match meltify-info exactly. Monero and Beldex come from the 25-word CryptoNote phrase derived from the sc-reduced seed; every EVM label shares one address.',
      ),
      el('div', { class: 'row tight', style: 'margin-top: 12px' }, [filter, counter]),
      el('div', { style: 'margin-top: 12px' }, [table]),
      el('div', { class: 'pills' }, [
        pill(`${addresses.length} labels`),
        pill('14 derivations'),
        pill('11 families'),
      ]),
    ]);

    root.replaceChildren(card);
    draw();
  };

  subscribe(render);
  return root;
}
