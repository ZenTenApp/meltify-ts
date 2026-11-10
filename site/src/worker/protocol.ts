/** Message contract between the page and the derive worker. */

import type { IdentityReport } from 'meltify-ts';

export interface CheckRow {
  name: string;
  pass: boolean;
  expected?: string;
  actual?: string;
}

export type MarshalRounds = 1 | 16;

export type WorkerRequest =
  | {
      id: number;
      op: 'derive';
      pem: string;
      passphrase: string;
      bip39Passphrase: string;
      subaccount?: string;
    }
  | {
      id: number;
      op: 'throwaway';
      seedHex: string;
      passphrase: string;
      bip39Passphrase: string;
      subaccount?: string;
    }
  | { id: number; op: 'marshal'; seedHex: string; passphrase: string; rounds: MarshalRounds }
  | { id: number; op: 'selfcheck' };

export type WorkerRequestPayload =
  WorkerRequest extends infer T ? (T extends WorkerRequest ? Omit<T, 'id'> : never) : never;

export type WorkerResult =
  | {
      op: 'derive';
      report: IdentityReport;
      seedHex: string;
      /** Echoed back so the view does not re-read the input; '' = no subaccount. */
      subaccount: string;
      /** Echoed back; the BIP39 passphrase the report was derived with. */
      bip39Passphrase: string;
      /** Re-encoded subaccount PEM; absent when no subaccount was requested. */
      pem?: string;
      elapsedMs: number;
    }
  | {
      op: 'throwaway';
      report: IdentityReport;
      seedHex: string;
      pem: string;
      subaccount: string;
      bip39Passphrase: string;
      elapsedMs: number;
    }
  | { op: 'marshal'; pem: string; keyBodyB64: string; elapsedMs: number }
  | { op: 'selfcheck'; rows: CheckRow[]; elapsedMs: number };

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
}

export type WorkerResponse =
  | ({ id: number; ok: true } & WorkerResult)
  | { id: number; ok: false; error: SerializedError };
