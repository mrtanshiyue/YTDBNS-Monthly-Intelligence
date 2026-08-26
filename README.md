# YTDBNS Monthly Intelligence V4.14

Cloudflare-ready monthly intelligence dashboard for YTDBNS Amazon US operations.

## Runtime
- Cloudflare Workers + Static Assets
- D1 binding: `DB` → `ytdbns-monthly-db`
- R2 binding: `RAW_REPORTS` → `ytdbns-monthly-raw-reports`
- Worker name: `ytdbns-monthly-intelligence`

## Current release
V4.14 includes the V4.13 design-system refinement plus the chart typography fix that moves responsive X-axis labels out of non-uniformly scaled SVG text.

## Commands
- `npm install`
- `npm run dev`
- `npm run deploy`

The D1 database and R2 bucket are provisioned separately and referenced by `wrangler.jsonc`.
