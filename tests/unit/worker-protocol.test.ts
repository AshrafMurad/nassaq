/**
 * Unit tests for the worker protocol client (docs/07 §4 `workerProtocol` row).
 *
 * Covers, with mocked Worker/FileReader globals:
 *  - Pre-read file gate: 0-byte → EMPTY_FILE and >2 MiB → FILE_TOO_LARGE
 *    without reading the file or constructing a worker (docs/02 §4, docs/06 §5).
 *  - Stale jobId messages from a previous job are discarded.
 *  - terminate() kills the worker and discards any later message.
 *  - Worker construction failure surfaces WORKER_UNAVAILABLE.
 *  - exportXlsx without an active job returns false.
 *  - Error messages are passed through untouched (codes + coordinates only).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerClient, type WorkerCallbacks } from '@/lib/worker-client';
import type {
  WorkerMessage,
  WorkerMsgReady,
  WorkerMsgError,
  WorkerMsgProgress,
} from '@/domain/protocol';

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: { data: WorkerMessage }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminated = false;
  posted: Array<{ msg: unknown; transfer?: Transferable[] }> = [];

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(msg: unknown, transfer?: Transferable[]): void {
    this.posted.push({ msg, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulate a worker->main message. */
  emit(msg: WorkerMessage): void {
    this.onmessage?.({ data: msg });
  }
}

class MockFileReader {
  static instances: MockFileReader[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: ArrayBuffer = new ArrayBuffer(8);

  readAsArrayBuffer(): void {
    MockFileReader.instances.push(this);
    this.onload?.();
  }
}

function makeFile(size: number): File {
  return { size, name: 'synthetic.csv' } as unknown as File;
}

interface RecordedCallbacks extends WorkerCallbacks {
  ready: WorkerMsgReady[];
  errors: WorkerMsgError[];
  progress: WorkerMsgProgress[];
}

const cbRef: RecordedCallbacks = {
  ready: [],
  errors: [],
  progress: [],
  onReady: (msg) => {
    cbRef.ready.push(msg);
  },
  onError: (msg) => {
    cbRef.errors.push(msg);
  },
  onProgress: (msg) => {
    cbRef.progress.push(msg);
  },
};

function makeCallbacks(): RecordedCallbacks {
  cbRef.ready = [];
  cbRef.errors = [];
  cbRef.progress = [];
  return cbRef;
}

describe('workerProtocol: WorkerClient', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    MockFileReader.instances = [];
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a 0-byte file with EMPTY_FILE before any read or worker creation', () => {
    const client = new WorkerClient();
    const cb = makeCallbacks();

    client.parse(makeFile(0), { encoding: 'utf-8', firstRowIsHeader: true }, cb);

    expect(cb.errors).toHaveLength(1);
    expect(cb.errors[0]).toMatchObject({ type: 'ERROR', code: 'EMPTY_FILE' });
    expect(MockFileReader.instances).toHaveLength(0);
    expect(MockWorker.instances).toHaveLength(0);
    expect(client.isActive).toBe(false);
  });

  it('rejects an oversized file with FILE_TOO_LARGE before any read', () => {
    const client = new WorkerClient();
    const cb = makeCallbacks();
    const oversize = 2 * 1024 * 1024 + 1;

    client.parse(makeFile(oversize), { encoding: 'utf-8', firstRowIsHeader: true }, cb);

    expect(cb.errors).toHaveLength(1);
    expect(cb.errors[0]).toMatchObject({
      type: 'ERROR',
      code: 'FILE_TOO_LARGE',
      detail: String(oversize),
    });
    expect(MockFileReader.instances).toHaveLength(0);
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('accepts a valid file and posts a PARSE message with the jobId', () => {
    const client = new WorkerClient();
    const cb = makeCallbacks();

    client.parse(makeFile(16), { encoding: 'utf-8', firstRowIsHeader: true }, cb);

    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0];
    expect(worker?.posted).toHaveLength(1);
    const parseMsg = worker?.posted[0]?.msg as { type: string; jobId: string };
    expect(parseMsg.type).toBe('PARSE');
    expect(parseMsg.jobId).toBe(client.currentJobId);
  });

  it('discards stale messages from a previous jobId', () => {
    const client = new WorkerClient();
    const cbA = makeCallbacks();
    const cbB = makeCallbacks();

    client.parse(makeFile(16), { encoding: 'utf-8', firstRowIsHeader: true }, cbA);
    const jobA = client.currentJobId;
    const workerA = MockWorker.instances[0];

    client.parse(makeFile(16), { encoding: 'utf-8', firstRowIsHeader: true }, cbB);
    const jobB = client.currentJobId;
    expect(jobA).not.toBeNull();
    expect(jobB).not.toBeNull();

    // Late READY from the old job must be ignored by the active client
    workerA?.emit({ type: 'READY', jobId: jobA as string, summary: {} as never });

    expect(cbB.ready).toHaveLength(0);
    expect(cbA.ready).toHaveLength(0);
    expect(cbB.errors).toHaveLength(0);
  });

  it('terminate() kills the worker and discards subsequent messages', () => {
    const client = new WorkerClient();
    const cb = makeCallbacks();

    client.parse(makeFile(16), { encoding: 'utf-8', firstRowIsHeader: true }, cb);
    const jobId = client.currentJobId as string;
    const worker = MockWorker.instances[0];

    client.terminate();

    expect(worker?.terminated).toBe(true);
    expect(client.isActive).toBe(false);
    expect(client.currentJobId).toBeNull();

    // A message racing after terminate must not reach callbacks
    worker?.emit({ type: 'READY', jobId, summary: {} as never });
    expect(cb.ready).toHaveLength(0);
    expect(cb.errors).toHaveLength(0);
  });

  it('surfaces WORKER_UNAVAILABLE when the Worker cannot be constructed', () => {
    vi.stubGlobal('Worker', class {
      constructor() {
        throw new Error('worker construction blocked');
      }
    });

    const client = new WorkerClient();
    const cb = makeCallbacks();

    client.parse(makeFile(16), { encoding: 'utf-8', firstRowIsHeader: true }, cb);

    expect(cb.errors).toHaveLength(1);
    expect(cb.errors[0]).toMatchObject({ type: 'ERROR', code: 'WORKER_UNAVAILABLE' });
    expect(client.isActive).toBe(false);
  });

  it('exportXlsx returns false when there is no active worker job', () => {
    const client = new WorkerClient();
    expect(client.exportXlsx({ 0: 'text' }, true)).toBe(false);
  });

  it('passes worker ERROR messages through without adding file content', () => {
    const client = new WorkerClient();
    const cb = makeCallbacks();

    client.parse(makeFile(16), { encoding: 'utf-8', firstRowIsHeader: true }, cb);
    const worker = MockWorker.instances[0];
    worker?.emit({
      type: 'ERROR',
      jobId: client.currentJobId as string,
      code: 'COLUMN_COUNT_MISMATCH',
      detail: 'row 2',
    });

    expect(cb.errors).toHaveLength(1);
    const firstError = cb.errors[0];
    expect(firstError).toBeDefined();
    expect(firstError?.code).toBe('COLUMN_COUNT_MISMATCH');
    expect(firstError?.detail).toBe('row 2');
    // No payload beyond code + safe coordinates
    expect(firstError ? Object.keys(firstError).sort() : []).toEqual([
      'code',
      'detail',
      'jobId',
      'type',
    ]);
  });
});
