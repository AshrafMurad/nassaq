/**
 * Unit tests for src/domain/csv.ts
 *
 * Tests: phantom trailing record removal, structural validation,
 * limit checking, empty string preservation, uneven rows, cell length.
 */

import { describe, it, expect } from 'vitest';
import { parseRawCsv, removePhantomTrailingRecord, validateAndSummarize } from '@/domain/csv';
import type { ParseError } from 'papaparse';

// ── parseRawCsv ──────────────────────────────────────────────────────────

describe('parseRawCsv', () => {
  it('parses a simple comma CSV into string arrays', () => {
    const { records } = parseRawCsv('name,phone\nأحمد,00123\n', ',');
    expect(records[0]).toEqual(['name', 'phone']);
    expect(records[1]).toEqual(['أحمد', '00123']);
  });

  it('preserves empty fields as empty strings', () => {
    const { records } = parseRawCsv('a,,c\n', ',');
    expect(records[0]).toEqual(['a', '', 'c']);
  });

  it('preserves leading-zero strings (no dynamic typing)', () => {
    const { records } = parseRawCsv('code\n0005\n000012\n', ',');
    expect(records[1]).toEqual(['0005']);
    expect(records[2]).toEqual(['000012']);
  });

  it('parses formula-like strings as plain text', () => {
    const { records } = parseRawCsv('code,formula\n03-04,=1+1\n', ',');
    expect(records[1]).toEqual(['03-04', '=1+1']);
  });

  it('handles quoted fields with embedded comma', () => {
    const { records } = parseRawCsv('"أحمد","مدينة: جدة, السعودية","03-04"\n', ',');
    expect(records[0]).toEqual(['أحمد', 'مدينة: جدة, السعودية', '03-04']);
  });

  it('handles quoted fields with embedded newline', () => {
    const text = 'name,note\nخالد,"سطر أول\nسطر ثان"\n';
    const { records } = parseRawCsv(text, ',');
    expect(records[0]).toEqual(['name', 'note']);
    expect(records[1]).toEqual(['خالد', 'سطر أول\nسطر ثان']);
  });

  it('handles escaped double-quote ("") inside quoted field', () => {
    const { records } = parseRawCsv('"Said ""hello"" yesterday"\n', ',');
    expect(records[0]).toEqual(['Said "hello" yesterday']);
  });

  it('parses semicolon delimiter', () => {
    const { records } = parseRawCsv('id;note\n1;test\n', ';');
    expect(records[1]).toEqual(['1', 'test']);
  });

  it('parses tab delimiter', () => {
    const { records } = parseRawCsv('id\tname\n1\tأحمد\n', '\t');
    expect(records[1]).toEqual(['1', 'أحمد']);
  });

  it('parses pipe delimiter', () => {
    const { records } = parseRawCsv('a|b|c\n1|2|3\n', '|');
    expect(records[1]).toEqual(['1', '2', '3']);
  });

  it('does not treat # as comments', () => {
    const { records } = parseRawCsv('#header\nvalue\n', ',');
    expect(records[0]).toEqual(['#header']);
  });

  it('preserves whitespace-only fields', () => {
    const { records } = parseRawCsv('a,  ,c\n', ',');
    expect(records[0]).toEqual(['a', '  ', 'c']);
  });
});

// ── removePhantomTrailingRecord ───────────────────────────────────────────

describe('removePhantomTrailingRecord', () => {
  it('removes phantom [""] when text ends with newline', () => {
    const records = [['name', 'phone'], ['أحمد', '00123'], ['']];
    const text = 'name,phone\nأحمد,00123\n';
    const result = removePhantomTrailingRecord(records, text);
    expect(result).toHaveLength(2);
  });

  it('does NOT remove last record when text has no trailing newline', () => {
    const records = [['name'], ['value']];
    const text = 'name\nvalue'; // no trailing newline
    const result = removePhantomTrailingRecord(records, text);
    expect(result).toHaveLength(2);
  });

  it('does NOT remove a genuine blank middle record', () => {
    // Blank line in the middle: `a\n\nb` → records: [['a'], [''], ['b']]
    // but text ends with newline too: we only check the LAST record
    const records = [['a'], [''], ['b'], ['']];
    const text = 'a\n\nb\n';
    const result = removePhantomTrailingRecord(records, text);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual(['']);
  });

  it('does NOT remove the only record', () => {
    const records = [['']];
    const text = '\n';
    const result = removePhantomTrailingRecord(records, text);
    expect(result).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const records = [['name', 'phone'], ['أحمد', '00123'], ['']];
    const text = 'name,phone\r\nأحمد,00123\r\n';
    const result = removePhantomTrailingRecord(records, text);
    expect(result).toHaveLength(2);
  });
});

// ── validateAndSummarize ─────────────────────────────────────────────────

const NO_ERRORS: ParseError[] = [];

function validate(
  records: string[][],
  opts?: {
    firstRowIsHeader?: boolean;
    delimiter?: ',' | ';' | '\t' | '|';
  },
) {
  return validateAndSummarize(
    records,
    NO_ERRORS,
    opts?.delimiter ?? ',',
    'utf-8',
    false,
    true,
    opts?.firstRowIsHeader ?? true,
  );
}

describe('validateAndSummarize', () => {
  it('returns a valid summary for a simple CSV', () => {
    const result = validate([
      ['name', 'phone'],
      ['أحمد', '00123'],
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.dataRows).toBe(1);
      expect(result.summary.columns).toBe(2);
      expect(result.summary.headerLabels).toEqual(['name', 'phone']);
      expect(result.summary.previewRows[0]).toEqual(['أحمد', '00123']);
    }
  });

  it('preserves empty string cells', () => {
    const result = validate([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.previewRows[0]).toEqual(['1', '', '3']);
    }
  });

  it('returns NO_DATA_ROWS for header-only table', () => {
    const result = validate([['name', 'phone']]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_DATA_ROWS');
  });

  it('returns NO_DATA_ROWS for empty records', () => {
    const result = validate([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_DATA_ROWS');
  });

  it('handles firstRowIsHeader:false — all rows are data', () => {
    const result = validate([['أحمد', '001'], ['Sara', '002']], {
      firstRowIsHeader: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.dataRows).toBe(2);
      expect(result.summary.headerLabels).toEqual(['', '']);
    }
  });

  it('blocks uneven rows with COLUMN_COUNT_MISMATCH naming the offending row', () => {
    const result = validate([
      ['a', 'b', 'c'],
      ['1', '2'],  // missing third column
      ['x', 'y', 'z'],
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('COLUMN_COUNT_MISMATCH');
    expect(result.detail).toBe('row 2');
  });

  it('lists multiple uneven rows in the blocking detail', () => {
    const result = validate([
      ['a', 'b'],
      ['x'],              // short: CSV row 2
      ['p', 'q'],
      ['y', 'z', 'w'],    // long: CSV row 4
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('COLUMN_COUNT_MISMATCH');
    expect(result.detail).toBe('rows 2, 4');
  });

  it('blocks uneven rows in headerless mode with 1-based row index', () => {
    const result = validate([['1', '2'], ['x']], {
      firstRowIsHeader: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('COLUMN_COUNT_MISMATCH');
    expect(result.detail).toBe('row 2');
  });

  it('rejects CELL_TOO_LONG for a cell exceeding 32767 chars', () => {
    const longCell = 'x'.repeat(32768);
    const result = validate([
      ['a', 'b'],
      [longCell, '1'],
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CELL_TOO_LONG');
  });

  it('rejects CELL_TOO_LONG for an oversized header cell with row 1 position', () => {
    const longHeader = 'x'.repeat(32768);
    const result = validate([
      [longHeader, 'b'],
      ['1', '2'],
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CELL_TOO_LONG');
      expect(result.detail).toBe('row 1, column 1');
    }
  });

  it('rejects LIMIT_EXCEEDED for > 50 columns', () => {
    const header = Array.from({ length: 51 }, (_, i) => `col${i}`);
    const row = Array.from({ length: 51 }, () => 'v');
    const result = validate([header, row]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LIMIT_EXCEEDED');
  });

  it('rejects LIMIT_EXCEEDED for > 10000 data rows', () => {
    const header = ['a'];
    const rows = Array.from({ length: 10001 }, () => ['v']);
    const result = validate([header, ...rows]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LIMIT_EXCEEDED');
  });

  it('rejects LIMIT_EXCEEDED when total cells exceed 100000', () => {
    // 50 columns × 2001 data rows = 100050 cells
    const header = Array.from({ length: 50 }, (_, i) => `c${i}`);
    const rows = Array.from({ length: 2001 }, () =>
      Array.from({ length: 50 }, () => 'v'),
    );
    const result = validate([header, ...rows]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('LIMIT_EXCEEDED');
  });

  it('returns MALFORMED_CSV when Papa errors include Quotes type', () => {
    const errors: ParseError[] = [
      { type: 'Quotes', code: 'MissingQuotes', message: 'missing', row: 0 },
    ];
    const r = validateAndSummarize(
      [['a', 'b']],
      errors,
      ',',
      'utf-8',
      false,
      true,
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('MALFORMED_CSV');
  });

  it('provides up to 20 preview rows', () => {
    const header = ['v'];
    const rows = Array.from({ length: 25 }, (_, i) => [`row${i}`]);
    const result = validate([header, ...rows]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.previewRows).toHaveLength(20);
    }
  });

  it('counts non-empty cells per column', () => {
    const result = validate([
      ['a', 'b'],
      ['1', ''],
      ['2', '3'],
      ['', '4'],
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.columnMeta[0]?.nonEmptyCount).toBe(2);
      expect(result.summary.columnMeta[1]?.nonEmptyCount).toBe(2);
    }
  });

  it('evaluates column numeric eligibility and risk counts', () => {
    const result = validate([
      ['Nums', 'Codes', 'Mixed'],
      ['10', '001', 'أحمد'],
      ['2.5', '03-04', 'Smith'],
      ['3', '12345678901234567890', '=1+1'],
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Column 0 is valid numeric
      expect(result.summary.columnMeta[0]?.isNumericEligible).toBe(true);
      // Column 1 has leading zero, date-shaped, long id -> ineligible
      expect(result.summary.columnMeta[1]?.isNumericEligible).toBe(false);
      expect(result.summary.columnMeta[1]?.numericIneligibleSampleRows).toContain(2);
      // Column 2 has formula and text -> ineligible
      expect(result.summary.columnMeta[2]?.isNumericEligible).toBe(false);

      // Risk summary checks
      expect(result.summary.riskSummary.LEADING_ZERO).toBe(1);
      expect(result.summary.riskSummary.DATE_SHAPED).toBe(1);
      expect(result.summary.riskSummary.LONG_NUMBER).toBe(1);
      expect(result.summary.riskSummary.FORMULA_LIKE).toBe(1);
      expect(result.summary.totalRisks).toBeGreaterThanOrEqual(4);
    }
  });
});

// ── concrete expected cases from doc 03 §7 ───────────────────────────────

describe('doc 03 §7 concrete cases', () => {
  it('UTF-8: name,phone + Arabic + leading-zero phone', () => {
    const { records } = parseRawCsv('name,phone\nأحمد,00123\n', ',');
    expect(records[1]).toEqual(['أحمد', '00123']);
  });

  it('semicolon: 20-digit ID with Arabic note containing semicolon', () => {
    const { records } = parseRawCsv(
      'id;note\n12345678901234567890;"ملاحظة; ثانية"\n',
      ';',
    );
    expect(records[1]).toEqual(['12345678901234567890', 'ملاحظة; ثانية']);
  });

  it('formula prefix and date-shaped codes preserved as text', () => {
    const { records } = parseRawCsv('code,value\n03-04,=1+1\n', ',');
    expect(records[1]).toEqual(['03-04', '=1+1']);
  });
});
