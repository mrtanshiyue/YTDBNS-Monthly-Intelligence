PRAGMA foreign_keys = ON;

-- Canonical real-data store catalog. On a fresh database this removes the
-- legacy single-store bootstrap row created by 0001 and leaves only the
-- three production stores used by the application.
DELETE FROM stores WHERE id = 'yt-us';

INSERT OR IGNORE INTO stores (id, code, name, marketplace, currency, timezone)
VALUES
  ('ytdbns', 'YTDBNS', 'YTDBNS', 'US', 'USD', 'America/Los_Angeles'),
  ('yy', 'YY', 'YY', 'US', 'USD', 'America/Los_Angeles'),
  ('jj', 'JJ', 'JJ', 'US', 'USD', 'America/Los_Angeles');
