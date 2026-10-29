/**
 * Strict entire-column numeric gate for Nassaq.
 *
 * Specification: docs/04_DATA_INTEGRITY_AND_VALIDATION.md §3
 *
 * Rules:
 *  1. Empty strings remain text and are acceptable (never coerced to 0).
 *  2. ASCII-only canonical decimal grammar: ^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$
 *  3. Integers must be safe integers: Number.isSafeInteger(Number(token)).
 *  4. At most 15 significant decimal digits (counted from first nonzero digit, or 1 for all zero).
 *  5. Integer digit run >= 16 is rejected (identifier-risk shape).
 *  6. Lexical round-trip preservation: Number.isFinite(num) && String(num) === token.
 *  7. If any non-empty cell fails, the whole column is ineligible.
 *     Up to 5 first offending 1-based row indices are returned (NO cell content).
 */

export const CANONICAL_DECIMAL_REGEX = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export type NumericRejectionReason =
  | 'EMPTY_COLUMN'
  | 'NON_CANONICAL_GRAMMAR'
  | 'UNSAFE_INTEGER'
  | 'SIGNIFICANT_DIGITS_EXCEEDED'
  | 'IDENTIFIER_RISK'
  | 'LEXICAL_ROUNDTRIP_MISMATCH';

export interface CellNumericValidation {
  valid: boolean;
  reason?: NumericRejectionReason;
}

/**
 * Counts significant decimal digits from the first nonzero digit.
 * For all-zero values (e.g. "0"), returns 1.
 */
export function countSignificantDigits(token: string): number {
  // Strip optional leading minus and decimal point
  const digitsOnly = token.replace(/^-/, '').replace('.', '');
  // Find first nonzero digit
  const firstNonZero = digitsOnly.search(/[1-9]/);
  if (firstNonZero === -1) {
    return 1;
  }
  return digitsOnly.slice(firstNonZero).length;
}

/**
 * Validates a single cell token according to the strict numeric gate.
 * Empty string is valid (remains text).
 */
export function validateCellNumeric(token: string): CellNumericValidation {
  if (token === '') {
    return { valid: true };
  }

  // 1. Strict canonical decimal grammar
  if (!CANONICAL_DECIMAL_REGEX.test(token)) {
    return { valid: false, reason: 'NON_CANONICAL_GRAMMAR' };
  }

  const isInteger = !token.includes('.');
  const digitsOnly = token.replace(/^-/, '').replace('.', '');

  // 2. Identifier risk check: integer digit run >= 16
  if (isInteger && digitsOnly.length >= 16) {
    return { valid: false, reason: 'IDENTIFIER_RISK' };
  }

  // 3. Significant decimal digits cap (<= 15)
  if (countSignificantDigits(token) > 15) {
    return { valid: false, reason: 'SIGNIFICANT_DIGITS_EXCEEDED' };
  }

  const num = Number(token);

  // 4. Safe integer check for integers
  if (isInteger && !Number.isSafeInteger(num)) {
    return { valid: false, reason: 'UNSAFE_INTEGER' };
  }

  // 5. Lexical round-trip preservation: String(Number(token)) === token
  if (!Number.isFinite(num) || String(num) !== token) {
    return { valid: false, reason: 'LEXICAL_ROUNDTRIP_MISMATCH' };
  }

  return { valid: true };
}

export interface ColumnNumericValidation {
  eligible: boolean;
  /** True if the column has at least one non-empty value. */
  hasValues: boolean;
  /** 1-based row indices of up to 5 earliest failures. */
  failedRowIndices: number[];
  /** Rejection reason for the earliest failure. */
  primaryReason?: NumericRejectionReason;
}

/**
 * Validates an entire column of data row values.
 *
 * @param values Array of string cell values for the column (data rows only).
 * @param rowOffset 1-based row offset for reporting (e.g. 2 if row 1 is header, 1 if no header).
 */
export function validateColumnNumeric(
  values: string[],
  rowOffset: number = 1,
): ColumnNumericValidation {
  const failedRowIndices: number[] = [];
  let primaryReason: NumericRejectionReason | undefined;
  let hasValues = false;

  for (let i = 0; i < values.length; i++) {
    const val = values[i] ?? '';
    if (val !== '') {
      hasValues = true;
    }

    const res = validateCellNumeric(val);
    if (!res.valid) {
      if (failedRowIndices.length < 5) {
        failedRowIndices.push(rowOffset + i);
        if (!primaryReason) {
          primaryReason = res.reason;
        }
      }
    }
  }

  // An all-empty column is not converted to number because it has no numeric values
  if (!hasValues) {
    return {
      eligible: false,
      hasValues: false,
      failedRowIndices: [],
      primaryReason: 'EMPTY_COLUMN',
    };
  }

  return {
    eligible: failedRowIndices.length === 0,
    hasValues,
    failedRowIndices,
    primaryReason,
  };
}
