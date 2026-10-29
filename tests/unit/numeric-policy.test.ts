import { describe, it, expect } from 'vitest';
import {
  validateCellNumeric,
  validateColumnNumeric,
  countSignificantDigits,
} from '@/domain/numeric-policy';

describe('numeric-policy: countSignificantDigits', () => {
  it('handles standard numbers', () => {
    expect(countSignificantDigits('123')).toBe(3);
    expect(countSignificantDigits('-123')).toBe(3);
    expect(countSignificantDigits('123.45')).toBe(5);
  });

  it('handles leading zeros properly', () => {
    expect(countSignificantDigits('0')).toBe(1);
    expect(countSignificantDigits('0.0')).toBe(1);
    expect(countSignificantDigits('0.005')).toBe(1);
    expect(countSignificantDigits('0.00502')).toBe(3);
  });
});

describe('numeric-policy: validateCellNumeric exactness matrix (docs/04 §4)', () => {
  it('accepts empty string as valid text cell', () => {
    expect(validateCellNumeric('')).toEqual({ valid: true });
  });

  it('accepts valid integers within safe integer and 15-digit limits', () => {
    expect(validateCellNumeric('0')).toEqual({ valid: true });
    expect(validateCellNumeric('42')).toEqual({ valid: true });
    expect(validateCellNumeric('-17')).toEqual({ valid: true });
    expect(validateCellNumeric('999999999999999')).toEqual({ valid: true }); // 15 digits
  });

  it('rejects 16-digit integers even if within Number.MAX_SAFE_INTEGER', () => {
    expect(validateCellNumeric('9007199254740991')).toEqual({
      valid: false,
      reason: 'IDENTIFIER_RISK',
    });
  });

  it('accepts valid decimals with lexical roundtrip preservation', () => {
    expect(validateCellNumeric('2.5')).toEqual({ valid: true });
    expect(validateCellNumeric('0.1')).toEqual({ valid: true });
    expect(validateCellNumeric('-3.14159')).toEqual({ valid: true });
  });

  it('blocks leading-zero integers (00123, 0123456789)', () => {
    expect(validateCellNumeric('00123')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
    expect(validateCellNumeric('0123456789')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
  });

  it('blocks long numeric IDs (>15 digits / >=16 digits identifier risk)', () => {
    expect(validateCellNumeric('12345678901234567890')).toEqual({
      valid: false,
      reason: 'IDENTIFIER_RISK',
    });
    expect(validateCellNumeric('9999999999999999')).toEqual({
      valid: false,
      reason: 'IDENTIFIER_RISK',
    });
  });

  it('blocks Arabic-Indic digits', () => {
    expect(validateCellNumeric('٠١٢٣')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
  });

  it('blocks date-shaped tokens (03-04, 1/2/26)', () => {
    expect(validateCellNumeric('03-04')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
    expect(validateCellNumeric('1/2/26')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
  });

  it('blocks trailing-zero decimals that fail lexical roundtrip (2.50, 0.10)', () => {
    expect(validateCellNumeric('2.50')).toEqual({
      valid: false,
      reason: 'LEXICAL_ROUNDTRIP_MISMATCH',
    });
    expect(validateCellNumeric('0.10')).toEqual({
      valid: false,
      reason: 'LEXICAL_ROUNDTRIP_MISMATCH',
    });
    expect(validateCellNumeric('1.00')).toEqual({
      valid: false,
      reason: 'LEXICAL_ROUNDTRIP_MISMATCH',
    });
  });

  it('blocks negative zero (-0)', () => {
    expect(validateCellNumeric('-0')).toEqual({
      valid: false,
      reason: 'LEXICAL_ROUNDTRIP_MISMATCH',
    });
  });

  it('blocks formulas and prefixes (=SUM, +1, @username)', () => {
    expect(validateCellNumeric('=SUM(A1:A2)')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
    expect(validateCellNumeric('+1')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
    expect(validateCellNumeric('@username')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
  });

  it('blocks whitespace-padded numbers', () => {
    expect(validateCellNumeric('  أحمد  ')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
    expect(validateCellNumeric(' 42 ')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
  });

  it('blocks embedded newlines', () => {
    expect(validateCellNumeric('12\n34')).toEqual({
      valid: false,
      reason: 'NON_CANONICAL_GRAMMAR',
    });
  });
});

describe('numeric-policy: validateColumnNumeric', () => {
  it('approves a column with valid numbers and empty strings', () => {
    const col = ['10', '2.5', '', '0', '-99'];
    const result = validateColumnNumeric(col, 2);
    expect(result.eligible).toBe(true);
    expect(result.hasValues).toBe(true);
    expect(result.failedRowIndices).toEqual([]);
  });

  it('rejects an all-empty column', () => {
    const col = ['', '', ''];
    const result = validateColumnNumeric(col, 2);
    expect(result.eligible).toBe(false);
    expect(result.hasValues).toBe(false);
    expect(result.primaryReason).toBe('EMPTY_COLUMN');
  });

  it('rejects a column if even a single value fails', () => {
    const col = ['10', '002', '30'];
    const result = validateColumnNumeric(col, 2);
    expect(result.eligible).toBe(false);
    expect(result.failedRowIndices).toEqual([3]); // rowOffset 2 + index 1 = row 3
    expect(result.primaryReason).toBe('NON_CANONICAL_GRAMMAR');
  });

  it('caps reported failing row indices at 5', () => {
    const col = ['01', '02', '03', '04', '05', '06', '07'];
    const result = validateColumnNumeric(col, 1);
    expect(result.eligible).toBe(false);
    expect(result.failedRowIndices).toEqual([1, 2, 3, 4, 5]);
  });
});
