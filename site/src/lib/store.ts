/** Single source of truth for the derived identity. In memory only, never persisted. */

import type { IdentityReport } from 'meltify-ts';

export interface Identity {
  report: IdentityReport;
  seedHex: string;
  /** Wall time of the key-unlock + derive in the worker. */
  elapsedMs: number;
  /** Where it came from, for the status line. */
  source: string;
  /** Subaccount label the report was derived for; '' when it is the source key. */
  subaccount: string;
  /**
   * BIP39 passphrase the report was derived with; '' when it was left empty (the
   * standard derivation). Optional in the site and in the core, but the Derive
   * view recommends it, and the Report tab needs it to say which derivation the
   * addresses come from.
   */
  bip39Passphrase: string;
  /** Re-encoded subaccount PEM (same passphrase, bcrypt rounds 1); absent for the source key. */
  subaccountPem?: string;
  derivedAt: number;
}

export interface AppState {
  identity: Identity | null;
}

type Listener = (state: AppState) => void;

const listeners = new Set<Listener>();
let identity: Identity | null = null;

export function getState(): AppState {
  return { identity };
}

export function setIdentity(next: Identity): void {
  identity = next;
  emit();
}

export function clearIdentity(): void {
  identity = null;
  emit();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(getState());
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  const state = getState();
  for (const listener of listeners) listener(state);
}
