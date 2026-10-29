/**
 * Export manifest and verification models for Phase 4.
 *
 * Defines the contract for XLSX workbook verification and export metadata.
 * In accordance with docs/04_DATA_INTEGRITY_AND_VALIDATION.md:
 *  - Manifest reports aggregate metrics (row counts, column counts, string/number/empty cell counts).
 *  - Verification failures disclose only coordinates (1-based row/column) and generic reason codes,
 *    never leaking sensitive user cell content.
 */

export interface ExportManifest {
  /** Total rows in the generated worksheet (header + data rows). */
  totalRows: number;
  /** Number of data rows (totalRows minus 1 if firstRowIsHeader). */
  dataRows: number;
  /** Total number of columns. */
  columns: number;
  /** Number of cells exported as text (string values). */
  textCells: number;
  /** Number of cells exported as primitive numbers. */
  numberCells: number;
  /** Number of cells that are empty strings. */
  emptyCells: number;
  /** Total verified cells (textCells + numberCells + emptyCells). */
  totalCells: number;
  /** True when full cell-by-cell round-trip read-back verification succeeds. */
  verificationSuccess: boolean;
  /** ISO timestamp when verification passed. */
  verifiedAt: string;
}

export type VerificationFailureReason =
  | 'SHEET_COUNT_MISMATCH'
  | 'SHEET_NAME_MISMATCH'
  | 'ROW_COUNT_MISMATCH'
  | 'COLUMN_COUNT_MISMATCH'
  | 'TYPE_MISMATCH'
  | 'VALUE_MISMATCH'
  | 'FORMULA_DETECTED'
  | 'HYPERLINK_DETECTED'
  | 'UNEXPECTED_CELL'
  | 'CORRUPT_XLSX';

export interface VerificationFailure {
  reason: VerificationFailureReason;
  /** 1-based Excel row coordinate of earliest failure, if applicable. */
  row?: number;
  /** 1-based Excel column coordinate of earliest failure, if applicable. */
  column?: number;
}

export type VerificationResult =
  | { ok: true; manifest: ExportManifest }
  | { ok: false; failure: VerificationFailure };
