# Nassaq — Phase-by-Phase Implementation Plan

**Version:** 1.0 · **Goal:** smallest trustworthy CSV→XLSX MVP. Phase 0's isolated technical spike is complete; no product UI or later-phase implementation has been started.

## 1. Starting point and constraints

This documentation package was authored from the supplied product brief. **The existing application repository was not provided or inspected.** Before implementation, inspect the actual repository and preserve code/configuration/docs if already present; do not assume it is blank. If conflicts with the architecture are found, record an ADR and update specifications before changing code.

**Hard guardrails:** static-only; zero auth/backend/database; zero remote file transfer; free and open source; English/Arabic UI; text-first; no automatic data cleaning; downloadable XLSX only after round-trip validation; caps: 2 MiB, 10k data rows, 50 columns, 100k data cells, 32,767 UTF-16 units/cell.

**Time:** target **~8–12 focused engineering hours**, assuming a familiar React/TypeScript environment, no existing conflicts, and a successful library spike. This is an **ambitious planning budget, not a delivery promise**. Safari/Firefox fixes, unresolved dependency vulnerabilities, empty-cell serialization quirks and deep QA can realistically take additional time; preserve safety and tests, not the estimate.

## 2. Gates and dependencies

```mermaid
flowchart TD
 P0[0. Repo inspect + browser library spike] --> P1[1. Static shell + AR/EN]
 P1 --> P2[2. Worker byte decode + CSV parse]
 P2 --> P3[3. Preview + issues + choices]
 P3 --> P4[4. Safe workbook writer + full verification]
 P4 --> P5[5. UX + E2E + privacy + release]
 P0 -.failed.-> STOP[Stop, record decision, replace library or revise architecture]
```

Each phase owns a coherent working milestone. Do **not** add features from later phases “because it is easy.” If phase 0 is blocked, re-evaluate ExcelJS and/or worker packaging before implementing the UI.

## Phase 0 — Repository inspection and feasibility spike (1.0–1.5 h)

**Objective:** eliminate high-risk unknowns before feature development.

**Execution evidence:** see the [XLSX worker feasibility report](XLSX_WORKER_FEASIBILITY.md). Phase 0 **passed**:
strict typecheck, 5 Node integration tests, static production build and 15 browser
checks across Chromium/Firefox/WebKit, including downloaded-XLSX comparison.
The audit has 2 reviewed moderate findings and no high/critical findings. ExcelJS
remains selected; Phase 1 is technically ready but requires separate authorization.

**Tasks:**
1. Inspect git status, lockfile, project structure, existing implementation, scripts, docs and tests. Preserve it.
2. Confirm Node/tool versions supported by current Vite/React and selected packages; choose/pin stable compatible releases.
3. Confirm library license, build and lockfile audit. Investigate transitive vulnerabilities and decide whether reachable/high severity.
4. In a **temporary isolated experiment** (may be outside repository), prove Vite worker can import ExcelJS, write a buffer, **re-open** it, preserve `"0004"`, `"=1+1"`, `""` text and Arabic, and transfer an XLSX ArrayBuffer back to main UI on Chrome/Firefox/WebKit. Verify empty-string semantics precisely.
5. Review realistic bundle size and benchmark small vs max synthetic sample. Confirm worker availability and output's opened-file representation.
6. If library cannot meet integrity, stop and replace writer/reader with a researched alternative; update `02`, `04`, `07`, `09` and `AGENTS.md` consistently before further work.

**Expected files:** no persistent source required for planning; implementation phase might add test spike under `tests/` if useful, plus lockfile and ADR updates.

**DoD:** a documented pass/fail for license, worker runtime and exact text/empty/formula tests. **Tests:** browser-generated XLSX parsed back and inspected (not just an import succeeds). **Dependency:** none.

## Phase 1 — Static shell, tooling, localization (1.0–1.5 h)

**Objective:** minimal AR/EN accessible shell with no backend.

**Execution evidence (2026-10-28, branch `feat/phase-1-shell`):** Phase 1
**passed**: strict `npm run typecheck`, production `vite build` (static
`dist/`), and 21 Playwright checks (7 cases × Chromium/Firefox/WebKit) covering
Arabic-default RTL, EN toggle with LTR/`lang`/`title` sync, keyboard-reachable
labelled file input, synthetic drag/drop file details with `bdi` isolation,
same-file reselection after reset, and zero non-app network requests. Stack:
Vite 8.3.5, React 19.3.1, TypeScript 7.0.2 (TS7 removed `baseUrl`; alias via
`paths` only), Tailwind 4.3.3, i18next 26.5.11 + react-i18next 17.1.9,
lucide-react 1.62.0 (brand icons removed upstream; the header GitHub mark is
an authored inline SVG). shadcn registry `Button` generated via
`shadcn@4.23.0 add`, adding `cn@0.5.0` (MIT), `radix-ui@1.8.1` (MIT) and
`class-variance-authority@0.7.1` (Apache-2.0); `npm audit`: 0 vulnerabilities.
File size/type enforcement is intentionally deferred to Phase 2 gating; the
dropzone only displays the caps. Owner visual review of the rendered AR/EN
shell is still recommended.

**Tasks:** Vite React TS strict; Tailwind v4; limited shadcn/ui primitives; react-i18next Arabic default; `dir`/`lang` switch; accessible `FileDropzone`, AppShell; build scripts; static-only deployment config. Avoid router unless needed for a legal/privacy page (simple in-page section is enough).

**Expected modules:** `src/main.tsx`, `src/app/App.tsx`, `src/app/providers.tsx`, `src/i18n/*`, `src/components/import/FileDropzone.tsx`, `src/styles/*`, `vite.config.ts`, `package.json`, configs.

**Acceptance:** project builds to `dist`, no API calls, language/RTL works, choose file accessible via keyboard. **Tests:** typecheck/build + one locale/drag/drop smoke. **Depends:** phase 0.

## Phase 2 — Client worker, encoding, CSV parsing (2.0–2.5 h)

**Objective:** immutable byte→reviewable parsed table, no silent coercion.

**Tasks:** typed worker request/response messages, transfer input bytes, strict UTF-8/BOM, manually selectable Windows-1256/ISO-8859-6, delimiter candidates, Papa quote-aware parser as string arrays, limits and errors, safe final-newline semantics, 20-row preview and full-file metadata. Return only summary+sample to UI; data stays in worker. Disallow stale jobs; cancel/reset via terminate/recreate.

**Expected modules:** `src/worker/import.worker.ts`, `src/domain/encoding.ts`, `src/domain/delimiter.ts`, `src/domain/csv.ts`, `src/domain/limits.ts`, `src/domain/protocol.ts`, `src/lib/worker-client.ts`.

**Acceptance:** Arabic UTF-8 and selected legacy fixtures, comma/semicolon/tab/pipe, quoted multiline cells, uneven rows and limits behave as `03`. **Tests:** encoding bytes + malformed CSV/quoted values + limits unit/integration. **Depends:** phase 1.

## Phase 3 — Risk review UI and safe type policy (1.5–2.0 h)

**Objective:** user can see ambiguous import choices and inspect risks before export.

**Tasks:** file details, encoding/delimiter selectors, header toggle, preview table, risk flags for zeros/IDs/dates/formulas, Text default per column, opt-in Number with full-column strict gate, loading/error states, invalidation on option change. User can change encoding and delimiter from the **raw bytes**.

**Expected modules:** `src/domain/risks.ts`, `src/domain/numeric-policy.ts`, `src/components/import/{EncodingSelector,DelimiterSelector,DataPreviewTable,RiskSummary,ColumnTypeSelector}.tsx`, `src/app/import-state.ts`.

**Acceptance:** sample readable in AR/EN, no HTML injection, wrong choices cannot export without user review, Number rejected for `002`, `0.10`, long IDs. **Tests:** risk table/unit + review E2E + keyboard selector. **Depends:** phase 2.

## Phase 4 — Safe XLSX and mandatory verification (2.0–2.5 h)

**Objective:** export only an exact **verified** workbook.

**Tasks:** writer adapter in worker, one `Data` worksheet, text literal assignments, verified approved Number conversions, no formula/hyperlink objects, preserve empty fields, generate ArrayBuffer, re-open with ExcelJS, verify each row/column/text/number type/value, dimensions and formula absence, return bytes only on full pass, sanitized local download, cleanup old object URLs.

**Expected modules:** `src/domain/export-manifest.ts`, `src/worker/xlsx-adapter.ts`, `src/domain/verify.ts`, `src/lib/download.ts`, `src/components/import/ValidationResult.tsx`, `src/components/import/DownloadAction.tsx`.

**Acceptance:** `00073`, `12345678901234567890`, `03-04`, Arabic and `=1+1` preserved exactly; no formula cells; failed/tampered verification blocks download. **Tests:** workbook read-back fixtures and mismatch injection, end-to-end download inspection. **Depends:** phase 3 and passed phase 0.

## Phase 5 — Security, final QA, release preparation (1.5–2.0 h)

**Objective:** credible public MVP with reproducible tests.

**Tasks:** add negative fixtures, privacy/network interception, CSP draft with static host headers, output filename sanitation, worker cancellation/error recovery, README/license/security/privacy pages, cross-browser smoke, usability copy, production build, first public version tag. Independent XML/Excel/LibreOffice opening tests on critical fixtures. Confirm bundle and memory caps.

**Expected files:** `tests/e2e/*`, `tests/fixtures/*`, `README.md`, `LICENSE`, `SECURITY.md`, privacy content, CI workflow, host headers config, docs updates.

**Acceptance:** all P0 requirements and release checklist green. **Tests:** Vitest, Playwright, build, audit, manual Safari/Firefox/open-in-Excel. **Depends:** phase 4.

## 3. Estimate summary and sequencing

| Phase | Estimate (hours) | Milestone |
|---|---:|---|
| 0 — Feasibility / repository | 1.0–1.5 | Workbook + worker proof |
| 1 — Shell / localization | 1.0–1.5 | Static bilingual page |
| 2 — Parse / encoding | 2.0–2.5 | Preview with safe parsing |
| 3 — Review / type policies | 1.5–2.0 | User-approved settings |
| 4 — Export / verify | 2.0–2.5 | Safe XLSX ready |
| 5 — QA / release | 1.5–2.0 | Publish-ready MVP |
| **Total** | **9.0–12.5** | Aspirational focused-engineering window |

**Schedule rule:** 12.5 is near the 8–12 hour target, not a guarantee; a more conservative allocation for comprehensive release QA is 15–24+ hours. Do not skip security/verification to fit the target. Parallelize only documentation/UI copy independently; share one integration baseline. Recommended AI coding sessions: **one phase per session** after reading `AGENTS.md` and all referenced docs, with a review gate between phases.

## 4. Acceptance fixture and gate matrix

| Gate | Must demonstrate |
|---|---|
| P0 | Exact literal `""`, `"0004"`, `"=1+1"` and Arabic after write/re-open in worker |
| P1 | Static `dist`, AR/EN, RTL/LTR and accessible file input |
| P2 | Strict encoding, quoted/multiline fields, deterministic delimiter decisions, row widths/limits |
| P3 | User reviews risks, default Text, Number rejects unsafe values, preview safe |
| P4 | Full cell-by-cell XLSX comparison and block on mismatch |
| P5 | E2E downloaded output + real app smoke + privacy/no outgoing file data |

Any failed critical gate stops moving to next phase. A “working download” that cannot be verified does **not** meet MVP.

## 5. Feature prioritization

**MVP P0:** CSV→XLSX, encoding selection and honest detection, delimiter selection, quote/multiline parsing, limited sample preview, risk counts, Text/Number column types, full workbook round-trip verification, local download, 2 locales, file/structural limits, offline processing *after code/assets load*.

**P1 improvements:** clearer contextual explanations, enhanced download summary, keyboard focus polish, broader browser monitoring, simple static help/privacy page.

**Post-MVP only:** advanced workbook type maps, multiple input files, XLSX imports, saved presets, decimal/date conversions, manual cell editing, bigger files/streamed XLSX writer, more encodings, additional delimiters, source repair, third-party system integrations, AI.

## 6. AI-agent execution pattern

For each phase, start a clean coding-agent session with: (1) exact phase, (2) `AGENTS.md`, (3) relevant docs, (4) inspected repo state, (5) explicit acceptance cases. Agent should inspect before editing, implement **only** phase scope, run tests, report modified files and unresolved findings, update docs if decisions changed, and stop. Never launch full autonomous feature implementation based on all 10 docs at once without review checkpoints.

## 7. Final review questions (implementation-time, not product ambiguity)

- Did ExcelJS runtime and dependencies pass phase-0 browser/security checks? If not, what documented replacement was approved?
- Did exact empty-string text survive writer/read-back? If not, pause instead of relaxing invariant.
- Can the max accepted fixture finish reliably in Chrome/Firefox/Safari without freezing UI? If not, lower caps and retest.
- Are privacy/copy claims true on the deployed host (headers, fonts and outgoing traffic)?
- Does opening XLSX with Excel/LibreOffice show literal formula-like strings and long IDs?

**Definition of Done:** Tests/checklists attached to each phase are satisfied; no unapproved scope growth; docs agree; no unresolved blocking integrity/security risk.
