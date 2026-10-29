import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateAndVerifyXlsx } from '@/worker/xlsx-adapter';

/**
 * Extracts a file from a standard PKZip buffer using Node's built-in zlib.
 */
function extractZipEntry(buffer: ArrayBuffer, targetPath: string): string | null {
  const buf = Buffer.from(buffer);
  let pos = 0;

  while (pos < buf.length - 4) {
    // Look for Local File Header signature: PK\x03\x04 (0x04034b50)
    if (buf.readUInt32LE(pos) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(pos + 8);
      const compSize = buf.readUInt32LE(pos + 18);
      const uncompSize = buf.readUInt32LE(pos + 22);
      const fnLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);

      const fileName = buf.toString('utf-8', pos + 30, pos + 30 + fnLen);
      const dataStart = pos + 30 + fnLen + extraLen;
      const dataEnd = dataStart + compSize;

      if (fileName === targetPath) {
        const compressedData = buf.subarray(dataStart, dataEnd);
        if (compMethod === 0) {
          return compressedData.toString('utf-8');
        } else if (compMethod === 8) {
          const decompressed = zlib.inflateRawSync(compressedData);
          return decompressed.toString('utf-8');
        }
      }

      pos = dataEnd;
    } else {
      pos++;
    }
  }

  return null;
}

describe('OpenXML spreadsheet structure & formula protection', () => {
  it('encodes literal escape underscores in shared strings using OOXML escaping', async () => {
    const result = await generateAndVerifyXlsx([
      ['_x0041_', '_x000D_'],
      ['_x0041_x000D_', '_x005F_x0041_'],
      ['_x00af_', '<tag>&_x000D_'],
    ], {}, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const xml = extractZipEntry(result.buffer, 'xl/sharedStrings.xml');
    expect(xml).toContain('<t>_x005F_x0041_</t>');
    expect(xml).toContain('<t>_x005F_x000D_</t>');
    expect(xml).toContain('<t>_x005F_x0041_x005F_x000D_</t>');
    expect(xml).toContain('<t>_x005F_x005F_x005F_x0041_</t>');
    expect(xml).toContain('<t>_x005F_x00af_</t>');
    expect(xml).toContain('<t>&lt;tag&gt;&amp;_x005F_x000D_</t>');
  });

  it('raw OpenXML sheet1.xml contains no <f> formula tags for formula-like cells', async () => {
    const records = [
      ['Title', 'DangerousFormula', 'NumberCol'],
      ['Row1', '=1+1', '42'],
      ['Row2', '@SUM(A1:B1)', '-10'],
      ['Row3', '+2+3', '0'],
      ['Row4', '-1-2', '99.5'],
      ['Row5', '\t=HYPERLINK("http://evil.com")', ''],
    ];

    const result = await generateAndVerifyXlsx(
      records,
      { 0: 'text', 1: 'text', 2: 'number' },
      true,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 1. Inspect raw OpenXML sheet1.xml directly from the ZIP stream
    const sheetXml = extractZipEntry(result.buffer, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;

    // Assert strictly zero <f> formula tags in sheet XML
    expect(sheetXml).not.toMatch(/<f[ >]/);
    expect(sheetXml).not.toMatch(/<\/f>/);

    // Assert zero hyperlink elements in sheet XML
    expect(sheetXml).not.toContain('<hyperlinks');
    expect(sheetXml).not.toContain('<hyperlink');

    // 2. Load with independent ExcelJS instance
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer);

    expect(wb.worksheets.length).toBe(1);
    const sheet = wb.worksheets[0];
    expect(sheet?.name).toBe('Data');

    // Cell B2 was '=1+1'
    const cellB2 = sheet?.getCell(2, 2);
    expect(cellB2?.type).toBe(ExcelJS.ValueType.String);
    expect(cellB2?.value).toBe('=1+1');
    expect(cellB2?.formula).toBeUndefined();
    expect(cellB2?.hyperlink).toBeUndefined();

    // Cell B3 was '@SUM(A1:B1)'
    const cellB3 = sheet?.getCell(3, 2);
    expect(cellB3?.type).toBe(ExcelJS.ValueType.String);
    expect(cellB3?.value).toBe('@SUM(A1:B1)');
    expect(cellB3?.formula).toBeUndefined();

    // Cell B6 was '\t=HYPERLINK("http://evil.com")'
    const cellB6 = sheet?.getCell(6, 2);
    expect(cellB6?.type).toBe(ExcelJS.ValueType.String);
    expect(cellB6?.value).toBe('\t=HYPERLINK("http://evil.com")');
    expect(cellB6?.formula).toBeUndefined();
    expect(cellB6?.hyperlink).toBeUndefined();

    // Number column checks
    expect(sheet?.getCell(2, 3).type).toBe(ExcelJS.ValueType.Number);
    expect(sheet?.getCell(2, 3).value).toBe(42);
    expect(sheet?.getCell(3, 3).value).toBe(-10);
    expect(sheet?.getCell(4, 3).value).toBe(0);
    expect(sheet?.getCell(5, 3).value).toBe(99.5);
    // Empty cell in number column remains empty string text
    expect(sheet?.getCell(6, 3).type).toBe(ExcelJS.ValueType.String);
    expect(sheet?.getCell(6, 3).value).toBe('');
  });

  it('workbook contains only the expected workbook parts (no macros, external relations)', async () => {
    const records = [
      ['Name', 'ID'],
      ['أحمد', '000123'],
    ];

    const result = await generateAndVerifyXlsx(records, { 0: 'text', 1: 'text' }, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Check [Content_Types].xml
    const contentTypes = extractZipEntry(result.buffer, '[Content_Types].xml');
    expect(contentTypes).not.toBeNull();
    if (!contentTypes) return;

    // Must be standard OpenXML spreadsheet, NOT macro-enabled xlsm
    expect(contentTypes).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
    expect(contentTypes).not.toContain('vbaProject');
    expect(contentTypes).not.toContain('macroEnabled');
  });
});
