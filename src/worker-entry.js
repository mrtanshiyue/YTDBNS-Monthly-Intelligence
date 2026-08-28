import app from './worker.js';
import { commitPartialImport } from './partial-import.js';

const STORES = Object.freeze([
  { id: 'ytdbns', code: 'YTDBNS', name: 'YTDBNS' },
  { id: 'yy', code: 'YY', name: 'YY' },
  { id: 'jj', code: 'JJ', name: 'JJ' }
]);
const STORE_IDS = new Set(STORES.map(store => store.id));
const RESET_TABLES = Object.freeze([
  'data_quality_checks',
  'report_files',
  'charge_daily_metrics',
  'charge_name_monthly',
  'daily_metrics',
  'monthly_metrics',
  'product_monthly_metrics',
  'parent_monthly_metrics',
  'campaign_monthly_metrics',
  'inventory_snapshots',
  'storage_monthly_metrics',
  'return_reason_monthly',
  'product_master',
  'cost_master',
  'import_batches'
]);
const OPS_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const OPS_OIDC_AUDIENCE = 'ytdbns-production-d1-reset';
const OPS_OIDC_REPOSITORY = 'mrtanshiyue/YTDBNS-Monthly-Intelligence';
let catalogPromise = null;
let githubJwksPromise = null;

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

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function parseJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function githubJwks() {
  if (!githubJwksPromise) {
    githubJwksPromise = fetch(`${OPS_OIDC_ISSUER}/.well-known/jwks`).then(async response => {
      if (!response.ok) throw new Error(`GitHub JWKS ${response.status}`);
      return response.json();
    }).catch(error => {
      githubJwksPromise = null;
      throw error;
    });
  }
  return githubJwksPromise;
}

async function verifyGithubOidc(request) {
  const authorization = String(request.headers.get('authorization') || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  let header;
  let claims;
  try {
    header = parseJwtPart(parts[0]);
    claims = parseJwtPart(parts[1]);
  } catch {
    return false;
  }
  if (header.alg !== 'RS256' || !header.kid) return false;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== OPS_OIDC_ISSUER) return false;
  if (!audiences.includes(OPS_OIDC_AUDIENCE)) return false;
  if (claims.repository !== OPS_OIDC_REPOSITORY) return false;
  if (claims.ref !== 'refs/heads/main') return false;
  if (claims.event_name !== 'push') return false;
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < now) return false;
  if (claims.nbf != null && Number(claims.nbf) > now + 30) return false;

  const jwks = await githubJwks();
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid);
  if (!jwk) return false;
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
}

async function countResetTables(env) {
  const results = await env.DB.batch(RESET_TABLES.map(table => env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`)));
  return Object.fromEntries(RESET_TABLES.map((table, index) => [table, Number(results[index]?.results?.[0]?.count || 0)]));
}

async function oneTimeResetResponse(request, env) {
  const authorized = await verifyGithubOidc(request).catch(() => false);
  if (!authorized) {
    return new Response(JSON.stringify({ ok: false, error: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const before = await countResetTables(env);
  await env.DB.batch(RESET_TABLES.map(table => env.DB.prepare(`DELETE FROM ${table}`)));
  await ensureStoreCatalog(env);
  const after = await countResetTables(env);
  const stores = (await env.DB.prepare(`SELECT id,code,name FROM stores WHERE id IN ('ytdbns','yy','jj') ORDER BY id`).all()).results || [];

  return new Response(JSON.stringify({
    ok: true,
    reset: 'business-data-only',
    before,
    after,
    preserved: { stores, schema: true, migrations: true, r2: true }
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
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

  const storeId = normalizeStoreId(url.searchParams.get('store'));
  url.searchParams.set('store', storeId);

  if (request.method === 'GET' || request.method === 'HEAD') {
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/imports/start') {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== 'object') return request;
    body.storeId = storeId;
    return jsonRequest(url, request, body);
  }

  if (request.method === 'POST' && url.pathname === '/api/imports/commit') {
    const body = await request.clone().json().catch(() => null);
    if (!body || typeof body !== 'object') return request;
    body.storeId = storeId;
    if (body.payload && typeof body.payload === 'object') body.payload.storeId = storeId;
    return jsonRequest(url, request, body);
  }

  if (request.method === 'POST' && url.pathname === '/api/imports/file') {
    const form = await request.clone().formData().catch(() => null);
    if (!form) return request;
    form.set('storeId', storeId);
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
    if (request.method === 'POST' && url.pathname === '/api/__ops/one-time-reset') return oneTimeResetResponse(request, env);

    const normalizedRequest = await normalizeApiRequest(request);
    if (request.method === 'POST' && url.pathname === '/api/imports/commit') {
      return commitPartialImport(normalizedRequest, env);
    }
    return app.fetch(normalizedRequest, env, ctx);
  }
};
