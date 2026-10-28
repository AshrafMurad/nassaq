# Nassaq — Product Requirements (PRD)

**Status:** Approved planning baseline, version 1.0 · **Date:** 2026-10-28  
**Product:** Nassaq / نسّق · **Tagline:** Import your data without losing a single digit.  
**Scope:** CSV input → reviewed, validated XLSX output; desktop-first static web app.

## 1. Vision and problem

Nassaq helps an Arabic-speaking person turn a CSV into an Excel workbook **without accidentally converting identifiers, breaking Arabic characters, or executing spreadsheet formulas**. Existing spreadsheet import workflows may guess encodings, delimiters and types; a wrong guess can be subtle and irreversible *after* export. Nassaq makes those decisions visible and treats uncertainty as a reason to ask—not to silently alter data.

This is **not** a general-purpose spreadsheet editor, cloud importer, or repair service for already-damaged CSVs. The original source file remains on the user's device. All content processing is local in their browser.

**Primary users and jobs:**

| User | Realistic job | Most costly failure |
|---|---|---|
| Accountant / office administrator | Open a customer CSV in Excel | Invoice/customer IDs converted to numbers or dates |
| HR officer | Export payroll/employee directory into XLSX | Employee identifiers or mobile prefixes lost |
| School registrar | Share an attendance/student CSV | Arabic names appear as mojibake; columns shift |
| Small business / e-commerce staff | Convert orders/catalog CSV | SKU `03-04` becomes a date; long order ID rounded |
| Any nontechnical Arabic-speaking user | Prepare spreadsheet for colleagues | Unsafe formula-like values become active in Excel |

### Product promise and boundaries

- Preserve **approved decoded cell strings**, including leading zeros, spaces and long IDs, in XLSX text cells.
- Make encoding and delimiter choice reviewable. If a CSV was already corrupted upstream, Nassaq cannot reconstruct information not present in its bytes.
- Neither “100% accurate encoding detection” nor perfect repair of unknown encodings is promised.
- An XLSX file is generated only after validations pass. Numeric conversion is always explicit and narrow.
- Site is free, open-source and usable without sign-in, database, remote APIs or upload endpoints.

## 2. MVP constraints (binding)

| Code | Contract | Verification |
|---|---|---|
| PR-01 | Arabic and English UI; correct RTL/LTR; Arabic default if no saved choice | Switch languages in E2E; inspect `html.lang`/`dir` |
| PR-02 | CSV only; `.csv`/`.txt` file picker, drag/drop; sniff content rather than trusting extension | Valid CSV accepted; nontext/restricted formats rejected |
| PR-03 | Entire import, parsing, XLSX generation, read-back and download local to browser | Network interception confirms no file-content requests |
| PR-04 | No auth, backend, DB, tracking, remote fonts, AI or analytics | Dependency and network review |
| PR-05 | Static build deployable to a CDN/static host | `npm run build` yields `dist/` |
| PR-06 | No silent trimming, normalization, type coercion, row deletion or automatic repair | Golden CSV/XLSX fixture comparisons |
| PR-07 | Formula-like text exported literally, never as formulas | Inspect loaded cell type and formula properties |
| PR-08 | Desktop recent Chromium, Firefox and Safari; mobile is usable but not a heavy-file target | Cross-browser E2E and smoke |
| PR-09 | **MVP caps:** 2 MiB raw input, 10,000 data rows, 50 columns, 100,000 non-header cells; Excel cell ≤32,767 UTF-16 code units | Boundary fixtures and informative refusal |
| PR-10 | One file at a time; keep only transient in-memory data; new file/reset discards previous buffers and object URLs | Manual profiling / reset test |

`2 MiB = 2,097,152 bytes`. A CSV at or below that size **may still be refused** if another cap is exceeded. No splitting/truncating into partial XLSX downloads. The caps are policy, not a guarantee against memory pressure on all devices.

## 3. Primary journey

1. User arrives at one-page app; UI explains “your file stays on this device.”
2. User selects a CSV; reject oversize/empty/unsupported input before expensive processing.
3. App detects UTF-8 BOM or tests strict UTF-8, suggests a candidate and shows an encoding selector where confidence is not certain. On decoding failure, require manual selection among available encodings. Do **not** automatically accept a legacy encoding guess.
4. App suggests delimiter from sampled rows; when low-confidence, require confirmation. User can select comma, semicolon, tab or pipe.
5. App previews first 20 rows and displays counts, parse errors, risk indicators and current settings.
6. User confirms the encoding/delimiter, whether first row is a header, and each column's export type. **Text** is the default for every column. **Number** is optional and only for columns passing strict numeric safety checks. Dates remain text.
7. User clicks “Create safe Excel”; app processes full file, enforces limits and blocks on parse errors or unsupported conversions.
8. Worker writes XLSX, re-opens generated bytes, compares expected values/types against output; download enabled only upon success.
9. App presents success summary with row/column counts, text/number cell counts and warnings that remained informational. Download file `<sanitized-base>-nassaq.xlsx`.

No “uploading” progress, success or security claim should imply a server transfer. UI copy should say **Choose file**, **Processing on this device**, **Create Excel**.

## 4. Functional requirements and acceptance criteria

| ID / Priority | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 / P0 | Select/drop one local CSV | Reject >2 MiB, 0 bytes and obviously incompatible content; explain reason |
| FR-02 / P0 | Decode with selected encoding | UTF-8 BOM recognized; strict invalid UTF-8 not silently replaced; manual Windows-1256 and ISO-8859-6 available |
| FR-03 / P0 | Choose delimiter | Comma/semicolon/tab/pipe parsed with proper quoted fields and newlines; ambiguous guess requests review |
| FR-04 / P0 | Display real parsed sample | First 20 rows retain whitespace, empty values, mixed scripts and quote-escaped content; no HTML interpretation |
| FR-05 / P0 | Identify risks | Leading zeros, 16+ digit decimal-only strings, date-shaped tokens and formula prefixes flagged; value unchanged |
| FR-06 / P0 | Select header mode and per-column Text/Number | Defaults Text; switching to Number validates entire column; invalid conversion shows affected row and blocks export until resolved |
| FR-07 / P0 | Write safe XLSX | Header is retained as text on row 1; data text retains exact decoded code points; numbers only if explicitly approved |
| FR-08 / P0 | Verify output | Re-open generated XLSX; check sheet dimensions, all cell values/types; mismatch blocks download |
| FR-09 / P0 | Summarize and download | Show success/failure, counts, decisions and localized filename; no account |
| FR-10 / P0 | Privacy and safety controls | No file transmission, no formulas, no stored content or telemetry; input limits and bounded preview |
| FR-11 / P0 | Recover from review mistakes | User can change encoding/delimiter/type and re-run, without retaining stale results |
| FR-12 / P1 | Show keyboard/a11y feedback | Focus on first error, accessible labels/status, keyboard selector navigation |

P0 = required for first public MVP. P1 = release-quality polish and should be implemented where time permits without violating P0. Security-critical a11y, labeling and error usability remain non-negotiable.

### Risks vs blockers

- **Informational:** numeric-like text with leading zeros, ID longer than 15 digits, date-like codes, mixed script, formula-like text—safe as `Text`; do not ask to approve each individual cell.
- **Requires review:** BOM absent and encoding uncertain, delimiter tie/undetectable, deliberate selection of `Number`, suspiciously garbled but technically valid decoded text.
- **Blocks export:** invalid decode for chosen encoding, malformed quoting, inconsistent column count, unsupported Excel cell length, limit exceeded, failed number validation, XLSX verification mismatch.

## 5. Out of scope and roadmap

**Not MVP:** XLS/XLSX inputs, CSV editing, data cleaning or deduplication, guessed phone-number columns, automatic correction of mojibake, Arabic comma delimiter, drag-and-drop of folders, multiple sheets, server import, database column mapping, cloud storage, account/sync, usage analytics, AI or mobile apps. Users **do not** map columns to a destination database; they select safe Excel **cell types**.

**Post-MVP priorities (separate decisions):** improve handling of larger data through stress profiling and efficient export; reusable user-confirmed column presets (local only, no data saved); more encodings/delimiters; explicit per-cell correction (with audit log); optional human-readable processing summary; automated accessibility audits.

## 6. User stories

- As an accountant, I can export `00004711` as text and confirm the downloaded cell still contains eight characters.
- As an HR administrator, I can select Windows-1256 if a legacy CSV displays unreadable Arabic under UTF-8.
- As a school employee, I see what delimiter was chosen before generating a workbook.
- As an e-commerce operator, I can keep `03-04` as a product code instead of converting it to a date.
- As a privacy-conscious user, I can disconnect the network after loading the app and still convert a file.
- As a keyboard user, I can choose a file, fix validation choices and download without using a mouse.

## 7. Nonfunctional acceptance thresholds

- **Integrity:** 100% exact decoded-text match for accepted `Text` cells in deterministic golden fixtures; no mismatches permitted in production export.
- **Responsiveness:** processing and verification off the main UI thread (dedicated worker); controls still react to cancel/reset; benchmark in target browsers; do not promise fixed runtime.
- **Accessibility:** semantically labeled controls, contrast target WCAG 2.2 AA, visible focus, predictable tab order, status messages, scrollable preview.
- **Security:** no formula objects, no unsafe DOM injection, strict size/count bounds, no remote calls containing input content; exported output verified before enabled download.
- **Localization:** no hardcoded user-facing strings; screen-reader and mixed-direction content tested in both locales.
- **Maintainability:** pure policies for decoding, detection, classification and comparison with fixture-driven tests.

## 8. Success measures (privacy preserving)

**Without analytics:** measure acceptance offline through user feedback/issues, opt-in local testing and manual QA; no automatic user behavior or file data collection. Suggested validation signals: all P0 acceptance cases pass, browser smoke matrix green, zero unreviewed integrity mismatches, <3 user steps from preview to download for an unambiguous file. Post-launch report aggregate issues submitted voluntarily (never attach real customer CSV by default).

## 9. Definition of MVP Done

All P0 rows pass with real exported XLSX inspection; both languages work; builds are static; no data leaves browser; happy path and blocking cases are tested in Chrome, Firefox and Safari; audit/review of dependencies complete; docs updated. See `04_DATA_INTEGRITY_AND_VALIDATION.md`, `07_TESTING_STRATEGY.md` and `08_IMPLEMENTATION_PLAN.md`.
