PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transaction_daily_sku (
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  sku TEXT NOT NULL,
  sales REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  refund_sales REAL NOT NULL DEFAULT 0,
  refund_qty REAL NOT NULL DEFAULT 0,
  cogs REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, date, sku),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_transaction_daily_sku_store_date ON transaction_daily_sku(store_id, date);
CREATE INDEX IF NOT EXISTS idx_transaction_daily_sku_store_sku ON transaction_daily_sku(store_id, sku, date);

CREATE TABLE IF NOT EXISTS ad_search_term_monthly (
  store_id TEXT NOT NULL,
  month TEXT NOT NULL,
  portfolio TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  ad_group_id TEXT NOT NULL DEFAULT '',
  ad_group TEXT NOT NULL DEFAULT '',
  search_term TEXT NOT NULL DEFAULT '',
  targeting_id TEXT NOT NULL DEFAULT '',
  targeting TEXT NOT NULL DEFAULT '',
  targeting_type TEXT NOT NULL DEFAULT '',
  targeting_state TEXT NOT NULL DEFAULT '',
  match_type TEXT NOT NULL DEFAULT '',
  target_bid REAL NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  sales REAL NOT NULL DEFAULT 0,
  orders REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  clicks REAL NOT NULL DEFAULT 0,
  acos REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  cvr REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, month, campaign_id, campaign, ad_group_id, ad_group, search_term, targeting_id, targeting, match_type),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_ad_search_term_month_spend ON ad_search_term_monthly(store_id, month, spend DESC);
CREATE INDEX IF NOT EXISTS idx_ad_search_term_lookup ON ad_search_term_monthly(store_id, month, campaign, ad_group, search_term);
