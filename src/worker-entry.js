import app from './worker.js';

const RESET_KEY = 'three_store_real_data_reset_2026_08_28_v1';
const STORES = Object.freeze([
  { id: 'ytdbns', code: 'YTDBNS', name: 'YTDBNS' },
  { id: 'yy', code: 'YY', name: 'YY' },
  { id: 'jj', code: 'JJ', name: 'JJ' }
]);

let baselinePromise = null;

async function clearRawReports(bucket) {
  let cursor;
  do {
    const page = await bucket.list(cursor ? { cursor } : {});
    const keys = (page.objects || []).map(item => item.key).filter(Boolean);
    if (keys.length) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function ensureThreeStoreBaseline(env) {
  if (baselinePromise) return baselinePromise;
  baselinePromise = (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      detail TEXT
    )`).run();

    const done = await env.DB.prepare('SELECT migration_key FROM app_migrations WHERE migration_key=?').bind(RESET_KEY).first();
    if (done) return;

    // User-authorized one-time production reset: remove every archived raw report first,
    // then clear all business facts while preserving D1/R2 resources and schema.
    await clearRawReports(env.RAW_REPORTS);

    const deleteSql = [
      'DELETE FROM data_quality_checks',
      'DELETE FROM charge_daily_metrics',
      'DELETE FROM charge_name_monthly',
      'DELETE FROM return_reason_monthly',
      'DELETE FROM storage_monthly_metrics',
      'DELETE FROM inventory_snapshots',
      'DELETE FROM campaign_monthly_metrics',
      'DELETE FROM parent_monthly_metrics',
      'DELETE FROM product_monthly_metrics',
      'DELETE FROM daily_metrics',
      'DELETE FROM monthly_metrics',
      'DELETE FROM cost_master',
      'DELETE FROM product_master',
      'DELETE FROM report_files',
      'DELETE FROM import_batches',
      'DELETE FROM stores'
    ];
    await env.DB.batch(deleteSql.map(sql => env.DB.prepare(sql)));

    const storeStatements = STORES.map(store => env.DB.prepare(
      `INSERT INTO stores(id,code,name,marketplace,currency,timezone) VALUES(?,?,?,'US','USD','America/Los_Angeles')`
    ).bind(store.id, store.code, store.name));
    storeStatements.push(env.DB.prepare(
      'INSERT INTO app_migrations(migration_key,detail) VALUES(?,?)'
    ).bind(RESET_KEY, 'Cleared D1 business data and R2 raw reports; seeded YTDBNS, YY, JJ'));
    await env.DB.batch(storeStatements);
  })().catch(error => {
    baselinePromise = null;
    throw error;
  });
  return baselinePromise;
}

function storesResponse() {
  return new Response(JSON.stringify({ ok: true, stores: STORES }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      await ensureThreeStoreBaseline(env);
      if (request.method === 'GET' && url.pathname === '/api/stores') return storesResponse();
    }
    return app.fetch(request, env, ctx);
  }
};
