/**
 * XLSX adapter for ExcelJS workbook generation and verification.
 *
 * Runs inside the Web Worker (or Node during testing).
 * In accordance with docs/04_DATA_INTEGRITY_AND_VALIDATION.md:
 *  - Generates exactly one worksheet named 'Data'.
 *  - Writes text values with explicit text format ('@').
 *  - Writes approved numeric values as primitive numbers.
 *  - Treats empty CSV fields as empty string text cells.
 *  - Reloads the written buffer back into an ExcelJS Workbook.
 *  - Runs full verification against canonical source records.
 *  - Returns a clean, detached ArrayBuffer only upon 100% verification pass.
 */

import ExcelJS from 'exceljs';
import type {
  ExportManifest,
  VerificationFailure,
} from '@/domain/export-manifest';
import {
  verifyWorkbook,
  type VerifiableSheet,
  type VerifiableCell,
  type LoadedCellType,
} from '@/domain/verify';

export type XlsxGenerationResult =
  | {
      ok: true;
      buffer: ArrayBuffer;
      manifest: ExportManifest;
    }
  | {
      ok: false;
      failure: VerificationFailure;
    };

/**
 * Generates an XLSX workbook from canonical parsed records, reloads it,
 * verifies every cell, and returns the verified ArrayBuffer.
 */
export async function generateAndVerifyXlsx(
  records: readonly (readonly string[])[],
  columnTypes: Record<number, 'text' | 'number'>,
  firstRowIsHeader: boolean,
): Promise<XlsxGenerationResult> {
  const expectedRowCount = records.length;
  const expectedColumnCount = records[0]?.length ?? 0;

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');

    for (let r = 0; r < expectedRowCount; r++) {
      const isHeader = r === 0 && firstRowIsHeader;
      const excelRow = r + 1;

      const row = records[r];
      for (let c = 0; c < expectedColumnCount; c++) {
        const excelCol = c + 1;
        const rawValue = row?.[c] ?? '';
        const cell = sheet.getCell(excelRow, excelCol);

        const targetType = isHeader ? 'text' : (columnTypes[c] ?? 'text');

        if (targetType === 'number' && rawValue !== '') {
          cell.value = Number(rawValue);
        } else {
          cell.value = rawValue;
          cell.numFmt = '@';
        }
      }
    }

    const output = await workbook.xlsx.writeBuffer();

    // ── Read-back and verify ─────────────────────────────────────────────
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(output);

    const verifiableSheets: VerifiableSheet[] = loaded.worksheets.map((ws) => ({
      name: ws.name,
      rowCount: ws.rowCount,
      columnCount: ws.columnCount,
      getCell(row: number, col: number): VerifiableCell {
        const cell = ws.getCell(row, col);
        let type: LoadedCellType = 'other';

        if (cell.formula || (cell.model && (cell.model as { formula?: unknown }).formula)) {
          type = 'formula';
        } else if (cell.hyperlink || (cell.model && (cell.model as { hyperlink?: unknown }).hyperlink)) {
          type = 'hyperlink';
        } else if (cell.type === ExcelJS.ValueType.Number) {
          type = 'number';
        } else if (cell.type === ExcelJS.ValueType.String) {
          type = 'string';
        } else if (cell.type === ExcelJS.ValueType.Null) {
          type = 'empty';
        }

        return {
          row,
          col,
          type,
          value: cell.value,
          formula: cell.formula,
          hyperlink: typeof cell.hyperlink === 'string' ? cell.hyperlink : undefined,
        };
      },
      getAllCells(): VerifiableCell[] {
        const cells: VerifiableCell[] = [];
        ws.eachRow((row, rowNumber) => {
          row.eachCell((cell, colNumber) => {
            let type: LoadedCellType = 'other';

            if (cell.formula || (cell.model && (cell.model as { formula?: unknown }).formula)) {
              type = 'formula';
            } else if (cell.hyperlink || (cell.model && (cell.model as { hyperlink?: unknown }).hyperlink)) {
              type = 'hyperlink';
            } else if (cell.type === ExcelJS.ValueType.Number) {
              type = 'number';
            } else if (cell.type === ExcelJS.ValueType.String) {
              type = 'string';
            } else if (cell.type === ExcelJS.ValueType.Null) {
              type = 'empty';
            }

            cells.push({
              row: rowNumber,
              col: colNumber,
              type,
              value: cell.value,
              formula: cell.formula,
              hyperlink: typeof cell.hyperlink === 'string' ? cell.hyperlink : undefined,
            });
          });
        });
        return cells;
      },
    }));

    const verifyResult = verifyWorkbook(
      { sheets: verifiableSheets },
      records,
      columnTypes,
      firstRowIsHeader,
    );

    if (!verifyResult.ok) {
      return {
        ok: false,
        failure: verifyResult.failure,
      };
    }

    // Convert output to standard ArrayBuffer for zero-copy postMessage transfer
    const bytes = new Uint8Array(output);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);

    return {
      ok: true,
      buffer,
      manifest: verifyResult.manifest,
    };
  } catch {
    return {
      ok: false,
      failure: {
        reason: 'CORRUPT_XLSX',
      },
    };
  }
}
