/**
 * Worker client — manages the import worker lifecycle.
 *
 * Design:
 *  - One worker per active job; terminated (not reused) after each cancel/reset.
 *  - Each job has a unique jobId; stale messages from an old worker are ignored.
 *  - The caller provides typed callbacks; this module handles message dispatch.
 */

import type {
  WorkerMessage,
  WorkerMsgProgress,
  WorkerMsgEncodingReview,
  WorkerMsgDelimiterReview,
  WorkerMsgReady,
  WorkerMsgExportReady,
  WorkerMsgError,
  SupportedEncoding,
  DelimiterChar,
} from '@/domain/protocol';
import { MAX_FILE_BYTES } from '@/domain/limits';

export interface WorkerCallbacks {
  onProgress?: (msg: WorkerMsgProgress) => void;
  onEncodingReview?: (msg: WorkerMsgEncodingReview) => void;
  onDelimiterReview?: (msg: WorkerMsgDelimiterReview) => void;
  onReady: (msg: WorkerMsgReady) => void;
  onExportReady?: (msg: WorkerMsgExportReady) => void;
  onError: (msg: WorkerMsgError) => void;
}

export interface ParseJobOptions {
  encoding: SupportedEncoding;
  delimiter?: DelimiterChar;
  firstRowIsHeader: boolean;
}

/** Manages a single import worker and its active job. */
export class WorkerClient {
  private worker: Worker | null = null;
  private activeJobId: string | null = null;

  /** Start a new parse job. Terminates any existing worker first. */
  parse(file: File, options: ParseJobOptions, callbacks: WorkerCallbacks): string {
    this.terminate();

    const jobId = crypto.randomUUID();
    this.activeJobId = jobId;

    // Pre-read gate (docs/02 §4, docs/06 §5): enforce size and emptiness caps
    // on File.size BEFORE reading anything into memory.
    if (file.size === 0) {
      this.activeJobId = null;
      callbacks.onError({ type: 'ERROR', jobId, code: 'EMPTY_FILE' });
      return jobId;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.activeJobId = null;
      callbacks.onError({
        type: 'ERROR',
        jobId,
        code: 'FILE_TOO_LARGE',
        detail: String(file.size),
      });
      return jobId;
    }

    // Read the file as an ArrayBuffer before spinning up the worker
    const reader = new FileReader();
    reader.onload = () => {
      // Guard: job may have been cancelled during the read
      if (this.activeJobId !== jobId) return;

      const buffer = reader.result as ArrayBuffer;

      try {
        this.worker = new Worker(
          new URL('@/worker/import.worker.ts', import.meta.url),
          { type: 'module' },
        );
      } catch {
        this.activeJobId = null;
        callbacks.onError({ type: 'ERROR', jobId, code: 'WORKER_UNAVAILABLE' });
        return;
      }

      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;
        // Discard stale messages
        if (msg.jobId !== this.activeJobId) return;

        switch (msg.type) {
          case 'PROGRESS':
            callbacks.onProgress?.(msg);
            break;
          case 'ENCODING_REVIEW':
            callbacks.onEncodingReview?.(msg);
            break;
          case 'DELIMITER_REVIEW':
            callbacks.onDelimiterReview?.(msg);
            break;
          case 'READY':
            callbacks.onReady(msg);
            break;
          case 'EXPORT_READY':
            callbacks.onExportReady?.(msg);
            break;
          case 'ERROR':
            callbacks.onError(msg);
            break;
        }
      };

      this.worker.onerror = (err) => {
        if (this.activeJobId !== jobId) return;
        callbacks.onError({
          type: 'ERROR',
          jobId,
          code: 'MALFORMED_CSV',
          detail: err.message,
        });
      };

      // Transfer the buffer (zero-copy)
      this.worker.postMessage(
        {
          type: 'PARSE',
          jobId,
          buffer,
          encoding: options.encoding,
          delimiter: options.delimiter,
          firstRowIsHeader: options.firstRowIsHeader,
        },
        [buffer],
      );
    };

    reader.onerror = () => {
      if (this.activeJobId !== jobId) return;
      callbacks.onError({
        type: 'ERROR',
        jobId,
        code: 'UNSUPPORTED_FILE',
        detail: 'FileReader error',
      });
    };

    reader.readAsArrayBuffer(file);
    return jobId;
  }

  /**
   * Request XLSX generation and verification for the active job.
   */
  exportXlsx(
    columnTypes: Record<number, 'text' | 'number'>,
    firstRowIsHeader: boolean,
  ): boolean {
    if (!this.worker || !this.activeJobId) {
      return false;
    }

    this.worker.postMessage({
      type: 'EXPORT',
      jobId: this.activeJobId,
      columnTypes,
      firstRowIsHeader,
    });
    return true;
  }

  /** Terminate the current worker and discard any active job. */
  terminate(): void {
    this.activeJobId = null;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  get isActive(): boolean {
    return this.activeJobId !== null;
  }

  get currentJobId(): string | null {
    return this.activeJobId;
  }
}
