# YTDBNS Monthly Intelligence — Cloudflare Deployment Handoff

Updated: 2026-08-26 +08:00

## Objective
Continue deployment of **YTDBNS Monthly Intelligence V4.14** to Cloudflare. Do not restart UI design work and do not touch the unrelated Ads Operations resources.

## Authoritative GitHub repository
- Repository: `mrtanshiyue/YTDBNS-Monthly-Intelligence`
- Visibility: private
- Default branch: `main`
- Current known main HEAD before this handoff document: `8773db1824a2e31687ff4f3597a7ff171fc66992`
- Repository currently contains deployment metadata (`README.md`, `package.json`, `wrangler.jsonc`) but **the full V4.14 application tree has not yet been committed to GitHub**. This is the first thing to finish in the new conversation before Cloudflare deployment.

## Release artifact
Authoritative release package from the previous conversation:
- `YTDBNS_Monthly_Intelligence_V4_14_Cloudflare_Ready.zip`
- Project directory inside ZIP: `YTDBNS_Monthly_Intelligence_V4_14_Chart_Typography_Fix/`
- Approx. 50 files / 1.56 MB uncompressed.

V4.14 contains the V4.13 design-system/readability refinements plus the chart typography fix: X-axis date labels were moved out of the non-uniformly scaled SVG text layer so labels such as `06-01`, `06-06` are no longer horizontally distorted.

If the artifact is not available automatically in the new conversation, ask the user to attach the V4.14 Cloudflare Ready ZIP; do not reconstruct the application from older repository files.

## Cloudflare resources already created — DO NOT recreate
Account: the user's connected Cloudflare Caicai account.

### D1
- Name: `ytdbns-monthly-db`
- Database ID: `daad1ce7-a13a-49a5-8581-14294b153147`
- Region: WNAM
- Base schema was initialized.
- Charge-name schema was also initialized.

### R2
- Bucket: `ytdbns-monthly-raw-reports`
- Region/location: WNAM
- Storage class: Standard

### Worker target
- Worker name: `ytdbns-monthly-intelligence`
- This Worker was NOT successfully deployed in the previous conversation because the Cloudflare connector stopped accepting execution calls at the final deployment stage.

## Existing wrangler binding contract
`wrangler.jsonc` on `main` is intended to bind:
- `DB` -> D1 `ytdbns-monthly-db` (`daad1ce7-a13a-49a5-8581-14294b153147`)
- `RAW_REPORTS` -> R2 `ytdbns-monthly-raw-reports`
- Static assets -> `public/`
- Worker -> `ytdbns-monthly-intelligence`

Validate the artifact's `wrangler.jsonc` against these values before deployment; preserve the real D1 ID and do not revert to placeholders.

## Existing GitHub commits from previous conversation
- `8cbc07c351c0e52bddc8236d12cb8209b063008d` — initialize repository
- `ea93e47abeaf762dcdee75eaab9099d2ae346738` — Cloudflare Worker bindings
- `8599f4d7890bb3843b970ae1aadefdff884c8b17` — V4.14 package configuration
- `8773db1824a2e31687ff4f3597a7ff171fc66992` — README deployment documentation

## New conversation execution order
1. Connect **GitHub** and **Cloudflare Caicai**.
2. Read this `DEPLOYMENT_HANDOFF.md`; do not repeat resource provisioning.
3. Verify current GitHub `main` and the existing D1/R2 resources with a short read-only drift check.
4. Obtain the authoritative `YTDBNS_Monthly_Intelligence_V4_14_Cloudflare_Ready.zip` artifact.
5. Commit the **entire V4.14 application tree** to `mrtanshiyue/YTDBNS-Monthly-Intelligence` `main`, keeping the real Cloudflare bindings.
6. Perform static integrity checks: referenced assets exist, `public/index.html` loads V4.14 layers, Worker syntax/config is valid, migrations are present.
7. Deploy Worker `ytdbns-monthly-intelligence` with static assets + D1 + R2 bindings.
8. Enable/confirm the workers.dev route/subdomain as needed.
9. Verify live `/api/health` and the root page.
10. Perform narrow browser/runtime acceptance: dashboard renders, no missing CSS/JS, V4.14 chart X-axis fonts are not distorted, D1 connection is live, tabs work, charges page works.
11. Report the final production URL and exact deployed GitHub SHA.

## Important boundaries
- Do NOT modify or reuse `ads-operations-*` D1 databases, R2 buckets, Workers, or their deployment configuration.
- Do NOT recreate `ytdbns-monthly-db` or `ytdbns-monthly-raw-reports` unless a read check proves they are missing.
- Do NOT deploy an older V4.13/V4.12 artifact over V4.14.
- Do NOT redesign colors/UI during the deployment pass unless a real deployment defect requires a minimal fix.
- Do not claim deployment complete until the live Worker URL and `/api/health` have been verified.

## Completion definition
Deployment is complete only when:
- full V4.14 source is on GitHub `main`;
- Worker `ytdbns-monthly-intelligence` is live;
- D1 and R2 bindings are confirmed;
- `/api/health` succeeds;
- root UI loads without missing assets/runtime errors;
- live chart typography fix is visually present;
- final deployed commit SHA and production URL are recorded.
