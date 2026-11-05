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
  | { id: number; op: 'derive'; pem: string; passphrase: string }
  | { id: number; op: 'throwaway'; seedHex: string; passphrase: string }
  | { id: number; op: 'marshal'; seedHex: string; passphrase: string; rounds: MarshalRounds }
  | { id: number; op: 'selfcheck' };

export type WorkerRequestPayload =
  WorkerRequest extends infer T ? (T extends WorkerRequest ? Omit<T, 'id'> : never) : never;

export type WorkerResult =
  | { op: 'derive'; report: IdentityReport; seedHex: string; elapsedMs: number }
  | {
      op: 'throwaway';
      report: IdentityReport;
      seedHex: string;
      pem: string;
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
