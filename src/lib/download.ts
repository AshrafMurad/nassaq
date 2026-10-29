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
 */
export function sanitizeExportFilename(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') {
    return `${DEFAULT_EXPORT_BASENAME}.xlsx`;
  }

  // Remove trailing .csv extension (case-insensitive)
  let base = originalName.replace(/\.csv$/i, '');

  // Strip path traversal sequences and path separators
  base = base.replace(/\.\./g, '').replace(/[/\\]/g, '-').replace(/:/g, '');

  // Remove control characters (0x00-0x1F, 0x7F) and unsafe characters
  base = base.replace(/[\x00-\x1f\x7f*?"<>|]/g, '');

  // Trim leading/trailing dashes, whitespace and periods
  base = base.trim().replace(/^[-.\s]+|[-.\s]+$/g, '');

  if (!base) {
    base = DEFAULT_EXPORT_BASENAME;
  }

  return `${base}.xlsx`;
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
