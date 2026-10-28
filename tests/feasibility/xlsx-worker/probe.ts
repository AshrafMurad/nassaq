import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export function parseProbe(bytes: Uint8Array): string[][] {
  const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  // Fixture has no terminal record separator. Terminal-record policy belongs to Phase 2.
  const result = Papa.parse<string[]>(decoded, {
    header: false, dynamicTyping: false, skipEmptyLines: false,
    comments: false, fastMode: false, delimiter: ',', worker: false,
  });
  if (result.errors.length) throw new Error('MALFORMED_CSV');
  return result.data;
}

export function verifyProbe(workbook: ExcelJS.Workbook, expected: readonly (readonly (string | number)[])[]): void {
  const sheet = workbook.worksheets[0];
  const width = expected[0]?.length ?? 0;
  if (workbook.worksheets.length !== 1 || !sheet || sheet.name !== 'Data' ||
      sheet.rowCount !== expected.length || sheet.columnCount !== width) {
    throw new Error('VERIFY_FAILED');
  }
  expected.forEach((row, r) => row.forEach((value, c) => {
    const cell = sheet.getCell(r + 1, c + 1);
    const type = typeof value === 'string' ? ExcelJS.ValueType.String : ExcelJS.ValueType.Number;
    if (cell.type !== type || !Object.is(cell.value, value) || cell.formula !== undefined || cell.hyperlink !== undefined) {
      throw new Error(`VERIFY_FAILED:${r + 1}:${c + 1}`);
    }
  }));
}

export async function roundTripProbe(expected: readonly (readonly (string | number)[])[]) {
  const started = performance.now();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  expected.forEach((row, r) => row.forEach((value, c) => {
    const cell = sheet.getCell(r + 1, c + 1);
    cell.value = value;
    if (typeof value === 'string') cell.numFmt = '@';
  }));
  const output = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(output);
  verifyProbe(loaded, expected);
  // ExcelJS returns a Uint8Array/Buffer in browsers despite its Buffer declaration.
  const bytes = new Uint8Array(output);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return { buffer, elapsedMs: performance.now() - started, rows: expected.length,
    columns: expected[0]?.length ?? 0 };
}
