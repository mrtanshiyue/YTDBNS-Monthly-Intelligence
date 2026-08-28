const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const STORE_IDS = new Set(['ytdbns', 'yy', 'jj']);
let schemaPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function ensureOperationLogSchema(env) {
  if (!schemaPromise) {
    const statements = [
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS operation_logs (
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
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_operation_logs_store_created ON operation_logs(store_id, created_at DESC)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_operation_logs_batch ON operation_logs(batch_id, id)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_operation_logs_month ON operation_logs(report_month, created_at DESC)')
    ];
    schemaPromise = env.DB.batch(statements).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function appendOperationLog(env, entry) {
  await ensureOperationLogSchema(env);
  const detail = JSON.stringify(entry.detail && typeof entry.detail === 'object' ? entry.detail : {});
  await env.DB.prepare(`INSERT INTO operation_logs(
      event_id,store_id,batch_id,report_month,event_type,status,actor,summary,detail_json,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(
      crypto.randomUUID(),
      STORE_IDS.has(String(entry.storeId || '').toLowerCase()) ? String(entry.storeId).toLowerCase() : 'ytdbns',
      entry.batchId || null,
      entry.reportMonth || null,
      entry.eventType || 'UNKNOWN',
      entry.status || 'INFO',
      entry.actor || 'web',
      String(entry.summary || '操作记录').slice(0, 500),
      detail
    ).run();
}

export async function safeAppendOperationLog(env, entry) {
  try {
    await appendOperationLog(env, entry);
  } catch (error) {
    console.error('operation log write failed', error);
  }
}

export async function operationLogsResponse(request, env) {
  try {
    await ensureOperationLogSchema(env);
    const url = new URL(request.url);
    const rawStore = String(url.searchParams.get('store') || 'all').toLowerCase();
    const month = String(url.searchParams.get('month') || '');
    const batchId = String(url.searchParams.get('batchId') || '');
    const limit = Math.max(1, Math.min(150, Number(url.searchParams.get('limit') || 100) || 100));
    const clauses = [];
    const args = [];

    if (rawStore !== 'all') {
      const storeId = STORE_IDS.has(rawStore) ? rawStore : 'ytdbns';
      clauses.push('store_id=?');
      args.push(storeId);
    }
    if (/^\d{4}-\d{2}$/.test(month)) {
      clauses.push('report_month=?');
      args.push(month);
    }
    if (batchId) {
      clauses.push('batch_id=?');
      args.push(batchId);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    let statement = env.DB.prepare(`SELECT id,event_id,store_id,batch_id,report_month,event_type,status,actor,summary,detail_json,created_at
        FROM operation_logs ${where} ORDER BY id DESC LIMIT ${limit}`);
    if (args.length) statement = statement.bind(...args);
    const result = await statement.all();
    const logs = (result.results || []).map(row => {
      let detail = {};
      try { detail = JSON.parse(row.detail_json || '{}'); } catch {}
      const base = { ...row };
      delete base.detail_json;
      return { ...base, detail };
    });
    return json({ ok: true, logs, limit });
  } catch (error) {
    console.error('operation log read failed', error);
    const message = error instanceof Error ? error.message : String(error || '操作日志读取失败');
    return json({ ok: false, error: message }, 500);
  }
}
