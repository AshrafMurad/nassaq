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
 * The worker does NOT automatically discard stale results; the client terminates
 * and recreates the worker for each new job to ensure cancellation.
 */

import type {
  WorkerRequest,
  WorkerMessage,
  SupportedEncoding,
  DelimiterChar,
} from '@/domain/protocol';
import { MAX_FILE_BYTES } from '@/domain/limits';
import {
  detectAndDecodeUtf8,
  decodeWithEncoding,
  hasBinaryContent,
} from '@/domain/encoding';
import { detectDelimiter } from '@/domain/delimiter';
import { parseRawCsv, removePhantomTrailingRecord, validateAndSummarize } from '@/domain/csv';

function post(msg: WorkerMessage): void {
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  if (req.type === 'CANCEL') {
    // Worker is terminated externally; nothing to do.
    return;
  }

  if (req.type === 'PARSE') {
    handleParse(req.jobId, req.buffer, req.encoding, req.delimiter, req.firstRowIsHeader);
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

  // ── Phase 7: Ready ────────────────────────────────────────────────────
  post({ type: 'READY', jobId, summary: result.summary });
}
