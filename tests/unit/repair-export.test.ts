/**
 * Integration tests for the Phase 6 repair → export pipeline (docs/07 §2
 * repair fixture classes, docs/04 §1a).
 *
 * Guarantees:
 *  - Export writes original + approved diffs; the generated workbook reloads
 *    to exactly the effective table (verify.ts compares against it).
 *  - Edits introducing formula-like text still export as literal text cells
 *    with no formula objects.
 *  - Leading zeros, Arabic text, 20-digit IDs and multiline content survive
 *    edit → export → read-back byte-exactly.
 *  - The strict entire-column numeric gate re-validates over the EFFECTIVE
 *    table: an edit can enable Number mode only when every cell then passes.
 *  - Original records are never mutated by the pipeline.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { applyEdits, type CellEdit } from '@/domain/repairs';
import { generateAndVerifyXlsx } from '@/worker/xlsx-adapter';
import { revalidateNumericExport } from '@/domain/numeric-policy';
import { validateAndSummarize } from '@/domain/csv';

function edit(
  row: number,
  col: number,
  original: string,
  proposed: string,
  source: CellEdit['source'] = 'suggestion',
): CellEdit {
  return { row, col, original, proposed, source };
}

describe('repair → export → read-back equality', () => {
  it('exports original + approved diffs and reloads every cell exactly', async () => {
    const original = [
      ['Name', 'Code', 'ID', 'Note'],
      ['أحمد', '00073', '12345678901234567890', 'سطر 1\nسطر 2'],
      ['  سارة  ', '03-04', '98765432109876543210', 'plain'],
    ];
    const snapshot = JSON.parse(JSON.stringify(original));

    const edits = [
      edit(1, 1, '00073', '73', 'suggestion'),
      edit(2, 0, '  سارة  ', 'سارة', 'suggestion'),
      edit(2, 1, '03-04', '=1+1', 'manual'),
    ];
    const applied = applyEdits(original, edits);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(original).toEqual(snapshot);

    const result = await generateAndVerifyXlsx(applied.effective, {}, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer);
    const sheet = wb.getWorksheet('Data');
    expect(sheet).toBeDefined();

    // Effective table reloads byte-exactly.
    applied.effective.forEach((row, r) =>
      row.forEach((value, c) => {
        const cell = sheet!.getCell(r + 1, c + 1);
        expect(cell.value).toBe(value);
      }),
    );

    // Formula-like EDITED value is literal text, never a formula object.
    const formulaCell = sheet!.getCell(3, 2);
    expect(formulaCell.value).toBe('=1+1');
    expect(formulaCell.type).toBe(ExcelJS.ValueType.String);
    expect(formulaCell.formula).toBeUndefined();
    expect(formulaCell.hyperlink).toBeUndefined();

    // Leading zero removed only by the approved diff; untouched cells exact.
    expect(sheet!.getCell(2, 2).value).toBe('73');
    expect(sheet!.getCell(2, 2).type).toBe(ExcelJS.ValueType.String);
    expect(sheet!.getCell(2, 3).value).toBe('12345678901234567890');
    expect(sheet!.getCell(3, 3).value).toBe('98765432109876543210');
    expect(sheet!.getCell(2, 4).value).toBe('سطر 1\nسطر 2');

    // Arabic text untouched by edits.
    expect(sheet!.getCell(2, 1).value).toBe('أحمد');
  });

  it('re-validates the numeric gate over the effective table at export', async () => {
    const original = [
      ['Item', 'Amount'],
      ['A', 'x2'],
      ['B', '10'],
    ];
    const edits = [edit(1, 1, 'x2', '2')];
    const applied = applyEdits(original, edits);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    // Effective column 1 is now fully numeric → Number mode allowed.
    const reval = revalidateNumericExport(applied.effective, { 1: 'number' }, true);
    expect(reval.ok).toBe(true);

    const result = await generateAndVerifyXlsx(
      applied.effective,
      { 1: 'number' },
      true,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.numberCells).toBe(2);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer);
    const sheet = wb.getWorksheet('Data');
    expect(sheet!.getCell(2, 2).value).toBe(2);
    expect(sheet!.getCell(2, 2).type).toBe(ExcelJS.ValueType.Number);
    expect(sheet!.getCell(3, 2).value).toBe(10);
  });

  it('keeps Number mode blocked when another effective cell fails the gate', () => {
    const original = [
      ['Item', 'Amount'],
      ['A', '2'],
      ['B', '0.10'],
    ];
    // Editing row 1 does NOT fix the 0.10 lexical round-trip failure.
    const applied = applyEdits(original, [edit(1, 0, 'A', 'AA')]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const reval = revalidateNumericExport(applied.effective, { 1: 'number' }, true);
    expect(reval.ok).toBe(false);
    expect(reval.failedColumnIndex).toBe(1);
  });

  it('edit → rebuild summary flow reproduces fresh-parse metadata over the effective table', () => {
    const csv = 'Name,Code\nأحمد,  00073  \nسارة,03-04\n';
    // Parse the ORIGINAL content (worker flow), then simulate the worker's
    // APPLY_EDITS rebuild over effective records.
    const parsed = validateAndSummarize(
      [
        ['Name', 'Code'],
        ['أحمد', '  00073  '],
        ['سارة', '03-04'],
      ],
      [],
      ',',
      'utf-8',
      false,
      true,
      true,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const applied = applyEdits(parsed.table, [edit(1, 1, '  00073  ', '00073')]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const rebuilt = validateAndSummarize(
      applied.effective,
      [],
      parsed.summary.delimiter,
      parsed.summary.encoding,
      parsed.summary.hadBom,
      parsed.summary.delimiterConfident,
      parsed.summary.firstRowIsHeader,
    );
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;

    // Risk counts drop for the repaired cell (whitespace flag pattern gone),
    // while structure and untouched values remain stable.
    expect(rebuilt.summary.totalRows).toBe(3);
    expect(rebuilt.summary.columns).toBe(2);
    expect(rebuilt.summary.previewRows[0]![1]).toBe('00073');
    expect(rebuilt.summary.previewRows[0]![1]).not.toBe('  00073  ');
  });
});
