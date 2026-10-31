/**
 * Safe local download utility for generated XLSX files.
 *
 * Responsibilities:
 *  - Sanitize exported filename to prevent path traversal or unsafe characters.
 *  - Create Blob with exact OpenXML spreadsheet MIME type.
 *  - Trigger browser local download via temporary link.
 *  - Manage and revoke object URLs to avoid memory leaks.
 */

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const DEFAULT_EXPORT_BASENAME = 'nassaq-export';

/**
 * Sanitizes an input filename into a safe, valid .xlsx filename.
 * Preserves Arabic characters, spaces, and standard alphanumeric text,
 * while stripping control characters, path separators, traversal sequences, and .csv extension.
 * Appends the documented `-nassaq` suffix (docs/01 §3, docs/06 §4); the
 * fallback basename already carries the product name and stays as-is.
 */
export function sanitizeExportFilename(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') {
    return `${DEFAULT_EXPORT_BASENAME}.xlsx`;
  }

  // Remove trailing .csv or .txt extension (case-insensitive)
  let base = originalName.replace(/\.(csv|txt)$/i, '');

  // Strip path traversal sequences and path separators
  base = base.replace(/\.\./g, '').replace(/[/\\]/g, '-').replace(/:/g, '');

  // Remove control characters (0x00-0x1F, 0x7F) and unsafe characters
  base = base.replace(/[\x00-\x1f\x7f*?"<>|]/g, '');

  // Strip bidi override and directional formatting characters
  base = base.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g, '');

  // Enforce maximum length of basename (100 characters)
  if (base.length > 100) {
    base = base.slice(0, 100);
  }

  // Trim leading/trailing dashes, whitespace and periods
  base = base.trim().replace(/^[-.\s]+|[-.\s]+$/g, '');

  if (!base) {
    return `${DEFAULT_EXPORT_BASENAME}.xlsx`;
  }

  return `${base}-nassaq.xlsx`;
}

/**
 * Triggers a browser download of the verified ArrayBuffer with a sanitized filename.
 * Returns the created object URL so it can be tracked and revoked.
 */
export function triggerFileDownload(
  buffer: ArrayBuffer,
  originalFilename: string,
): { url: string; filename: string } {
  const filename = sanitizeExportFilename(originalFilename);
  const blob = new Blob([buffer], { type: XLSX_MIME_TYPE });
  const url = URL.createObjectURL(blob);

  // Trigger download via temporary anchor
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  return { url, filename };
}

/**
 * Safely revokes an object URL when no longer needed.
 */
export function revokeDownloadUrl(url: string | null | undefined): void {
  if (url && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore errors if URL is already invalid
    }
  }
}
