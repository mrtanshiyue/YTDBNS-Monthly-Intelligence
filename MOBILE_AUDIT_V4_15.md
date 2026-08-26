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
- **FIXED — Command Palette inherits legacy `translateX(-50%)` on mobile.** The open `<=860px` state explicitly resolves to `transform:none`; desktop-shell viewports retain the V4.14 centering transform.
- **FIXED — Short landscape View Settings clips above the viewport.** The View sheet now caps its height to available `100dvh`, subtracting both safe-area top/bottom and the bottom navigation, with internal vertical scrolling.
- **FIXED — 932px landscape accidentally inherits partial mobile-shell sizing.** Compact shell height rules are now scoped to `<=860px`; 932px landscape keeps the desktop shell while low-height chart/overlay protections may still apply.
- **FIXED — Desktop no-op leakage.** Early V4.15 table/chart helpers and an explicit `>860px` navigation override were capable of touching 1440/1920 styles. DOM-affecting V4.15 CSS is now contained inside responsive breakpoints; desktop regression widths no longer receive V4.15 table/touch/chart helper overrides.
- **FIXED — Browser acceptance was not reproducible from a clean checkout.** The script imported undeclared `playwright`. It now uses lightweight `playwright-core` with an explicit system Chromium/Chrome resolver and package scripts for static/browser acceptance.
- **FIXED — Browser acceptance contained fail-open coverage paths.** Required tables and Period Quick/Month/Custom controls now fail the run when absent instead of silently skipping their assertions; desktop regression widths also execute the overlay interaction sequence.

## P2

- Toast placement clears the bottom mobile navigation and home indicator.
- Landscape mode uses reduced shell heights only inside the mobile breakpoint and retains low-height overlay/chart protections.
- Secondary tab rails horizontally scroll without creating document-level horizontal overflow.
- Mobile header blur removal uses a near-opaque background to avoid content bleed-through while preserving Period fixed-position correctness.
- Static invariants now enforce mobile-only CSS boundaries, selector/media ownership of critical declarations, system-Chromium acceptance dependency, exact viewport coverage, non-destructive Import behavior, Period Quick/Month/Custom coverage, internal overlay scrolling and the 932px desktop-shell boundary.

## Chromium evidence collected during hardening

The following evidence was collected against the real V4.14 Production DOM/CSS/JS layering with the V4.15 candidate layer injected. Findings that caused failures were fixed immediately; any viewport touched by a later shared CSS or acceptance refinement remains subject to the final exact-head rerun before merge.

### 320x568

- Document horizontal overflow: `0`.
- Nine primary navigation items present; all nine page-switch contracts activated successfully.
- Bottom navigation scrolls internally (`320px` viewport over approximately `624px` navigation content).
- Ads chart sampled `7 -> 4` visible HTML X labels; first/last labels preserved.
- Products table stayed inside the document (`294px` viewport over approximately `1046px` table content).
- Import drawer reached exact full-viewport geometry after transition; close target measured `44x44`.
- Command Palette reached final viewport-bound mobile geometry with `transform:none`.
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

## Final acceptance hardening

The current browser/static gates include the following deterministic protections. These are test-contract hardening changes; they do not expand product/runtime scope.

- Device semantics are derived from viewport class: `mobile = width <= 860`; `compactLandscape = width > 860 && width <= 960 && height <= 520`; `deviceLike = mobile || compactLandscape`.
- Phones, 768/820 tablets, 844x390 and 932x430 use touch/device-like Chromium contexts; 1440/1920 desktop regression contexts remain non-touch.
- Every declared case verifies the actual Chromium `innerWidth` and `innerHeight` against the matrix with <=1px tolerance, preventing fake viewport coverage.
- All 12 viewports execute the overlay interaction sequence so desktop regression widths cannot silently skip Import / Command / View / Detail / Panel behavior.
- Required Ads / Products / Charges / Inventory / Returns tables fail closed when missing. Narrow phones additionally prove that `.table-wrap` has a real horizontal scroll range while document/body overflow remain zero.
- Refresh is actually clicked and must produce the existing read-only refresh confirmation; this exercises the click contract without writing D1/R2.
- Period Quick / Month / Custom controls fail closed when absent. Custom uses the existing 2026-06-01 to 2026-06-30 read-only range.
- Import checks `.drawer-body` vertical-scroll ownership, drawer/body containment, footer reachability and dropzone geometry. The acceptance script must not reference or invoke `#commitBtn`.
- Command checks viewport containment, result-list vertical-scroll ownership and functional text input.
- Detail checks `#detailBody` vertical-scroll ownership; Panel checks `#panelModalBody` vertical-scroll ownership.
- View Settings checks viewport containment and, on mobile, its own vertical-scroll ownership.
- Mobile critical touch targets include Search, Period, Refresh, Import, Compare and View Settings; overlay close controls retain their mobile 44px checks.
- Final post-interaction document and body horizontal-overflow gates run after the full sequence.
- Static gates use brace-aware media/rule extraction for critical rules instead of relying only on global substring presence.
- Drawer/detail header `safe-area-top` and Import footer `safe-area-bottom` are deterministic static invariants because standard headless Chromium normally reports safe-area env values as zero.
- The `<=960px` low-height acceptance block is statically prohibited from defining `:root`, `.global-nav`, `.global-links` or `.section-nav`, protecting the 932x430 desktop-shell boundary.

### 932x430 command invariant

932x430 has `width > 860`, so it is a desktop-shell viewport even though the browser context is device-like/touch for acceptance realism.

- `<=860px` mobile Command Palette: open state must resolve to `transform:none` and remain viewport-bound.
- `932x430` desktop-shell Command Palette: preserve the V4.14 centering transform (`left:50%` / translated centering) and require viewport containment, functional input, internal results scrolling and zero console/page errors.
- Do not reintroduce a blanket `transform:none` assertion for 932x430.

## Hosted-runner infrastructure evidence

A temporary feature-branch-only workflow was created solely to attempt the final exact-head Chromium matrix, then removed immediately after the result was classified.

- Workflow run: `32962806116`.
- Test commit: `f872f8e9cbb61ab849fc86b0e755f330bdaf5cd3`.
- Job: `chromium-matrix` / `98158682596`.
- GitHub reported `runner_id=0`, empty runner name and `steps=[]`.
- The job completed in about four seconds without executing Checkout, Node setup, static checks or Chromium.
- Conclusion: this is hosted-runner infrastructure failure, not a product or acceptance failure.
- The temporary `.github/workflows/mobile-responsive-acceptance-temp.yml` file was deleted on the next feature-branch commit so PR scope contains no permanent workflow or false-red CI asset.
- Repository Actions still show no newer run demonstrating that hosted-runner availability has recovered; do not mechanically recreate the same workflow.

## Current local execution-route evidence

A later execution environment was re-probed because it exposed `/usr/bin/chromium` (`Chromium 144.0.7559.96`). That is a material environment change, so one isolated local-route check was justified.

- System Chromium exists, but navigation to `http://127.0.0.1:4173/` fails with Chromium `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
- Direct outbound connectivity is also unavailable in that environment (`1.1.1.1:443` refused; public DNS resolution unavailable).
- Therefore the presence of the Chromium binary alone does not create a valid exact-head browser execution chain.
- This is infrastructure evidence only. It must not be reported as a V4.15 product failure and does not justify Production deployment.

## Final merge gate — still pending

PR #1 remains Draft until the **final exact-head** matrix is rerun after all current acceptance/static refinements and all of the following are true:

- P0 = 0.
- P1 = 0.
- Mobile navigation PASS.
- Document-level and body horizontal overflow = 0.
- Overlay clipping = 0.
- Table presence, containment and internal scrolling PASS.
- Search / Period / Refresh / Import mobile actions PASS.
- Compare / View Settings mobile touch targets PASS.
- Period Quick / Month / Custom PASS.
- Compare `aria-pressed` PASS.
- `<=860px` Command Palette PASS with final `transform:none`.
- 932x430 Command Palette PASS while preserving desktop centering transform.
- Import Drawer PASS without data commit.
- Import body/footer/dropzone internal geometry PASS.
- Command Results / Detail body / Panel body internal scrolling PASS.
- View Settings viewport/internal-scroll PASS.
- V4.14 HTML chart label architecture and viewport sampling PASS with first/last labels preserved.
- Actual Chromium `innerWidth` / `innerHeight` match every declared case.
- 932x430 desktop-shell outer/inner height consistency PASS.
- 320 / 360 / 375 / 390 / 393 / 430 / 768 / 820 / 844-landscape / 932-landscape PASS.
- 1440 / 1920 desktop regression PASS.
- No new console/page errors.
- Feature branch remains `behind_by = 0` with zero unresolved review threads.

Only after this final exact-head gate should the PR be marked Ready and considered for merge.

## Non-regression invariants

- Keep V4.14 chart X-axis labels in the HTML layer; do not move them back into SVG text.
- Keep all nine page-switch click contracts and existing API/D1/R2 behavior.
- Do not create or alter Cloudflare D1/R2 resources during mobile hardening.
- Do not invoke Import Commit during browser acceptance.
- 932x430 must not inherit the `<=860px` mobile header heights, fixed bottom navigation or mobile Command transform override.
- Desktop visual system remains unchanged above the responsive breakpoint except the explicitly tested low-height 932px landscape protections.
