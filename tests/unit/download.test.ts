import { describe, it, expect } from 'vitest';
import { sanitizeExportFilename } from '@/lib/download';

describe('sanitizeExportFilename', () => {
  it('replaces .csv with .xlsx', () => {
    expect(sanitizeExportFilename('data.csv')).toBe('data.xlsx');
    expect(sanitizeExportFilename('REPORT.CSV')).toBe('REPORT.xlsx');
  });

  it('preserves Arabic filenames', () => {
    expect(sanitizeExportFilename('تقرير_المبيعات_2026.csv')).toBe(
      'تقرير_المبيعات_2026.xlsx',
    );
  });

  it('sanitizes path traversal and path separators', () => {
    expect(sanitizeExportFilename('../../etc/passwd.csv')).toBe(
      'etc-passwd.xlsx',
    );
    expect(sanitizeExportFilename('C:\\Windows\\system.csv')).toBe(
      'C-Windows-system.xlsx',
    );
  });

  it('falls back to default basename when original name is empty or dot-only', () => {
    expect(sanitizeExportFilename('')).toBe('nassaq-export.xlsx');
    expect(sanitizeExportFilename('.csv')).toBe('nassaq-export.xlsx');
    expect(sanitizeExportFilename('...')).toBe('nassaq-export.xlsx');
  });

  it('removes control characters and unsafe filesystem characters', () => {
    expect(sanitizeExportFilename('test\x00file*name?.csv')).toBe('testfilename.xlsx');
  });
});
