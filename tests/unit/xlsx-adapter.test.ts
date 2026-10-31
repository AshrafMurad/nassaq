import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateAndVerifyXlsx } from '@/worker/xlsx-adapter';

describe('xlsx-adapter generateAndVerifyXlsx', () => {
  it.each([true, false])('preserves literal XLSX escapes with header mode %s', async (firstRowIsHeader) => {
    const literals = [
      '_x0041_', '_x000D_', '_x000A_', '_x0009_', '_x0000_', '_x005F_',
      '_x00af_', '_x00aF_', '_xD83D__xDE00_', '_x0041__x000D_',
      '_x0041_x000D_', '_x005F_x0041_', '_x005F_x005F_x0041_',
      'prefix_x0041_suffix', 'نص_x0041_عربي', '=_x0041_+1',
      '<tag>&_x000D_', '  _x0041_  ', '', '_x041_', '_xZZZZ_', '_X0041_',
      '_x0041__', '__x0041_', '_x005f_x000d_',
      '_x0041_'.repeat(4681), // 32,767 source UTF-16 units, before XML escaping
    ];
    const records = [['_x0041_', '_x000D_'], ...literals.map(value => [value, value])];
    const original = records.map(row => [...row]);
    const result = await generateAndVerifyXlsx(records, {}, firstRowIsHeader);

    expect(result.ok).toBe(true);
    expect(records).toEqual(original);
    if (!result.ok) return;

    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(result.buffer);
    const sheet = loaded.getWorksheet('Data');
    expect(sheet?.rowCount).toBe(records.length);
    expect(sheet?.columnCount).toBe(2);
    records.forEach((row, r) => row.forEach((value, c) => {
      const cell = sheet?.getCell(r + 1, c + 1);
      expect(cell?.value).toBe(value);
      expect(cell?.type).toBe(ExcelJS.ValueType.String);
      expect(cell?.formula).toBeUndefined();
      expect(cell?.hyperlink).toBeUndefined();
    }));
  });

  it('generates, reloads, and verifies exact text and numeric values', async () => {
    const records = [
      ['Name', 'Code', 'ID', 'DateLike', 'FormulaLookalike', 'Amount', 'Empty'],
      ['أحمد', '00073', '12345678901234567890', '03-04', '=1+1', '42.5', ''],
      ['سارة', '00100', '98765432109876543210', '12/31/2026', '+SUM(A1)', '-15', ''],
    ];

    const result = await generateAndVerifyXlsx(
      records,
      { 5: 'number' }, // Column 5 is Amount (Number)
      true,            // First row is header
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buffer.byteLength).toBeGreaterThan(0);
      expect(result.manifest.totalRows).toBe(3);
      expect(result.manifest.dataRows).toBe(2);
      expect(result.manifest.columns).toBe(7);
      expect(result.manifest.numberCells).toBe(2); // 42.5, -15
      expect(result.manifest.emptyCells).toBe(2);  // row 2 col 6, row 3 col 6
      expect(result.manifest.verificationSuccess).toBe(true);

      // Verify the generated buffer independently with ExcelJS
      const independent = new ExcelJS.Workbook();
      await independent.xlsx.load(result.buffer);
      const sheet = independent.getWorksheet('Data');
      expect(sheet).toBeDefined();

      // Check row 2 (data row 1)
      expect(sheet?.getCell(2, 1).value).toBe('أحمد');
      expect(sheet?.getCell(2, 1).type).toBe(ExcelJS.ValueType.String);

      // Leading zero preserved as string
      expect(sheet?.getCell(2, 2).value).toBe('00073');
      expect(sheet?.getCell(2, 2).type).toBe(ExcelJS.ValueType.String);

      // 20-digit ID preserved as string
      expect(sheet?.getCell(2, 3).value).toBe('12345678901234567890');
      expect(sheet?.getCell(2, 3).type).toBe(ExcelJS.ValueType.String);

      // Date-like preserved as string
      expect(sheet?.getCell(2, 4).value).toBe('03-04');
      expect(sheet?.getCell(2, 4).type).toBe(ExcelJS.ValueType.String);

      // Formula lookalike is literal string, NOT a formula!
      const formulaCell = sheet?.getCell(2, 5);
      expect(formulaCell?.value).toBe('=1+1');
      expect(formulaCell?.type).toBe(ExcelJS.ValueType.String);
      expect(formulaCell?.formula).toBeUndefined();

      // Amount is primitive number
      const amountCell = sheet?.getCell(2, 6);
      expect(amountCell?.value).toBe(42.5);
      expect(amountCell?.type).toBe(ExcelJS.ValueType.Number);

      // Empty cell is string ""
      const emptyCell = sheet?.getCell(2, 7);
      expect(emptyCell?.value).toBe('');
      expect(emptyCell?.type).toBe(ExcelJS.ValueType.String);
    }
  });

  it('preserves header row as strings even when column is number mode', async () => {
    const records = [
      ['Price'],
      ['100'],
      ['200'],
    ];

    const result = await generateAndVerifyXlsx(
      records,
      { 0: 'number' },
      true, // header enabled
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.numberCells).toBe(2);
      expect(result.manifest.textCells).toBe(1); // Header 'Price'
    }
  });

  it('fails closed on ragged records instead of padding or dropping cells', async () => {
    // Short row (would previously be padded with an empty text cell)
    const short = [
      ['a', 'b'],
      ['x'],
    ];
    const shortResult = await generateAndVerifyXlsx(short, {}, true);
    expect(shortResult.ok).toBe(false);
    if (!shortResult.ok) {
      expect(shortResult.failure.reason).toBe('COLUMN_COUNT_MISMATCH');
      expect(shortResult.failure.row).toBe(2);
    }

    // Long row (would previously be truncated beyond the first record's width)
    const long = [
      ['a', 'b'],
      ['x', 'y', 'z', 'w'],
    ];
    const longResult = await generateAndVerifyXlsx(long, {}, true);
    expect(longResult.ok).toBe(false);
    if (!longResult.ok) {
      expect(longResult.failure.reason).toBe('COLUMN_COUNT_MISMATCH');
      expect(longResult.failure.row).toBe(2);
    }
  });

  it('reports generating then verifying phases via onPhase (F-6)', async () => {
    const records = [
      ['Name', 'Amount'],
      ['أحمد', '42.5'],
    ];
    const phases: string[] = [];
    const result = await generateAndVerifyXlsx(
      records,
      {},
      true,
      (phase) => phases.push(phase),
    );

    expect(result.ok).toBe(true);
    expect(phases).toEqual(['generating-xlsx', 'verifying-xlsx']);
  });
});
