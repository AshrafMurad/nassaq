import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateAndVerifyXlsx } from '@/worker/xlsx-adapter';

describe('xlsx-adapter generateAndVerifyXlsx', () => {
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
});
