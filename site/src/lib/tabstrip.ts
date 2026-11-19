/**
 * One browser-style tab strip: a `tablist` plus a trailing `+` button.
 *
 * Used three times (keys, wallets, cards) at three sizes. The strip owns no
 * state beyond an in-place rename; the caller re-renders it from the store.
 * Double-click a committed tab to rename it — that edits the label only, never
 * the secret, because changing a secret changes the identity.
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
  /** Static section tab: never closable, never renameable. */
  section?: boolean;
  /**
   * The immutable "nothing selected here" node, drawn first in its row: a green
   * dot and a fixed-width label that names the identity above the row. It can be
   * neither renamed nor closed, because it is not a wallet or a card.
   */
  plain?: boolean;
  /** Draws a divider before this tab (fixed sections | dynamic tabs). */
  dividerBefore?: boolean;
}

export interface StripOptions {
  /** aria-label for the tablist, e.g. "Wallets". */
  label: string;
  tabs: readonly StripTab[];
  activeId: string | null;
  addLabel: string;
  addTitle: string;
  addDisabled?: boolean;
  /** Hides the `+` button (a fixed segmented control, e.g. the leaf panel). */
  addHidden?: boolean;
  /**
   * Divides the row's width evenly between every cell — each tab and the
   * trailing `+` alike (the three shell strips). Off by default, so the leaf
   * panel's segmented control keeps its natural size.
   */
  fill?: boolean;
  /** Dims and disables the whole row (`rows below a key need a key`). */
  disabled?: boolean;
  /** Empty-state text next to a disabled +, e.g. "add a key first". */
  disabledNote?: string;
  variant: 'major' | 'sub' | 'minor';
  onSelect(id: string): void;
  onAdd(): void;
  onClose?(id: string): void;
  onRename?(id: string, label: string): void;
}

interface Strip {
  root: HTMLElement;
  render(options: StripOptions): void;
}

/** The selected-tab underline lives on the item, so it spans the close button too. */
function itemClass(active: boolean): string {
  return active ? 'tabitem tabitem--active' : 'tabitem';
}

export function createStrip(): Strip {
  const root = el('div', { class: 'strip' });
  let current: StripOptions | null = null;
  /** Set while an inline rename input is open, so re-renders do not eat it. */
  let editing: { id: string; input: HTMLInputElement } | null = null;

  const render = (options: StripOptions): void => {
    if (editing !== null) {
      // Keep the input alive; the options in hand are stale once the rename commits.
      current = options;
      return;
    }
    current = options;

    const list = el('div', { class: 'strip__list', role: 'tablist', 'aria-label': options.label });
    const buttons: HTMLButtonElement[] = [];

    for (const tab of options.tabs) {
      if (tab.dividerBefore === true) {
        list.append(el('span', { class: 'tabsep', role: 'presentation', 'aria-hidden': 'true' }));
      }
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
      button.addEventListener('dblclick', () => {
        if (tab.section === true || plain || options.onRename === undefined || options.disabled === true) {
          return;
        }
        beginRename(tab, button);
      });

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
          el('span', { class: itemClass(isActive), role: 'presentation' }, [button, close]),
        );
      } else {
        list.append(el('span', { class: itemClass(isActive), role: 'presentation' }, [button]));
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

    // The plain tab is always there, so label the `+` while the row has nothing else.
    const named = options.tabs.filter((tab) => tab.plain !== true).length;
    const add = el('button', {
      type: 'button',
      class: `tabadd${named === 0 ? ' tabadd--labelled' : ''}`,
      title: options.addTitle,
      'aria-label': options.addTitle,
    }, [options.addLabel]);
    add.disabled = options.addDisabled === true || options.disabled === true;
    add.addEventListener('click', () => options.onAdd());

    root.className = `strip strip--${options.variant}${options.fill === true ? ' strip--fill' : ''}${options.disabled === true ? ' strip--off' : ''}`;
    // A filled row is an even split over every cell: N tabs plus the trailing `+`.
    // The list carries `--strip-tabs` so its grow factor is the tab count, which
    // makes one tab exactly as wide as the `+` beside it.
    if (options.fill === true) root.style.setProperty('--strip-tabs', String(Math.max(options.tabs.length, 1)));
    else root.style.removeProperty('--strip-tabs');
    root.replaceChildren(
      list,
      ...(options.addHidden === true ? [] : [add]),
      ...(options.disabled === true && options.disabledNote !== undefined
        ? [el('span', { class: 'strip__note' }, [options.disabledNote])]
        : []),
    );
  };

  const beginRename = (tab: StripTab, button: HTMLButtonElement): void => {
    const input = el('input', {
      type: 'text',
      class: 'tab__rename',
      value: tab.label,
      'aria-label': `Rename ${tab.label}`,
    });
    editing = { id: tab.id, input };
    button.replaceWith(input);
    input.focus();
    input.select();

    const finish = (commit: boolean): void => {
      if (editing === null || editing.id !== tab.id) return;
      const value = input.value.trim();
      editing = null;
      if (commit && value !== '' && value !== tab.label) current?.onRename?.(tab.id, value);
      // `current` may have advanced while the input was open; redraw from it.
      if (current !== null) render(current);
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  };

  return { root, render };
}
