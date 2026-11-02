/**
 * Minimal DOM helpers. No framework: the app is small enough that a tiny
 * create-element wrapper keeps the bundle flat and the types honest.
 */

export type Child = Node | string | null | undefined | false;

export type Attrs = Record<string, string | number | boolean | undefined | ((event: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') {
      node.addEventListener(key.replace(/^on/, '').toLowerCase(), value);
      continue;
    }
    if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function append(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function must<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector(selector);
  if (found === null) throw new Error(`missing element: ${selector}`);
  return found as unknown as T;
}

export function pill(text: string, tone?: 'ok' | 'bad'): HTMLSpanElement {
  return el('span', { class: tone === undefined ? 'pill' : `pill ${tone}` }, [text]);
}

export function card(title?: string, children: readonly Child[] = [], className = ''): HTMLElement {
  const node = el('section', { class: `card ${className}`.trim() });
  if (title !== undefined) append(node, [el('h2', {}, [title])]);
  append(node, children);
  return node;
}

export function hint(text: string): HTMLParagraphElement {
  return el('p', { class: 'hint tight' }, [text]);
}

export function message(text: string, tone: 'err' | 'ok' | 'warn'): HTMLDivElement {
  return el('div', { class: `msg ${tone}`, role: tone === 'err' ? 'alert' : 'status' }, [text]);
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

let toastTimer = 0;

export function toast(text: string, bad = false): void {
  const node = document.getElementById('toast');
  if (node === null) return;
  node.textContent = text;
  node.className = bad ? 'toast show bad' : 'toast show';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.className = bad ? 'toast bad' : 'toast';
  }, 1600);
}
