# XLSX worker feasibility report

**Date:** 2026-10-28 · **Verdict:** Phase 0 passed; technically ready for Phase 1,
which requires separate authorization. No product UI or later-phase implementation
has been started. This is a feasibility verdict, not a public-release clearance.

## 1. Repository and scope

Read `AGENTS.md` and all nine numbered planning documents before implementation.
The initial directory contained those documents only: no application, manifest,
lockfile, tests or Git repository. Existing documents were preserved.

The experiment is isolated in `tests/feasibility/xlsx-worker/`, with its own private package,
strict TypeScript configuration and lockfile. All fixtures are synthetic. There
is no real-file picker, application UI, backend, database, upload or persistence.

During the session the owner initialized Git and configured a remote. The initial
branch was unborn `master`. Work continued on `chore/phase-0-feasibility`; no
commits or pushes were made because committing was not explicitly authorized.

## 2. Stack and dependency decisions

Environment: Windows, Node **24.21.0**, npm **11.19.0**.

| Package | Pinned version | Declared license | Role |
|---|---|---|---|
| Vite | 8.3.5 | MIT | Production static build and module-worker bundling |
| TypeScript | 7.0.2 | Apache-2.0 | Strict typechecking |
| Papa Parse | 5.7.0 | MIT | Positional string-array parsing inside our worker |
| ExcelJS | 4.4.0 | MIT | Browser XLSX creation and read-back |
| Vitest | 5.0.5 | MIT | Node vendor integration checks |
| Playwright Test | 1.64.1 | Apache-2.0 | Chromium, Firefox and WebKit tests |
| JSZip | 3.10.2 | MIT OR GPL-3.0-or-later | Test-only independent ZIP/CRC/XML inspection; MIT option |
| @types/node | 26.6.5 | MIT | Development declarations |
| @types/papaparse | 5.5.2 | MIT | Development declarations |

Node satisfies Vite's `^20.19.0 || >=22.12.0`, Vitest's
`^22.12.0 || ^24.0.0 || >=26.0.0` and Playwright's `>=20` requirements.
JSZip was already an ExcelJS transitive dependency; declaring it explicitly for
tests installed no additional packages. No package lifecycle scripts were enabled.

Registry metadata also confirmed React/react-dom 19.3.1 (MIT),
Tailwind/@tailwindcss/vite 4.3.3 (MIT), i18next 26.5.11 (MIT),
react-i18next 17.1.9 (MIT), lucide-react 1.62.0 (ISC) and shadcn CLI 4.23.0 (MIT).
These UI packages were not installed in the spike. Their integrated configuration
and any generated shadcn components belong to Phase 1.

## 3. Executed evidence and gate results

| Check | Result |
|---|---|
| Clean `npm ci --ignore-scripts` | Pass; lockfile reproduction followed by typecheck, integration tests and identical-hash production build |
| Strict `npm run typecheck` | Pass |
| `npm test` | **5/5 pass** |
| `npm run build` | Pass; static `dist/` output |
| `npm run test:e2e` | **15/15 pass**, three engines, 1.7-minute test run |
| Browser-downloaded XLSX comparison | All expected cells match values and string types |
| Literal `0004`, `=1+1`, `""`, Arabic | Exact after worker write/load and downloaded read-back |
| ZIP CRC and independent XML inspection | Pass; expected explicit string-cell counts, no formulas or hyperlinks |
| External workbook content | No external relationships, external links, connections or VBA package entries in tested output |
| Browser decoding | Windows-1256 and ISO-8859-6 synthetic bytes match Arabic; malformed UTF-8 returns error without output bytes |
| Offline/privacy smoke | Pass; no requests during processing after worker warmup; local/session storage remain empty |
| Main-thread responsiveness | Timer continues during processing in all engines |
| Dependency inventory and `npm ls --all` | Reviewed; 282 lockfile package entries, including optional platforms |
| `npm audit --json` | **2 moderate findings**, **0 high**, **0 critical**; one underlying advisory, assessed below |

Compact, reproducible artifacts:

- `tests/feasibility/xlsx-worker/evidence/browser-results.json`: per-case verdicts, browser versions,
  input/output bytes, worker write/load/verify timing and main-thread timer ticks.
- `tests/feasibility/xlsx-worker/evidence/dependency-inventory.json`: resolved versions, declared
  licenses, registry URLs, integrity presence and install-script flags.
- `tests/feasibility/xlsx-worker/evidence/bundle-evidence.json`: minified browser sourcemap dependency
  paths, inspected exclusions, build asset sizes and gzip sizes.

The small fixture also covers long IDs, date-shaped tokens, Arabic-Indic digits,
formula prefixes, significant whitespace, quoted delimiters/quotes, multiline text,
HTML-looking text, URL-looking text, Unicode normalization distinctions, bidi
marks, literal U+FFFD and embedded U+FEFF. Duplicate/empty headers, trailing empty
cells and an entirely empty final record all survive as explicit strings.
Node tests additionally exercise primitive numbers alongside empty text, and
verify that a missing cell is not equivalent to an expected empty string.

### Browser benchmarks

Measured worker timing covers XLSX creation, buffer generation, reload, full
cell comparison and output-buffer copy; it excludes CSV parsing, Playwright input
serialization, page startup, download handling and Node-side ZIP/read-back checks.
Numbers describe this synthetic run, not a performance promise.

| Fixture | CSV bytes | Dimensions including header | Chromium 156.0.8078.4 | Firefox 157.0 | WebKit 27.2 |
|---|---:|---|---:|---:|---:|
| Small | 360 | 8 × 4 | 39 ms | 59 ms | 27 ms |
| Maximum rows/cells | 1,798,949 | 10,001 × 10 | 1,229 ms | 1,756 ms | 1,416 ms |
| Maximum columns/cells | 1,826,789 | 2,001 × 50 | 1,187 ms | 1,684 ms | 1,391 ms |
| Long cells / near byte cap | 2,064,580 | 64 × 1; 63 cells at 32,767 UTF-16 units | 144 ms | 191 ms | 129 ms |

All expected values and dimensions were compared after actual downloads.
These tests demonstrate successful bounded workloads and responsiveness, not
peak-memory measurements or guarantees for all possible inputs/devices.

### Static output size

The main JS asset is **1,205 bytes**, **684 bytes gzip**. The worker containing
Papa and ExcelJS is **952,770 bytes**, **264,109 bytes gzip**. HTML is approximately
0.21 kB. Worker cost is material but compatible with the planned small static app.
No source data is embedded in a runtime URL. `base:'./'` emits relative assets.
Tests run against the production build served by static Vite preview, not dev mode.

## 4. Failed experiments and resolution

1. Initial strict typechecking exposed mixed DOM/worker declarations and the
   ExcelJS Buffer declaration mismatch with Node's current Buffer types. The
   harness uses global worker postMessage transfer options and explicit
   ArrayBuffer copies; no unchecked casts were introduced.
2. Vitest initially discovered Playwright specs. The integration script now
   targets `probe.test.ts`; both runners pass independently.
3. Browser downloads timed out or were incomplete. Later test attempts failed at
   browser launch before any worker code executed. The owner completed downloads;
   no further downloads over 50 MB were initiated by the agent.
4. After installation, Firefox passed but Chromium/WebKit failed when the harness
   terminated a warmed worker and tried to fetch a fresh worker script offline.
   Reusing the already-loaded worker fixes the test and matches the intended
   active-job architecture. The final assertions require **zero** processing-time
   requests. This changes no CSV value or workbook integrity policy.
5. The supply-chain skill's automated collector could not execute: neither `uv`
   nor Python is installed. `gh` authentication is available. No automated
   publisher/staleness/OSV report is claimed; npm's lockfile audit and source/bundle
   inspection provide the Phase 0 dependency evidence. Running the collector is
   an additional maintenance/release follow-up, not a claim of clean coverage.

## 5. Security and license assessment

### Audit finding: uuid

The current npm audit reports ExcelJS and `uuid@8.3.2` for the same advisory,
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The advisory affects v3/v5/v6 with caller-provided output buffers. ExcelJS source
imports **v4** for conditional-format extension IDs. This spike creates no
conditional formatting, and CSV strings are never supplied to uuid calls.

The minified bundle sourcemap includes uuid's v3/v5 implementation as well as v4;
therefore the affected code is **present**, but no reachable CSV-controlled call
to the affected API was identified. The finding is reviewed as nonblocking for
this constrained feasibility spike and starting Phase 1. It remains open for
reassessment before production adoption/release. This is not a clean audit or an
assertion that every bundled dependency is vulnerability-free. Do not apply npm's
suggested forced ExcelJS downgrade or an untested major uuid override.

### License scope and distribution

ExcelJS and Papa's direct licenses are MIT. The resolved dependency inventory
records permissive, dual-option and development-tool licenses; JSZip's MIT option
is compatible, pako carries MIT and Zlib notices, and Lightning CSS uses MPL-2.0
as development tooling. All 282 lockfile package entries have integrity hashes.
Only optional macOS `fsevents` is flagged with an install script; installation
uses `--ignore-scripts` successfully.

`buffers@0.1.1` has no declared lockfile license and no packaged LICENSE. Its
ancestry is ExcelJS → unzipper → binary → buffers. Upstream license retrieval
returned 404; no license was inferred. Inspection of **the minified browser
bundle's own sourcemap**, with 534 sources, finds no `buffers/`, `unzipper/` or
`archiver/` paths. This closes the question of that package's inclusion in the
selected browser distribution: it is not part of that mapped browser code.
The Node dependency tree must not be distributed as a release artifact; deploy
only `dist/`. Any future Node redistribution requires resolving this license first.

ExcelJS's browser file is prebundled. Its embedded dependency versions and full
attribution cannot be equated with the newly resolved npm tree. The sourcemap
inventory is retained explicitly for a final vendored-code advisory/NOTICE review.
This is a release follow-up; the selected library's MIT license and static-only
feasibility pass. No legal copyright holder or project publication license was
invented. No real user file was used or sent to audit services.

## 6. Confirmed architecture decisions

- Retain Vite + dedicated module worker + Papa Parse + ExcelJS. No replacement
  writer/reader or backend is required by the tested cases.
- Papa runs synchronously with `worker:false` inside the dedicated worker;
  its own helper worker is unnecessary. Parsing returns positional strings.
- Literal string assignments, including empty strings, survive write/load exactly.
  No prefixing, trimming, normalization or automatic number/date conversion is used.
- Worker verifies every cell before returning bytes; the page downloads a Blob.
  Input/output ArrayBuffers transfer across the worker boundary.
- Keep the active worker loaded for offline processing. Reset/cancel may terminate
  it; starting a new worker offline must not assume identical caching across engines.
- A static `dist/` can serve the tested pipeline. Actual host configuration, HTTPS,
  subpath smoke and CSP headers still need deployment testing.
- No integrity-policy changes are needed. Product limits remain unchanged.

## 7. Remaining release work and phase boundary

These are not claims of work completed by this spike:

- Real Chrome/Edge/Safari and Excel/LibreOffice interoperability; Playwright WebKit
  on Windows is not actual Safari on macOS.
- Peak-memory profiling, constrained devices and broader worst-case inputs.
- Production parser/encoding/delimiter/limit policies, numeric gate, stale-job and
  cancellation protocol, localization/accessibility and user-facing error handling.
- Full product privacy interception, no-persistence review, CSP/host validation and
  vendored dependency attribution/current advisory review.

Those obligations remain in their planned phases. Phase 0's required browser
worker, exact empty/text/formula, build, audit review and benchmark feasibility
gates have passed. **Stop here and obtain approval before Phase 1.**
