# YTDBNS Monthly Intelligence V5.0 — Native Mobile Architecture

## Status

- Desktop V4.15: HARD FROZEN baseline
- Production: HARD FROZEN during V5 development
- V5 mobile: independent View Architecture
- Data safety during normal UI development: GET-only

## Current coupling inventory

The V4.15 frontend uses one primary Desktop DOM and a layered CSS/JS stack. `app.js` currently combines application state, API access, date/range logic, business-facing formatting, HTML rendering, import mutation flow, and DOM binding. `enhancements.js` adds more DOM-driven behavior and duplicates some range/summary utilities. `v54.js` adapts the same Desktop DOM below 860px.

V5.0 must not continue that pattern.

## Target architecture

```text
public/
  shared/
    runtime.js              # view-agnostic, read-only runtime facade during V5 UI work
  mobile/
    mobile-shell.js         # independent mobile navigation and view host
    mobile-shell.css        # isolated mobile visual system
    views/                  # introduced incrementally in later phases
  app.js                    # frozen Desktop V4.15 implementation until shared migration is proven
```

The first implementation slice intentionally leaves Desktop rendering untouched. Mobile receives a separate root and shell. The new shared runtime is DOM-independent and GET-only. Desktop migration onto the shared runtime is a later, regression-gated refactor; business logic must not be forked permanently.

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

Mobile code must not depend on Desktop primary DOM IDs or transform Desktop overlays into mobile surfaces. In particular, Mobile must not use these as its UI contract:

- `#mainNav`
- `#periodPopover`
- `#importDrawer`
- `#commandPalette`
- `#detailDrawer`
- `#panelModal`

The V5 mobile implementation may share data/state/API contracts, but creates its own navigation, view host, sheets, full-screen details, search, period picker, record cards, and chart interaction.

## Phase 1 acceptance

- independent `#mobileAppRoot`
- dedicated top bar
- 5-item bottom navigation
- More sheet for secondary modules
- safe-area handling
- minimum 44px touch targets
- no horizontal document/body overflow by design
- no POST/PUT/PATCH/DELETE from V5 mobile runtime
- no Production deployment
- Desktop source files are not visually refactored

## Later phases

1. Mobile Overview read models and single-focus chart
2. Ads / Products / Inventory record-card views
3. Finance / Charges / Returns / History / Data
4. Native Bottom Sheet, Full-screen Detail, Search, Period Picker, Compare
5. iPhone Chromium acceptance at 390×844, 393×852, 430×932 plus Desktop regression
