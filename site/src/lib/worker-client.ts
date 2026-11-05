/** Promise wrapper around the derive worker. One worker, lazily created. */

import type {
  SerializedError,
  WorkerRequestPayload,
  WorkerResponse,
  WorkerResult,
} from '../worker/protocol.ts';

/** Injected by `site/build.mjs` (esbuild `define`): the hashed worker URL. */
declare const __WORKER_URL__: string;

export class WorkerCallError extends Error {
  readonly code: string | undefined;

  constructor(error: SerializedError) {
    super(error.message);
    this.name = error.name;
    this.code = error.code;
  }
}

interface Pending {
  resolve: (value: WorkerResult) => void;
  reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker !== null) return worker;

  const url = new URL(__WORKER_URL__, document.baseURI);
  const created = new Worker(url, { type: 'module', name: 'meltify-derive' });

  created.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const slot = pending.get(response.id);
    if (slot === undefined) return;
    pending.delete(response.id);
    if (response.ok) {
      const { id: _id, ok: _ok, ...result } = response;
      slot.resolve(result as WorkerResult);
    } else {
      slot.reject(new WorkerCallError(response.error));
    }
  });

  const failAll = (message: string): void => {
    for (const slot of pending.values()) slot.reject(new Error(message));
    pending.clear();
    created.terminate();
    worker = null;
  };
  created.addEventListener('error', (event) => {
    failAll(event.message === '' ? 'derive worker crashed' : `derive worker: ${event.message}`);
  });
  created.addEventListener('messageerror', () => {
    failAll('derive worker returned an unreadable message');
  });

  worker = created;
  return created;
}

function send(payload: WorkerRequestPayload): Promise<WorkerResult> {
  const target = ensureWorker();
  const id = nextId;
  nextId += 1;
  return new Promise<WorkerResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    target.postMessage({ ...payload, id });
  });
}

export async function deriveFromKey(
  pem: string,
  passphrase: string,
  subaccount = '',
): Promise<Extract<WorkerResult, { op: 'derive' }>> {
  return (await send({ op: 'derive', pem, passphrase, subaccount })) as Extract<
    WorkerResult,
    { op: 'derive' }
  >;
}

export async function deriveThrowaway(
  seedHex: string,
  passphrase: string,
  subaccount = '',
): Promise<Extract<WorkerResult, { op: 'throwaway' }>> {
  return (await send({ op: 'throwaway', seedHex, passphrase, subaccount })) as Extract<
    WorkerResult,
    { op: 'throwaway' }
  >;
}

export async function marshalKey(
  seedHex: string,
  passphrase: string,
  rounds: 1 | 16,
): Promise<Extract<WorkerResult, { op: 'marshal' }>> {
  return (await send({ op: 'marshal', seedHex, passphrase, rounds })) as Extract<
    WorkerResult,
    { op: 'marshal' }
  >;
}

export async function runSelfCheck(): Promise<Extract<WorkerResult, { op: 'selfcheck' }>> {
  return (await send({ op: 'selfcheck' })) as Extract<WorkerResult, { op: 'selfcheck' }>;
}
