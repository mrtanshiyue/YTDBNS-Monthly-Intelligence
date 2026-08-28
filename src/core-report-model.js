const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const isMonth = value => /^\d{4}-\d{2}$/.test(String(value || ''));
const monthOf = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).slice(0, 7) : '';
const num = value => Number(value || 0) || 0;
async function all(db, sql, ...args) { return (await db.prepare(sql).bind(...args).all()).results || []; }
async function chunks(db, statements, size = 80) { for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size)); }

function aggregate(rows, keyFn, seedFn, addFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    const target = map.get(key) || seedFn(row);
    addFn(target, row);
    map.set(key, target);
  }
  return [...map.values()];
}

async function ensureMonthly(db, storeId, month) {
  if (!isMonth(month)) return;
  await db.prepare('INSERT INTO monthly_metrics(store_id,month) VALUES(?,?) ON CONFLICT(store_id,month) DO NOTHING').bind(storeId, month).run();
}

async function writeCostComponents(db, storeId, rows) {
  const statements = (rows || []).filter(row => row?.sku).map(row => db.prepare(`INSERT INTO cost_master
    (store_id,sku,purchase_cost,first_mile_cost,fbm_shipping_cost,currency,source_updated_at,updated_at)
    VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(store_id,sku) DO UPDATE SET purchase_cost=excluded.purchase_cost,first_mile_cost=excluded.first_mile_cost,
      fbm_shipping_cost=excluded.fbm_shipping_cost,currency=excluded.currency,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`)
    .bind(storeId, row.sku, num(row.purchaseCost ?? row.cost), num(row.firstMileCost), num(row.fbmShippingCost), row.currency || 'USD', row.updated || ''));
  await chunks(db, statements);
}

function skuAggregate(rows) {
  return aggregate(rows || [], row => `${row.date || ''}|${row.sku || ''}`,
    row => ({ date: row.date || '', sku: row.sku || '', sales: 0, units: 0, refundSales: 0, refundQty: 0 }),
    (target, row) => { target.sales += num(row.sales); target.units += num(row.units); target.refundSales += num(row.refundSales); target.refundQty += num(row.refundQty); });
}

async function replaceTransactionMonth(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM transaction_daily_sku WHERE store_id=? AND substr(date,1,7)=?').bind(storeId, month).run();
  const statements = skuAggregate(rows).filter(row => row.sku && /^\d{4}-\d{2}-\d{2}$/.test(row.date)).map(row => db.prepare(`INSERT INTO transaction_daily_sku
    (store_id,date,sku,sales,units,refund_sales,refund_qty,cogs,batch_id,updated_at) VALUES(?,?,?,?,?,?,?,0,?,CURRENT_TIMESTAMP)`)
    .bind(storeId, row.date, row.sku, row.sales, row.units, row.refundSales, row.refundQty, batchId));
  await chunks(db, statements);
}

async function recalcCogsMonth(db, storeId, month) {
  await db.prepare(`UPDATE transaction_daily_sku SET cogs=units*COALESCE((SELECT purchase_cost+first_mile_cost+fbm_shipping_cost
    FROM cost_master c WHERE c.store_id=transaction_daily_sku.store_id AND c.sku=transaction_daily_sku.sku),0),updated_at=CURRENT_TIMESTAMP
    WHERE store_id=? AND substr(date,1,7)=?`).bind(storeId, month).run();
  await db.prepare(`UPDATE daily_metrics SET cogs=COALESCE((SELECT SUM(t.cogs) FROM transaction_daily_sku t
    WHERE t.store_id=daily_metrics.store_id AND t.date=daily_metrics.date),0),updated_at=CURRENT_TIMESTAMP
    WHERE store_id=? AND substr(date,1,7)=?`).bind(storeId, month).run();
  await ensureMonthly(db, storeId, month);
  await db.prepare(`UPDATE monthly_metrics SET cogs=COALESCE((SELECT SUM(cogs) FROM daily_metrics d
    WHERE d.store_id=monthly_metrics.store_id AND substr(d.date,1,7)=monthly_metrics.month),0),updated_at=CURRENT_TIMESTAMP
    WHERE store_id=? AND month=?`).bind(storeId, month).run();
}

async function applyBusinessFallback(db, storeId, month) {
  await ensureMonthly(db, storeId, month);
  await db.prepare(`UPDATE monthly_metrics SET
    business_sales=CASE WHEN business_sales IS NULL OR business_sales=0 OR ABS(business_sales-COALESCE(finance_gross_sales,0))<0.01 THEN COALESCE(finance_gross_sales,0) ELSE business_sales END,
    business_units=CASE WHEN business_units IS NULL OR business_units=0 OR ABS(business_units-COALESCE(orders_qty,0))<0.01 THEN COALESCE(orders_qty,0) ELSE business_units END,
    updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND month=?`).bind(storeId, month).run();
}

async function recalcProfitMonth(db, storeId, month) {
  await db.prepare(`UPDATE daily_metrics SET contribution_profit=
    COALESCE(settlement,0)+COALESCE(finance_ad_charge,0)-COALESCE(ad_spend,0)-COALESCE(cogs,0)+
    CASE WHEN COALESCE(storage_estimate,0)>0 THEN COALESCE(base_storage_charge,0)-COALESCE(storage_estimate,0) ELSE 0 END,
    updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND substr(date,1,7)=?`).bind(storeId, month).run();
  await ensureMonthly(db, storeId, month);
  await db.prepare(`UPDATE monthly_metrics SET
    acos=CASE WHEN COALESCE(ad_sales,0)>0 THEN COALESCE(ad_spend,0)/ad_sales ELSE 0 END,
    tacos=CASE WHEN COALESCE(business_sales,0)>0 THEN COALESCE(ad_spend,0)/business_sales
      WHEN COALESCE(finance_gross_sales,0)>0 THEN COALESCE(ad_spend,0)/finance_gross_sales ELSE 0 END,
    contribution_profit=COALESCE(settlement,0)+COALESCE(ad_charge,0)-COALESCE(ad_spend,0)-COALESCE(cogs,0)+
      CASE WHEN COALESCE(storage_estimate,0)>0 THEN COALESCE(base_storage_charge,0)-COALESCE(storage_estimate,0) ELSE 0 END,
    profit_margin=CASE WHEN COALESCE(finance_gross_sales,0)>0 THEN
      (COALESCE(settlement,0)+COALESCE(ad_charge,0)-COALESCE(ad_spend,0)-COALESCE(cogs,0)+
      CASE WHEN COALESCE(storage_estimate,0)>0 THEN COALESCE(base_storage_charge,0)-COALESCE(storage_estimate,0) ELSE 0 END)/finance_gross_sales ELSE 0 END,
    updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND month=?`).bind(storeId, month).run();
}

async function replaceAdSearchMonth(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM ad_search_term_monthly WHERE store_id=? AND month=?').bind(storeId, month).run();
  const grouped = aggregate(rows || [], row => [row.campaignId || '', row.campaign || '', row.adGroupId || '', row.adGroup || '', row.searchTerm || '', row.targetingId || '', row.targeting || '', row.matchType || ''].join('|'),
    row => ({ portfolio: row.portfolio || '', campaignId: row.campaignId || '', campaign: row.campaign || '', adGroupId: row.adGroupId || '', adGroup: row.adGroup || '', searchTerm: row.searchTerm || '', targetingId: row.targetingId || '', targeting: row.targeting || '', targetingType: row.targetingType || '', targetingState: row.targetingState || '', matchType: row.matchType || '', targetBid: num(row.targetBid), spend: 0, sales: 0, orders: 0, units: 0, impressions: 0, clicks: 0 }),
    (target, row) => { target.spend += num(row.spend); target.sales += num(row.sales); target.orders += num(row.orders); target.units += num(row.units); target.impressions += num(row.impressions); target.clicks += num(row.clicks); if (num(row.targetBid)) target.targetBid = num(row.targetBid); });
  const statements = grouped.map(row => db.prepare(`INSERT INTO ad_search_term_monthly
    (store_id,month,portfolio,campaign_id,campaign,ad_group_id,ad_group,search_term,targeting_id,targeting,targeting_type,targeting_state,match_type,target_bid,spend,sales,orders,units,impressions,clicks,acos,ctr,cvr,batch_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
      storeId, month, row.portfolio, row.campaignId, row.campaign, row.adGroupId, row.adGroup, row.searchTerm, row.targetingId, row.targeting,
      row.targetingType, row.targetingState, row.matchType, row.targetBid, row.spend, row.sales, row.orders, row.units, row.impressions, row.clicks,
      row.sales ? row.spend / row.sales : 0, row.impressions ? row.clicks / row.impressions : 0, row.clicks ? row.orders / row.clicks : 0, batchId));
  await chunks(db, statements);
}

export async function enhanceCoreCommit(body, response, env) {
  if (!response.ok) return response;
  const result = await response.clone().json().catch(() => ({}));
  const payload = body?.payload || {};
  const storeId = payload.storeId || body?.storeId || 'ytdbns';
  const batchId = body?.batchId || result.batchId || null;
  const roleRows = await all(env.DB, 'SELECT DISTINCT report_type FROM report_files WHERE batch_id=? AND store_id=?', batchId, storeId);
  const roles = new Set(roleRows.map(row => String(row.report_type || '')).filter(Boolean));
  const affected = new Set(result.affectedMonths || result.touchedMonths || result.months || []);

  if (roles.has('cost')) await writeCostComponents(env.DB, storeId, payload.costMaster || []);

  if (roles.has('transactions') && Array.isArray(payload.transactionSkuEvents) && payload.transactionSkuEvents.length) {
    const months = [...new Set(payload.transactionSkuEvents.map(row => monthOf(row.date)).filter(isMonth))];
    for (const month of months) {
      await replaceTransactionMonth(env.DB, storeId, month, payload.transactionSkuEvents.filter(row => monthOf(row.date) === month), batchId);
      await applyBusinessFallback(env.DB, storeId, month);
      await recalcCogsMonth(env.DB, storeId, month);
      affected.add(month);
    }
  }

  if (roles.has('cost')) {
    const months = await all(env.DB, 'SELECT DISTINCT substr(date,1,7) month FROM transaction_daily_sku WHERE store_id=? ORDER BY month', storeId);
    for (const row of months) if (isMonth(row.month)) { await recalcCogsMonth(env.DB, storeId, row.month); affected.add(row.month); }
  }

  if (roles.has('ads') && Array.isArray(payload.adSearchEvents) && payload.adSearchEvents.length) {
    const months = [...new Set(payload.adSearchEvents.map(row => monthOf(row.date)).filter(isMonth))];
    for (const month of months) {
      await replaceAdSearchMonth(env.DB, storeId, month, payload.adSearchEvents.filter(row => monthOf(row.date) === month), batchId);
      affected.add(month);
    }
  }

  for (const month of affected) if (isMonth(month)) await recalcProfitMonth(env.DB, storeId, month);

  const enhanced = {
    ...result,
    partial: false,
    sourceModel: 'core-v2',
    coreSources: [...roles].filter(role => ['transactions', 'ads', 'cost'].includes(role)),
    affectedMonths: [...affected].filter(isMonth).sort()
  };
  return new Response(JSON.stringify(enhanced), { status: response.status, headers: response.headers });
}

export async function adSearchTermsResponse(request, env, storeId) {
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || '';
  if (!isMonth(month)) return new Response(JSON.stringify({ ok: false, error: '月份格式应为 YYYY-MM' }), { status: 400, headers: JSON_HEADERS });
  const limit = Math.max(1, Math.min(10000, Number(url.searchParams.get('limit') || 5000)));
  const rows = await all(env.DB, `SELECT * FROM ad_search_term_monthly WHERE store_id=? AND month=? ORDER BY spend DESC LIMIT ?`, storeId, month, limit);
  return new Response(JSON.stringify({ ok: true, storeId, month, rows, count: rows.length }), { status: 200, headers: JSON_HEADERS });
}
