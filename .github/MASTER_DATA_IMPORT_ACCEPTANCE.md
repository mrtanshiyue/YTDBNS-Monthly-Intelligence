# Master-data import period acceptance

- Uploaded cost library is master data, not a month-scoped business report.
- Standalone `cost` / `product` imports use an internal America/Los_Angeles audit month only for import-batch/R2 organization.
- The UI presents `主数据导入` and explicitly states that no report month is required.
- Mixed master + monthly report imports continue to use monthly report date evidence for the business month.
- Browser/D1 acceptance run 33164778935 passed with a realistic XLSX cost library.
- Acceptance verified `cost_master` writes successfully and `monthly_metrics` remains empty for a master-only import.
- Final static release gate run 33164919429 passed `check:release:static` and `wrangler deploy --dry-run`.
