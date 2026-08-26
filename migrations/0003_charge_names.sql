PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS charge_name_monthly (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  charge_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他费用',
  source_field TEXT NOT NULL DEFAULT '',
  gross_debit REAL NOT NULL DEFAULT 0,
  credits REAL NOT NULL DEFAULT 0,
  net_cost REAL NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, month, charge_name),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_charge_month_amount ON charge_name_monthly(store_id, month, net_cost DESC);

CREATE TABLE IF NOT EXISTS charge_daily_metrics (
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  charge_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他费用',
  source_field TEXT NOT NULL DEFAULT '',
  gross_debit REAL NOT NULL DEFAULT 0,
  credits REAL NOT NULL DEFAULT 0,
  net_cost REAL NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, date, charge_name),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_charge_daily_range ON charge_daily_metrics(store_id, date, net_cost DESC);
