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

  it('strips bidi override and directional formatting characters', () => {
    // RLO (\u202E), LRM (\u200E), RLM (\u200F), ALM (\u061C)
    const dangerous = 'safe\u202Eexe.csv';
    expect(sanitizeExportFilename(dangerous)).toBe('safeexe.xlsx');

    const bidiArabic = '\u200Eتقرير\u200F_الموظفين\u061C.csv';
    expect(sanitizeExportFilename(bidiArabic)).toBe('تقرير_الموظفين.xlsx');
  });

  it('enforces maximum length cap on basename', () => {
    const longName = 'a'.repeat(150) + '.csv';
    const sanitized = sanitizeExportFilename(longName);
    expect(sanitized).toBe('a'.repeat(100) + '.xlsx');
  });

  it('handles .txt extension gracefully', () => {
    expect(sanitizeExportFilename('data-export.txt')).toBe('data-export.xlsx');
  });
});
