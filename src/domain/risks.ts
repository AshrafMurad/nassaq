/**
 * Risk scanner for Nassaq CSV cells and tables.
 *
 * Specification: docs/04_DATA_INTEGRITY_AND_VALIDATION.md §5
 *
 * Scanner output is explanatory only for text columns; it never mutates values
 * or prohibits safe text export. XLSX cell typing guarantees safety.
 */

export type RiskCategory =
  | 'LEADING_ZERO'
  | 'LONG_NUMBER'
  | 'DATE_SHAPED'
  | 'SCIENTIFIC_NOTATION'
  | 'DECIMAL_SEPARATOR_AMBIGUITY'
  | 'FORMULA_LIKE'
  | 'MIXED_DIRECTION';

export const ALL_RISK_CATEGORIES: RiskCategory[] = [
  'LEADING_ZERO',
  'LONG_NUMBER',
  'DATE_SHAPED',
  'SCIENTIFIC_NOTATION',
  'DECIMAL_SEPARATOR_AMBIGUITY',
  'FORMULA_LIKE',
  'MIXED_DIRECTION',
];

// Regex patterns for risk classification
const LEADING_ZERO_WESTERN = /^0[0-9]+(?:\.[0-9]+)?$/;
const LEADING_ZERO_ARABIC = /^٠[٠-٩]+$/;
const PHONE_LIKE = /^(?:\+|00)[0-9]{7,15}$/;
const LONG_ASCII_DIGITS = /^\d{16,}$/;
const DATE_SHAPED_1 = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
const DATE_SHAPED_2 = /^\d{1,2}[-/]\d{1,2}$/;
const SCIENTIFIC_NOTATION = /^-?\d+(?:\.\d+)?[eE][+-]?\d+$/;
const DECIMAL_COMMA = /^-?\d+,\d+$/;
const FORMULA_PREFIX = /^[\s\u0000-\u001F]*[=@]/;
const PLUS_PREFIX = /^[\s\u0000-\u001F]*\+/;
const MINUS_PREFIX = /^[\s\u0000-\u001F]*-/;
const PLAIN_NEGATIVE_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
const LTR_REGEX = /[A-Za-z]/;

/**
 * Scans a single string cell value for risk patterns.
 * Returns an array of detected risk categories (empty if no risks).
 */
export function scanCellRisks(value: string): RiskCategory[] {
  if (value === '') {
    return [];
  }

  const risks: RiskCategory[] = [];

  // 1. Formula-like prefix
  if (FORMULA_PREFIX.test(value) || PLUS_PREFIX.test(value)) {
    risks.push('FORMULA_LIKE');
  } else if (MINUS_PREFIX.test(value) && !PLAIN_NEGATIVE_DECIMAL.test(value)) {
    // Minus followed by non-number expression (e.g. -SUM, -A1, -1+2)
    risks.push('FORMULA_LIKE');
  }

  // 2. Leading zero / phone-like
  if (
    LEADING_ZERO_WESTERN.test(value) ||
    LEADING_ZERO_ARABIC.test(value) ||
    PHONE_LIKE.test(value)
  ) {
    risks.push('LEADING_ZERO');
  }

  // 3. Long ASCII digit sequence (>15 digits)
  if (LONG_ASCII_DIGITS.test(value)) {
    risks.push('LONG_NUMBER');
  }

  // 4. Date-shaped tokens
  if (DATE_SHAPED_1.test(value) || DATE_SHAPED_2.test(value)) {
    risks.push('DATE_SHAPED');
  }

  // 5. Scientific notation
  if (SCIENTIFIC_NOTATION.test(value)) {
    risks.push('SCIENTIFIC_NOTATION');
  }

  // 6. Decimal separator ambiguity (e.g. 1,25)
  if (DECIMAL_COMMA.test(value)) {
    risks.push('DECIMAL_SEPARATOR_AMBIGUITY');
  }

  // 7. Mixed direction text (RTL + LTR)
  if (RTL_REGEX.test(value) && LTR_REGEX.test(value)) {
    risks.push('MIXED_DIRECTION');
  }

  return risks;
}

export interface TableRiskAnalysis {
  summary: Record<RiskCategory, number>;
  totalRisks: number;
  columnRisks: Record<number, Record<RiskCategory, number>>;
}

/**
 * Scans an entire table of records for risk patterns.
 *
 * @param records All parsed rows.
 * @param firstRowIsHeader If true, row index 0 is treated as header and skipped.
 */
export function scanTableRisks(
  records: string[][],
  firstRowIsHeader: boolean,
): TableRiskAnalysis {
  const summary: Record<RiskCategory, number> = {
    LEADING_ZERO: 0,
    LONG_NUMBER: 0,
    DATE_SHAPED: 0,
    SCIENTIFIC_NOTATION: 0,
    DECIMAL_SEPARATOR_AMBIGUITY: 0,
    FORMULA_LIKE: 0,
    MIXED_DIRECTION: 0,
  };

  const columnRisks: Record<number, Record<RiskCategory, number>> = {};
  let totalRisks = 0;

  const startRow = firstRowIsHeader ? 1 : 0;

  for (let r = startRow; r < records.length; r++) {
    const row = records[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      let colObj = columnRisks[c];
      if (!colObj) {
        colObj = {
          LEADING_ZERO: 0,
          LONG_NUMBER: 0,
          DATE_SHAPED: 0,
          SCIENTIFIC_NOTATION: 0,
          DECIMAL_SEPARATOR_AMBIGUITY: 0,
          FORMULA_LIKE: 0,
          MIXED_DIRECTION: 0,
        };
        columnRisks[c] = colObj;
      }

      const val = row[c] ?? '';
      const cellRisks = scanCellRisks(val);
      for (const risk of cellRisks) {
        summary[risk]++;
        colObj[risk]++;
        totalRisks++;
      }
    }
  }

  return {
    summary,
    totalRisks,
    columnRisks,
  };
}
