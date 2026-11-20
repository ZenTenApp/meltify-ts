/** Contract shared by the three leaf panels (report, chains, compat). */

import type { Identity } from '../lib/store.ts';

export interface IdentityView {
  root: HTMLElement;
  /** Draws the given identity, or the view's empty state when it is null. */
  render(identity: Identity | null): void;
}
