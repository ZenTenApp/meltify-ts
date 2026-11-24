/**
 * One browser-style tab strip: a `tablist` plus an add button.
 *
 * Used three times (keys, wallets, cards) at three sizes, and once standalone in
 * the leaf panel. The strip owns no state at all; the caller re-renders it from
 * the store. Titles are positional numbers (`Key 1`, `Wallet 1.2`, `Card 1.2.3`),
 * or a key's own OpenSSH comment, so there is nothing to rename in place.
 *
 * The three app strips render with `grid: true`: each is its own horizontal
 * scroller, and selecting a tab slides that row until the tab sits at the left
 * edge. The add button is pinned to the right edge and is one tab wide.
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
   * Renders as an app row: tabs scroll under a pinned add button. Off for the
   * leaf panel's standalone strip, which has no add column.
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

export function createStrip(): Strip {
  const root = el('div', { class: 'strip' });

  const render = (options: StripOptions): void => {
    const grid = options.grid === true;
    // The list is replaced on every render. Carry its scroll offset over before
    // the new list is laid out, otherwise it starts at 0 and reveal() animates
    // from the empty tab instead of from where the row actually was.
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
    const buttons: HTMLButtonElement[] = [];

    for (const tab of options.tabs) {
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
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          options.onClose?.(tab.id);
        });
        list.append(
          el('span', { class: itemBase, role: 'presentation' }, [button, close]),
        );
      } else {
        list.append(el('span', { class: itemBase, role: 'presentation' }, [button]));
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

    if (grid) {
      let tail: HTMLElement | null = null;
      if (options.addHidden !== true) {
        // The tail sits outside the tab scroller, so the add button stays on the
        // row's right edge whatever the scroller is doing.
        tail = el('span', { class: 'strip__tail' }, [
          ...(note === null ? [] : [note]),
          add,
        ]);
      }
      // Trailing space inside the scroller, so even the last tab can slide to
      // the left edge. Without it a scroller stops at its own right edge.
      list.append(el('span', { class: 'strip__end', 'aria-hidden': 'true' }));
      root.replaceChildren(list, ...(tail === null ? [] : [tail]));
    } else {
      // The leaf strip is a plain flex row: note before add, nothing sticky.
      root.replaceChildren(
        list,
        ...(note === null ? [] : [note]),
        ...(options.addHidden === true ? [] : [add]),
      );
    }

    // Put the scroller back where it was before this render. reveal() can then
    // animate from that position to the newly selected tab.
    void list.scrollWidth;
    list.scrollLeft = previousScrollLeft;

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
