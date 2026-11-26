/** Shell context handed to the fixed section views. */

import type { SectionId } from './lib/store.ts';

export type { SectionId };

export interface Ctx {
  /** Show one of the fixed top-row sections (self-check, key tools, phrase lab). */
  section(id: SectionId): void;
  /** Open the key draft tab, optionally pre-filled (Key tools → "Open in Derive"). */
  newKey(pem?: string, passphrase?: string): void;
  /** Clear every tab, key, wallet, card and cached derivation. */
  wipe(): void;
  /** Ask the relays again for this node's kind 0, ignoring what was already asked. */
  searchProfiles(nodeId: string): void;
  /** Session preference: show the wallet private name without its own reveal step. */
  showPrivateName(): boolean;
  setShowPrivateName(value: boolean): void;
}
