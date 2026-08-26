# YTDBNS Monthly Intelligence V4.15 — Mobile Responsive Audit

Baseline: `49e7ab87d079b8eff8af3ed26846f48e54a9c6f6`

Scope: responsive presentation and interaction only. No D1/R2/API/business-logic changes.

## P0

- **Mobile primary navigation disappears at <=860px.** `app.css` hides `.global-links`, while later design layers do not restore `display`. Result: the nine primary pages lose their main navigation entry point on phones.

## P1

- **Global/section shell conflict.** Legacy mobile section height and later fixed-shell assumptions can overlap content and consume excessive first-screen space.
- **Tables are scroll-enabled but can still be browser-compressed.** Complex tables need an explicit readable minimum content width inside `.table-wrap`.
- **Overlay geometry is desktop-oriented.** Import/detail drawers, command palette, panel modal, period selector and view popover need viewport-bound mobile geometry, internal scrolling and safe-area padding.
- **Chart X labels need viewport-aware density.** V4.14 HTML `.chart-xlabels` must remain; on narrow widths only an evenly sampled subset should display while preserving first/last labels.
- **Touch targets are inconsistent.** Icon controls, close buttons, segmented controls and actions need approximately 44px hit areas.
- **Safe-area handling is incomplete.** Fixed bottom navigation and full-screen overlays need iPhone top/bottom inset protection.
- **Mobile context controls lose functionality if the full `.section-status` is hidden.** Keep Compare and View Settings accessible while hiding lower-priority freshness/grain chips.

## P2

- Toast placement needs to clear the bottom mobile navigation and home indicator.
- Landscape mode needs reduced shell heights and overlay max-height rules.
- Secondary tab rails should horizontally scroll without creating document-level horizontal overflow.

## Acceptance matrix

Portrait: 320x568, 360x800, 375x667, 390x844, 393x852, 430x932.

Tablet: 768x1024, 820x1180.

Landscape: 844x390, 932x430.

Desktop regression: 1440x900, 1920x1080.

## Non-regression invariants

- Keep V4.14 chart X-axis labels in the HTML layer; do not move them back into SVG text.
- Keep all nine page-switch click contracts and existing API/D1/R2 behavior.
- Do not create or alter Cloudflare D1/R2 resources during mobile hardening.
- Desktop visual system remains unchanged above the mobile breakpoint.
