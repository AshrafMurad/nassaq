/**
 * Pure domain workbook verification algorithm.
 *
 * Implements Section 7 of docs/04_DATA_INTEGRITY_AND_VALIDATION.md:
 *  - Verifies exactly one worksheet named 'Data'.
 *  - Verifies exact sheet dimensions.
 *  - Verifies each cell's type and exact value against the approved canonical records.
 *  - Confirms complete absence of formulas, hyperlinks, and external references.
 *  - Confirms no unexpected populated cells outside the expected grid rectangle.
 *
 * This module is pure TypeScript and does not import ExcelJS, DOM, or React.
 */

import type {
  ExportManifest,
  VerificationFailure,
  VerificationResult,
} from './export-manifest';

export type LoadedCellType = 'string' | 'number' | 'empty' | 'formula' | 'hyperlink' | 'other';

export interface VerifiableCell {
  row: number;    // 1-based Excel row coordinate
  col: number;    // 1-based Excel col coordinate
  type: LoadedCellType;
  value: unknown;
  formula?: string;
  hyperlink?: string;
}

export interface VerifiableSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  getCell(row: number, col: number): VerifiableCell;
  /** Iterates all cells found in the sheet to catch out-of-bounds cells. */
  getAllCells?(): VerifiableCell[];
}

export interface VerifiableWorkbook {
  sheets: VerifiableSheet[];
}

export function verifyWorkbook(
  workbook: VerifiableWorkbook,
  records: readonly (readonly string[])[],
  columnTypes: Record<number, 'text' | 'number'>,
  firstRowIsHeader: boolean,
): VerificationResult {
  // 1. Workbook must have exactly one sheet
  if (workbook.sheets.length !== 1) {
    return {
      ok: false,
      failure: { reason: 'SHEET_COUNT_MISMATCH' },
    };
  }

  const sheet = workbook.sheets[0];
  if (!sheet) {
    return {
      ok: false,
      failure: { reason: 'SHEET_COUNT_MISMATCH' },
    };
  }

  // 2. Sheet name must be exactly 'Data'
  if (sheet.name !== 'Data') {
    return {
      ok: false,
      failure: { reason: 'SHEET_NAME_MISMATCH' },
    };
  }

  const expectedRowCount = records.length;
  const expectedColumnCount = records[0]?.length ?? 0;

  // 3. Dimensions check
  if (sheet.rowCount !== expectedRowCount) {
    return {
      ok: false,
      failure: { reason: 'ROW_COUNT_MISMATCH' },
    };
  }

  if (sheet.columnCount !== expectedColumnCount) {
    return {
      ok: false,
      failure: { reason: 'COLUMN_COUNT_MISMATCH' },
    };
  }

  let textCells = 0;
  let numberCells = 0;
  let emptyCells = 0;

  // 4. Exact cell-by-cell verification
  for (let r = 0; r < expectedRowCount; r++) {
    const isHeader = r === 0 && firstRowIsHeader;
    const excelRow = r + 1;
    const rowRecord = records[r];

    for (let c = 0; c < expectedColumnCount; c++) {
      const excelCol = c + 1;
      const rawValue = rowRecord?.[c] ?? '';
      const cell = sheet.getCell(excelRow, excelCol);

      // Formulas are strictly prohibited
      if (cell.type === 'formula' || cell.formula !== undefined) {
        return {
          ok: false,
          failure: {
            reason: 'FORMULA_DETECTED',
            row: excelRow,
            column: excelCol,
          },
        };
      }

      // Hyperlinks are strictly prohibited
      if (cell.type === 'hyperlink' || cell.hyperlink !== undefined) {
        return {
          ok: false,
          failure: {
            reason: 'HYPERLINK_DETECTED',
            row: excelRow,
            column: excelCol,
          },
        };
      }

      // Determine expected type and value
      const targetType = isHeader ? 'text' : (columnTypes[c] ?? 'text');

      if (targetType === 'number' && rawValue !== '') {
        const expectedNum = Number(rawValue);
        if (
          cell.type !== 'number' ||
          typeof cell.value !== 'number' ||
          !Object.is(cell.value, expectedNum)
        ) {
          return {
            ok: false,
            failure: {
              reason: 'VALUE_MISMATCH',
              row: excelRow,
              column: excelCol,
            },
          };
        }
        numberCells++;
      } else {
        // String/text cell (including empty strings and header rows)
        if (
          cell.type !== 'string' ||
          typeof cell.value !== 'string' ||
          cell.value !== rawValue
        ) {
          return {
            ok: false,
            failure: {
              reason: 'VALUE_MISMATCH',
              row: excelRow,
              column: excelCol,
            },
          };
        }
        if (rawValue === '') {
          emptyCells++;
        } else {
          textCells++;
        }
      }
    }
  }

  // 5. Check for unexpected populated cells outside bounds
  if (sheet.getAllCells) {
    const allCells = sheet.getAllCells();
    for (const cell of allCells) {
      if (
        cell.row < 1 ||
        cell.row > expectedRowCount ||
        cell.col < 1 ||
        cell.col > expectedColumnCount
      ) {
        return {
          ok: false,
          failure: {
            reason: 'UNEXPECTED_CELL',
            row: cell.row,
            column: cell.col,
          },
        };
      }
    }
  }

  const dataRows = firstRowIsHeader ? Math.max(0, expectedRowCount - 1) : expectedRowCount;

  return {
    ok: true,
    manifest: {
      totalRows: expectedRowCount,
      dataRows,
      columns: expectedColumnCount,
      textCells,
      numberCells,
      emptyCells,
      totalCells: textCells + numberCells + emptyCells,
      verificationSuccess: true,
      verifiedAt: new Date().toISOString(),
    },
  };
}
