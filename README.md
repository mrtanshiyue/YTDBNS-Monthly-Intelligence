# YTDBNS Monthly Intelligence V5.0

YTDBNS Monthly Intelligence is a Cloudflare Workers application for monthly Amazon US operating intelligence. The product now has two deliberately different presentation architectures over the same data contracts:

- **Desktop / PC:** nine-module operating cockpit optimized for wide-screen scanning, comparison, tables, import workflow and detailed analysis.
- **Native Mobile:** independent iPhone-first view architecture optimized for one-handed navigation, record cards, bottom sheets, full-screen Search / Detail / Compare and read-only operating review.

## Production status

V5.0 Native Mobile was merged to `main` on 2026-08-27. The release merge baseline before the current UI-polish pass is:

- GitHub `main`: `3e42ef1ecff923f15dc242bc521c58c113edf8c1`
- Cloudflare Production build: `9cfb8828-d0f4-4697-8f82-e0463022067d`
- Production Worker Version: `c6b27555-f366-4e12-981f-0285f5bf8837`
- Worker: `ytdbns-monthly-intelligence`

The current repository work must continue through a branch + acceptance gate before a new Production release. Do not treat an audit or feature branch as deployed Production.

## Current UI architecture

### Desktop

Desktop retains the proven V4 application/rendering core and nine destinations:

`总览 / 利润 / 扣费 / 广告 / 商品 / 库存 / 退货 / 历史 / 数据`

Historical `v43`–`v53` CSS remains as a compatibility foundation because later design layers intentionally override earlier application markup. Runtime behavior is narrower:

- `v43.js`–`v47.js` retain real product enhancements such as page tabs, charge navigation and icon decoration.
- `current-ui.js` is the canonical current polish/accessibility runtime.
- Redundant `v48.js`–`v54.js` runtime helpers are not loaded.
- Legacy V4.15 mobile-responsive `v54.css` / `v54-acceptance.css` remain in the repository only as historical frozen evidence and are not loaded by the V5 entry point.

### Native Mobile

Mobile uses its own root and does not transform the Desktop DOM:

```text
public/mobile/
  mobile-shell.js
  mobile-shell.css
  mobile-interactions.js
  mobile-interactions.css
  mobile-compare.js
  mobile-compare.css
  views/
    overview.js
    ads.js
    products.js
    inventory.js
    finance.js
    charges.js
    returns.js
    history.js
    data.js
```

Primary mobile navigation is exactly five destinations:

`首页 / 广告 / 商品 / 库存 / 更多`

`更多` contains `利润 / 扣费 / 退货 / 历史 / 数据`.

Mobile is designed around iPhone safe areas, >=44px touch targets, no document-level horizontal scrolling, native dialog focus lifecycle, deterministic SVG icons and readable record-card typography.

## Data and mutation boundaries

The Desktop product retains the existing import workflow. Native Mobile is intentionally **read-only**:

- no POST / PUT / PATCH / DELETE from V5 mobile browser code;
- no direct D1 or R2 access from the browser;
- no `/api/imports/start`, `/api/imports/file` or `/api/imports/commit` calls from V5 Mobile;
- Search, Detail and Compare use GET-backed runtime data only.

Cloudflare bindings remain:

- `DB` -> `ytdbns-monthly-db`
- `RAW_REPORTS` -> `ytdbns-monthly-raw-reports`
- static assets -> `public/`
- Worker -> `ytdbns-monthly-intelligence`

## Quality gates

Run the architecture and UI integrity gates before any release:

```bash
npm install
npm run check:release:static
```

Individual gates:

```bash
npm run check:v5:mobile:static
npm run check:ui:static
```

Real browser acceptance should cover the supported matrix before Production promotion:

- iPhone: `375x812`, `390x844`, `393x852`, `430x932`
- Desktop: `1440x900`, `1920x1080`

The browser gate must remain GET-only and fail on console/page errors, horizontal overflow, broken mobile focus/overlay behavior or Desktop regression.

## Release discipline

1. Develop on a non-production branch.
2. Run static gates on the exact branch head.
3. Run Chromium acceptance on the exact head when a browser runner is available.
4. Create/review a PR; do not bypass a failing P0/P1 gate.
5. Merge to `main` only after acceptance.
6. Let the existing Cloudflare Production `main` build deploy the merge commit.
7. Verify exact-main build/version/traffic and narrow Production runtime behavior.

Do not recreate D1/R2 resources and do not overwrite Production with an older V4 artifact.
