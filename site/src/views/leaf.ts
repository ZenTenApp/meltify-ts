/**
 * The leaf panel: whatever the deepest selected tab derives, as Report /
 * Chains / meltify-info. One instance for the whole app; whichever key tab is
 * showing adopts it.
 *
 * Each panel renders lazily, so a derivation only pays for the panel on screen.
 */

import { el, message, pill } from '../lib/dom.ts';
import { createStrip, type StripOptions } from '../lib/tabstrip.ts';
import type { Identity, LeafInfo } from '../lib/store.ts';
import { mountChains } from './chains.ts';
import { mountCompat } from './compat.ts';
import { mountReport } from './report.ts';
import type { Ctx } from '../app-types.ts';

type LeafTab = 'report' | 'chains' | 'compat';

const LEAF_TABS = [
  { id: 'report', label: 'Report', section: true },
  { id: 'chains', label: 'Chains', section: true },
  { id: 'compat', label: 'meltify-info', section: true },
] as const;

export interface LeafPanel {
  root: HTMLElement;
  render(info: LeafInfo | null, identity: Identity | null): void;
}

export function mountLeaf(ctx: Ctx): LeafPanel {
  const views = { report: mountReport(ctx), chains: mountChains(), compat: mountCompat() } as const;

  let active: LeafTab = 'report';
  let info: LeafInfo | null = null;
  let identity: Identity | null = null;
  /** What each panel was last drawn with, so switching panels stays cheap. */
  const drawn = new Map<LeafTab, Identity | null>();

  const strip = createStrip();
  const crumb = el('div', { class: 'crumb' });
  const status = el('div');
  const pills = el('div', { class: 'pills' });
  const body = el('div', { class: 'leaf__body' });

  const stripOptions = (): StripOptions => ({
    label: 'Identity output',
    variant: 'minor',
    tabs: LEAF_TABS,
    activeId: active,
    addLabel: '',
    addTitle: '',
    addHidden: true,
    onSelect: (id) => {
      active = id as LeafTab;
      renderStrip();
      draw();
    },
    onAdd: () => undefined,
  });

  const renderStrip = (): void => strip.render(stripOptions());

  const draw = (): void => {
    const view = views[active];
    if (drawn.get(active) !== identity) {
      view.render(identity);
      drawn.set(active, identity);
    }
    if (body.firstChild !== view.root) body.replaceChildren(view.root);
  };

  const drawStatus = (): void => {
    crumb.replaceChildren();
    pills.replaceChildren();
    status.replaceChildren();

    if (info !== null) {
      const path: { text: string; leaf: boolean }[] = [
        { text: info.key.label, leaf: info.wallet === null && info.card === null },
      ];
      if (info.wallet !== null) path.push({ text: info.wallet.label, leaf: info.card === null });
      if (info.card !== null) path.push({ text: info.card.label, leaf: true });
      for (const [index, part] of path.entries()) {
        if (index > 0) crumb.append(el('span', { class: 'crumb__sep' }, ['›']));
        crumb.append(el('span', { class: part.leaf ? 'crumb__leaf' : 'crumb__part' }, [part.text]));
      }
    }

    const node = info?.node;
    if (node !== undefined && node.deriving) {
      status.replaceChildren(
        el('div', { class: 'msg warn' }, [el('span', { class: 'busy' }), 'Deriving in the worker…']),
      );
    } else if (node !== undefined && node.error !== null) {
      status.replaceChildren(message(node.error, 'err'));
    }

    if (identity !== null && info !== null) {
      pills.append(
        pill(`source: ${identity.source}`),
        info.wallet === null ? pill('no subaccount') : pill(`wallet: ${info.wallet.label}`),
        info.card === null
          ? pill('bip39 passphrase: none')
          : pill(`card: ${info.card.label}`, identity.bip39Passphrase === '' ? undefined : 'ok'),
        pill(`${identity.report.addresses.length} addresses`),
        pill(`derive ${identity.elapsedMs.toFixed(0)} ms`),
      );
    }
  };

  renderStrip();

  const root = el('section', { class: 'card tight leaf' }, [
    el('div', { class: 'leaf__head' }, [crumb, pills]),
    status,
    strip.root,
    body,
  ]);

  return {
    root,
    render(nextInfo, nextIdentity) {
      info = nextInfo;
      identity = nextIdentity;
      drawStatus();
      draw();
    },
  };
}
