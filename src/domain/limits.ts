/**
 * Hard caps for the MVP import pipeline.
 * All limits are inclusive upper bounds.
 */

/** Maximum file size accepted (bytes). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB

/** Maximum number of DATA rows (excludes the header row if firstRowIsHeader). */
export const MAX_DATA_ROWS = 10_000;

/** Maximum number of columns (field width of the first record). */
export const MAX_COLUMNS = 50;

/** Maximum total data cells (data rows × columns). */
export const MAX_CELLS = 100_000;

/** Maximum UTF-16 code units per cell value. */
export const MAX_CELL_UTF16 = 32_767;

/**
 * Count the number of UTF-16 code units in a string.
 * JS `.length` already returns UTF-16 units, so this is a direct alias,
 * but naming it explicitly documents intent.
 */
export function utf16Length(s: string): number {
  return s.length;
}
