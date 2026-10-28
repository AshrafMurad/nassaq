# Nassaq — Technical Architecture and Decisions

**Version:** 1.0 · **Decision scope:** static, local-only CSV → XLSX MVP · **Related:** `03_CSV_PARSING_AND_ENCODING.md`, `04_DATA_INTEGRITY_AND_VALIDATION.md`.

## 1. Architectural summary

A statically hosted React application loads all necessary code into the browser. A dedicated module **Web Worker** owns raw-byte decoding, CSV parsing, risk analysis, safe XLSX creation and **XLSX round-trip verification**. The UI owns only ephemeral file selection, review state and download initiation. No backend or file upload endpoint exists.

```mermaid
flowchart LR
 U[User picks local CSV] --> UI[React UI / state machine]
 UI -->|Transfer ArrayBuffer| W[Dedicated Web Worker]
 W --> D[Decode bytes with selected encoding]
 D --> P[Papa Parse to string[][]]
 P --> R[Detect risks / enforce limits]
 R -->|Summary + first 20 rows only| UI
 UI -->|Confirmed options| W
 W --> E[ExcelJS writes typed XLSX]
 E --> V[Reopen XLSX / verify every cell]
 V -->|Verified bytes or error| UI
 UI -->|Blob object URL| F[Local .xlsx download]
```

### Security/integrity trust boundary

The CSV is **untrusted local content**. React renders its cells as escaped text, and the worker never constructs Excel formula objects from untrusted strings. Transport from worker to UI is via structured messages, not JSON injected into HTML. External assets are bundled or hosted first-party. The local file name is treated as untrusted display input and sanitized for downloads.

## 2. Final stack and explicit tradeoffs

| Technology | Decision | Why / constraint |
|---|---|---|
| **Vite + React + TypeScript strict** | **Selected** | A single client page needs neither SSR nor App Router; small static build and first-class module worker support. |
| Next.js App Router | Rejected for MVP | Static export is possible, but router/server conventions and Next-specific features add complexity with no user benefit here. Can revisit if real multi-page/SEO needs arise. |
| **Tailwind CSS v4 + shadcn/ui** | Selected, selectively | Familiar, accessible building blocks; generate only used shadcn components rather than adding a component suite. |
| **i18next + react-i18next** | Selected | Browser React localization without Next; **next-intl** was considered but is Next-centered and not used. |
| **Papa Parse** | Selected | Robust quoted fields, delimiter detection, parse errors and row arrays; always `dynamicTyping:false`, `header:false`. |
| **ExcelJS** | Selected subject to P0 browser/security spike | MIT license, explicit string/number cell types, workbook read and write buffer API; potential large bundle/memory/transitive dependency issues. Pin a reviewed release. |
| SheetJS Community Edition | Not MVP | Apache-2.0 is compatible; its official distribution differs from historically stale npm `xlsx`; adds supply-chain/update complexity without clear MVP advantage. |
| **Dedicated Web Worker** | Required | Keeps CPU-heavy parse, workbook generation and verification off main UI thread; Vite module worker must be proven in target browsers. |
| **Vitest + Playwright** | Selected | Pure invariant tests and browser file-to-XLSX end-to-end tests. |
| **lucide-react** | Selected | Small icons; no additional icon package. |

**Library validation gate:** Before writing features, run a minimal browser-built probe proving worker import, `ExcelJS.Workbook()`, `workbook.xlsx.writeBuffer()`, `workbook.xlsx.load()`, true text cells and File/Blob download. Run `npm audit`/lockfile review; if runtime issues or unacceptable unresolved high/critical vulnerabilities occur, stop and document the substitution decision. Node-only ExcelJS streaming writers and Node filesystem APIs are **not** available in this architecture. Versions are locked in the project's lockfile at implementation time; this document deliberately does not assume a current safe version.

**Phase 0 result (2026-10-28):** ExcelJS 4.4.0 and Papa Parse 5.7.0 passed the
Vite 8.3.5 module-worker probe in Chromium, Firefox and WebKit, including literal
empty strings, Arabic, formula-looking text, transferable bytes and downloaded
XLSX comparison. No writer substitution is needed. See `XLSX_WORKER_FEASIBILITY.md` for
benchmarks, bundle size, reviewed moderate audit findings and release limitations.
Papa runs with `worker:false` inside the dedicated worker. Offline processing is
proven with that worker already loaded and retained; creating a new worker after
disconnection cannot rely on identical HTTP-cache behavior across browsers.

**Research checked 2026-10-28:** [Vite production build](https://vite.dev/guide/build), [Vite module workers](https://vite.dev/guide/features), [Next static export](https://nextjs.org/docs/app/guides/static-exports), [Papa Parse docs](https://www.papaparse.com/docs), [ExcelJS repository/license](https://github.com/exceljs/exceljs), [SheetJS licensing](https://docs.sheetjs.com/docs/miscellany/license/), [SheetJS official installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/). These confirm API/architecture direction, **not** a completed runtime security audit.

## 3. State machine and contracts

States: `idle` → `reading` → `review` → `generating` → `verifying` → `ready`, with transitions to `error` and `cancelled`. `ready` is reachable **only** after verified XLSX. Changing any source option clears previous output and restarts preview/validation. Reset terminates current worker/job and revokes old download URL.

Messages are strongly typed discriminated unions with `jobId` (monotonic), `kind`, payload, and no file bytes in error messages. All late results for a prior `jobId` are discarded. Transfer buffers rather than duplicating large arrays; retain original raw bytes only while a file is active so decoding can be repeated. Use a separate worker job or retained raw bytes within worker; do not have two concurrent jobs. Cancelling terminates worker, releases data and creates a fresh worker for next file.

**Request types:** `ANALYZE` (file bytes + settings); `GENERATE` (confirmed settings); `CANCEL`. **Response types:** `ANALYSIS` (sample rows, counts, encoding/delimiter assessment, risk summaries/errors), `PROGRESS` (phase only, no fabricated percent), `READY` (verified XLSX ArrayBuffer + summary), `ERROR` (code + safe location/context). Types cannot share arbitrary `any` payloads.

**Core domain structures (specification, not source code):**

- `ImportOptions`: `encoding: utf-8 | windows-1256 | iso-8859-6`; `delimiter: , | ; | tab | |`; `firstRowIsHeader: boolean`; `columnTypes: Record<index, text | number>`; `encodingConfirmed: boolean`; `delimiterConfirmed: boolean`.
- `ParsedTable`: row arrays `string[][]`, separate header-mode metadata, source row indices (1-based), never objects keyed by potentially duplicated names.
- `Issue`: stable code; severity `info | review | blocking`; 1-based CSV row and column if applicable; translated UI message key; never include real data in logs.
- `ExportManifest`: source SHA-256 is **not** needed for MVP; expected dimensions, encoding/delimiter choices, per-cell expected representation, issue counts, and verification verdict. The manifest exists in memory only.

### Preserving values

CSV **quoting syntax** is stripped by parsing, while the decoded **field content** is preserved. Do not `trim()`, normalize Unicode, replace Arabic digits, strip BOM other than the *file-leading UTF-8 BOM*, or use `Number` by default. For text fields, assign plain strings to ExcelJS. For explicit Number mode, validation determines the approved numeric value; see integrity spec.

## 4. Detailed pipeline

1. **Gate file:** require `File`; raw file `size` ≤2 MiB and >0; expect `.csv`/`.txt`; reject strong binary indicators, ZIP signatures (`PK`), NUL-heavy samples and extensions such as `.xlsx`. Do not trust MIME as decisive.
2. **Transfer input:** read raw bytes in browser and transfer to worker; if file is unreadable, display a local error.
3. **Decode candidates:** UTF-8 BOM accepted; else strict UTF-8 attempted; if invalid, show manual Windows-1256/ISO-8859-6 choices with decoded preview. If decoding uncertain, flag for confirmation rather than make a silent guess.
4. **Detect delimiter on sample:** evaluate `,`, `;`, tab, `|` using quote-aware parsing; prefer stable widths and low parse errors; tie/one-column is review-required. Full parse uses chosen delimiter, `header:false`, `dynamicTyping:false`, `skipEmptyLines:false`, `comments:false`.
5. **Parse & validate full data:** detect malformed quotes, inconsistent field counts, input caps, long cells. Handle final row separator deterministically (see encoding spec). Classify risk patterns without changing values.
6. **Send preview:** first 20 rows and diagnostics only. No full data matrix crosses to React; worker holds table until generated/reset.
7. **Confirm:** user confirms uncertain choices and selects cell types; text is default, number requires entire-column validation.
8. **Build:** one sheet (`Data`), header text if enabled; exact string cell assignments, optional safe number values, all cells written, including empty strings; no formulas, macros, hyperlinks or external references generated.
9. **Verify:** parse XLSX bytes back with ExcelJS (in same worker) and compare dimensions, types and values for every cell. Verification failure is fatal. UI never exposes unverified bytes.
10. **Deliver:** transfer verified `ArrayBuffer` to UI; create `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` Blob and object URL. Revoke on new job/reset/unmount (not immediately while download is starting).

## 5. Resource budgets and performance

**Limits:** raw file ≤2 MiB; data rows ≤10,000; columns ≤50; data cells ≤100,000; one worksheet; preview ≤20 rows; cell text length ≤32,767 UTF-16 code units. Limit counts are checked **during streaming parsing** before allocating unbounded matrices, with a full table retained only for accepted files. Count header separately: 10,000 data rows **plus at most one header row**. Rows with deliberate empty fields count as rows. All limits apply to the entire file, not preview alone.

ExcelJS builds XLSX in memory, then loads it again for verification; peak usage can greatly exceed input size. Restrict worker concurrency to one, generate only after review, clear workbook references and revoke object URLs. If a target browser cannot reliably process a worst-case allowed fixture, lower caps in a documented update—**do not** silently skip verification.

Vite bundles worker with `new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })`. Probe browser builds during phase 0. No fallback that runs unbounded workbook operations on UI thread; unsupported browsers get a clear compatibility error.

## 6. Folder structure (app shell realized in Phase 1; worker/domain/lib pending later phases)

```text
nassaq/
├─ AGENTS.md
├─ docs/01_PRODUCT_REQUIREMENTS.md … 09_OPEN_SOURCE_AND_RELEASE.md
├─ public/                    # first-party immutable assets only
├─ src/
│  ├─ app/                    # App, providers, import state machine
│  ├─ components/import/      # uploader, preview, issues, type selector, result
│  ├─ components/ui/          # selected shadcn components
│  ├─ i18n/                   # ar/en namespaces and direction helpers
│  ├─ domain/                 # pure types, risk rules, numeric gate, verifier
│  ├─ worker/import.worker.ts # decoding, parsing, XLSX, verification orchestrator
│  ├─ lib/                    # safe filename, worker client, URL cleanup
│  ├─ styles/                 # Tailwind CSS v4 entry/theme
│  └─ main.tsx
├─ tests/fixtures/            # generated synthetic files; no real personal records
├─ tests/e2e/
├─ vite.config.ts
├─ vitest.config.ts
└─ package.json
```

**Dependency direction:** UI→typed worker client/messages→worker orchestrator→pure domain utilities and vendors. Domain rules should not import React, browser DOM or ExcelJS. XLSX adapter is the only domain-adjacent module that knows ExcelJS.

## 7. Error, deployment, compatibility

Error messages use stable codes: `FILE_TOO_LARGE`, `EMPTY_FILE`, `UNSUPPORTED_FILE`, `DECODE_FAILED`, `ENCODING_REVIEW`, `DELIMITER_REVIEW`, `MALFORMED_CSV`, `COLUMN_COUNT_MISMATCH`, `LIMIT_EXCEEDED`, `INVALID_NUMBER`, `CELL_TOO_LONG`, `EXPORT_FAILED`, `VERIFY_FAILED`, `WORKER_UNAVAILABLE`. UI translates into Arabic/English with suggested corrective action; never print full row content to console or crash-report services.

Ship **`dist/` only** on Cloudflare Pages, Netlify, Vercel static, GitHub Pages with correct base path, or a basic HTTP static server. Serve over HTTPS with MIME types correct for worker assets. Deploy no API/server functions. Use first-party bundled fonts or system fonts; don't fetch Google Fonts. Recommend current stable Chrome, Edge, Firefox and Safari (Vite current baseline includes Safari 16.4+); older platforms may be unsupported. Browser claims require real matrix evidence before release.

## 8. Decisions log

| ADR | Resolution | Why |
|---|---|---|
| 001 | Vite SPA instead of Next App Router | No server/router needed; minimal deployment |
| 002 | Text by default; no automatic numeric/date typing | Prioritize identity preservation |
| 003 | Manual confirmation for ambiguous encodings/delimiters | Heuristic cannot guarantee correctness |
| 004 | Single worker, one job | UI responsiveness; isolate memory/abort |
| 005 | ExcelJS browser export + read-back, adoption spike first | One library for output and verification |
| 006 | One sheet, hard limits, no silent partial success | Bounded honest MVP |
| 007 | Local-only; no file-content network calls | Privacy contract |
| 008 | No autosave of file content or user selections | Simple retention model; no secret persistence |
