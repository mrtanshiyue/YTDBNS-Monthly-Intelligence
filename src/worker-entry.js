import app from './worker.js';

const STORES = Object.freeze([
  { id: 'ytdbns', code: 'YTDBNS', name: 'YTDBNS' },
  { id: 'yy', code: 'YY', name: 'YY' },
  { id: 'jj', code: 'JJ', name: 'JJ' }
]);
const STORE_IDS = new Set(STORES.map(store => store.id));
let catalogPromise = null;

const normalizeStoreId = value => STORE_IDS.has(String(value || '').toLowerCase())
  ? String(value).toLowerCase()
  : 'ytdbns';

async function ensureStoreCatalog(env) {
  if (catalogPromise) return catalogPromise;
  catalogPromise = env.DB.batch(STORES.map(store => env.DB.prepare(
    `INSERT OR IGNORE INTO stores(id,code,name,marketplace,currency,timezone) VALUES(?,?,?,'US','USD','America/Los_Angeles')`
  ).bind(store.id, store.code, store.name))).catch(error => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

async function storesResponse(env) {
  const rows = (await env.DB.prepare(`SELECT id,code,name,marketplace,currency,timezone
    FROM stores WHERE id IN ('ytdbns','yy','jj')
    ORDER BY CASE id WHEN 'ytdbns' THEN 1 WHEN 'yy' THEN 2 WHEN 'jj' THEN 3 ELSE 9 END`).all()).results || [];
  return new Response(JSON.stringify({ ok: true, stores: rows }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function jsonRequest(url, request, body) {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.delete('content-length');
  return new Request(url.toString(), {
    method: request.method,
    headers,
    body: JSON.stringify(body)
  });
}

async function normalizeApiRequest(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') || ['/api/health', '/api/stores'].includes(url.pathname)) return request;

  const queryStore = url.searchParams.get('store');
  const queryStoreId = normalizeStoreId(queryStore);
  url.searchParams.set('store', queryStoreId);

  if (request.method === 'GET' || request.method === 'HEAD') {
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/imports/start') {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== 'object') return request;
    body.storeId = normalizeStoreId(body.storeId || queryStoreId);
    return jsonRequest(url, request, body);
  }

  if (request.method === 'POST' && url.pathname === '/api/imports/commit') {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== 'object') return request;
    const storeId = normalizeStoreId(body.storeId || body.payload?.storeId || queryStoreId);
    body.storeId = storeId;
    if (body.payload && typeof body.payload === 'object') body.payload.storeId = storeId;
    return jsonRequest(url, request, body);
  }

  if (request.method === 'POST' && url.pathname === '/api/imports/file') {
    const form = await request.clone().formData().catch(() => null);
    if (!form) return request;
    form.set('storeId', normalizeStoreId(form.get('storeId') || queryStoreId));
    const headers = new Headers(request.headers);
    headers.delete('content-type');
    headers.delete('content-length');
    return new Request(url.toString(), {
      method: request.method,
      headers,
      body: form
    });
  }

  return request;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);

    await ensureStoreCatalog(env);
    if (request.method === 'GET' && url.pathname === '/api/stores') return storesResponse(env);

    const normalizedRequest = await normalizeApiRequest(request);
    return app.fetch(normalizedRequest, env, ctx);
  }
};
