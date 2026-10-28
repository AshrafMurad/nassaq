import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { csvBytes, textFixture } from './fixtures';
import { parseProbe, roundTripProbe, verifyProbe } from './probe';

describe('Phase 0 vendor feasibility', () => {
  it('preserves parsed synthetic strings through XLSX write/load', async () => {
    const expected = textFixture();
    expect(parseProbe(csvBytes(expected))).toEqual(expected);
    expect((await roundTripProbe(expected)).buffer.byteLength).toBeGreaterThan(0);
  });
  it('observes empty text as distinct from missing and detects tampering', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.getCell('A1').value = '';
    verifyProbe(workbook, [['']]);
    expect(sheet.getCell('B1').value).toBeNull();
    sheet.getCell('A1').value = null;
    expect(() => verifyProbe(workbook, [['']])).toThrow('VERIFY_FAILED');
  });
  it('supports explicit primitive numbers alongside text empty cells', async () => {
    await roundTripProbe([['Qty'], [2], [-17], [2.5], [0.1], ['']]);
  });
  it('rejects invalid UTF-8 without replacement', () => {
    expect(() => parseProbe(new Uint8Array([0xc3, 0x28]))).toThrow();
  });
  it('supports browser-standard legacy Arabic decoders', () => {
    expect(new TextDecoder('windows-1256', { fatal: true }).decode(new Uint8Array([0xe3, 0xcd, 0xe3, 0xcf]))).toBe('محمد');
    expect(new TextDecoder('iso-8859-6', { fatal: true }).decode(new Uint8Array([0xe5, 0xcd, 0xe5, 0xcf]))).toBe('محمد');
  });
});
