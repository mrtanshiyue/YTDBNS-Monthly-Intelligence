# V4.13 Design System Convergence

## Scope
Presentation and interaction refinement only. Business logic, API routes, D1/R2 schema, import pipeline and report calculations are unchanged.

## Research principles applied
- WCAG 2.2: normal text contrast target >= 4.5:1; non-text interactive indicators >= 3:1 where applicable; visible focus; pointer target minimum 24 CSS px.
- Apple HIG: readable hierarchy, sufficient contrast, optical sizing principles, clear press state, restrained number of visually prominent actions.
- Material 3: semantic color roles and consistent enabled / hover / focused / pressed / disabled states.
- Carbon productive typography: 14px base for dense product interfaces; 12px reserved for supporting labels/captions, not body copy.
- W3C Chinese Layout Requirements: avoid Latin-centric negative tracking on Chinese body text and preserve appropriate CJK spacing behavior.

## Final typography roles
- Product body / table: 13.5–14px.
- Navigation: 12.75–13.25px.
- Supporting UI: 12–12.5px.
- Historical 7–11px fragments: protected with an 11.5–12px floor.
- Component headings: 16px / 680.
- Section headings: 23px / 700.
- Page title: 28px / 720.
- KPI numerals: tabular lining numerals, reduced negative tracking only at display sizes.
- Chinese body tracking: 0.

## Final color roles
- Canvas: #F7F8F9
- Surface: #FFFFFF
- Primary text: #202A33
- Secondary text: #3E4A55
- Tertiary text: #53616D
- Supporting text: #64717D
- Accent: #315F73
- Accent hover: #285064
- Success: #2F6B54
- Warning: #806127
- Danger: #934954
- Info: #326C83

## Interaction system
- Primary controls: 38px high.
- Standard desktop controls: 34–36px high.
- No hover-induced card movement.
- Heatmap hover no longer scales cells.
- Focus ring is explicit and high-contrast.
- Segmented controls and tabs support Left/Right/Home/End keyboard navigation.
- Reduced-motion preference disables decorative transitions.

## Layout system
- Spacing converges to a 4/8pt rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Core card radius: 16px; controls: 8–12px.
- Shadows are subordinate to borders; elevation is not used as decoration.
