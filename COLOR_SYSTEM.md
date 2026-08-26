# V4.10 Color System Audit

This release changes color only. Layout, spacing, interactions, database logic and reporting logic are unchanged.

## Design basis
- WCAG 2.2: normal text contrast target >= 4.5:1; large text >= 3:1.
- APCA: used as a perceptual-readability design direction rather than as the conformance target.
- Apple HIG: color and contrast should remain legible across interface states.
- Material 3: colors are assigned by semantic roles (surface / on-surface / primary / outline), not decorative placement.
- IBM Carbon: neutral values establish structure; chromatic colors are reserved for action, status and data meaning.

## Core palette
- Canvas: #F3F6F8
- Surface: #FFFFFF
- Primary text: #18232D
- Secondary text: #35434F
- Muted text: #566572
- Subtle small text: #64727E
- Primary action: #25647A
- Primary action strong: #1D5265
- Success: #21684F
- Warning: #76520A
- Critical: #963B49
- Data blue: #156B91
- Data orange: #A44A12
- Data violet: #704C8C

## Key WCAG contrast checks
- Primary text / white: 15.94:1
- Secondary text / white: 10.16:1
- Muted text / white: 6.00:1
- Subtle small text / white: 4.94:1
- Subtle small text / canvas: 4.55:1
- Primary action / white: 6.60:1
- Data blue / white: 5.93:1
- Success / white: 6.65:1
- Warning / white: 7.04:1
- Critical / white: 6.96:1

The previous V4.9 faint text (#9A948C) measured about 2.98:1 on the main light surface, which was the principal readability defect corrected in this release.
