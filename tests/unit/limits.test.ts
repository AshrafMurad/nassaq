/**
 * Unit tests for src/domain/limits.ts
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_BYTES,
  MAX_DATA_ROWS,
  MAX_COLUMNS,
  MAX_CELLS,
  MAX_CELL_UTF16,
  utf16Length,
} from '@/domain/limits';

describe('limits constants', () => {
  it('MAX_FILE_BYTES is 2 MiB', () => {
    expect(MAX_FILE_BYTES).toBe(2 * 1024 * 1024);
  });

  it('MAX_DATA_ROWS is 10000', () => {
    expect(MAX_DATA_ROWS).toBe(10_000);
  });

  it('MAX_COLUMNS is 50', () => {
    expect(MAX_COLUMNS).toBe(50);
  });

  it('MAX_CELLS is 100000', () => {
    expect(MAX_CELLS).toBe(100_000);
  });

  it('MAX_CELL_UTF16 is 32767', () => {
    expect(MAX_CELL_UTF16).toBe(32_767);
  });
});

describe('utf16Length', () => {
  it('returns correct length for ASCII', () => {
    expect(utf16Length('hello')).toBe(5);
  });

  it('returns correct length for Arabic text', () => {
    expect(utf16Length('أحمد')).toBe(4);
  });

  it('returns correct length for empty string', () => {
    expect(utf16Length('')).toBe(0);
  });

  it('counts emoji as 2 UTF-16 code units (surrogate pair)', () => {
    // 😀 is U+1F600, which requires a surrogate pair (2 UTF-16 units)
    expect(utf16Length('😀')).toBe(2);
  });

  it('counts a string at the 32767 limit correctly', () => {
    const s = 'x'.repeat(32_767);
    expect(utf16Length(s)).toBe(32_767);
  });

  it('counts a string just over the limit', () => {
    const s = 'x'.repeat(32_768);
    expect(utf16Length(s)).toBe(32_768);
  });
});
