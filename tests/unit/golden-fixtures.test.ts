import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { detectAndDecodeUtf8, decodeWithEncoding, hasBinaryContent } from '@/domain/encoding';
import { detectDelimiter } from '@/domain/delimiter';
import { parseRawCsv, removePhantomTrailingRecord, validateAndSummarize } from '@/domain/csv';
import { validateColumnNumeric } from '@/domain/numeric-policy';
import { scanCellRisks, scanTableRisks } from '@/domain/risks';
import { generateAndVerifyXlsx } from '@/worker/xlsx-adapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBuffer(filename: string): ArrayBuffer {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, filename));
  return new Uint8Array(buf).buffer;
}

function readFixtureString(filename: string, encoding: BufferEncoding = 'utf-8'): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), encoding);
}

describe('Golden synthetic fixture matrix', () => {
  it('literal-xlsx-escapes.csv: UTF-8 bytes parse and export without interpreting literal escapes', async () => {
    const raw = readFixtureBuffer('literal-xlsx-escapes.csv');
    const decoded = decodeWithEncoding(raw, 'utf-8');
    const { records: rawRecords, errors } = parseRawCsv(decoded, ',');
    const records = removePhantomTrailingRecord(rawRecords, decoded);
    const parsed = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.table[0]).toEqual(['Scenario', '_x0041_', 'Amount']);
    expect(parsed.table[1]?.[1]).toBe('_x0041_');
    expect(parsed.table[2]?.[1]).toBe('_x000D_');
    expect(parsed.table[23]?.[1]).toBe('_x000D__x0041_');
    const result = await generateAndVerifyXlsx(parsed.table, { 2: 'number' }, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.numberCells).toBe(26);
    expect(result.manifest.verificationSuccess).toBe(true);
  });

  it('1. arabic-utf8-bom.csv: UTF-8 BOM detected and stripped; exact Arabic & leading zeros', async () => {
    const raw = readFixtureBuffer('arabic-utf8-bom.csv');
    const decodeRes = detectAndDecodeUtf8(raw);
    expect(decodeRes.status).toBe('utf8-bom');
    if (decodeRes.status !== 'utf8-bom') return;
    expect(decodeRes.hadBom).toBe(true);

    const { records: rawRecords, errors } = parseRawCsv(decodeRes.decoded, ',');
    const records = removePhantomTrailingRecord(rawRecords, decodeRes.decoded);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', true, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table).toEqual([
      ['الاسم', 'الهاتف'],
      ['أحمد', '001234'],
    ]);

    // Leading zeros risk detected in phone column
    const risks = scanTableRisks(result.table, true);
    expect(risks.summary.LEADING_ZERO).toBeGreaterThan(0);

    // Export with all columns as text and verify
    const exportRes = await generateAndVerifyXlsx(result.table, { 0: 'text', 1: 'text' }, true);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;
    expect(exportRes.manifest.verificationSuccess).toBe(true);
    expect(exportRes.manifest.textCells).toBe(4);
  });

  it('2. arabic-utf8-no-bom.csv: BOM-less UTF-8 flagged non-ASCII', () => {
    const raw = readFixtureBuffer('arabic-utf8-no-bom.csv');
    const decodeRes = detectAndDecodeUtf8(raw);
    expect(decodeRes.status).toBe('utf8-ok');
    if (decodeRes.status !== 'utf8-ok') return;
    expect(decodeRes.hasNonAscii).toBe(true);

    const { records: rawRecords, errors } = parseRawCsv(decodeRes.decoded, ',');
    const records = removePhantomTrailingRecord(rawRecords, decodeRes.decoded);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[1]).toBe('جدة');
  });

  it('3. arabic-windows-1256.csv: strict UTF-8 fails; manual Windows-1256 decodes محمد', () => {
    const raw = readFixtureBuffer('arabic-windows-1256.csv');
    const utf8Res = detectAndDecodeUtf8(raw);
    expect(utf8Res.status).toBe('utf8-failed');

    const decoded = decodeWithEncoding(raw, 'windows-1256');
    expect(decoded).toContain('محمد');

    const { records: rawRecords, errors } = parseRawCsv(decoded, ',');
    const records = removePhantomTrailingRecord(rawRecords, decoded);
    const result = validateAndSummarize(records, errors, ',', 'windows-1256', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[1]).toBe('محمد');
  });

  it('4. arabic-iso-8859-6.csv: manual ISO-8859-6 decodes محمد', () => {
    const raw = readFixtureBuffer('arabic-iso-8859-6.csv');
    const decoded = decodeWithEncoding(raw, 'iso-8859-6');
    expect(decoded).toContain('محمد');

    const { records: rawRecords, errors } = parseRawCsv(decoded, ',');
    const records = removePhantomTrailingRecord(rawRecords, decoded);
    const result = validateAndSummarize(records, errors, ',', 'iso-8859-6', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[1]).toBe('محمد');
  });

  it('5. leading-zeros.csv: code 00073 preserved as string; Number selection rejected', () => {
    const text = readFixtureString('leading-zeros.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('00073');

    // Number gate rejects leading zeros
    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(false);
    expect(numEligibility.primaryReason).toBe('NON_CANONICAL_GRAMMAR');
  });

  it('6. long-id.csv: 20-digit ID preserved as string; Number selection rejected', () => {
    const text = readFixtureString('long-id.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('12345678901234567890');

    // Number gate rejects long identifier (>15 digits)
    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(false);
    expect(numEligibility.primaryReason).toBe('IDENTIFIER_RISK');
  });

  it('7. arabic-indic.csv: Unicode Arabic-Indic digits preserved exactly', () => {
    const text = readFixtureString('arabic-indic.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('٠٠١٢٣');

    // Should NOT be silently coerced to ASCII or Number
    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(false);
  });

  it('8. sku-date.csv: date-like code 03-04 flagged as DATE_SHAPED and preserved as text', () => {
    const text = readFixtureString('sku-date.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cellRisks = scanCellRisks('03-04');
    expect(cellRisks).toContain('DATE_SHAPED');

    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(false);
  });

  it('9. mixed-direction.csv: mixed RTL/LTR text preserved exactly', () => {
    const text = readFixtureString('mixed-direction.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('سجل-ABC 001');

    const cellRisks = scanCellRisks('سجل-ABC 001');
    expect(cellRisks).toContain('MIXED_DIRECTION');
  });

  it('10. quoted-comma.csv: quoted comma parsed into 2 columns with embedded comma intact', () => {
    const text = readFixtureString('quoted-comma.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.summary.columns).toBe(2);
    expect(result.table[1]?.[0]).toBe('أحمد');
    expect(result.table[1]?.[1]).toBe('جدة, السعودية');
  });

  it('11. quoted-quote.csv: escaped quotes preserved correctly', () => {
    const text = readFixtureString('quoted-quote.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('He said "ok"');
  });

  it('12. multiline.csv: embedded newline preserved inside single data record', () => {
    const text = readFixtureString('multiline.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.summary.dataRows).toBe(1);
    expect(result.table[1]?.[0]).toBe('سطر 1\nسطر 2');
  });

  it('13-15. semicolon, tab, pipe delimiters correctly detected', () => {
    const semiText = readFixtureString('semicolon.csv');
    const semiDelim = detectDelimiter(semiText);
    expect(semiDelim.status).toBe('confident');
    if (semiDelim.status === 'confident') {
      expect(semiDelim.delimiter).toBe(';');
    }

    const tabText = readFixtureString('tab.csv');
    const tabDelim = detectDelimiter(tabText);
    expect(tabDelim.status).toBe('confident');
    if (tabDelim.status === 'confident') {
      expect(tabDelim.delimiter).toBe('\t');
    }

    const pipeText = readFixtureString('pipe.csv');
    const pipeDelim = detectDelimiter(pipeText);
    expect(pipeDelim.status).toBe('confident');
    if (pipeDelim.status === 'confident') {
      expect(pipeDelim.delimiter).toBe('|');
    }
  });

  it('16. formula.csv: =1+1 flagged as FORMULA_LIKE; exports as exact literal text', async () => {
    const text = readFixtureString('formula.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('=1+1');
    const risks = scanCellRisks('=1+1');
    expect(risks).toContain('FORMULA_LIKE');

    const exportRes = await generateAndVerifyXlsx(result.table, { 0: 'text' }, true);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;
    expect(exportRes.manifest.verificationSuccess).toBe(true);
  });

  it('17. formula-prefixes.csv: =, +, -, @, \\t= all identified as FORMULA_LIKE', () => {
    const text = readFixtureString('formula-prefixes.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (let r = 1; r < result.table.length; r++) {
      const formulaVal = result.table[r]?.[1] ?? '';
      const risks = scanCellRisks(formulaVal);
      expect(risks).toContain('FORMULA_LIKE');
    }
  });

  it('18. html-string.csv: HTML/XSS strings preserved as literal text', () => {
    const text = readFixtureString('html-string.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('<img src=x onerror=alert(1)>');
  });

  it('19. whitespace.csv: preserves leading and trailing spaces', () => {
    const text = readFixtureString('whitespace.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]?.[0]).toBe('  نص  ');
  });

  it('20. empty-values.csv: empty field is literal empty string "", not null or omitted', () => {
    const text = readFixtureString('empty-values.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.table[1]).toEqual(['1', '', '3']);
  });

  it('21. numeric-valid.csv: valid numeric column converts to Number', () => {
    const text = readFixtureString('numeric-valid.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(true);
  });

  it('22. numeric-invalid.csv: leading zero 02 blocks entire numeric conversion', () => {
    const text = readFixtureString('numeric-invalid.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(false);
    expect(numEligibility.primaryReason).toBe('NON_CANONICAL_GRAMMAR');
  });

  it('23. numeric-lexical.csv: 0.10 fails round-trip check and blocks numeric conversion', () => {
    const text = readFixtureString('numeric-lexical.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const colValues = result.table.slice(1).map((r) => r[0] ?? '');
    const numEligibility = validateColumnNumeric(colValues, 2);
    expect(numEligibility.eligible).toBe(false);
    expect(numEligibility.primaryReason).toBe('LEXICAL_ROUNDTRIP_MISMATCH');
  });

  it('24. uneven.csv: full export blocked with row index', () => {
    const text = readFixtureString('uneven.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe('COLUMN_COUNT_MISMATCH');
    expect(result.detail).toBe('row 2');
  });

  it('25. broken-quote.csv: reports unclosed quote or parsing error', () => {
    const text = readFixtureString('broken-quote.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('MALFORMED_CSV');
  });

  it('26. empty.csv: 0-byte file has no data rows', () => {
    const raw = readFixtureBuffer('empty.csv');
    expect(raw.byteLength).toBe(0);
    const { records: rawRecords, errors } = parseRawCsv('', ',');
    const records = removePhantomTrailingRecord(rawRecords, '');
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_DATA_ROWS');
  });

  it('27. header-only.csv: parses 1 row; has 0 data rows when header mode is enabled', () => {
    const text = readFixtureString('header-only.csv');
    const { records: rawRecords, errors } = parseRawCsv(text, ',');
    const records = removePhantomTrailingRecord(rawRecords, text);
    const result = validateAndSummarize(records, errors, ',', 'utf-8', false, true, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_DATA_ROWS');
  });

  it('28. zip-masquerading.csv: detects binary signature / NUL content', () => {
    const raw = readFixtureBuffer('zip-masquerading.csv');
    expect(hasBinaryContent(raw)).toBe(true);
  });
});
