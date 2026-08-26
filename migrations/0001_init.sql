PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'US',
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  report_month TEXT NOT NULL,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UPLOADING',
  model_status TEXT NOT NULL DEFAULT 'WARN',
  file_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_batches_store_month ON import_batches(store_id, report_month DESC);

CREATE TABLE IF NOT EXISTS report_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  report_month TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  source_period TEXT,
  status TEXT NOT NULL DEFAULT 'STORED',
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_report_files_batch ON report_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_report_files_store_month ON report_files(store_id, report_month);

CREATE TABLE IF NOT EXISTS monthly_metrics (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  business_sales REAL,
  business_units REAL,
  sessions REAL,
  finance_gross_sales REAL,
  refund_sales REAL,
  orders_qty REAL,
  refund_qty REAL,
  ad_spend REAL,
  ad_sales REAL,
  ad_orders REAL,
  impressions REAL,
  clicks REAL,
  acos REAL,
  tacos REAL,
  cogs REAL,
  settlement REAL,
  transfer_payout REAL,
  ad_charge REAL,
  storage_estimate REAL,
  base_storage_charge REAL,
  long_term_storage_fee REAL,
  reimbursements REAL,
  liquidation_net REAL,
  subscription REAL,
  contribution_profit REAL,
  profit_margin REAL,
  returns REAL,
  sellable_returns REAL,
  damaged_returns REAL,
  inventory_units REAL,
  fulfillable_units REAL,
  inbound_units REAL,
  inventory_value REAL,
  model_status TEXT NOT NULL DEFAULT 'WARN',
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, month),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  sales REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  sessions REAL,
  page_views REAL,
  buy_box REAL,
  traffic_cvr REAL,
  orders REAL NOT NULL DEFAULT 0,
  refund_sales REAL NOT NULL DEFAULT 0,
  refund_qty REAL NOT NULL DEFAULT 0,
  ad_spend REAL NOT NULL DEFAULT 0,
  ad_sales REAL NOT NULL DEFAULT 0,
  ad_orders REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  clicks REAL NOT NULL DEFAULT 0,
  cogs REAL NOT NULL DEFAULT 0,
  settlement REAL NOT NULL DEFAULT 0,
  finance_ad_charge REAL NOT NULL DEFAULT 0,
  base_storage_charge REAL NOT NULL DEFAULT 0,
  storage_estimate REAL NOT NULL DEFAULT 0,
  contribution_profit REAL NOT NULL DEFAULT 0,
  returns REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, date),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_store_date ON daily_metrics(store_id, date);

CREATE TABLE IF NOT EXISTS product_monthly_metrics (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  asin TEXT NOT NULL DEFAULT '',
  parent_asin TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'UNASSIGNED',
  sales REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  sessions REAL NOT NULL DEFAULT 0,
  cvr REAL NOT NULL DEFAULT 0,
  buy_box REAL NOT NULL DEFAULT 0,
  ad_spend REAL NOT NULL DEFAULT 0,
  ad_sales REAL NOT NULL DEFAULT 0,
  returns REAL NOT NULL DEFAULT 0,
  cogs REAL NOT NULL DEFAULT 0,
  storage_fee REAL NOT NULL DEFAULT 0,
  contribution_profit REAL NOT NULL DEFAULT 0,
  fulfillable_units REAL NOT NULL DEFAULT 0,
  inventory_value REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, month, sku, asin),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_product_month_model ON product_monthly_metrics(store_id, month, model);

CREATE TABLE IF NOT EXISTS parent_monthly_metrics (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  parent_asin TEXT NOT NULL,
  title TEXT,
  sales REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  sessions REAL NOT NULL DEFAULT 0,
  cvr REAL NOT NULL DEFAULT 0,
  buy_box REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  PRIMARY KEY (store_id, month, parent_asin),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS campaign_monthly_metrics (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  portfolio TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL,
  spend REAL NOT NULL DEFAULT 0,
  sales REAL NOT NULL DEFAULT 0,
  orders REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  clicks REAL NOT NULL DEFAULT 0,
  acos REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  cvr REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  PRIMARY KEY (store_id, month, portfolio, campaign),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_month_spend ON campaign_monthly_metrics(store_id, month, spend DESC);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  store_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'UNASSIGNED',
  sku TEXT NOT NULL,
  fnsku TEXT NOT NULL DEFAULT '',
  asin TEXT NOT NULL DEFAULT '',
  fulfillable REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  inbound REAL NOT NULL DEFAULT 0,
  unsellable REAL NOT NULL DEFAULT 0,
  inventory_value REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  PRIMARY KEY (store_id, snapshot_date, sku),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot ON inventory_snapshots(store_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS storage_monthly_metrics (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'UNASSIGNED',
  sku TEXT NOT NULL DEFAULT '',
  fnsku TEXT NOT NULL DEFAULT '',
  asin TEXT NOT NULL DEFAULT '',
  fee REAL NOT NULL DEFAULT 0,
  avg_qty REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  PRIMARY KEY (store_id, month, fnsku, asin),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS return_reason_monthly (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  reason TEXT NOT NULL,
  count REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  PRIMARY KEY (store_id, month, reason),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS product_master (
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  model TEXT,
  internal_code TEXT,
  fnsku TEXT,
  asin TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, sku),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_product_master_asin ON product_master(store_id, asin);
CREATE INDEX IF NOT EXISTS idx_product_master_fnsku ON product_master(store_id, fnsku);

CREATE TABLE IF NOT EXISTS cost_master (
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  purchase_cost REAL NOT NULL DEFAULT 0,
  first_mile_cost REAL NOT NULL DEFAULT 0,
  fbm_shipping_cost REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  source_updated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, sku),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS data_quality_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  report_month TEXT NOT NULL,
  item TEXT NOT NULL,
  status TEXT NOT NULL,
  value TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quality_batch ON data_quality_checks(batch_id);

INSERT OR IGNORE INTO stores (id, code, name, marketplace, currency, timezone)
VALUES ('yt-us', 'YTDBNS-US', 'YTDBNS · Amazon US', 'US', 'USD', 'America/Los_Angeles');
