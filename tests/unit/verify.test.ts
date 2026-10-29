import { describe, it, expect } from 'vitest';
import {
  verifyWorkbook,
  type VerifiableWorkbook,
  type VerifiableSheet,
  type VerifiableCell,
} from '@/domain/verify';

function createMockSheet(
  name: string,
  grid: (string | number)[][],
  extraCells: VerifiableCell[] = [],
): VerifiableSheet {
  const cellMap = new Map<string, VerifiableCell>();

  grid.forEach((row, r) => {
    row.forEach((val, c) => {
      const type = typeof val === 'string' ? 'string' : 'number';
      cellMap.set(`${r + 1}:${c + 1}`, {
        row: r + 1,
        col: c + 1,
        type,
        value: val,
      });
    });
  });

  extraCells.forEach((c) => {
    cellMap.set(`${c.row}:${c.col}`, c);
  });

  return {
    name,
    rowCount: grid.length,
    columnCount: grid[0]?.length ?? 0,
    getCell(row: number, col: number): VerifiableCell {
      return (
        cellMap.get(`${row}:${col}`) ?? {
          row,
          col,
          type: 'other',
          value: undefined,
        }
      );
    },
    getAllCells(): VerifiableCell[] {
      return Array.from(cellMap.values());
    },
  };
}

describe('verifyWorkbook domain logic', () => {
  it('passes on exact matching text-only table', () => {
    const records = [
      ['Name', 'Code', 'FormulaLookalike'],
      ['أحمد', '00123', '=1+1'],
      ['John', '03-04', '+SUM(A1)'],
    ];

    const sheet = createMockSheet('Data', records);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.totalRows).toBe(3);
      expect(result.manifest.dataRows).toBe(2);
      expect(result.manifest.columns).toBe(3);
      expect(result.manifest.textCells).toBe(9);
      expect(result.manifest.numberCells).toBe(0);
      expect(result.manifest.emptyCells).toBe(0);
      expect(result.manifest.verificationSuccess).toBe(true);
    }
  });

  it('passes on valid mixed Text and Number columns', () => {
    const records = [
      ['Item', 'Qty', 'Price'],
      ['Widget', '15', '2.5'],
      ['Gadget', '', '100'],
    ];

    const sheet = createMockSheet('Data', [
      ['Item', 'Qty', 'Price'],
      ['Widget', 15, 2.5],
      ['Gadget', '', 100],
    ]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(
      workbook,
      records,
      { 1: 'number', 2: 'number' },
      true,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.totalRows).toBe(3);
      expect(result.manifest.dataRows).toBe(2);
      expect(result.manifest.columns).toBe(3);
      expect(result.manifest.textCells).toBe(5); // Header row (3) + Item col (2)
      expect(result.manifest.numberCells).toBe(3); // 15, 2.5, 100
      expect(result.manifest.emptyCells).toBe(1); // empty cell at row 3 col 2
    }
  });

  it('blocks when sheet count !== 1', () => {
    const records = [['a', 'b']];
    const sheet1 = createMockSheet('Data', records);
    const sheet2 = createMockSheet('Extra', records);
    const workbook: VerifiableWorkbook = { sheets: [sheet1, sheet2] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('SHEET_COUNT_MISMATCH');
    }
  });

  it('blocks when sheet name is not Data', () => {
    const records = [['a', 'b']];
    const sheet = createMockSheet('Sheet1', records);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('SHEET_NAME_MISMATCH');
    }
  });

  it('blocks when row count does not match records length', () => {
    const records = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const sheet = createMockSheet('Data', [['a', 'b']]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('ROW_COUNT_MISMATCH');
    }
  });

  it('blocks when column count does not match record width', () => {
    const records = [['a', 'b', 'c']];
    const sheet = createMockSheet('Data', [['a', 'b']]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('COLUMN_COUNT_MISMATCH');
    }
  });

  it('blocks and reports coordinate on formula cell without leaking content', () => {
    const records = [['formula']];
    const sheet = createMockSheet('Data', [['formula']], [
      {
        row: 1,
        col: 1,
        type: 'formula',
        value: 42,
        formula: 'SUM(1, 2)',
      },
    ]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('FORMULA_DETECTED');
      expect(result.failure.row).toBe(1);
      expect(result.failure.column).toBe(1);
      // Ensure failure object does not contain value or formula text
      expect((result.failure as unknown as { value?: unknown }).value).toBeUndefined();
    }
  });

  it('blocks on hyperlink cell without leaking content', () => {
    const records = [['https://example.com']];
    const sheet = createMockSheet('Data', [['https://example.com']], [
      {
        row: 1,
        col: 1,
        type: 'hyperlink',
        value: 'https://example.com',
        hyperlink: 'https://example.com',
      },
    ]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('HYPERLINK_DETECTED');
      expect(result.failure.row).toBe(1);
      expect(result.failure.column).toBe(1);
    }
  });

  it('blocks when string value has been altered', () => {
    const records = [['00123']];
    // Mutated to number or different string
    const sheet = createMockSheet('Data', [['123']]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('VALUE_MISMATCH');
      expect(result.failure.row).toBe(1);
      expect(result.failure.column).toBe(1);
    }
  });

  it('blocks when unexpected cell is found outside rectangle', () => {
    const records = [['a', 'b']];
    const sheet = createMockSheet('Data', records, [
      {
        row: 5,
        col: 5,
        type: 'string',
        value: 'rogue cell',
      },
    ]);
    const workbook: VerifiableWorkbook = { sheets: [sheet] };

    const result = verifyWorkbook(workbook, records, {}, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('UNEXPECTED_CELL');
      expect(result.failure.row).toBe(5);
      expect(result.failure.column).toBe(5);
    }
  });
});
