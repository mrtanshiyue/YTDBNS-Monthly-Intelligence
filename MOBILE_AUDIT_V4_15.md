# YTDBNS Monthly Intelligence V4.15 — Responsive Acceptance Audit

Baseline main: `49e7ab87d079b8eff8af3ed26846f48e54a9c6f6`

Scope: responsive presentation and interaction only. No D1/R2/API/business-logic changes.

## Supported runtime contract

The supported product surface is **desktop browsers + Apple iPhone**.

Authoritative merge-gate viewports:

### iPhone / touch

- `375x667` — compact iPhone floor
- `390x844` — mainstream iPhone
- `430x932` — large iPhone / `<=430px` sampling boundary
- `440x956` — large iPhone immediately above the `<=430px` boundary
- `844x390` — iPhone landscape / low-height protection

### Desktop / non-touch

- `1440x900`
- `1920x1080`

The former 12-viewport matrix remains historical hardening evidence only. Android-specific, iPad/tablet and `932x430` coverage are no longer merge requirements because they are outside the declared supported-device contract.

## P0

- **0 open P0.** Mobile primary navigation disappearance was fixed by restoring the existing nine navigation buttons as a fixed, horizontally scrollable iPhone rail without duplicating DOM or click contracts.

## P1 fixes

- **FIXED — Mobile shell overlap.** Global/section fixed-shell heights are authoritative inside `<=860px`.
- **FIXED — Table compression / document overflow.** Complex tables retain readable intrinsic width and own horizontal scrolling.
- **FIXED — Overlay geometry.** Import/detail drawers, Command, Panel, Period and View Settings are viewport-contained with internal scrolling.
- **FIXED — Chart label density.** V4.14 HTML `.chart-xlabels` architecture is preserved; visible labels are sampled by viewport width while retaining first/last labels.
- **FIXED — Touch targets.** Required iPhone actions and overlay controls meet the approximately 44px hit-target gate.
- **FIXED — Compare / View Settings discoverability.** Both remain available on iPhone while low-priority status chips are suppressed.
- **FIXED — Period wrapper and fixed-containing-block issue.** The existing Period control remains reachable and the sheet is viewport-bound.
- **FIXED — Mobile Command transform.** `<=860px` open state resolves to `transform:none`.
- **FIXED — Short-landscape View Settings.** Height is capped to available `100dvh` with internal vertical scrolling.
- **FIXED — Desktop leakage.** General V4.15 DOM-affecting rules remain responsive-scoped.
- **FIXED — 430px Compare hit box.** Legacy desktop/mobile CSS compressed `#compareToggle` to about `29x44px` while its text overflowed the clickable box. V4.15 now uses `width:auto` with `min-width:44px`; the `<=390px` dot-only mode remains `44x44`.
- **FIXED — Desktop primary-nav containment.** The V4.14 1440px desktop baseline allocated about 632px to the centered primary-nav track while nine roughly 78px items overflowed symmetrically into the Wordmark and actions. `总览` and `数据` were therefore not fully discoverable/hit-testable. V4.15 preserves centered desktop navigation but tightens only item spacing (`gap:0`, 5px inline padding), keeping all nine existing click targets inside the allocated track at 1440 and 1920.

## Static / architecture invariants

- `viewport-fit=cover` remains present.
- `v54.css` loads after `v53.css`; `v54-acceptance.css` loads after `v54.css`; `v54.js` loads after `v53.js`.
- V4.14 chart X labels remain HTML `.chart-xlabels` / `.chart-xlabel`; no SVG `<text class="chart-xlabel">` regression.
- Sampling limits remain `<=340 -> 4`, `<=430 -> 5`, `<=620 -> 6`, retaining first and last labels.
- `playwright-core@1.62.1` remains pinned for the repository browser harness.
- Browser acceptance never references or invokes `#commitBtn`.
- Import acceptance is non-destructive.
- Production APIs are not required for the final browser evidence.

## Real-browser execution venue

Cloudflare Browser Rendering was initially blocked by Cloudflare API error `2001: Rate limit exceeded`. That was classified as infrastructure/quota evidence, not a product failure.

A valid alternative execution chain was established with local system Chromium:

- Browser: `Chrome/144.0.7559.96`
- Control: Chrome DevTools Protocol (CDP)
- Page load: fully inline exact-head DOM/CSS/JS using `Page.setDocumentContent`
- No localhost navigation dependency
- No public DNS dependency
- `/api/*` is blocked by the acceptance prelude and forced into DEMO fallback
- No Production POST
- No D1 write
- No R2 write
- No Import Commit

The inline candidate was built from the existing V4.14 release baseline plus GitHub exact-head V4.15 assets. Runtime inputs were validated by Git blob SHA before execution.

## Harness fake-red classifications

The following failures were isolated and classified as harness/timing issues rather than product failures:

- synthetic Escape did not initially reproduce a real keyboard close sequence; CDP keyboard input / explicit cleanup was used instead
- transient Refresh toast could remain longer in headless CDP and occlude unrelated follow-on actions; it is removed only after its Refresh contract is verified
- global `html{scroll-behavior:smooth}` made short harness waits observe intermediate scroll positions; acceptance scrolling uses `behavior:'instant'`
- Import dropzone in `844x390` initially sits below the visible drawer-body fold; the drawer body correctly owns vertical scrolling and the dropzone becomes fully contained/reachable after scrolling
- Detail Drawer uses a `0.36s` transition; containment is measured after stable state rather than during the transition

None of these classifications required product-code changes.

## Final runtime evidence before audit-only closure commit

Runtime/code exact head used for the final measured matrix:

`b555fd66ee6002fe40e77014a250ed482b979347`

Executable Static Gate:

`MOBILE RESPONSIVE STATIC CHECK PASS`

Real Chromium supported matrix:

- `375x667` iPhone/touch — **PASS**, 0 failures
- `390x844` iPhone/touch — **PASS**, 0 failures
- `430x932` iPhone/touch — **PASS**, 0 failures
- `440x956` iPhone/touch — **PASS**, 0 failures
- `844x390` iPhone landscape/touch — **PASS**, 0 failures
- `1440x900` desktop/non-touch — **PASS**, 0 failures
- `1920x1080` desktop/non-touch — **PASS**, 0 failures

The complete interaction contract covered:

- actual `innerWidth` / `innerHeight`
- all 9 primary navigation contracts
- active navigation discoverability
- document/body horizontal overflow = 0
- Search / Period / Refresh / Import / Compare / View Settings
- iPhone touch semantics and touch targets
- desktop non-touch semantics
- Compare `aria-pressed`
- Period Quick / Month / Custom / Apply
- Ads / Products / Charges / Inventory / Returns tables
- table-owned horizontal scrolling on iPhone
- Import containment, body scroll, footer reachability and dropzone reachability
- Command containment, input and result scrolling
- View Settings containment/internal scroll
- Detail drawer/body scroll
- Panel modal/body scroll
- V4.14 HTML chart-label architecture
- first/last chart labels and sampling thresholds
- final document/body overflow = 0
- console errors = 0
- page errors = 0
- Production mutation guard / Import Commit guard

## Audit-only exact-head reconciliation rule

This document update is audit-only and does not alter `public/index.html`, `public/v54.css`, `public/v54-acceptance.css`, `public/v54.js`, package dependencies, business logic, Worker runtime, API contracts, D1 or R2.

After this audit-only commit, the final exact head must still be reconciled by rerunning:

1. executable Static Gate
2. all 7 supported real-Chromium cases
3. GitHub `behind_by=0`
4. unresolved review threads = 0
5. PR scope remains the same 8 files

Only if that final reconciliation remains green may PR #1 move from Draft to Ready and be merged.

## Non-regression invariants

- Keep all nine page-switch click contracts.
- Keep V4.14 chart X-axis labels in the HTML layer.
- Do not invoke Import Commit during browser acceptance.
- Do not modify D1/R2/API/business semantics as part of responsive hardening.
- Do not deploy Production or trigger the existing main-bound Workers Build before the merge gate.
