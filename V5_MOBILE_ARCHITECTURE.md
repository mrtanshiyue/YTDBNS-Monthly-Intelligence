# YTDBNS Monthly Intelligence V5.0 — Native Mobile Architecture

## Current production architecture

V5 Native Mobile is no longer a phased prototype. It is the supported mobile presentation architecture while Desktop retains its proven wide-screen application core.

- Desktop: nine-module operating cockpit, supported at 1440×900 and 1920×1080 acceptance viewports.
- Mobile: independent View Architecture, supported on the iPhone matrix 375×812, 390×844, 393×852 and 430×932.
- Shared data layer: `public/shared/runtime.js`, formatters and selectors.
- Mobile mutation policy: GET-only.
- Production release baseline before the current UI-polish pass: `main` `3e42ef1ecff923f15dc242bc521c58c113edf8c1`.

## Architecture

```text
public/
  shared/
    runtime.js
    formatters.js
    selectors.js
    secondary-selectors.js
  mobile/
    mobile-shell.js
    mobile-shell.css
    mobile-interactions.js
    mobile-interactions.css
    mobile-compare.js
    mobile-compare.css
    mobile-app-bridge.js
    mobile-compare-trigger.js
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
  current-ui.js             # canonical cross-device polish/accessibility runtime
  current-ui.css            # final cross-device convergence layer
  app.js                    # Desktop application/rendering core
```

Desktop and Mobile intentionally share data/state contracts, not primary DOM contracts.

## Mobile primary navigation

Exactly five primary destinations:

1. 首页 (`overview`)
2. 广告 (`ads`)
3. 商品 (`products`)
4. 库存 (`inventory`)
5. 更多 (`more`)

Secondary destinations under More:

- 利润 (`finance`)
- 扣费 (`charges`)
- 退货 (`returns`)
- 历史 (`history`)
- 数据 (`data`)

## Hard boundaries

Mobile code must not depend on the Desktop primary UI as its rendering contract. In particular, Mobile must not reuse or transform:

- `#mainNav`
- `#periodPopover`
- `#importDrawer`
- `#commandPalette`
- `#detailDrawer`
- `#panelModal`

The Mobile implementation owns its own:

- top bar and five-item fixed bottom navigation;
- More dialog;
- Period bottom sheet;
- full-screen Search and Detail;
- previous-period Compare;
- record-card views;
- focus lifecycle and iPhone safe-area behavior.

## Interaction and accessibility contract

- minimum 44px touch targets;
- no document/body horizontal overflow;
- iOS date/search inputs remain at >=16px where focus zoom is relevant;
- deterministic inline SVG navigation icons rather than font-specific symbol glyphs;
- interactive Campaign / SKU / inventory / charge records use native button semantics;
- More, Period, Search, Detail and Compare keep focus inside the active modal surface;
- Escape closes supported modal surfaces and focus returns to the originating control;
- reduced-motion preference is respected;
- small operational labels use a raised readability floor rather than 8–9px text.

## Data safety contract

V5 Mobile is read-only:

- no POST / PUT / PATCH / DELETE requests;
- no import start/file/commit mutation endpoints;
- no direct D1 binding access;
- no direct R2 binding access;
- Compare retrieves previous-period data through the shared runtime;
- inventory uses source-aware snapshot semantics and must not fabricate a snapshot.

## Desktop compatibility strategy

The Desktop HTML/rendering core remains stable. Historical presentation CSS `v43`–`v53` stays loaded as a compatibility foundation because the layers are cumulative. The runtime has been simplified:

- keep `v43.js`–`v47.js` where they provide real behavior;
- use `current-ui.js` for current keyboard, ARIA, number-fit and dialog-state behavior;
- do not load duplicate `v48.js`–`v53.js` helpers;
- do not load the retired V4.15 responsive `v54.css`, `v54-acceptance.css` or `v54.js` now that Native Mobile owns widths <=860px.

Frozen historical files may remain in the repository for release evidence even when they are no longer linked by `index.html`.

## Acceptance

Static release gate:

```bash
npm run check:release:static
```

Browser matrix:

- 375×812
- 390×844
- 393×852
- 430×932
- 1440×900
- 1920×1080

Browser acceptance must verify native mobile activation, fixed bottom nav, sticky top bar, no horizontal overflow, all nine views, Period/Search/Detail/Compare, focus lifecycle, Desktop nine-destination regression, console/page-error absence and GET-only network behavior.
