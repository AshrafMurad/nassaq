/**
 * Typed message protocol between the main thread and the import worker.
 * All messages carry a jobId so stale results from a previous job can be
 * discarded before the worker is terminated.
 */

import type { RiskCategory } from './risks';
import type { ExportManifest } from './export-manifest';
import type { CellEdit } from './repairs';
import type { SuggestionItem, SuggestionSet } from './suggestions';

// ---------------------------------------------------------------------------
// Supported encoding identifiers
// ---------------------------------------------------------------------------

export type SupportedEncoding =
  | 'utf-8'
  | 'windows-1256'
  | 'iso-8859-6';

// ---------------------------------------------------------------------------
// Supported delimiter characters
// ---------------------------------------------------------------------------

export type DelimiterChar = ',' | ';' | '\t' | '|';

// ---------------------------------------------------------------------------
// Messages sent FROM the main thread TO the worker
// ---------------------------------------------------------------------------

/** Start a new parse job. The ArrayBuffer is transferred (not copied). */
export interface WorkerRequestParse {
  type: 'PARSE';
  jobId: string;
  /** Raw file bytes transferred from the main thread. */
  buffer: ArrayBuffer;
  encoding: SupportedEncoding;
  /** Explicit delimiter; omit to trigger auto-detection. */
  delimiter?: DelimiterChar;
  firstRowIsHeader: boolean;
}

/** Abort the current job (worker will be terminated by the client). */
export interface WorkerRequestCancel {
  type: 'CANCEL';
  jobId: string;
}

/** Request workbook generation and mandatory verification. */
export interface WorkerRequestExport {
  type: 'EXPORT';
  jobId: string;
  columnTypes: Record<number, 'text' | 'number'>;
  firstRowIsHeader: boolean;
}

/**
 * Phase 6: replace the approved diff list for the active job.
 * The UI always sends the COMPLETE desired diff list (not a delta); the
 * worker rebuilds the effective table as original records + diffs, re-runs
 * risk/suggestion/numeric analysis, and answers EDITS_APPLIED. Any diff that
 * fails validation (stale original, out of bounds, over cap) fails closed.
 */
export interface WorkerRequestApplyEdits {
  type: 'APPLY_EDITS';
  jobId: string;
  /** Complete approved diff list in confirmation order. */
  edits: CellEdit[];
}

/**
 * Phase 6 follow-up: request one bounded page of suggestions over the
 * current effective table. The READY/EDITS_APPLIED summary stays bounded
 * to its first 50 items (docs/04 §5a); this message serves arbitrary
 * further pages without ever transferring the whole list at once.
 */
export interface WorkerRequestGetSuggestions {
  type: 'GET_SUGGESTIONS';
  jobId: string;
  /** 0-based index into the full suggestion list. */
  offset: number;
  /** Page size (bounded by the caller). */
  limit: number;
}

export type WorkerRequest =
  | WorkerRequestParse
  | WorkerRequestCancel
  | WorkerRequestExport
  | WorkerRequestApplyEdits
  | WorkerRequestGetSuggestions;

// ---------------------------------------------------------------------------
// Messages sent FROM the worker TO the main thread
// ---------------------------------------------------------------------------

/** Encoding, parsing, or XLSX generation/verification progress phase indicator. */
export type ProgressPhase =
  | 'decoding'
  | 'detecting-delimiter'
  | 'parsing'
  | 'validating'
  | 'generating-xlsx'
  | 'verifying-xlsx';

export interface WorkerMsgProgress {
  type: 'PROGRESS';
  jobId: string;
  phase: ProgressPhase;
}

/** The worker requires the user to confirm the encoding before continuing. */
export interface WorkerMsgEncodingReview {
  type: 'ENCODING_REVIEW';
  jobId: string;
  /**
   * If the file decoded successfully as UTF-8 but contains non-ASCII bytes,
   * the user should confirm the encoding.
   */
  reason: 'non-ascii-utf8';
  /** First 500 characters of the decoded string for preview. */
  preview: string;
}

/** Delimiter detection result requiring user confirmation. */
export interface WorkerMsgDelimiterReview {
  type: 'DELIMITER_REVIEW';
  jobId: string;
  reason: 'tie' | 'all-single-column' | 'too-few-records' | 'no-multi-column';
  /** Scored candidates in descending confidence order. */
  candidates: Array<{ delimiter: DelimiterChar; consistentRows: number }>;
}

/** A single preview row (first 20 data rows). */
export type PreviewRow = string[];

/** Column-level statistics returned with a successful parse. */
export interface ColumnMeta {
  /** 0-based column index. */
  index: number;
  /** Header label (if firstRowIsHeader), else empty string. */
  label: string;
  /** Total non-empty cells in this column (data rows only). */
  nonEmptyCount: number;
  /** Whether the column meets all strict numeric criteria across all data rows. */
  isNumericEligible: boolean;
  /** Primary rejection reason code if ineligible for number mode. */
  numericIneligibleReason?: string;
  /** 1-based row indices of up to 5 earliest failures. */
  numericIneligibleSampleRows?: number[];
  /** Breakdown of risks in this column. */
  riskCounts: Record<RiskCategory, number>;
}

/** Summary returned when parsing completes successfully. */
export interface ParseSummary {
  /** Encoding used to decode the file. */
  encoding: SupportedEncoding;
  /** Whether a UTF-8 BOM was detected and stripped. */
  hadBom: boolean;
  /** Detected or user-confirmed delimiter. */
  delimiter: DelimiterChar;
  /** True when delimiter was auto-detected with high confidence. */
  delimiterConfident: boolean;
  /** Whether the first row was treated as a header row. */
  firstRowIsHeader: boolean;
  /** Total rows in the parsed table (including header). */
  totalRows: number;
  /** Number of data rows (totalRows minus 1 if firstRowIsHeader). */
  dataRows: number;
  /** Number of columns determined by the width of the first record. */
  columns: number;
  /** Header labels; empty strings when firstRowIsHeader is false. */
  headerLabels: string[];
  /** Per-column statistics. */
  columnMeta: ColumnMeta[];
  /** Up to 20 data rows for preview. */
  previewRows: PreviewRow[];
  /** Total data cells (dataRows × columns). */
  totalCells: number;
  /** Whether the file contained rows with a different field count. */
  hasUnevenRows: boolean;
  /** Row indices (1-based) of the uneven rows, up to 10 reported. */
  unevenRowIndices: number[];
  /** Overall risk summary across all data cells. */
  riskSummary: Record<RiskCategory, number>;
  /** Total number of cell risk flags detected. */
  totalRisks: number;
  /** Phase 6: bounded suggestion list + total count over the effective table. */
  suggestions: SuggestionSet;
  /** Phase 6: number of currently approved cell edits (dirty cells may differ). */
  appliedEditCount: number;
}

/** Parse completed successfully. */
export interface WorkerMsgReady {
  type: 'READY';
  jobId: string;
  summary: ParseSummary;
}

/** XLSX generation and verification completed successfully. */
export interface WorkerMsgExportReady {
  type: 'EXPORT_READY';
  jobId: string;
  buffer: ArrayBuffer;
  manifest: ExportManifest;
}

/**
 * Phase 6: the submitted approved diff list was validated and applied.
 * The fresh summary describes the EFFECTIVE table (original + diffs):
 * preview rows, risk counts, numeric eligibility and suggestions.
 */
export interface WorkerMsgEditsApplied {
  type: 'EDITS_APPLIED';
  jobId: string;
  /** Number of edits accepted in this sync (equal to edits.length). */
  appliedCount: number;
  summary: ParseSummary;
}

/**
 * Phase 6 follow-up: one bounded page of suggestions over the effective
 * table, plus the full total so the UI can paginate without holding the
 * complete list in memory.
 */
export interface WorkerMsgSuggestionsReady {
  type: 'SUGGESTIONS_READY';
  jobId: string;
  items: SuggestionItem[];
  /** Total suggestions across the whole effective table. */
  total: number;
  /** Echoed request window. */
  offset: number;
  limit: number;
}

/** Stable error codes for the import pipeline. */
export type ImportErrorCode =
  | 'DECODE_FAILED'
  | 'MALFORMED_CSV'
  | 'COLUMN_COUNT_MISMATCH'
  | 'LIMIT_EXCEEDED'
  | 'CELL_TOO_LONG'
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'WORKER_UNAVAILABLE'
  | 'ZERO_COLUMNS'
  | 'NO_DATA_ROWS'
  | 'EXPORT_FAILED'
  | 'VERIFY_FAILED'
  | 'EDIT_CONFLICT'
  | 'EDIT_INVALID';

export interface WorkerMsgError {
  type: 'ERROR';
  jobId: string;
  code: ImportErrorCode;
  /** Localization-safe detail: encoding name, 1-based row/column coordinates, etc. */
  detail?: string;
}

export type WorkerMessage =
  | WorkerMsgProgress
  | WorkerMsgEncodingReview
  | WorkerMsgDelimiterReview
  | WorkerMsgReady
  | WorkerMsgExportReady
  | WorkerMsgEditsApplied
  | WorkerMsgSuggestionsReady
  | WorkerMsgError;
