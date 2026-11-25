/**
 * One browser-style tab strip: a `tablist` plus an add button.
 *
 * Used three times (keys, wallets, cards) at three sizes, and once standalone in
 * the leaf panel. The strip owns no state at all; the caller re-renders it from
 * the store. Titles are positional numbers (`Key 1`, `Wallet 1.2`, `Card 1.2.3`),
 * or a key's own OpenSSH comment, so there is nothing to rename in place.
 *
 * The three app strips render with `grid: true`: each is a circular scroller
 * whose wrap point is one full cycle of tabs, and selecting a tab slides that row
 * until the tab sits at the left edge. The add button is pinned to the right edge
 * and is one tab wide.
 */

import { el } from './dom.ts';

export interface StripTab {
  id: string;
  label: string;
  /** Uncommitted tab: dashed, italic, and closable without consequence. */
  draft?: boolean;
  /** Small marker after the label, e.g. '·' while deriving. */
  mark?: string;
  /** `data:` URI drawn before the label, e.g. a wallet's hashatar. Decorative. */
  icon?: string;
  /** Hover text. Must never contain a secret. */
  title?: string;
  /** Static section tab: never closable. */
  section?: boolean;
  /**
   * The immutable "nothing selected here" node, drawn first in its row: a green
   * dot and a fixed-width label that names the identity above the row. It can be
   * neither labelled nor closed, because it is not a wallet or a card.
   */
  plain?: boolean;
}

export interface StripOptions {
  /** aria-label for the tablist, e.g. "Wallets". */
  label: string;
  tabs: readonly StripTab[];
  activeId: string | null;
  addLabel: string;
  addTitle: string;
  addDisabled?: boolean;
  /** Hides the add button (a fixed segmented control, e.g. the leaf panel). */
  addHidden?: boolean;
  /** Dims and disables the whole row (`rows below a key need a key`). */
  disabled?: boolean;
  /** Empty-state text next to a disabled +, e.g. "add a key first". */
  disabledNote?: string;
  variant: 'major' | 'sub' | 'minor';
  /**
   * Renders as an app row: a circular scroller with a pinned add button. Off
   * for the leaf panel's standalone strip, which has no add column.
   */
  grid?: boolean;
  onSelect(id: string): void;
  onAdd(): void;
  onClose?(id: string): void;
}

interface Strip {
  root: HTMLElement;
  render(options: StripOptions): void;
  /** Scrolls the selected tab to the left edge of its row. */
  reveal(activeId?: string | null, smooth?: boolean): void;
}

/** The selected-tab underline lives on the item, so it spans the close button too. */
function itemClass(active: boolean): string {
  return active ? 'tabitem tabitem--active' : 'tabitem';
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function modulo(value: number, period: number): number {
  return period <= 0 ? 0 : ((value % period) + period) % period;
}

export function createStrip(): Strip {
  const root = el('div', { class: 'strip' });

  // Circular-scroller state for grid rows. `offset` is the visual position in
  // pixels; every real tab is placed by wrapping its own slot around one cycle.
  let trackEl: HTMLElement | null = null;
  let baseCycleEl: HTMLElement | null = null;
  let lastOptions: StripOptions | null = null;
  let cycleItems: HTMLElement[] = [];
  let tabWidth = 0;
  let stepWidth = 0;
  let cycleWidth = 0;
  let offset = 0;
  let frame = 0;
  let animFrom = 0;
  let animDelta = 0;
  let animStart = 0;
  let animTarget = 0;
  let animCycle = 0;

  const stopAnimation = (): void => {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const paint = (): void => {
    if (cycleWidth <= 0 || tabWidth <= 0) return;
    const current = modulo(offset, cycleWidth);
    for (const item of cycleItems) {
      const index = Number(item.dataset.index);
      if (!Number.isFinite(index)) continue;
      const natural = index * stepWidth;
      // Wrap only once the tab is fully clear of the left edge. One DOM node per
      // tab, so it is never visible twice.
      const visual = modulo(natural - current + tabWidth, cycleWidth) - tabWidth;
      item.style.transform = `translate3d(${visual - natural}px, 0, 0)`;
    }
  };

  /** Re-measures a rendered row. */
  const layout = (): void => {
    if (trackEl === null || baseCycleEl === null || lastOptions === null) return;
    const sample = baseCycleEl.querySelector<HTMLElement>('.tabitem');
    if (sample === null) return;
    tabWidth = sample.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(trackEl).columnGap) || 0;
    if (tabWidth <= 0) return;
    stepWidth = tabWidth + gap;
    cycleWidth = lastOptions.tabs.length * stepWidth;
  };

  const setOffset = (target: number): void => {
    stopAnimation();
    offset = modulo(target, cycleWidth);
    paint();
  };

  const animateTo = (target: number): void => {
    if (cycleWidth <= 0) return;
    const current = modulo(offset, cycleWidth);
    let delta = target - current;
    if (delta > cycleWidth / 2) delta -= cycleWidth;
    else if (delta < -cycleWidth / 2) delta += cycleWidth;
    if (Math.abs(delta) < 0.5) {
      setOffset(target);
      return;
    }
    if (frame !== 0 && Math.abs(animTarget - target) < 0.5 && Math.abs(animCycle - cycleWidth) < 0.5) {
      paint();
      return;
    }

    stopAnimation();
    animFrom = current;
    animDelta = delta;
    animStart = performance.now();
    animTarget = target;
    animCycle = cycleWidth;
    const duration = Math.min(520, Math.max(220, Math.abs(delta) * 0.4));
    const tick = (now: number): void => {
      const t = Math.min(1, (now - animStart) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      offset = animFrom + animDelta * eased;
      paint();
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        offset = modulo(animTarget, cycleWidth);
        paint();
      }
    };
    frame = requestAnimationFrame(tick);
  };

  const nudge = (delta: number): void => {
    if (cycleWidth <= 0) return;
    stopAnimation();
    offset = modulo(offset + delta, cycleWidth);
    paint();
  };

  const render = (options: StripOptions): void => {
    lastOptions = options;
    const grid = options.grid === true;
    // Non-grid strips still use native horizontal scrolling. Carry its offset
    // over before the new list is laid out, so it does not jump to 0.
    const previousScrollLeft = root.querySelector<HTMLElement>('.strip__list')?.scrollLeft ?? 0;
    const focused = document.activeElement;
    let focusTabId: string | null = null;
    let focusClose = false;
    if (focused instanceof HTMLElement && root.contains(focused)) {
      const item = focused.closest('.tabitem');
      const tabButton = item?.querySelector<HTMLButtonElement>('.tab');
      focusTabId = tabButton?.dataset.tabId ?? null;
      focusClose = focused.classList.contains('tab__x');
    }

    const list = el('div', { class: 'strip__list', role: 'tablist', 'aria-label': options.label });
    const baseCycle = grid ? el('div', { class: 'strip__cycle' }) : null;
    const items = baseCycle ?? list;
    const buttons: HTMLButtonElement[] = [];
    cycleItems = [];

    for (const [index, tab] of options.tabs.entries()) {
      const isActive = tab.id === options.activeId && !options.disabled;
      const plain = tab.plain === true;
      const button = el(
        'button',
        {
          type: 'button',
          class: `tab${tab.draft === true ? ' tab--draft' : ''}${tab.section === true ? ' tab--section' : ''}${plain ? ' tab--plain' : ''}`,
          role: 'tab',
          'aria-selected': isActive ? 'true' : 'false',
          tabindex: isActive ? 0 : -1,
          title: tab.title ?? tab.label,
          ...(plain ? { 'aria-label': tab.title ?? 'No selection' } : {}),
        },
        [
          ...(tab.icon === undefined
            ? []
            : [el('img', { class: 'tab__icon', src: tab.icon, alt: '', 'aria-hidden': 'true' })]),
          tab.label,
          ...(tab.mark === undefined ? [] : [el('span', { class: 'tab__mark' }, [tab.mark])]),
        ],
      );
      button.dataset.tabId = tab.id;
      if (options.disabled === true) button.disabled = true;
      button.addEventListener('click', () => options.onSelect(tab.id));

      const itemBase = itemClass(isActive) + (plain ? ' tabitem--plain' : '');
      if (tab.section !== true && !plain && options.onClose !== undefined) {
        const close = el('button', {
          type: 'button',
          class: 'tab__x',
          'aria-label': `Close ${tab.label}`,
          title: `Close ${tab.label}`,
          tabindex: -1,
        }, ['×']);
        close.dataset.closeId = tab.id;
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          options.onClose?.(tab.id);
        });
        const item = el('span', { class: itemBase, role: 'presentation' }, [button, close]);
        item.dataset.index = String(index);
        if (grid) cycleItems.push(item);
        items.append(item);
      } else {
        const item = el('span', { class: itemBase, role: 'presentation' }, [button]);
        item.dataset.index = String(index);
        if (grid) cycleItems.push(item);
        items.append(item);
      }
      buttons.push(button);
    }

    list.addEventListener('keydown', (event) => {
      const index = buttons.findIndex((button) => button === document.activeElement);
      if (index === -1) return;
      const last = buttons.length - 1;
      let next = index;
      if (event.key === 'ArrowRight') next = Math.min(index + 1, last);
      else if (event.key === 'ArrowLeft') next = Math.max(index - 1, 0);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else return;
      event.preventDefault();
      const target = buttons[next];
      if (target === undefined) return;
      target.focus();
      const tab = options.tabs[next];
      if (tab !== undefined) options.onSelect(tab.id);
    });

    if (grid) {
      let dragPointer: number | null = null;
      let dragStartX = 0;
      let dragLastX = 0;
      let dragging = false;
      let suppressClick = false;

      // A completed drag must not select the tab it started on.
      list.addEventListener('click', (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }, true);

      list.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        dragPointer = event.pointerId;
        dragStartX = event.clientX;
        dragLastX = event.clientX;
        dragging = false;
        suppressClick = false;
      });
      list.addEventListener('pointermove', (event) => {
        if (dragPointer !== event.pointerId) return;
        if (!dragging && Math.abs(event.clientX - dragStartX) < 4) return;
        if (!dragging) {
          dragging = true;
          list.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        const dx = event.clientX - dragLastX;
        dragLastX = event.clientX;
        nudge(-dx);
      });
      const endDrag = (event: PointerEvent): void => {
        if (dragPointer !== event.pointerId) return;
        dragPointer = null;
        if (!dragging) return;
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      };
      list.addEventListener('pointerup', endDrag);
      list.addEventListener('pointercancel', endDrag);

      list.addEventListener('wheel', (event) => {
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1;
        let delta = event.deltaX * scale;
        if (Math.abs(delta) < 0.01 && event.shiftKey) delta = event.deltaY * scale;
        if (Math.abs(delta) < 0.01) return;
        event.preventDefault();
        nudge(delta);
      }, { passive: false });
    }

    const add = el('button', {
      type: 'button',
      class: 'tabadd',
      title: options.addTitle,
      'aria-label': options.addTitle,
    }, [options.addLabel]);
    add.disabled = options.addDisabled === true || options.disabled === true;
    add.addEventListener('click', () => options.onAdd());

    const note = options.disabled === true && options.disabledNote !== undefined
      ? el('span', { class: 'strip__note' }, [options.disabledNote])
      : null;

    root.className = `strip strip--${options.variant}${grid ? ' strip--grid' : ''}${options.disabled === true ? ' strip--off' : ''}`;

    if (grid && baseCycle !== null) {
      const oldCycle = cycleWidth;
      const track = el('div', { class: 'strip__track' }, [baseCycle]);
      list.append(track);
      let tail: HTMLElement | null = null;
      if (options.addHidden !== true) {
        // The tail sits outside the tab scroller, so the add button stays on the
        // row's right edge whatever the scroller is doing.
        tail = el('span', { class: 'strip__tail' }, [
          ...(note === null ? [] : [note]),
          add,
        ]);
      }
      root.replaceChildren(list, ...(tail === null ? [] : [tail]));

      trackEl = track;
      baseCycleEl = baseCycle;
      layout();
      if (oldCycle > 0 && Math.abs(oldCycle - cycleWidth) >= 0.5) stopAnimation();
      if (cycleWidth > 0) offset = modulo(offset, cycleWidth);
      paint();
    } else {
      trackEl = null;
      baseCycleEl = null;
      cycleItems = [];
      cycleWidth = 0;
      stepWidth = 0;
      tabWidth = 0;
      // The leaf strip is a plain flex row: note before add, nothing sticky.
      root.replaceChildren(
        list,
        ...(note === null ? [] : [note]),
        ...(options.addHidden === true ? [] : [add]),
      );
      // Put the scroller back where it was before this render.
      void list.scrollWidth;
      list.scrollLeft = previousScrollLeft;
    }

    // Re-rendering replaces every tab. Put keyboard focus back on the same tab
    // (or its close button), otherwise ArrowRight/End drop focus to the body.
    if (focusTabId !== null) {
      const button = buttons.find((candidate) => candidate.dataset.tabId === focusTabId);
      if (button !== undefined) {
        if (focusClose) {
          const item = button.closest('.tabitem');
          const close = item?.querySelector<HTMLButtonElement>('.tab__x');
          (close ?? button).focus({ preventScroll: true });
        } else {
          button.focus({ preventScroll: true });
        }
      }
    }
  };

  const reveal = (activeId: string | null = null, smooth = true): void => {
    if (root.classList.contains('strip--grid')) {
      layout();
      if (baseCycleEl === null || lastOptions === null || stepWidth <= 0 || cycleWidth <= 0) return;
      const buttons = [...baseCycleEl.querySelectorAll<HTMLButtonElement>('.tab')];
      const button = activeId !== null
        ? buttons.find((candidate) => candidate.dataset.tabId === activeId)
        : baseCycleEl.querySelector<HTMLButtonElement>('.tabitem--active .tab');
      const id = button?.dataset.tabId;
      const index = id === undefined ? -1 : lastOptions.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      const target = index * stepWidth;
      if (!smooth || reducedMotion()) setOffset(target);
      else animateTo(target);
      return;
    }

    const scroller = root.querySelector<HTMLElement>('.strip__list');
    if (scroller === null) return;
    const item =
      [...root.querySelectorAll<HTMLElement>('.tabitem')].find((candidate) => {
        const tab = candidate.querySelector<HTMLButtonElement>('.tab');
        return activeId !== null && tab?.dataset.tabId === activeId;
      }) ?? root.querySelector<HTMLElement>('.tabitem--active');
    if (item === null) return;

    // Every tab, empty ones included, slides to the scroller's left edge.
    const target =
      item.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    const desired = Math.max(0, target);
    if (Math.abs(desired - scroller.scrollLeft) < 1) return;

    const behavior = smooth && !reducedMotion() ? 'smooth' : 'auto';
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ left: desired, behavior });
    } else {
      // Older/incomplete DOM implementations (and jsdom) lack scrollTo.
      scroller.scrollLeft = desired;
    }
  };

  return { root, render, reveal };
}
