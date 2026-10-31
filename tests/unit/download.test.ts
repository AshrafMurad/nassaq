import { describe, it, expect } from 'vitest';
import { sanitizeExportFilename } from '@/lib/download';

describe('sanitizeExportFilename', () => {
  it('replaces .csv with -nassaq.xlsx (docs/01 §3, docs/06 §4)', () => {
    expect(sanitizeExportFilename('data.csv')).toBe('data-nassaq.xlsx');
    expect(sanitizeExportFilename('REPORT.CSV')).toBe('REPORT-nassaq.xlsx');
  });

  it('preserves Arabic filenames', () => {
    expect(sanitizeExportFilename('تقرير_المبيعات_2026.csv')).toBe(
      'تقرير_المبيعات_2026-nassaq.xlsx',
    );
  });

  it('sanitizes path traversal and path separators', () => {
    expect(sanitizeExportFilename('../../etc/passwd.csv')).toBe(
      'etc-passwd-nassaq.xlsx',
    );
    expect(sanitizeExportFilename('C:\\Windows\\system.csv')).toBe(
      'C-Windows-system-nassaq.xlsx',
    );
  });

  it('falls back to default basename when original name is empty or dot-only', () => {
    expect(sanitizeExportFilename('')).toBe('nassaq-export.xlsx');
    expect(sanitizeExportFilename('.csv')).toBe('nassaq-export.xlsx');
    expect(sanitizeExportFilename('...')).toBe('nassaq-export.xlsx');
  });

  it('removes control characters and unsafe filesystem characters', () => {
    expect(sanitizeExportFilename('test\x00file*name?.csv')).toBe('testfilename-nassaq.xlsx');
  });

  it('strips bidi override and directional formatting characters', () => {
    // RLO (\u202E), LRM (\u200E), RLM (\u200F), ALM (\u061C)
    const dangerous = 'safe\u202Eexe.csv';
    expect(sanitizeExportFilename(dangerous)).toBe('safeexe-nassaq.xlsx');

    const bidiArabic = '\u200Eتقرير\u200F_الموظفين\u061C.csv';
    expect(sanitizeExportFilename(bidiArabic)).toBe('تقرير_الموظفين-nassaq.xlsx');
  });

  it('enforces maximum length cap on basename before appending the suffix', () => {
    const longName = 'a'.repeat(150) + '.csv';
    const sanitized = sanitizeExportFilename(longName);
    expect(sanitized).toBe('a'.repeat(100) + '-nassaq.xlsx');
  });

  it('handles .txt extension gracefully', () => {
    expect(sanitizeExportFilename('data-export.txt')).toBe('data-export-nassaq.xlsx');
  });
});
