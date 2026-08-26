# V4.14 Chart Typography Fix

- Root cause: X-axis labels were SVG text inside a `preserveAspectRatio="none"` chart. Wide responsive panels non-uniformly scaled the glyphs.
- Fix: X-axis labels are now HTML overlay text, while the SVG remains responsible only for plotted geometry.
- Axis typography: 12px / 500, normal tracking, tabular lining numerals, CJK-safe system font stack.
- Business logic, data, tooltip interaction, chart paths, API and database logic are unchanged.
