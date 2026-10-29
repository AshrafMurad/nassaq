/**
 * Encoding detection and decoding for the Nassaq import pipeline.
 *
 * Rules (from doc 03_CSV_PARSING_AND_ENCODING.md):
 *  - UTF-8 BOM (EF BB BF): strip BOM, decode rest as strict UTF-8; preselect UTF-8.
 *  - BOM-less UTF-8 success: preselect UTF-8; if non-ASCII bytes exist, flag for review.
 *  - BOM-less UTF-8 failure: report DECODE_FAILED; offer Windows-1256 / ISO-8859-6.
 *  - Manual encoding: decode from original bytes every time.
 *  - Never generate U+FFFD as a recovery tactic.
 */

import type { SupportedEncoding } from './protocol';

/** Result of the auto-detect phase (before any user confirmation). */
export type EncodingDetectResult =
  | {
      status: 'utf8-bom';
      /** Decoded full text (BOM stripped). */
      decoded: string;
      hadBom: true;
    }
  | {
      status: 'utf8-ok';
      decoded: string;
      hadBom: false;
      /** True when the file contains non-ASCII bytes. */
      hasNonAscii: boolean;
    }
  | {
      status: 'utf8-failed';
      hadBom: false;
    };

/**
 * Detect encoding and attempt UTF-8 decode.
 * Never modifies the supplied ArrayBuffer.
 */
export function detectAndDecodeUtf8(buffer: ArrayBuffer): EncodingDetectResult {
  const bytes = new Uint8Array(buffer);

  // Detect UTF-8 BOM (EF BB BF)
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;

  const slice = hasBom ? buffer.slice(3) : buffer;

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(slice);
    const hasNonAscii = hasNonAsciiBytes(hasBom ? bytes.subarray(3) : bytes);

    if (hasBom) {
      return { status: 'utf8-bom', decoded, hadBom: true };
    }
    return { status: 'utf8-ok', decoded, hadBom: false, hasNonAscii };
  } catch {
    return { status: 'utf8-failed', hadBom: false };
  }
}

/**
 * Decode an ArrayBuffer using the specified encoding.
 * Throws a TypeError (from TextDecoder) if the bytes are invalid for the encoding.
 */
export function decodeWithEncoding(
  buffer: ArrayBuffer,
  encoding: SupportedEncoding,
): string {
  const bytes = new Uint8Array(buffer);

  // Handle BOM strip for UTF-8
  if (encoding === 'utf-8') {
    const hasBom =
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf;
    const slice = hasBom ? buffer.slice(3) : buffer;
    return new TextDecoder('utf-8', { fatal: true }).decode(slice);
  }

  // Legacy single-byte encodings: decode from raw bytes (no BOM handling)
  return new TextDecoder(encoding, { fatal: true }).decode(buffer);
}

/**
 * Returns true if the byte array contains any byte > 127.
 */
export function hasNonAsciiBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if ((bytes[i] ?? 0) > 127) return true;
  }
  return false;
}

/**
 * Check for NUL bytes or other binary content markers.
 * Returns true if the buffer likely contains binary content.
 */
export function hasBinaryContent(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    const b = bytes[i] ?? 0;
    // NUL byte is the clearest indicator; also reject DEL (127) and most C0 controls
    // except: HT (9), LF (10), CR (13), FF (12)
    if (b === 0) return true;
    if (b < 9 || (b > 10 && b < 12) || (b > 13 && b < 32)) return true;
  }
  return false;
}
