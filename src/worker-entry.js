import app from './worker.js';
import { commitPartialImport } from './partial-import.js';
import { operationLogsResponse, safeAppendOperationLog } from './operation-log.js';
import { enhanceCoreCommit, adSearchTermsResponse } from './core-report-model.js';

const STORES = Object.freeze([
  { id: 'ytdbns', code: 'YTDBNS', name: 'YTDBNS' },
  { id: 'yy', code: 'YY', name: 'YY' },
  { id: 'jj', code: 'JJ', name: 'JJ' }
]);
const STORE_IDS = new Set(STORES.map(store => store.id));
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
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
    headers: JSON_HEADERS
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
  if (!url.pathname.startsWith('/api/') || ['/api/health', '/api/stores', '/api/operation-logs', '/api/ad-search-terms'].includes(url.pathname)) return request;

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

async function responseJson(response) {
  return response.clone().json().catch(() => ({}));
}

function compactChecks(checks) {
  return (checks || []).slice(0, 40).map(check => ({
    item: String(check?.item || ''),
    status: String(check?.status || ''),
    value: String(check?.value ?? '').slice(0, 240),
    detail: String(check?.detail ?? '').slice(0, 800)
  }));
}

function payloadCounts(payload) {
  const keys = [
    'daily', 'products', 'parents', 'campaigns', 'returns', 'inventory', 'storage', 'charges',
    'productMaster', 'costMaster', 'returnEvents', 'campaignEvents', 'transactionEvents', 'transactionSkuEvents', 'adSearchEvents'
  ];
  return Object.fromEntries(keys
    .filter(key => Array.isArray(payload?.[key]))
    .map(key => [key, payload[key].length]));
}

async function batchEvidence(env, batchId, storeId) {
  if (!batchId) return { batch: null, files: [] };
  const batch = await env.DB.prepare(`SELECT id,store_id,report_month,range_start,range_end,status,model_status,file_count,source_count,warning_count,created_by,created_at,committed_at
      FROM import_batches WHERE id=? AND store_id=?`).bind(batchId, storeId).first();
  const files = (await env.DB.prepare(`SELECT id,report_type,filename,size_bytes,row_count,checksum,status,uploaded_at
      FROM report_files WHERE batch_id=? AND store_id=? ORDER BY uploaded_at,id`).bind(batchId, storeId).all()).results || [];
  return { batch, files };
}

async function logStartOutcome(env, body, response) {
  const result = await responseJson(response);
  const storeId = normalizeStoreId(body?.storeId);
  await safeAppendOperationLog(env, {
    storeId,
    batchId: result.batchId || null,
    reportMonth: body?.month || result.month || null,
    eventType: response.ok ? 'IMPORT_STARTED' : 'IMPORT_START_FAILED',
    status: response.ok ? 'SUCCESS' : 'FAILED',
    actor: body?.createdBy || 'web',
    summary: response.ok ? '创建导入批次' : '创建导入批次失败',
    detail: response.ok ? {
      rangeStart: result.rangeStart || null,
      rangeEnd: result.rangeEnd || null
    } : {
      error: result.error || `HTTP ${response.status}`
    }
  });
}

async function logFileOutcome(env, meta, response) {
  const result = await responseJson(response);
  const storeId = normalizeStoreId(meta.storeId);
  const filename = meta.filename || '未命名文件';
  await safeAppendOperationLog(env, {
    storeId,
    batchId: meta.batchId || null,
    reportMonth: meta.month || null,
    eventType: response.ok ? 'FILE_STORED' : 'FILE_STORE_FAILED',
    status: response.ok ? 'SUCCESS' : 'FAILED',
    actor: 'web',
    summary: response.ok ? `归档文件 · ${filename}` : `文件归档失败 · ${filename}`,
    detail: {
      filename,
      reportType: meta.reportType || 'unknown',
      rowCount: Number(meta.rowCount || 0),
      sizeBytes: Number(meta.sizeBytes || result.size || 0),
      fileId: result.fileId || null,
      r2Key: result.key || null,
      checksum: result.checksum || null,
      error: response.ok ? null : (result.error || `HTTP ${response.status}`)
    }
  });
}

async function logCommitOutcome(env, body, response) {
  const result = await responseJson(response);
  const payload = body?.payload || {};
  const storeId = normalizeStoreId(payload.storeId || body?.storeId);
  const batchId = body?.batchId || result.batchId || null;
  const evidence = await batchEvidence(env, batchId, storeId).catch(() => ({ batch: null, files: [] }));
  const fileCount = evidence.files.length || Number(evidence.batch?.file_count || 0);
  const sourceCount = new Set(evidence.files.map(file => file.report_type).filter(Boolean)).size || Number(evidence.batch?.source_count || 0);
  const finalStatus = response.ok ? (result.status === 'WARN' ? 'WARN' : 'SUCCESS') : 'FAILED';
  const checks = compactChecks(payload.checks);
  const warningChecks = checks.filter(check => check.status === 'WARN');
  const failedChecks = checks.filter(check => check.status === 'FAIL');

  await safeAppendOperationLog(env, {
    storeId,
    batchId,
    reportMonth: payload.month || evidence.batch?.report_month || null,
    eventType: response.ok ? 'IMPORT_COMMITTED' : 'IMPORT_COMMIT_FAILED',
    status: finalStatus,
    actor: evidence.batch?.created_by || 'web',
    summary: response.ok
      ? `导入完成 · ${fileCount} 个文件 / ${sourceCount} 类数据源`
      : '导入写入失败',
    detail: {
      modelStatus: result.status || evidence.batch?.model_status || null,
      warningCount: Number(result.warningCount ?? evidence.batch?.warning_count ?? warningChecks.length),
      failedCheckCount: failedChecks.length,
      fileCount,
      sourceCount,
      partial: result.partial ?? false,
      sourceModel: result.sourceModel || null,
      coreSources: result.coreSources || [],
      rangeStart: evidence.batch?.range_start || null,
      rangeEnd: evidence.batch?.range_end || null,
      touchedMonths: result.affectedMonths || result.touchedMonths || result.months || [],
      rowCounts: payloadCounts(payload),
      checks,
      files: evidence.files.map(file => ({
        id: file.id,
        reportType: file.report_type,
        filename: file.filename,
        sizeBytes: Number(file.size_bytes || 0),
        rowCount: Number(file.row_count || 0),
        checksum: file.checksum || null,
        status: file.status,
        uploadedAt: file.uploaded_at
      })),
      error: response.ok ? null : (result.error || `HTTP ${response.status}`)
    }
  });
}

function commitFailureResponse(error) {
  const message = error instanceof Error ? error.message : String(error || '导入写入失败');
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 500,
    headers: JSON_HEADERS
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);

    await ensureStoreCatalog(env);
    if (request.method === 'GET' && url.pathname === '/api/stores') return storesResponse(env);
    if (request.method === 'GET' && url.pathname === '/api/operation-logs') return operationLogsResponse(request, env);
    if (request.method === 'GET' && url.pathname === '/api/ad-search-terms') return adSearchTermsResponse(request, env, normalizeStoreId(url.searchParams.get('store')));

    const normalizedRequest = await normalizeApiRequest(request);

    if (request.method === 'POST' && url.pathname === '/api/imports/start') {
      const body = await normalizedRequest.clone().json().catch(() => null);
      const response = await app.fetch(normalizedRequest, env, ctx);
      await logStartOutcome(env, body, response);
      return response;
    }

    if (request.method === 'POST' && url.pathname === '/api/imports/file') {
      const form = await normalizedRequest.clone().formData().catch(() => null);
      const file = form?.get('file');
      const meta = {
        batchId: String(form?.get('batchId') || ''),
        storeId: String(form?.get('storeId') || 'ytdbns'),
        month: String(form?.get('month') || ''),
        reportType: String(form?.get('reportType') || 'unknown'),
        rowCount: Number(form?.get('rowCount') || 0),
        filename: file && typeof file === 'object' && 'name' in file ? String(file.name) : '',
        sizeBytes: file && typeof file === 'object' && 'size' in file ? Number(file.size || 0) : 0
      };
      const response = await app.fetch(normalizedRequest, env, ctx);
      await logFileOutcome(env, meta, response);
      return response;
    }

    if (request.method === 'POST' && url.pathname === '/api/imports/commit') {
      const body = await normalizedRequest.clone().json().catch(() => null);
      try {
        let response = await commitPartialImport(normalizedRequest, env);
        response = await enhanceCoreCommit(body, response, env);
        await logCommitOutcome(env, body, response);
        return response;
      } catch (error) {
        const response = commitFailureResponse(error);
        await logCommitOutcome(env, body, response);
        return response;
      }
    }

    return app.fetch(normalizedRequest, env, ctx);
  }
};
