PRAGMA foreign_keys = ON;

-- Canonical five-source model support.
-- Inventory is current-state data; rows are replaced as one complete store snapshot.
ALTER TABLE inventory_snapshots ADD COLUMN product_name TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_snapshots ADD COLUMN condition TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_snapshots ADD COLUMN your_price REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN mfn_listing_exists TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_snapshots ADD COLUMN mfn_fulfillable REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN afn_listing_exists TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_snapshots ADD COLUMN warehouse REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN reserved REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN per_unit_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN inbound_working REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN inbound_shipped REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN inbound_receiving REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN researching REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN reserved_future_supply REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN future_supply_buyable REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN fc_transfer REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN onhand_buyable REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_snapshots ADD COLUMN store_label TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS transaction_sku_daily (
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  sku TEXT NOT NULL,
  sales REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  refund_sales REAL NOT NULL DEFAULT 0,
  refund_qty REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, date, sku),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_transaction_sku_month ON transaction_sku_daily(store_id, date, sku);

CREATE TABLE IF NOT EXISTS return_sku_daily (
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT NOT NULL DEFAULT '',
  fnsku TEXT NOT NULL DEFAULT '',
  returns REAL NOT NULL DEFAULT 0,
  sellable_returns REAL NOT NULL DEFAULT 0,
  damaged_returns REAL NOT NULL DEFAULT 0,
  batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, date, sku),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE INDEX IF NOT EXISTS idx_return_sku_month ON return_sku_daily(store_id, date, sku);
