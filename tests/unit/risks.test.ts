import { describe, it, expect } from 'vitest';
import { scanCellRisks, scanTableRisks } from '@/domain/risks';

describe('risks: scanCellRisks', () => {
  it('returns empty array for safe standard values', () => {
    expect(scanCellRisks('')).toEqual([]);
    expect(scanCellRisks('Hello World')).toEqual([]);
    expect(scanCellRisks('مرحبا بالعالم')).toEqual([]);
    expect(scanCellRisks('42')).toEqual([]);
    expect(scanCellRisks('2.5')).toEqual([]);
    expect(scanCellRisks('-17')).toEqual([]);
  });

  it('detects leading zeros and phone-like patterns', () => {
    expect(scanCellRisks('00123')).toContain('LEADING_ZERO');
    expect(scanCellRisks('0123456789')).toContain('LEADING_ZERO');
    expect(scanCellRisks('٠١٢٣')).toContain('LEADING_ZERO');
    expect(scanCellRisks('+966501234567')).toContain('LEADING_ZERO');
  });

  it('detects long ASCII digit sequences', () => {
    expect(scanCellRisks('12345678901234567890')).toContain('LONG_NUMBER');
  });

  it('detects date-shaped tokens', () => {
    expect(scanCellRisks('03-04')).toContain('DATE_SHAPED');
    expect(scanCellRisks('01/02/2026')).toContain('DATE_SHAPED');
    expect(scanCellRisks('2026-01-02')).toContain('DATE_SHAPED');
  });

  it('detects scientific notation', () => {
    expect(scanCellRisks('1e12')).toContain('SCIENTIFIC_NOTATION');
    expect(scanCellRisks('2.5E-4')).toContain('SCIENTIFIC_NOTATION');
  });

  it('detects decimal comma ambiguity', () => {
    expect(scanCellRisks('1,25')).toContain('DECIMAL_SEPARATOR_AMBIGUITY');
    expect(scanCellRisks('0,5')).toContain('DECIMAL_SEPARATOR_AMBIGUITY');
  });

  it('detects formula-like prefixes with or without invisible whitespace', () => {
    expect(scanCellRisks('=SUM(A1:A2)')).toContain('FORMULA_LIKE');
    expect(scanCellRisks('  =1+1')).toContain('FORMULA_LIKE');
    expect(scanCellRisks('\t+SUM(1,2)')).toContain('FORMULA_LIKE');
    expect(scanCellRisks('@username')).toContain('FORMULA_LIKE');
    expect(scanCellRisks('-SUM(A1:A2)')).toContain('FORMULA_LIKE');
  });

  it('detects mixed-direction text (Arabic + Latin)', () => {
    expect(scanCellRisks('Invoice رقم 123')).toContain('MIXED_DIRECTION');
    expect(scanCellRisks('أحمد Smith')).toContain('MIXED_DIRECTION');
  });
});

describe('risks: scanTableRisks', () => {
  it('aggregates summary and column risk counts, respecting header row', () => {
    const table = [
      ['ID', 'Code', 'Amount'],
      ['001', '03-04', '=1+1'],
      ['002', 'normal', '10'],
    ];

    const result = scanTableRisks(table, true);
    expect(result.summary.LEADING_ZERO).toBe(2);
    expect(result.summary.DATE_SHAPED).toBe(1);
    expect(result.summary.FORMULA_LIKE).toBe(1);
    expect(result.totalRisks).toBe(4);

    expect(result.columnRisks[0]?.LEADING_ZERO).toBe(2);
    expect(result.columnRisks[1]?.DATE_SHAPED).toBe(1);
    expect(result.columnRisks[2]?.FORMULA_LIKE).toBe(1);
  });
});
