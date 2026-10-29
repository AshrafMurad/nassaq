/**
 * Unit tests for src/domain/encoding.ts
 *
 * Tests: UTF-8 BOM stripping, strict UTF-8 acceptance/rejection,
 * non-ASCII detection, legacy encoding decoding, binary detection.
 */

import { describe, it, expect } from 'vitest';
import {
  detectAndDecodeUtf8,
  decodeWithEncoding,
  hasNonAsciiBytes,
  hasBinaryContent,
} from '@/domain/encoding';

// ── helpers ──────────────────────────────────────────────────────────────

function toBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function utf8Bytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

// ── detectAndDecodeUtf8 ──────────────────────────────────────────────────

describe('detectAndDecodeUtf8', () => {
  it('detects UTF-8 BOM and strips it', () => {
    // EF BB BF followed by "hello"
    const buf = toBuffer([0xef, 0xbb, 0xbf, ...utf8Bytes('hello')]);
    const res = detectAndDecodeUtf8(buf);
    expect(res.status).toBe('utf8-bom');
    if (res.status === 'utf8-bom') {
      expect(res.decoded).toBe('hello');
      expect(res.hadBom).toBe(true);
    }
  });

  it('decodes ASCII-only UTF-8 without BOM (no non-ASCII flag)', () => {
    const buf = toBuffer(utf8Bytes('name,phone\nSara,001234\n'));
    const res = detectAndDecodeUtf8(buf);
    expect(res.status).toBe('utf8-ok');
    if (res.status === 'utf8-ok') {
      expect(res.decoded).toContain('Sara');
      expect(res.hasNonAscii).toBe(false);
      expect(res.hadBom).toBe(false);
    }
  });

  it('decodes Arabic UTF-8 and flags non-ASCII', () => {
    const buf = toBuffer(utf8Bytes('أحمد,001234'));
    const res = detectAndDecodeUtf8(buf);
    expect(res.status).toBe('utf8-ok');
    if (res.status === 'utf8-ok') {
      expect(res.decoded).toContain('أحمد');
      expect(res.hasNonAscii).toBe(true);
    }
  });

  it('decodes UTF-8 BOM file with Arabic content', () => {
    const buf = toBuffer([0xef, 0xbb, 0xbf, ...utf8Bytes('أحمد,001234')]);
    const res = detectAndDecodeUtf8(buf);
    expect(res.status).toBe('utf8-bom');
    if (res.status === 'utf8-bom') {
      expect(res.decoded).toBe('أحمد,001234');
    }
  });

  it('returns utf8-failed for invalid UTF-8 bytes', () => {
    // 0x80 is an invalid UTF-8 continuation byte as a standalone
    const buf = toBuffer([0x80, 0x81, 0x82]);
    const res = detectAndDecodeUtf8(buf);
    expect(res.status).toBe('utf8-failed');
  });

  it('returns utf8-failed for Windows-1256 encoded Arabic (not valid UTF-8)', () => {
    // Windows-1256 Arabic character for "أ" is 0xC3, 0xE1 etc. — not valid UTF-8 sequence
    const buf = toBuffer([0xc3, 0xe1, 0xcd, 0xd5, 0xaf]);
    const res = detectAndDecodeUtf8(buf);
    expect(res.status).toBe('utf8-failed');
  });
});

// ── decodeWithEncoding ────────────────────────────────────────────────────

describe('decodeWithEncoding', () => {
  it('decodes UTF-8 correctly', () => {
    const buf = toBuffer(utf8Bytes('hello,world'));
    expect(decodeWithEncoding(buf, 'utf-8')).toBe('hello,world');
  });

  it('strips UTF-8 BOM when encoding is utf-8', () => {
    const buf = toBuffer([0xef, 0xbb, 0xbf, ...utf8Bytes('test')]);
    expect(decodeWithEncoding(buf, 'utf-8')).toBe('test');
  });

  it('decodes Windows-1256 Arabic bytes correctly', () => {
    // "أحمد" in Windows-1256: C3 CD E3 CF
    const buf = toBuffer([0xc3, 0xcd, 0xe3, 0xcf]);
    const decoded = decodeWithEncoding(buf, 'windows-1256');
    expect(decoded).toBe('أحمد');
  });

  it('throws for invalid bytes in selected encoding (fatal mode)', () => {
    // 0xFF is not valid in ISO-8859-6 (it's unassigned)
    // Note: some decoders are lenient; this tests that fatal is set.
    // We use a sequence that is demonstrably invalid in UTF-8.
    const buf = toBuffer([0x80, 0x81]);
    expect(() => decodeWithEncoding(buf, 'utf-8')).toThrow();
  });
});

// ── hasNonAsciiBytes ──────────────────────────────────────────────────────

describe('hasNonAsciiBytes', () => {
  it('returns false for pure ASCII', () => {
    const bytes = new TextEncoder().encode('hello');
    expect(hasNonAsciiBytes(bytes)).toBe(false);
  });

  it('returns true when any byte > 127', () => {
    const bytes = new Uint8Array([65, 0xc3, 66]);
    expect(hasNonAsciiBytes(bytes)).toBe(true);
  });
});

// ── hasBinaryContent ──────────────────────────────────────────────────────

describe('hasBinaryContent', () => {
  it('returns false for plain text', () => {
    const buf = toBuffer(utf8Bytes('name,phone\nأحمد,001\n'));
    expect(hasBinaryContent(buf)).toBe(false);
  });

  it('returns true for NUL byte', () => {
    const buf = toBuffer([0x68, 0x65, 0x00, 0x6c, 0x6f]);
    expect(hasBinaryContent(buf)).toBe(true);
  });

  it('returns false for CR, LF, HT characters (allowed control chars)', () => {
    const buf = toBuffer([0x61, 0x09, 0x0a, 0x0d, 0x62]); // a TAB LF CR b
    expect(hasBinaryContent(buf)).toBe(false);
  });
});
