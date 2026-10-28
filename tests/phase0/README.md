# Phase 0 isolated feasibility experiment

This directory is a disposable technical harness, not Nassaq application source.
There is no application UI, file picker, backend, or persistence. All input is synthetic.
See `../../docs/PHASE_0_REPORT.md` for completed feasibility evidence and release follow-ups.

Run commands from this directory:

```powershell
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run inventory
npm run evidence:bundle
npm audit --json
```

Browser downloads exceed 50 MB and must be executed by the user:

```powershell
npx playwright install chromium firefox webkit
```

Once installed:

```powershell
npm run test:e2e
npm run evidence:browsers
```

`test:e2e` serves only built static files using Vite preview. Its 15 cases passed
in Chromium, Firefox and WebKit: small, 10,000-row/100,000-cell,
50-column/100,000-cell, and near-2-MiB/32,767-unit-cell fixtures, plus browser
decoder/refusal checks. Each workbook is reopened inside the worker, transferred,
downloaded via Blob, and compared cell by cell again in Node. JSZip additionally
checks ZIP CRCs, explicit string-cell counts, formula absence and external-link
absence. It is a test-only dependency already present transitively through ExcelJS.

Processing runs offline using an already-loaded retained worker, with no requests
after disconnection. Recreating a worker offline is not guaranteed across engines.
JSON test reports go to ignored `test-results/`; compact synthetic evidence is
retained in `evidence/`. Rebuild before browser tests after changing worker/main code.

The worker calls Papa synchronously with `worker:false` because parsing is
already inside our dedicated module worker. Papa's built-in worker helper is
unnecessary. This spike intentionally does not implement Phase 2 parsing policy,
Phase 3 numeric validation, or the production Phase 4 verification adapter.
