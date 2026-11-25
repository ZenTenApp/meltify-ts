/**
 * Leaf Settings tab. The only setting is a session-wide switch for the wallet
 * private name; it is mirrored by Info and by the selected wallet panel.
 */

import { el, hint } from '../lib/dom.ts';
import type { Ctx } from '../app-types.ts';

export interface SettingsView {
  root: HTMLElement;
  render(): void;
}

export function mountSettings(ctx: Ctx): SettingsView {
  const checkbox = el('input', { type: 'checkbox', id: 'show-private-name' });
  checkbox.addEventListener('change', () => ctx.setShowPrivateName(checkbox.checked));

  const root = el('section', { class: 'card' }, [
    el('h2', {}, ['Settings']),
    el('label', { class: 'switch', for: 'show-private-name' }, [
      checkbox,
      el('span', {}, ['show private name']),
    ]),
    hint(
      'Shows the wallet private name without a reveal step wherever it appears: Info, the selected wallet panel, and the Report and meltify-info subaccount pills. The key passphrase and card passphrase keep their own reveal buttons.',
    ),
  ]);

  return {
    root,
    render() {
      checkbox.checked = ctx.showPrivateName();
    },
  };
}
