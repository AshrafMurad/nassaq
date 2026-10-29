/**
 * Import worker — runs off-thread.
 *
 * Receives a PARSE request, processes bytes through:
 *   1. File size guard (byte cap)
 *   2. Binary content detection
 *   3. Encoding detection / decoding
 *   4. Delimiter detection / confirmation
 *   5. Papa Parse (strict, no transforms)
 *   6. Structural validation and limit checks
 *   7. READY response with summary + preview (full table stays in worker scope)
 *
 * Receives an EXPORT request:
 *   1. Generates single 'Data' sheet XLSX via ExcelJS
 *   2. Re-loads the buffer and verifies all dimensions, cell types, values, formula absence
 *   3. Transfers verified buffer and manifest via EXPORT_READY on 100% pass
 *   4. Fails closed with VERIFY_FAILED on any mismatch
 */

import type {
  WorkerRequest,
  WorkerMessage,
  SupportedEncoding,
  DelimiterChar,
  ParseSummary,
} from '@/domain/protocol';
import { MAX_FILE_BYTES } from '@/domain/limits';
import {
  detectAndDecodeUtf8,
  decodeWithEncoding,
  hasBinaryContent,
} from '@/domain/encoding';
import { detectDelimiter } from '@/domain/delimiter';
import {
  parseRawCsv,
  removePhantomTrailingRecord,
  validateAndSummarize,
} from '@/domain/csv';
import { generateAndVerifyXlsx } from './xlsx-adapter';

interface ActiveJob {
  jobId: string;
  records: string[][];
  summary: ParseSummary;
}

let activeJob: ActiveJob | null = null;

function post(msg: WorkerMessage): void {
  self.postMessage(msg);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.type === 'CANCEL') {
    activeJob = null;
    return;
  }

  if (req.type === 'PARSE') {
    activeJob = null;
    handleParse(
      req.jobId,
      req.buffer,
      req.encoding,
      req.delimiter,
      req.firstRowIsHeader,
    );
    return;
  }

  if (req.type === 'EXPORT') {
    await handleExport(
      req.jobId,
      req.columnTypes,
      req.firstRowIsHeader,
    );
  }
};

function handleParse(
  jobId: string,
  buffer: ArrayBuffer,
  requestedEncoding: SupportedEncoding,
  requestedDelimiter: DelimiterChar | undefined,
  firstRowIsHeader: boolean,
): void {
  // ── Phase 1: File size cap ─────────────────────────────────────────────
  if (buffer.byteLength > MAX_FILE_BYTES) {
    post({
      type: 'ERROR',
      jobId,
      code: 'FILE_TOO_LARGE',
      detail: `${buffer.byteLength}`,
    });
    return;
  }

  // ── Phase 2: Binary detection ──────────────────────────────────────────
  post({ type: 'PROGRESS', jobId, phase: 'decoding' });

  if (hasBinaryContent(buffer)) {
    post({ type: 'ERROR', jobId, code: 'UNSUPPORTED_FILE' });
    return;
  }

  // ── Phase 3: Encoding / decode ────────────────────────────────────────
  let decoded: string;
  let hadBom = false;
  let actualEncoding: SupportedEncoding = requestedEncoding;

  if (requestedEncoding === 'utf-8') {
    const detect = detectAndDecodeUtf8(buffer);

    if (detect.status === 'utf8-failed') {
      post({ type: 'ERROR', jobId, code: 'DECODE_FAILED', detail: 'utf-8' });
      return;
    }

    decoded = detect.decoded;
    hadBom = detect.hadBom;

    // Non-ASCII UTF-8 without BOM: send review notice (informational, not blocking)
    if (detect.status === 'utf8-ok' && detect.hasNonAscii) {
      post({
        type: 'ENCODING_REVIEW',
        jobId,
        reason: 'non-ascii-utf8',
        preview: decoded.slice(0, 500),
      });
    }
  } else {
    // Manual encoding selection
    try {
      decoded = decodeWithEncoding(buffer, requestedEncoding);
      actualEncoding = requestedEncoding;
    } catch {
      post({
        type: 'ERROR',
        jobId,
        code: 'DECODE_FAILED',
        detail: requestedEncoding,
      });
      return;
    }
  }

  // ── Phase 4: Delimiter detection ────────────────────────────────────────
  post({ type: 'PROGRESS', jobId, phase: 'detecting-delimiter' });

  let confirmedDelimiter: DelimiterChar;
  let delimiterConfident: boolean;

  if (requestedDelimiter !== undefined) {
    // User has explicitly chosen a delimiter; use it directly.
    confirmedDelimiter = requestedDelimiter;
    delimiterConfident = true;
  } else {
    const detected = detectDelimiter(decoded);

    if (detected.status === 'review') {
      post({
        type: 'DELIMITER_REVIEW',
        jobId,
        reason: detected.reason,
        candidates: detected.candidates.map((c) => ({
          delimiter: c.delimiter,
          consistentRows: c.consistentRows,
        })),
      });
      return;
    }

    confirmedDelimiter = detected.delimiter;
    delimiterConfident = true;
  }

  // ── Phase 5: Parse ────────────────────────────────────────────────────
  post({ type: 'PROGRESS', jobId, phase: 'parsing' });

  const { records: rawRecords, errors } = parseRawCsv(decoded, confirmedDelimiter);
  const records = removePhantomTrailingRecord(rawRecords, decoded);

  // ── Phase 6: Validate ─────────────────────────────────────────────────
  post({ type: 'PROGRESS', jobId, phase: 'validating' });

  const result = validateAndSummarize(
    records,
    errors,
    confirmedDelimiter,
    actualEncoding,
    hadBom,
    delimiterConfident,
    firstRowIsHeader,
  );

  if (!result.ok) {
    post({ type: 'ERROR', jobId, code: result.code, detail: result.detail });
    return;
  }

  // Retain parsed table in worker memory for safe export
  activeJob = {
    jobId,
    records,
    summary: result.summary,
  };

  // ── Phase 7: Ready ────────────────────────────────────────────────────
  post({ type: 'READY', jobId, summary: result.summary });
}

async function handleExport(
  jobId: string,
  columnTypes: Record<number, 'text' | 'number'>,
  firstRowIsHeader: boolean,
): Promise<void> {
  if (!activeJob || activeJob.jobId !== jobId) {
    post({
      type: 'ERROR',
      jobId,
      code: 'EXPORT_FAILED',
      detail: 'JOB_MISMATCH',
    });
    return;
  }

  post({ type: 'PROGRESS', jobId, phase: 'generating-xlsx' });

  const result = await generateAndVerifyXlsx(
    activeJob.records,
    columnTypes,
    firstRowIsHeader,
  );

  if (!result.ok) {
    const detail =
      result.failure.row !== undefined
        ? `${result.failure.reason}:${result.failure.row}:${result.failure.column ?? 0}`
        : result.failure.reason;

    post({
      type: 'ERROR',
      jobId,
      code: 'VERIFY_FAILED',
      detail,
    });
    return;
  }

  // Transfer the generated buffer zero-copy
  const exportMsg: WorkerMessage = {
    type: 'EXPORT_READY',
    jobId,
    buffer: result.buffer,
    manifest: result.manifest,
  };
  (self as unknown as { postMessage(message: unknown, options?: { transfer?: Transferable[] }): void }).postMessage(
    exportMsg,
    { transfer: [result.buffer] },
  );
}
