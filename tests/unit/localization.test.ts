/**
 * Unit tests for AR/EN localization resource parity (docs/07 §4).
 *
 * Guarantees:
 *  - `en` declares exactly the same keys as the Arabic source `ar`.
 *  - Every key maps to a non-empty string in both locales.
 *  - Interpolation placeholders ({{name}}) match per key, so no locale can
 *    drop a required value.
 */

import { describe, it, expect } from 'vitest';
import { ar } from '@/i18n/ar';
import { en } from '@/i18n/en';

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

function extractPlaceholders(value: string): string[] {
  const found: string[] = [];
  for (const match of value.matchAll(PLACEHOLDER_REGEX)) {
    found.push(match[1] ?? '');
  }
  return found.sort();
}

function keySet(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

describe('localization: AR/EN resource parity', () => {
  it('declares identical key sets in both locales', () => {
    const arKeys = keySet(ar);
    const enKeys = keySet(en);

    const missingInEn = arKeys.filter((k) => !enKeys.includes(k));
    const missingInAr = enKeys.filter((k) => !arKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInAr).toEqual([]);
    expect(enKeys).toEqual(arKeys);
  });

  it('maps every key to a non-empty string in both locales', () => {
    const arRecord = ar as unknown as Record<string, unknown>;
    const enRecord = en as unknown as Record<string, unknown>;
    for (const key of keySet(ar)) {
      const arValue = arRecord[key];
      const enValue = enRecord[key];
      expect(typeof arValue, `ar[${key}] should be a string`).toBe('string');
      expect(typeof enValue, `en[${key}] should be a string`).toBe('string');
      expect((arValue as string).length, `ar[${key}] must be non-empty`).toBeGreaterThan(0);
      expect((enValue as string).length, `en[${key}] must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('uses identical interpolation placeholders per key', () => {
    const arRecord = ar as unknown as Record<string, string>;
    const enRecord = en as unknown as Record<string, string>;
    for (const key of keySet(ar)) {
      const arPlaceholders = extractPlaceholders(arRecord[key] ?? '');
      const enPlaceholders = extractPlaceholders(enRecord[key] ?? '');
      expect(enPlaceholders, `placeholder mismatch for key ${key}`).toEqual(arPlaceholders);
    }
  });

  it('keeps the documented blocking-error keys present with row placeholders', () => {
    expect(ar.errorColumnCountMismatch).toContain('{{detail}}');
    expect(en.errorColumnCountMismatch).toContain('{{detail}}');
    expect(ar.errorEmptyFile.length).toBeGreaterThan(0);
    expect(en.errorEmptyFile.length).toBeGreaterThan(0);
  });
});
