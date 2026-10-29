# Nassaq — Open Source, Distribution and Release

**Version:** 1.0 · **Project:** Nassaq / نسّق · **Operating model:** completely free, browser-local, static website.

## 1. Open-source position and license

Nassaq's entire application is public source and free to use. The design must not hide data processing behind proprietary server endpoints. The core CSV decode→parse→XLSX engine remains inspectable.

| License | Advantages | Tradeoffs |
|---|---|---|
| **MIT** | Short, permissive, easy for individuals, businesses and education; matches ExcelJS's MIT license | No obligation for downstream improvements to remain public |
| Apache-2.0 | Permissive plus explicit patent license and NOTICE requirements | Longer obligations and license notice management |
| GPLv3 | Strong copyleft for distributed derivative binaries | More obligations/incompatibilities for some adopters; doesn't ensure hosted changes published without AGPL-style terms |
| AGPLv3 | Encourages disclosure of network-hosted modifications | Larger compliance burden, may discourage simple embedding/use |

**Decision:** **MIT** for Nassaq source code. It maximizes reuse in small-business and educational settings. This is a project licensing recommendation to be applied when the repository owner approves publishing; include the standard MIT text in `LICENSE` with the correct copyright holder and year—do not invent a legal name.

**Dependencies:** React/Vite/TypeScript/Papa Parse/i18next/Tailwind/shadcn/ExcelJS/Lucide licenses must be checked against their exact resolved versions when installing. **ExcelJS is MIT**, **SheetJS Community Edition is Apache-2.0** if chosen later; this does not mean every dependency version or included subpackage has identical terms. Keep a license inventory and all attribution/NOTICE files required by applicable packages.

## 2. Proposed public repository structure

```text
nassaq/
├─ LICENSE
├─ README.md
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md             # optional but recommended for public community
├─ SECURITY.md
├─ AGENTS.md
├─ docs/
│  ├─ 01_PRODUCT_REQUIREMENTS.md
│  ├─ 02_TECHNICAL_ARCHITECTURE.md
│  ├─ 03_CSV_PARSING_AND_ENCODING.md
│  ├─ 04_DATA_INTEGRITY_AND_VALIDATION.md
│  ├─ 05_UI_UX_SPECIFICATION.md
│  ├─ 06_SECURITY_AND_PRIVACY.md
│  ├─ 07_TESTING_STRATEGY.md
│  ├─ 08_IMPLEMENTATION_PLAN.md
│  └─ 09_OPEN_SOURCE_AND_RELEASE.md
├─ src/                            # implemented phase-by-phase later
├─ public/                         # first-party static assets
├─ tests/fixtures/                 # synthetic only
├─ tests/e2e/
├─ .github/ISSUE_TEMPLATE/
├─ .github/PULL_REQUEST_TEMPLATE.md
├─ .github/workflows/ci.yml
├─ package.json
└─ package-lock.json               # or one equivalent lockfile
```

Do not add server functions, secret-bearing `.env` files, Docker/database/services or production telemetry merely to look enterprise-grade.

## 3. README contract

README should answer in this order:

1. **What Nassaq is:** free Arabic-first safe CSV→XLSX converter; short English/Arabic tagline and one truthful UI screenshot.
2. **Who it helps:** admins/accountants/HR/schools/small businesses needing stable Arabic text and identifiers.
3. **How to use:** open website, select CSV, check encoding/separator, review preview/warnings, keep Text or explicitly choose Number, generate and download verified XLSX.
4. **Privacy:** files processed locally; no file-content transmission; mention static hosting provider access logs are possible and a compromised browser/device is outside the claim.
5. **Limits:** ≤2 MiB, ≤10,000 data rows, ≤50 columns, ≤100,000 data cells, ≤32,767 UTF-16 units/cell, and one file at a time.
6. **Known limitations:** wrong or already-damaged encoding cannot always be repaired; defaults text; only CSV input; exact text read-back is verified, no cross-app guarantee of display formatting.
7. **Development prerequisites:** current compatible Node/npm; clean install; documented scripts (`dev`, `build`, `preview`, `typecheck`, `test`, `test:e2e`, `lint`). Only list scripts actually implemented.
8. **License, contributing, security reporting**, and acknowledgments.

A screenshot must not show actual customer/school/employee data; use synthetic fixtures.

## 4. Contribution policy

**CONTRIBUTING.md:** fork, branch from `main`, focused PR per problem, link issue, conform to TypeScript strict and AR/EN localization, add regression fixture for parser/integrity changes, run tests and build, never attach sensitive customer CSVs. PR description must include: rationale; files changed; integrity impact; sample **synthetic** before/after; tests; screenshots for UI; browser impact; docs updates. Use conventional or clear descriptive commits, e.g. `fix: preserve literal plus-prefixed cells`.

**Issue forms:** `Bug report`, `Feature request`, `Security issue?` (redirect to private reporting), `Encoding fixture request`. Warn users to **redact real names, identifiers, phones and finance data** and instead submit minimal synthesized examples. Require browser version, CSV encoding/delimiter if known, exact reproduction using fake values, expected vs actual, verified output type if issue relates to data.

**Review rules:** all PRs require tests for changed invariants and a review of potential network-data leakage. Security/export changes need a second reviewer if maintainers available; if solo maintainer, explicitly run independent test checks and document review evidence. `main` should require passing CI and no direct force pushes when hosting supports rules.

## 5. Versioning and release cadence

Semantic versioning: `0.1.0` = MVP candidate/beta; `1.0.0` once tested browser/local-processing guarantees are stable. Increment patch for fixes without changing supported behavior, minor for backward-compatible user features or new encodings, major for breaking product/data semantics or reduced declared guarantees. For changing input limits, add release note and tests; do not silently change capabilities.

**Release artifacts:** static `dist/` from clean build, tag/versioned source, changelog entry, license inventory, test summary and deployment preview; do not distribute genuine user CSV files, keys or personal usage logs.

## 6. Pre-release checklist

- [ ] All P0 requirements in `01_PRODUCT_REQUIREMENTS.md` implemented and tested.
- [ ] All documents and AGENTS match actual stack/version/limits.
- [ ] ExcelJS or documented replacement passed worker/read-back and empty-string feasibility gate.
- [ ] No formula-like source became an executable formula in XLSX.
- [ ] Every golden Arabic, leading-zero, long-number and date-shaped fixture compared in **actual** downloaded workbook.
- [ ] Invalid encoding, malformed CSV, uneven row, unsupported file and over-limit files reject safely.
- [ ] Browser tests: Chrome, Edge, Firefox and Safari, with localization/RTL keyboard smoke.
- [ ] Network privacy audit: no CSV bytes, filenames, rows or workbook sent externally; no analytics/remote fonts.
- [ ] CSP and static host security headers tested in preview.
- [ ] Dependency audit, license attribution and lockfile review completed; no unreviewed reachable high/critical security findings.
- [ ] MIT `LICENSE` with verified correct copyright, README, CONTRIBUTING, SECURITY and privacy page published.
- [ ] Static build contents audited for API endpoints, secrets and unexpected services.
- [ ] README claims do not exceed actual behavior; screenshots contain synthetic data.
- [ ] Changelog, release tag and rollback plan ready.

## 7. Hosting/deployment design

Deploy **`dist/`** to a static hosting provider (e.g. Cloudflare Pages, Netlify, GitHub Pages, Vercel configured for static Vite) over HTTPS. Use Vite `base` configuration for subpaths, never hardcode `/assets/...` paths that break on GitHub Pages. Set correct JavaScript MIME types and static security headers; ensure module worker asset URLs resolve in production. First-party assets only. No backend, DNS proxy logic or storage bucket is needed for file processing.

**Smoke after deploy:** load page, open DevTools Network, select synthetic Arabic CSV, disconnect after assets are loaded, generate XLSX, verify the workbook locally and ensure no outgoing request holds sentinel data. Test on an actual static-host preview (not only `vite dev`).

## 8. Privacy policy, security disclosure and sustainability

Privacy policy states that Nassaq reads selected files inside the browser, does not upload/store their contents, does not require an account, and has no application analytics/cookies. Clearly separate hosting-provider logs and external project-link requests. Give a contact/issue pathway chosen by the maintainer; do not invent email or domain ownership. Explain memory/session lifetime honestly. Security report path should use private channel and a safe reproduction; avoid requesting real customer data.

Long-term maintenance: at least occasional dependency security reviews, browser regression checks, Arabic/English string upkeep, small focused releases. No monetization or SaaS billing in MVP; future donations/sponsorship are independent of user-file processing.

## 9. Research and final caveats

Licensing checked against [ExcelJS](https://github.com/exceljs/exceljs), [SheetJS CE](https://docs.sheetjs.com/docs/miscellany/license/) and [SheetJS installation documentation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/). Static deployment capabilities documented by [Vite](https://vite.dev/guide/static-deploy.html).

**Phase 0:** installed dependency/license inventory, npm audit, three-engine worker
interoperability and static-preview downloads are recorded in `XLSX_WORKER_FEASIBILITY.md`.
The undeclared-license Node-only `buffers` package is absent from ExcelJS's mapped
browser bundle and must not be distributed as part of a Node dependency tree.
Ship `dist/` only. Full browser-vendored dependency attribution, current advisory
review, real-office/browser QA and deployment security configuration remain release
gates. The supply-chain skill's Python collector could not run in the available
environment; no claim of its automated report being complete is made.
