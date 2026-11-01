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
 *   1. Builds the effective table (original records + approved diffs)
 *   2. Generates single 'Data' sheet XLSX via ExcelJS
 *   3. Re-loads the buffer and verifies all dimensions, cell types, values, formula absence
 *   4. Transfers verified buffer and manifest via EXPORT_READY on 100% pass
 *   5. Fails closed with VERIFY_FAILED on any mismatch
 *
 * Receives an APPLY_EDITS request (Phase 6):
 *   1. Rebuilds the effective table from immutable originals + the submitted
 *      approved diff list (fail-closed validation per docs/04 §1a)
 *   2. Re-runs risk scan, suggestions and numeric eligibility over it
 *   3. Answers EDITS_APPLIED with a fresh ParseSummary (≤20 preview rows);
 *      the full table never crosses to the UI
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
import { revalidateNumericExport } from '@/domain/numeric-policy';
import { applyEdits, type CellEdit } from '@/domain/repairs';
import { generateAndVerifyXlsx } from './xlsx-adapter';

interface ActiveJob {
  jobId: string;
  /** Immutable parsed records; never mutated after parse (docs/04 §1a). */
  records: string[][];
  /** Approved cell diffs in confirmation order (empty after fresh parse). */
  approvedEdits: CellEdit[];
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
    return;
  }

  if (req.type === 'APPLY_EDITS') {
    handleApplyEdits(req.jobId, req.edits);
  }
};

/**
 * Phase 6: replaces the approved diff list, rebuilds the effective table,
 * and answers with a fresh summary over original + approved diffs.
 * The full desired list is submitted each time, so undo/redo re-sync is
 * the same code path as an initial apply. Fails closed on any invalid diff.
 */
function handleApplyEdits(jobId: string, edits: CellEdit[]): void {
  if (!activeJob || activeJob.jobId !== jobId) {
    post({ type: 'ERROR', jobId, code: 'EDIT_CONFLICT', detail: 'JOB_MISMATCH' });
    return;
  }

  const applied = applyEdits(activeJob.records, edits);
  if (!applied.ok) {
    post({
      type: 'ERROR',
      jobId,
      code: applied.failure.code,
      detail: `row ${applied.failure.row + 1}, column ${applied.failure.col + 1}`,
    });
    return;
  }

  // Re-run structural validation, risk scan, numeric eligibility and
  // suggestion generation over the effective table (docs/04 §1a-4).
  const result = validateAndSummarize(
    applied.effective,
    [],
    activeJob.summary.delimiter,
    activeJob.summary.encoding,
    activeJob.summary.hadBom,
    activeJob.summary.delimiterConfident,
    activeJob.summary.firstRowIsHeader,
  );
  if (!result.ok) {
    // Cannot happen for value-only edits that passed cap validation;
    // fail closed rather than deliver a table that fails checks.
    post({ type: 'ERROR', jobId, code: result.code, detail: result.detail });
    return;
  }

  const summary: ParseSummary = {
    ...result.summary,
    appliedEditCount: edits.length,
  };

  activeJob = { ...activeJob, approvedEdits: [...edits], summary };

  const msg: WorkerMessage = {
    type: 'EDITS_APPLIED',
    jobId,
    appliedCount: edits.length,
    summary,
  };
  post(msg);
}

function handleParse(
  jobId: string,
  buffer: ArrayBuffer,
  requestedEncoding: SupportedEncoding,
  requestedDelimiter: DelimiterChar | undefined,
  firstRowIsHeader: boolean,
): void {
  // ── Phase 1: File size cap ─────────────────────────────────────────────
  // Defense-in-depth: the main thread gates File.size before reading, but the
  // worker re-checks the transferred buffer (docs/02 §4, docs/06 §5).
  if (buffer.byteLength === 0) {
    post({ type: 'ERROR', jobId, code: 'EMPTY_FILE' });
    return;
  }
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
    approvedEdits: [],
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

  // Phase 6: build the effective table (original + approved diffs). Fail
  // closed if any approved diff no longer matches — export must never use a
  // table that differs from what the user confirmed (docs/04 §1a-5).
  const effective = applyEdits(activeJob.records, activeJob.approvedEdits);
  if (!effective.ok) {
    post({
      type: 'ERROR',
      jobId,
      code: effective.failure.code,
      detail: `row ${effective.failure.row + 1}, column ${effective.failure.col + 1}`,
    });
    return;
  }
  const exportRecords = effective.effective;

  // Defense-in-depth (docs/04 §3): never trust UI-supplied column types.
  // Re-run the strict entire-column numeric gate inside the worker against
  // the EFFECTIVE table, so an edit cannot smuggle an ineligible value into
  // a Number column.
  const revalidation = revalidateNumericExport(
    exportRecords,
    columnTypes,
    firstRowIsHeader,
  );
  if (!revalidation.ok) {
    post({
      type: 'ERROR',
      jobId,
      code: 'EXPORT_FAILED',
      detail: `INVALID_NUMBER:${revalidation.failedColumnIndex ?? -1}`,
    });
    return;
  }

  post({ type: 'PROGRESS', jobId, phase: 'generating-xlsx' });

  // The adapter verifies the generated workbook against these effective
  // records cell-by-cell (verify.ts strength unchanged, docs/04 §1a-5).
  const result = await generateAndVerifyXlsx(
    exportRecords,
    columnTypes,
    firstRowIsHeader,
    // Surface the verification sub-phase so the UI can show "Verifying cells"
    (phase) => post({ type: 'PROGRESS', jobId, phase }),
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
