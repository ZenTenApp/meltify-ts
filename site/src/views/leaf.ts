/**
 * The leaf panel: whatever the deepest selected tab derives, as meltify-info /
 * Chains / Report, plus the node's Profile, Settings and Info tabs. One instance
 * for the whole app; whichever key tab is showing adopts it.
 *
 * Each identity panel renders lazily, so a derivation only pays for the panel on
 * screen. Profile/Settings/Info are built from the current leaf node.
 */

import { el, message, pill } from '../lib/dom.ts';
import { createStrip, type StripOptions } from '../lib/tabstrip.ts';
import { getState, labelOf, type Identity, type LeafInfo } from '../lib/store.ts';
import { mountChains } from './chains.ts';
import { mountCompat } from './compat.ts';
import { mountInfo } from './info.ts';
import { profilePanel } from './profile.ts';
import { mountReport } from './report.ts';
import { mountSettings } from './settings.ts';
import type { Ctx } from '../app-types.ts';

type LeafTab = 'compat' | 'chains' | 'report' | 'profile' | 'settings' | 'info';

const LEAF_TABS = [
  { id: 'compat', label: 'meltify-info', section: true },
  { id: 'chains', label: 'Chains', section: true },
  { id: 'report', label: 'Report', section: true },
  { id: 'profile', label: 'Profile', section: true },
  { id: 'settings', label: 'Settings', section: true },
  { id: 'info', label: 'Info', section: true },
] as const;

export interface LeafPanel {
  root: HTMLElement;
  render(info: LeafInfo | null, identity: Identity | null): void;
}

export function mountLeaf(ctx: Ctx): LeafPanel {
  const views = { report: mountReport(ctx), chains: mountChains(), compat: mountCompat(ctx) } as const;
  const infoView = mountInfo();
  const settingsView = mountSettings(ctx);
  const profileRoot = el('div');

  let active: LeafTab = 'compat';
  let info: LeafInfo | null = null;
  let identity: Identity | null = null;
  /** What each identity panel was last drawn with, so switching stays cheap. */
  const drawn = new Map<keyof typeof views, Identity | null>();
  const drawnSetting = new Map<keyof typeof views, boolean>();
  /** The profile panel is rebuilt only when its node or lookup state changes. */
  let profileSignature = '\u0000';

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
    if (active === 'profile') {
      const node = info?.node ?? null;
      const signature =
        node === null
          ? ''
          : [
              node.id,
              node.profile?.name ?? '',
              node.profile?.via ?? '',
              node.profile?.createdAt ?? 0,
              node.search?.state ?? '',
              node.search?.at ?? 0,
              node.search?.relays.length ?? 0,
              node.identity?.report.npub ?? '',
            ].join('|');
      if (signature !== profileSignature) {
        profileSignature = signature;
        profileRoot.replaceChildren(
          node === null
            ? el('section', { class: 'card' }, [
                el('div', { class: 'empty' }, [
                  el('h2', {}, ['No node selected']),
                  el('p', { class: 'hint' }, ['Select a key, wallet or card to see its profile.']),
                ]),
              ])
            : profilePanel(node, ctx),
        );
      }
      if (body.firstChild !== profileRoot) body.replaceChildren(profileRoot);
      return;
    }

    if (active === 'settings') {
      settingsView.render();
      if (body.firstChild !== settingsView.root) body.replaceChildren(settingsView.root);
      return;
    }

    if (active === 'info') {
      infoView.render(info, ctx.showPrivateName());
      if (body.firstChild !== infoView.root) body.replaceChildren(infoView.root);
      return;
    }

    const view = views[active];
    const showPrivateName = ctx.showPrivateName();
    if (drawn.get(active) !== identity || drawnSetting.get(active) !== showPrivateName) {
      view.render(identity);
      drawn.set(active, identity);
      drawnSetting.set(active, showPrivateName);
    }
    if (body.firstChild !== view.root) body.replaceChildren(view.root);
  };

  const drawStatus = (): void => {
    crumb.replaceChildren();
    pills.replaceChildren();
    status.replaceChildren();

    if (info !== null) {
      const path: { text: string; leaf: boolean }[] = [
        { text: labelOf(getState(), info.key.id), leaf: info.wallet === null && info.card === null },
      ];
      if (info.wallet !== null) {
        path.push({ text: labelOf(getState(), info.wallet.id), leaf: info.card === null });
      }
      if (info.card !== null) path.push({ text: labelOf(getState(), info.card.id), leaf: true });
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
        pill(`fingerprint ${identity.report.fingerprint}`),
        info.wallet === null ? pill('no subaccount') : pill(`wallet: ${labelOf(getState(), info.wallet.id)}`),
        info.card === null
          ? pill('bip39 passphrase: none')
          : pill(`card: ${labelOf(getState(), info.card.id)}`, identity.bip39Passphrase === '' ? undefined : 'ok'),
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
