/**
 * One browser-style tab strip: a `tablist` plus a trailing add button.
 *
 * Used three times (keys, wallets, cards) at three sizes. The strip owns no
 * state at all; the caller re-renders it from the store. Titles are positional
 * numbers (`Key 1`, `Wallet 1.2`, `Card 1.2.3`), or a key's own OpenSSH comment,
 * so there is nothing to rename in place.
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
  /** Hides the add button (a fixed segmented control, e.g. the leaf panel). */
  addHidden?: boolean;
  /** Dims and disables the whole row (`rows below a key need a key`). */
  disabled?: boolean;
  /** Empty-state text next to a disabled +, e.g. "add a key first". */
  disabledNote?: string;
  variant: 'major' | 'sub' | 'minor';
  onSelect(id: string): void;
  onAdd(): void;
  onClose?(id: string): void;
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

  const render = (options: StripOptions): void => {
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

    root.className = `strip strip--${options.variant}${options.disabled === true ? ' strip--off' : ''}`;
    // The tabs grow into the row, so the add button is pinned to the right with
    // the leftover space between them; the note sits just before the button.
    root.replaceChildren(
      list,
      ...(options.disabled === true && options.disabledNote !== undefined
        ? [el('span', { class: 'strip__note' }, [options.disabledNote])]
        : []),
      ...(options.addHidden === true ? [] : [add]),
    );
  };

  return { root, render };
}
