/**
 * Delimiter auto-detection for the Nassaq import pipeline.
 *
 * Rules (from doc 03_CSV_PARSING_AND_ENCODING.md §3):
 *  - Candidates: comma, semicolon, tab, pipe.
 *  - Sample up to 30 logical records (parsed with Papa Parse, not naïve line-split).
 *  - Score by: most consistent field count across non-empty records, then most columns.
 *  - If top candidates tie, all yield one column, or sample is too short → DELIMITER_REVIEW.
 *  - Never assume comma if detection fails.
 */

import Papa from 'papaparse';
import type { DelimiterChar } from './protocol';

export const DELIMITER_CANDIDATES: DelimiterChar[] = [',', ';', '\t', '|'];
const SAMPLE_ROWS = 30;

export interface DelimiterScore {
  delimiter: DelimiterChar;
  /** Number of non-empty rows where field count equals modal field count. */
  consistentRows: number;
  /** Modal field count (columns) for this delimiter. */
  modalColumns: number;
}

export type DelimiterDetectResult =
  | { status: 'confident'; delimiter: DelimiterChar; score: DelimiterScore }
  | {
      status: 'review';
      reason: 'tie' | 'all-single-column' | 'too-few-records' | 'no-multi-column';
      candidates: DelimiterScore[];
    };

/**
 * Score a single delimiter candidate against the decoded text sample.
 */
function scoreDelimiter(text: string, delimiter: DelimiterChar): DelimiterScore {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    comments: false,
    fastMode: false,
  });

  // Ignore parse errors; take first SAMPLE_ROWS rows
  const rows = result.data.slice(0, SAMPLE_ROWS);

  // Count field widths for non-empty rows (rows that have at least one non-empty field)
  const widthFreq = new Map<number, number>();
  for (const row of rows) {
    // Skip fully-empty rows (Papa returns [[""]] for blank lines with some delimiters)
    if (row.length === 1 && row[0] === '') continue;
    const w = row.length;
    widthFreq.set(w, (widthFreq.get(w) ?? 0) + 1);
  }

  if (widthFreq.size === 0) {
    return { delimiter, consistentRows: 0, modalColumns: 1 };
  }

  // Find modal width
  let modalColumns = 1;
  let modalCount = 0;
  for (const [width, count] of widthFreq) {
    if (count > modalCount || (count === modalCount && width > modalColumns)) {
      modalColumns = width;
      modalCount = count;
    }
  }

  return { delimiter, consistentRows: modalCount, modalColumns };
}

/**
 * Auto-detect the best delimiter for the decoded CSV text.
 * Uses a sample of up to 30 logical records.
 */
export function detectDelimiter(decodedText: string): DelimiterDetectResult {
  const scores = DELIMITER_CANDIDATES.map((d) => scoreDelimiter(decodedText, d));

  // Filter to candidates with parse errors only: Papa Parse doesn't expose
  // structural quote errors directly, so we rely on consistency scoring.

  // Sort: most multi-column consistent rows first.
  // A single-column result (modalColumns === 1) should rank below any multi-column result.
  // Scoring: prefer multi-column first, then consistent rows, then column count.
  const ranked = [...scores].sort((a, b) => {
    const aMulti = a.modalColumns > 1 ? 1 : 0;
    const bMulti = b.modalColumns > 1 ? 1 : 0;
    if (bMulti !== aMulti) return bMulti - aMulti;
    if (b.consistentRows !== a.consistentRows) return b.consistentRows - a.consistentRows;
    return b.modalColumns - a.modalColumns;
  });

  const best = ranked[0];

  // Require at least 1 consistent multi-column record to be confident
  if (!best || best.consistentRows === 0) {
    return {
      status: 'review',
      reason: 'no-multi-column',
      candidates: ranked,
    };
  }

  // Check for ties (same consistentRows and modalColumns)
  const ties = ranked.filter(
    (s) =>
      s.consistentRows === best.consistentRows &&
      s.modalColumns === best.modalColumns,
  );

  if (ties.length > 1) {
    return { status: 'review', reason: 'tie', candidates: ranked };
  }

  // All candidates yield single column → unclear
  if (best.modalColumns === 1) {
    return { status: 'review', reason: 'all-single-column', candidates: ranked };
  }

  return { status: 'confident', delimiter: best.delimiter, score: best };
}

/**
 * Return a human-readable label for a delimiter character.
 */
export function delimiterLabel(d: DelimiterChar): string {
  switch (d) {
    case ',':
      return 'Comma (,)';
    case ';':
      return 'Semicolon (;)';
    case '\t':
      return 'Tab';
    case '|':
      return 'Pipe (|)';
  }
}
