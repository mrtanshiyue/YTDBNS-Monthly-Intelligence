PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  store_id TEXT NOT NULL,
  batch_id TEXT,
  report_month TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'web',
  summary TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_store_created
  ON operation_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_batch
  ON operation_logs(batch_id, id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_month
  ON operation_logs(report_month, created_at DESC);
