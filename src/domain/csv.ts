/**
 * CSV parsing domain logic for the Nassaq import pipeline.
 *
 * Rules (from doc 03_CSV_PARSING_AND_ENCODING.md §4):
 *  - Papa Parse with header:false, dynamicTyping:false, no transforms.
 *  - Preserve all rows; phantom final empty record from trailing newline is removed.
 *  - Empty between delimiters is empty string, not null.
 *  - Uneven rows (field count ≠ first row width) are structural errors to report.
 *  - Limits checked here; caller decides blocking vs. reporting.
 */

import Papa from 'papaparse';
import type { DelimiterChar, ColumnMeta, ParseSummary, PreviewRow } from './protocol';
import { scanTableRisks } from './risks';
import { validateColumnNumeric } from './numeric-policy';
import {
  MAX_COLUMNS,
  MAX_DATA_ROWS,
  MAX_CELLS,
  MAX_CELL_UTF16,
  utf16Length,
} from './limits';

const PREVIEW_ROWS = 20;

/** Per-row parse result before limit/structural checks. */
export interface RawParseResult {
  /** All records returned by Papa Parse (string[][]). */
  records: string[][];
  /** Parser errors (e.g. malformed quotes). */
  errors: Papa.ParseError[];
}

/**
 * Parse the decoded CSV text using Papa Parse with strict settings.
 * Returns raw records and any parser errors; structural validation is separate.
 */
export function parseRawCsv(text: string, delimiter: DelimiterChar): RawParseResult {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    comments: false,
    fastMode: false,
    // No transform or transformHeader — preserve values exactly
  });

  return {
    records: result.data,
    errors: result.errors,
  };
}

/**
 * Remove a phantom trailing empty record produced by a terminal record separator.
 *
 * Papa Parse may emit a final [""] record when the text ends with a newline.
 * We remove it ONLY when:
 *  - The last record is exactly [""] (single empty-string field)
 *  - The text ends with \n or \r\n (or \r)
 *  - There is more than one record (so we don't destroy a single-record file)
 *
 * We do NOT remove a genuine intentionally blank record in the middle of the data.
 */
export function removePhantomTrailingRecord(
  records: string[][],
  decodedText: string,
): string[][] {
  if (records.length <= 1) return records;

  const last = records[records.length - 1];
  if (!last || last.length !== 1 || last[0] !== '') return records;

  // Check that text ends with a newline (terminal separator)
  const trimmed = decodedText.trimEnd();
  const endsWithNewline = decodedText.length > trimmed.length;
  if (!endsWithNewline) return records;

  // Remove the phantom record
  return records.slice(0, -1);
}

/** Outcome of the full structural validation step. */
export type CsvValidateResult =
  | {
      ok: true;
      summary: ParseSummary;
      /** Full table (all rows including header), for worker-side storage. */
      table: string[][];
    }
  | {
      ok: false;
      code:
        | 'MALFORMED_CSV'
        | 'ZERO_COLUMNS'
        | 'LIMIT_EXCEEDED'
        | 'CELL_TOO_LONG'
        | 'NO_DATA_ROWS';
      detail?: string;
    };

/**
 * Validate and build a ParseSummary from raw parse results.
 *
 * @param records   Raw records from parseRawCsv (after phantom removal).
 * @param errors    Parser errors from Papa Parse.
 * @param delimiter Confirmed delimiter.
 * @param encoding  Encoding used to decode the file.
 * @param hadBom    Whether a UTF-8 BOM was detected.
 * @param delimiterConfident  Whether delimiter was auto-detected with confidence.
 * @param firstRowIsHeader    Whether the first row is treated as a header.
 */
export function validateAndSummarize(
  records: string[][],
  errors: Papa.ParseError[],
  delimiter: DelimiterChar,
  encoding: import('./protocol').SupportedEncoding,
  hadBom: boolean,
  delimiterConfident: boolean,
  firstRowIsHeader: boolean,
): CsvValidateResult {
  // Check for malformed CSV (e.g. missing closing quote)
  const fatalErrors = errors.filter((e) => e.type === 'Quotes');
  if (fatalErrors.length > 0) {
    const first = fatalErrors[0];
    return {
      ok: false,
      code: 'MALFORMED_CSV',
      detail: `row ${(first?.row ?? 0) + 1}`,
    };
  }

  if (records.length === 0) {
    return { ok: false, code: 'NO_DATA_ROWS' };
  }

  // Determine column count from first record
  const firstRecord = records[0];
  if (!firstRecord) {
    return { ok: false, code: 'NO_DATA_ROWS' };
  }
  const columns = firstRecord.length;

  if (columns === 0) {
    return { ok: false, code: 'ZERO_COLUMNS' };
  }
  if (columns > MAX_COLUMNS) {
    return {
      ok: false,
      code: 'LIMIT_EXCEEDED',
      detail: `${columns} columns exceeds max ${MAX_COLUMNS}`,
    };
  }

  // Split header vs. data records
  const headerRecord = firstRowIsHeader ? firstRecord : null;
  const dataRecords = firstRowIsHeader ? records.slice(1) : records;

  const dataRows = dataRecords.length;
  const totalRows = records.length;

  if (dataRows === 0) {
    return { ok: false, code: 'NO_DATA_ROWS' };
  }
  if (dataRows > MAX_DATA_ROWS) {
    return {
      ok: false,
      code: 'LIMIT_EXCEEDED',
      detail: `${dataRows} data rows exceeds max ${MAX_DATA_ROWS}`,
    };
  }

  const totalCells = dataRows * columns;
  if (totalCells > MAX_CELLS) {
    return {
      ok: false,
      code: 'LIMIT_EXCEEDED',
      detail: `${totalCells} cells exceeds max ${MAX_CELLS}`,
    };
  }

  // Scan cells: check length cap and detect uneven rows
  const unevenRowIndices: number[] = [];
  let hasUnevenRows = false;

  for (let r = 0; r < dataRecords.length; r++) {
    const row = dataRecords[r];
    if (!row) continue;

    // 1-based row index in the CSV (data rows start at row 2 when there's a header)
    const csvRow = firstRowIsHeader ? r + 2 : r + 1;

    if (row.length !== columns) {
      hasUnevenRows = true;
      if (unevenRowIndices.length < 10) unevenRowIndices.push(csvRow);
    }

    for (let c = 0; c < row.length; c++) {
      const cell = row[c] ?? '';
      if (utf16Length(cell) > MAX_CELL_UTF16) {
        return {
          ok: false,
          code: 'CELL_TOO_LONG',
          detail: `row ${csvRow}, column ${c + 1}`,
        };
      }
    }
  }

  // Header labels
  const headerLabels: string[] = [];
  for (let c = 0; c < columns; c++) {
    headerLabels.push(headerRecord ? (headerRecord[c] ?? '') : '');
  }

  // Scan risks across the entire table
  const riskAnalysis = scanTableRisks(records, firstRowIsHeader);

  // Column metadata (non-empty count, numeric validation, risk counts from data rows only)
  const rowOffset = firstRowIsHeader ? 2 : 1;
  const columnMeta: ColumnMeta[] = [];

  for (let c = 0; c < columns; c++) {
    const colValues = dataRecords.map((r) => r[c] ?? '');
    const numValidation = validateColumnNumeric(colValues, rowOffset);
    const colRisks = riskAnalysis.columnRisks[c] ?? {
      LEADING_ZERO: 0,
      LONG_NUMBER: 0,
      DATE_SHAPED: 0,
      SCIENTIFIC_NOTATION: 0,
      DECIMAL_SEPARATOR_AMBIGUITY: 0,
      FORMULA_LIKE: 0,
      MIXED_DIRECTION: 0,
    };

    let nonEmptyCount = 0;
    for (const val of colValues) {
      if (val !== '') nonEmptyCount++;
    }

    columnMeta.push({
      index: c,
      label: headerLabels[c] ?? '',
      nonEmptyCount,
      isNumericEligible: numValidation.eligible,
      numericIneligibleReason: numValidation.primaryReason,
      numericIneligibleSampleRows: numValidation.failedRowIndices,
      riskCounts: colRisks,
    });
  }

  // Preview: first 20 data rows, padded to `columns` width
  const previewRows: PreviewRow[] = dataRecords
    .slice(0, PREVIEW_ROWS)
    .map((row) => {
      const padded: string[] = [];
      for (let c = 0; c < columns; c++) {
        padded.push(row[c] ?? '');
      }
      return padded;
    });

  const summary: ParseSummary = {
    encoding,
    hadBom,
    delimiter,
    delimiterConfident,
    firstRowIsHeader,
    totalRows,
    dataRows,
    columns,
    headerLabels,
    columnMeta,
    previewRows,
    totalCells,
    hasUnevenRows,
    unevenRowIndices,
    riskSummary: riskAnalysis.summary,
    totalRisks: riskAnalysis.totalRisks,
  };

  return { ok: true, summary, table: records };
}
