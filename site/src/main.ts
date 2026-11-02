/**
 * App shell: hash router, tab state, and the global wipe control.
 *
 * Views stay mounted for the lifetime of the page, so switching tabs never
 * loses typed input. Only the wrapper divs are hidden.
 */

import './styles/main.css';
import { must, toast } from './lib/dom.ts';
import { clearIdentity, getState, subscribe } from './lib/store.ts';
import type { Ctx, TabId } from './app-types.ts';
import { mountChains } from './views/chains.ts';
import { mountCompat } from './views/compat.ts';
import { mountDerive } from './views/derive.ts';
import { mountKeys } from './views/keys.ts';
import { mountPhrases } from './views/phrases.ts';
import { mountReport } from './views/report.ts';
import { mountSelfCheck } from './views/selfcheck.ts';

const TAB_IDS: readonly TabId[] = [
  'derive',
  'report',
  'chains',
  'compat',
  'phrases',
  'keys',
  'selfcheck',
];

const NEEDS_REPORT: ReadonlySet<TabId> = new Set<TabId>(['report', 'chains', 'compat']);

function parseHash(): TabId {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : 'derive';
}

function wipe(message: string): void {
  clearIdentity();
  window.dispatchEvent(new CustomEvent('meltify:wipe'));
  toast(message);
}

function main(): void {
  const container = must<HTMLElement>('#views');
  const nav = must<HTMLElement>('#tabs');

  const ctx: Ctx = {
    go: (tab) => {
      location.hash = `#/${tab}`;
      apply(tab);
    },
  };

  const mounts: Record<TabId, (context: Ctx) => HTMLElement> = {
    derive: mountDerive,
    report: mountReport,
    chains: mountChains,
    compat: mountCompat,
    phrases: mountPhrases,
    keys: mountKeys,
    selfcheck: mountSelfCheck,
  };

  const mounted = new Map<TabId, HTMLElement>();
  for (const id of TAB_IDS) {
    const node = mounts[id](ctx);
    node.hidden = true;
    container.append(node);
    mounted.set(id, node);
  }

  const tabLinks = [...nav.querySelectorAll<HTMLAnchorElement>('a[data-tab]')];

  function apply(tab: TabId): void {
    const hasIdentity = getState().identity !== null;
    const target = NEEDS_REPORT.has(tab) && !hasIdentity ? 'derive' : tab;

    for (const [id, node] of mounted) node.hidden = id !== target;
    for (const link of tabLinks) {
      const id = link.dataset.tab as TabId;
      const blocked = NEEDS_REPORT.has(id) && !hasIdentity;
      if (id === target) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      link.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    }
    if (target !== tab) location.hash = '#/derive';
  }

  subscribe(() => apply(parseHash()));

  window.addEventListener('hashchange', () => {
    apply(parseHash());
  });

  // Auto-clear: a backgrounded tab should not keep the seed resident.
  const autoclear = must<HTMLInputElement>('#autoclear');
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && autoclear.checked && getState().identity !== null) {
      wipe('Wiped — tab was hidden');
    }
  });

  must<HTMLButtonElement>('#wipe').addEventListener('click', () => {
    wipe(getState().identity === null ? 'Nothing loaded' : 'Identity wiped from memory');
  });

  apply(parseHash());
}

main();
