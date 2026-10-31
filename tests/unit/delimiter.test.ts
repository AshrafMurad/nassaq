/**
 * Unit tests for src/domain/delimiter.ts
 *
 * Tests: confident detection for comma/semicolon/tab/pipe,
 * tie detection, all-single-column handling.
 */

import { describe, it, expect } from 'vitest';
import { detectDelimiter } from '@/domain/delimiter';

describe('detectDelimiter', () => {
  it('detects comma delimiter confidently', () => {
    const text = 'name,phone,city\nأحمد,001234,جدة\nSara,002345,Riyadh\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe(',');
    }
  });

  it('detects semicolon delimiter confidently', () => {
    const text = 'name;phone;city\nأحمد;001234;جدة\nSara;002345;Riyadh\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe(';');
    }
  });

  it('detects tab delimiter confidently', () => {
    const text = 'name\tphone\tcity\nأحمد\t001234\tجدة\nSara\t002345\tRiyadh\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe('\t');
    }
  });

  it('detects pipe delimiter confidently', () => {
    const text = 'name|phone|city\nأحمد|001234|جدة\nSara|002345|Riyadh\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe('|');
    }
  });

  it('returns review for single-column CSV (no clear delimiter)', () => {
    const text = 'justonecolumn\nvalue1\nvalue2\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('review');
  });

  it('handles quoted commas in semicolon-delimited file', () => {
    // Semicolon is the actual delimiter; commas appear inside quoted fields
    const text =
      'id;note\n1;"مدينة: جدة, السعودية"\n2;"Hello, World"\n3;"مرحبا, عالم"\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe(';');
    }
  });

  it('handles multiline quoted cells', () => {
    const text = 'name,note\nأحمد,"سطر أول\nسطر ثان"\nSara,"ok"\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe(',');
    }
  });

  it('rejects candidates with quote parse errors — malformed sample forces review (docs/03 §3)', () => {
    // Unclosed quote: every candidate parse hits a Quotes error, so none may
    // be confidently auto-picked.
    const text = 'a,b\n"unclosed quote,value\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('review');
    if (result.status === 'review') {
      expect(result.reason).toBe('tie');
    }
  });

  it('still detects confidently when only some candidates hit quote errors', () => {
    // Balanced quotes; semicolon is the real delimiter with quoted commas.
    const text =
      'id;note\n1;"Hello, World"\n2;"مرحبا, عالم"\n3;"ok, fine"\n';
    const result = detectDelimiter(text);
    expect(result.status).toBe('confident');
    if (result.status === 'confident') {
      expect(result.delimiter).toBe(';');
    }
  });
});
