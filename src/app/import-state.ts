import type { SupportedEncoding, DelimiterChar } from '@/domain/protocol';

export type ColumnType = 'text' | 'number';

export interface ImportReviewOptions {
  encoding: SupportedEncoding;
  delimiter?: DelimiterChar;
  firstRowIsHeader: boolean;
  columnTypes: Record<number, ColumnType>;
}

export function createInitialReviewOptions(
  encoding: SupportedEncoding = 'utf-8',
  delimiter?: DelimiterChar,
  firstRowIsHeader: boolean = true,
): ImportReviewOptions {
  return {
    encoding,
    delimiter,
    firstRowIsHeader,
    columnTypes: {},
  };
}

export function updateColumnType(
  current: Record<number, ColumnType>,
  columnIndex: number,
  type: ColumnType,
): Record<number, ColumnType> {
  return {
    ...current,
    [columnIndex]: type,
  };
}
