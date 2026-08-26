# YTDBNS Monthly Intelligence V4.15 — Mobile Responsive Audit

Baseline: `49e7ab87d079b8eff8af3ed26846f48e54a9c6f6`

Scope: responsive presentation and interaction only. No D1/R2/API/business-logic changes.

## P0

- **FIXED — Mobile primary navigation disappears at <=860px.** Legacy `app.css` hides `.global-links`; V4.15 restores the existing nine navigation buttons as a fixed, horizontally scrollable mobile rail without duplicating business DOM or click contracts.

## P1

- **FIXED — Global/section shell conflict.** V4.15 makes the mobile fixed-shell heights authoritative and removes the measured legacy overlap.
- **FIXED — Tables are scroll-enabled but browser-compressed.** Complex `.data-table` content now keeps a readable intrinsic width inside `.table-wrap`; horizontal scrolling remains owned by the table viewport rather than the document.
- **FIXED — Overlay geometry is desktop-oriented.** Import/detail drawers, command palette, panel modal, period selector and view popover have viewport-bound mobile geometry, internal scrolling and safe-area treatment.
- **FIXED — Chart X labels need viewport-aware density.** V4.14 HTML `.chart-xlabels` is preserved. V4.15 samples visible labels by viewport width while keeping first/last labels.
- **FIXED — Touch targets are inconsistent.** Required mobile header actions, close buttons, segmented controls and primary overlay actions are protected at approximately 44px minimum hit areas, including the <=340px override.
- **FIXED — Mobile context controls lose functionality if the full `.section-status` is hidden.** Compare and View Settings remain accessible; lower-priority freshness/grain chips are hidden.
- **FIXED — Period control wrapper is hidden by legacy mobile CSS.** A higher-specificity V4.15 override restores the existing `.period-control` wrapper and preserves the original event contract.
- **FIXED — Period sheet is header-bound in Chromium.** Legacy `backdrop-filter` on the compact fixed header establishes a containing block for fixed descendants. V4.15 removes that mobile blur, adds a near-opaque readability fallback, and keeps the Period sheet viewport-bound.
- **FIXED — Command Palette inherits legacy `translateX(-50%)`.** The open mobile state explicitly resolves to `transform:none`.
- **FIXED — Short landscape View Settings clips above the viewport.** The View sheet now caps its height to available `100dvh`, subtracting both safe-area top/bottom and the bottom navigation, with internal vertical scrolling.
- **FIXED — 932px landscape accidentally inherits partial mobile-shell sizing.** Compact shell height rules are now scoped to `<=860px`; 932px landscape keeps the desktop shell while low-height chart/overlay protections may still apply.
- **FIXED — Desktop no-op leakage.** Early V4.15 table/chart helpers and an explicit `>860px` navigation override were capable of touching 1440/1920 styles. DOM-affecting V4.15 CSS is now contained inside responsive breakpoints; desktop regression widths no longer receive V4.15 table/touch/chart helper overrides.
- **FIXED — Browser acceptance was not reproducible from a clean checkout.** The script imported undeclared `playwright`. It now uses lightweight `playwright-core` with an explicit system Chromium/Chrome resolver and package scripts for static/browser acceptance.

## P2

- Toast placement clears the bottom mobile navigation and home indicator.
- Landscape mode uses reduced shell heights only inside the mobile breakpoint and retains low-height overlay/chart protections.
- Secondary tab rails horizontally scroll without creating document-level horizontal overflow.
- Mobile header blur removal uses a near-opaque background to avoid content bleed-through while preserving Period fixed-position correctness.
- Static invariants now enforce the mobile-only CSS boundary, system-Chromium acceptance dependency, Period Quick/Month/Custom coverage, and Detail/Panel overlay coverage.

## Chromium evidence collected during hardening

The following evidence was collected against the real V4.14 Production DOM/CSS/JS layering with the V4.15 candidate layer injected. Findings that caused failures were fixed immediately; any viewport touched by a later shared CSS refinement remains subject to the final exact-head rerun before merge.

### 320x568

- Document horizontal overflow: `0`.
- Nine primary navigation items present; all nine page-switch contracts activated successfully.
- Bottom navigation scrolls internally (`320px` viewport over approximately `624px` navigation content).
- Ads chart sampled `7 -> 4` visible HTML X labels; first/last labels preserved.
- Products table stayed inside the document (`294px` viewport over approximately `1046px` table content).
- Import drawer reached exact full-viewport geometry after transition; close target measured `44x44`.
- Command Palette reached final viewport-bound geometry with `transform:none`.
- This viewport exposed the legacy hidden Period wrapper and <=340px 42px touch-target regressions; both were subsequently fixed.

### 390x844

- Document overflow, navigation switching, chart sampling (`7 -> 5`), table containment, Import Drawer, Command Palette, View Settings and Compare toggle passed in the measured run.
- The Period sheet was measured at negative Y due to the fixed-containing-block effect from header `backdrop-filter`; the dedicated fix was then verified with the Period sheet back inside the viewport and clear of bottom navigation.

### 430x932

- Full measured run returned no acceptance failures at that revision.
- Four required header actions measured `44x44` and remained inside the viewport.
- Nine primary navigation items remained functional and active navigation remained discoverable.
- Ads chart sampled `7 -> 5` with first/last HTML labels preserved.
- Table horizontal scrolling remained internal.
- Period, Import, Command and View overlays all remained inside the viewport.

### 844x390 landscape

- Document overflow, navigation, header actions, chart height, table containment, Period, Import and Command passed in the measured run.
- The run isolated one remaining View Settings top clip (about `6.8px`); a viewport-height cap with internal scroll was then verified to restore in-viewport geometry.

## Acceptance matrix

Portrait: 320x568, 360x800, 375x667, 390x844, 393x852, 430x932.

Tablet: 768x1024, 820x1180.

Landscape: 844x390, 932x430.

Desktop regression: 1440x900, 1920x1080.

The browser acceptance script now additionally verifies:

- All nine page-switch contracts and active-navigation discoverability.
- Search / Period / Refresh / Import mobile touch targets.
- Period Quick, Month and Custom Apply flows using read-only dashboard ranges.
- Compare `aria-pressed` state transition.
- Ads / Products / Charges / Inventory / Returns table containment.
- Import Drawer geometry without invoking the destructive Commit action.
- Command Palette final `transform:none`, View Settings, Detail Drawer and Panel Modal geometry.
- V4.14 HTML X-axis label architecture plus viewport sampling.
- 932x430 outer/inner shell consistency so desktop shell cannot partially inherit mobile heights.
- Console/page errors.

## Final merge gate — still pending

PR #1 remains Draft until the **final exact-head** matrix is rerun after the shared safe-area/landscape/desktop-no-op refinements and all of the following are true:

- P0 = 0.
- Mobile navigation PASS.
- Document-level horizontal overflow = 0.
- Overlay clipping = 0.
- Table internal scrolling PASS.
- Search / Period / Refresh / Import mobile actions PASS.
- Period Quick / Month / Custom PASS.
- Compare `aria-pressed` PASS.
- Command Palette PASS with final `transform:none`.
- Import Drawer PASS without data commit.
- Detail Drawer / Panel Modal PASS.
- V4.14 HTML chart label architecture and sampling PASS.
- 320 / 390 / 430 / landscape / tablet PASS.
- 1440 / 1920 desktop regression PASS.
- No new console/page errors.

Only after this final exact-head gate should the PR be marked Ready and considered for merge.

## Non-regression invariants

- Keep V4.14 chart X-axis labels in the HTML layer; do not move them back into SVG text.
- Keep all nine page-switch click contracts and existing API/D1/R2 behavior.
- Do not create or alter Cloudflare D1/R2 resources during mobile hardening.
- Desktop visual system remains unchanged above the responsive breakpoint except the explicitly tested low-height 932px landscape protections.
