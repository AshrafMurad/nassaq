/**
 * Typed message protocol between the main thread and the import worker.
 * All messages carry a jobId so stale results from a previous job can be
 * discarded before the worker is terminated.
 */

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

export type WorkerRequest = WorkerRequestParse | WorkerRequestCancel;

// ---------------------------------------------------------------------------
// Messages sent FROM the worker TO the main thread
// ---------------------------------------------------------------------------

/** Encoding or parsing progress phase indicator. */
export type ProgressPhase =
  | 'decoding'
  | 'detecting-delimiter'
  | 'parsing'
  | 'validating';

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
}

/** Parse completed successfully. */
export interface WorkerMsgReady {
  type: 'READY';
  jobId: string;
  summary: ParseSummary;
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
  | 'ZERO_COLUMNS'
  | 'NO_DATA_ROWS';

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
  | WorkerMsgError;
