# YTDBNS Monthly Intelligence — V5 Production Operations Handoff

Updated: 2026-08-27

## Current phase

V5.0 Native Mobile has already been merged and released. The current workstream is a **Desktop + Native Mobile full UI integrity / polish pass** on a non-production branch.

Do not restart V4.14 deployment work and do not recreate existing Cloudflare resources.

## Authoritative repository state

Repository: `mrtanshiyue/YTDBNS-Monthly-Intelligence`

Production baseline before the current polish pass:

- `main`: `3e42ef1ecff923f15dc242bc521c58c113edf8c1`
- merged PR: #2 — `V5.0 Native Mobile Experience`
- exact accepted V5 source tree: `3a5c3507ebcf5175f5824901c74e1633056e8883`

Current polish branch:

- `audit/v5-pc-mobile-polish`
- purpose: consolidate UI runtime layers, audit all Desktop/Mobile presentation details, accessibility and maintainability
- boundary: **do not deploy this branch directly to Production**

## Current Production evidence

Worker: `ytdbns-monthly-intelligence`

Exact-main Cloudflare Workers Build after PR #2 merge:

- Build ID: `9cfb8828-d0f4-4697-8f82-e0463022067d`
- source SHA: `3e42ef1ecff923f15dc242bc521c58c113edf8c1`
- Worker Version: `c6b27555-f366-4e12-981f-0285f5bf8837`
- build conclusion: SUCCESS

The accepted feature head `746074c9c827cae51eed40464c9b7195572d3a75` and the Production merge commit have the same Git tree, so the V5 release had no merge-source drift.

## Existing Cloudflare resources — DO NOT recreate

### D1

- Name: `ytdbns-monthly-db`
- Database ID: `daad1ce7-a13a-49a5-8581-14294b153147`

### R2

- Bucket: `ytdbns-monthly-raw-reports`

### Worker bindings

`wrangler.jsonc` binds:

- `DB` -> `ytdbns-monthly-db`
- `RAW_REPORTS` -> `ytdbns-monthly-raw-reports`
- static assets -> `public/`
- Worker -> `ytdbns-monthly-intelligence`

Do not touch unrelated `ads-operations-*` resources.

## Current UI architecture

### Desktop

Desktop retains the proven nine-module application/rendering core. Historical `v43`–`v53` CSS remains as cumulative compatibility styling.

Current runtime policy after the polish pass:

- keep `v43.js`–`v47.js` real product enhancements;
- use `current-ui.js` / `current-ui.css` as the canonical current convergence layer;
- do not load duplicate `v48.js`–`v53.js` runtime helpers;
- do not load retired V4.15 responsive `v54.css`, `v54-acceptance.css` or `v54.js`.

The v54 files remain in the repository unchanged as historical/frozen evidence.

### Native Mobile

Mobile is independent from the Desktop primary DOM and owns all nine mobile views, its five-item bottom navigation, More, Period, Search, Detail and Compare surfaces.

V5 Mobile remains GET-only and must never call import mutation endpoints.

## Required release gates for the current polish branch

Before merge:

```bash
npm install
npm run check:release:static
```

The static release gate composes:

1. `check:v5:mobile:static` — architecture, GET-only and frozen-baseline invariants
2. `check:ui:static` — Desktop/Mobile entrypoint, readability, accessibility and runtime-consolidation invariants

Then perform real Chromium acceptance on the exact branch head when a browser runner is available:

- iPhone 375×812
- iPhone 390×844
- iPhone 393×852
- iPhone 430×932
- Desktop 1440×900
- Desktop 1920×1080

Required result:

- P0 = 0
- P1 = 0
- no horizontal overflow
- no console/page errors
- all nine Desktop destinations work
- all nine Mobile views work
- Period/Search/Detail/Compare work
- modal focus lifecycle works
- Mobile network behavior remains GET-only
- no D1/R2/import mutation

## Release order

1. Finish audit branch changes.
2. Lock exact branch head.
3. Run static gates.
4. Run exact-head Chromium matrix when available.
5. Create/review Draft PR.
6. Mark Ready only after acceptance.
7. Merge to `main` with expected-head protection.
8. Let the existing Cloudflare Production `main` build deploy the merge commit.
9. Verify Production build/version/traffic and narrow runtime acceptance.

Do not manually deploy an audit/feature SHA over Production and do not restore obsolete V4 deployment instructions.
