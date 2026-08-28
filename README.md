# YTDBNS Monthly Intelligence V5.0

YTDBNS Monthly Intelligence is a Cloudflare Workers application for monthly Amazon US operating intelligence. The product has two deliberately different presentation architectures over the same data contracts:

- **Desktop / PC:** nine-module operating cockpit optimized for wide-screen scanning, comparison, tables, import workflow and detailed analysis.
- **Native Mobile:** independent iPhone-first view architecture optimized for one-handed navigation, an action queue, compact record lists, bottom sheets, full-screen Search / Detail / Compare and read-only operating review.

## Production status

V5.0 Native Mobile was merged to `main` on 2026-08-27. The release merge baseline before the current mobile IA redesign is:

- GitHub `main`: `b5b8b736ef480fc97129a92367a34a6f0b3e28c6`
- Worker: `ytdbns-monthly-intelligence`

The current mobile redesign must continue through PR acceptance before a new Production release. Do not treat a feature branch as deployed Production.

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

Mobile uses its own root and does not transform the Desktop DOM.

Authoritative primary navigation is exactly five destinations:

`首页 / 待办 / 广告 / 商品 / 库存`

Contextual destinations remain available through drill-down, Search and operating signals:

`利润 / 扣费 / 退货 / 历史 / 数据`

The mobile information architecture is action-first:

- `首页` is an Executive Brief: result → exceptions → operating pulse → trend.
- `待办` is the cross-business Action Queue.
- `广告 / 商品 / 库存` follow result → risk → records.
- Filters and sorting use a shared bottom sheet rather than horizontal filter strips.
- Search, Period, Detail and Compare use modal/full-screen surfaces with contained focus and Safari Back-aware route behavior.

Mobile is designed around iPhone safe areas, >=44px touch targets, no document-level horizontal scrolling, deterministic SVG icons and readable record-card typography.

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

Legacy V5.1 static/browser gates describe the superseded mobile IA and are not authoritative for the redesigned navigation contract.

The accepted redesign was validated on its exact feature head with a dedicated same-origin Playwright runtime matrix covering:

- Chromium `393x852`
- Chromium `430x932`
- WebKit `393x852`
- WebKit `430x932`

The acceptance matrix verifies primary/contextual routing, browser Back behavior, Search, Period, Filter/Sort, Detail, Compare, modal focus containment, >=44px visible touch targets, zero horizontal overflow, zero console/page errors and GET-only browser API traffic.

## Release discipline

1. Develop on a non-production branch.
2. Run syntax/source integrity checks on the exact branch head.
3. Run Chromium/WebKit acceptance on the exact product code before promotion.
4. Create/review a PR; do not bypass a real P0/P1 gate.
5. Merge to `main` only after acceptance.
6. Let the existing Cloudflare Production `main` build deploy the merge commit.
7. Verify exact-main build/version/traffic and narrow Production runtime behavior.

Do not recreate D1/R2 resources and do not overwrite Production with an older V4 artifact.
