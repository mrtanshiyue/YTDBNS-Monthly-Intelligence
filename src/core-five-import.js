import { commitPartialImport } from './partial-import.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const CORE_ROLES = Object.freeze(['cost', 'transactions', 'ads', 'returns', 'inventory']);
const EVENT_ROLES = Object.freeze(['transactions', 'ads', 'returns', 'parent', 'child', 'storage']);
const num = value => Number(value || 0) || 0;
const monthOf = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).slice(0, 7) : '';
const isMonth = value => /^\d{4}-\d{2}$/.test(String(value || ''));

async function all(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).all()).results || [];
}
async function one(db, sql, ...args) {
  return await db.prepare(sql).bind(...args).first();
}
async function chunks(db, statements, size = 80) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}
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
function modelFromSku(sku) {
  const match = String(sku || '').match(/^(YS\d{3})/i);
  return match ? match[1].toUpperCase() : 'UNASSIGNED';
}

async function rolesForBatch(db, batchId, storeId) {
  const rows = await all(db, 'SELECT DISTINCT report_type FROM report_files WHERE batch_id=? AND store_id=?', batchId, storeId);
  return new Set(rows.map(row => String(row.report_type || '')).filter(Boolean));
}

async function persistDetailedCosts(db, storeId, rows) {
  const statements = (rows || []).filter(row => row.sku).map(row => db.prepare(`
    INSERT INTO cost_master(store_id,sku,purchase_cost,first_mile_cost,fbm_shipping_cost,currency,source_updated_at,updated_at)
    VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(store_id,sku) DO UPDATE SET
      purchase_cost=excluded.purchase_cost,
      first_mile_cost=excluded.first_mile_cost,
      fbm_shipping_cost=excluded.fbm_shipping_cost,
      currency=excluded.currency,
      source_updated_at=excluded.source_updated_at,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    storeId,
    row.sku,
    row.purchaseCost == null ? num(row.cost) : num(row.purchaseCost),
    num(row.firstMileCost),
    num(row.fbmShippingCost),
    String(row.currency || 'USD').trim() || 'USD',
    row.updated || ''
  ));
  await chunks(db, statements);
}

async function persistInventoryIdentity(db, storeId, products) {
  const statements = (products || []).filter(row => row.sku).map(row => db.prepare(`
    INSERT INTO product_master(store_id,sku,model,internal_code,fnsku,asin,updated_at)
    VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(store_id,sku) DO UPDATE SET
      model=excluded.model,internal_code=excluded.internal_code,fnsku=excluded.fnsku,asin=excluded.asin,updated_at=CURRENT_TIMESTAMP
  `).bind(storeId, row.sku, row.model || modelFromSku(row.sku), row.internal || '', row.fnsku || '', row.asin || ''));
  await chunks(db, statements);
}

async function finalizeCurrentInventory(db, storeId, batchId, payload) {
  const snapshotDate = String(payload.inventorySnapshotDate || payload.inventory?.[0]?.snapshotDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) throw new Error('库存快照日期无效');

  // The base commit inserted this batch successfully. Only now remove older snapshots.
  await db.prepare('DELETE FROM inventory_snapshots WHERE store_id=? AND batch_id<>?').bind(storeId, batchId).run();
  await db.prepare('DELETE FROM inventory_snapshots WHERE store_id=? AND snapshot_date<>?').bind(storeId, snapshotDate).run();

  const statements = (payload.inventory || []).filter(row => row.sku).map(row => db.prepare(`
    UPDATE inventory_snapshots SET
      model=?,fnsku=?,asin=?,product_name=?,condition=?,your_price=?,
      mfn_listing_exists=?,mfn_fulfillable=?,afn_listing_exists=?,warehouse=?,fulfillable=?,unsellable=?,reserved=?,total=?,
      per_unit_volume=?,inbound_working=?,inbound_shipped=?,inbound_receiving=?,inbound=?,researching=?,
      reserved_future_supply=?,future_supply_buyable=?,fc_transfer=?,onhand_buyable=?,store_label=?,
      inventory_value=total*COALESCE((SELECT purchase_cost+first_mile_cost+fbm_shipping_cost FROM cost_master c WHERE c.store_id=inventory_snapshots.store_id AND c.sku=inventory_snapshots.sku),inventory_value,0),
      batch_id=?
    WHERE store_id=? AND snapshot_date=? AND sku=?
  `).bind(
    row.model || modelFromSku(row.sku), row.fnsku || '', row.asin || '', row.productName || '', row.condition || '', num(row.yourPrice),
    row.mfnListingExists || '', num(row.mfnFulfillable), row.afnListingExists || '', num(row.warehouse), num(row.fulfillable), num(row.unsellable), num(row.reserved), num(row.total),
    num(row.perUnitVolume), num(row.inboundWorking), num(row.inboundShipped), num(row.inboundReceiving), num(row.inbound), num(row.researching),
    num(row.reservedFutureSupply), num(row.futureSupplyBuyable), num(row.fcTransfer), num(row.onhandBuyable), row.storeLabel || '',
    batchId, storeId, snapshotDate, row.sku
  ));
  await chunks(db, statements);

  // Current inventory is not a historical monthly fact.
  await db.prepare(`UPDATE monthly_metrics SET inventory_units=NULL,fulfillable_units=NULL,inbound_units=NULL,inventory_value=NULL,updated_at=CURRENT_TIMESTAMP WHERE store_id=?`)
    .bind(storeId).run();
}

async function preserveOrRemoveInventoryAuditMonth(db, storeId, batchId, payload, roles, preExistingMonth) {
  if (!roles.has('inventory') || EVENT_ROLES.some(role => roles.has(role))) return;
  const month = payload?.month;
  if (!isMonth(month)) return;

  if (preExistingMonth) {
    await db.prepare(`UPDATE monthly_metrics SET model_status=?,batch_id=?,updated_at=? WHERE store_id=? AND month=?`)
      .bind(
        preExistingMonth.model_status || 'WARN',
        preExistingMonth.batch_id || null,
        preExistingMonth.updated_at || new Date().toISOString(),
        storeId,
        month
      ).run();
    return;
  }

  // The base partial importer needs a month key to stage inventory. Remove that
  // synthetic row when this was an inventory/master-only batch.
  await db.prepare('DELETE FROM monthly_metrics WHERE store_id=? AND month=? AND batch_id=?')
    .bind(storeId, month, batchId).run();
}

async function replaceTransactionSkuMonth(db, storeId, month, events, batchId) {
  await db.prepare('DELETE FROM transaction_sku_daily WHERE store_id=? AND substr(date,1,7)=?').bind(storeId, month).run();
  const grouped = aggregate((events || []).filter(row => monthOf(row.date) === month && row.sku),
    row => `${row.date}|${row.sku}`,
    row => ({ date: row.date, sku: row.sku, sales: 0, units: 0, refundSales: 0, refundQty: 0 }),
    (target, row) => {
      if (String(row.type || '') === 'Order') {
        target.sales += num(row.productSales);
        target.units += num(row.quantity);
      } else if (String(row.type || '') === 'Refund') {
        target.refundSales += Math.abs(num(row.productSales));
        target.refundQty += num(row.quantity) || 1;
      }
    });
  const statements = grouped.map(row => db.prepare(`
    INSERT INTO transaction_sku_daily(store_id,date,sku,sales,units,refund_sales,refund_qty,batch_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(storeId, row.date, row.sku, row.sales, row.units, row.refundSales, row.refundQty, batchId));
  await chunks(db, statements);
}

async function replaceReturnSkuMonth(db, storeId, month, events, batchId) {
  await db.prepare('DELETE FROM return_sku_daily WHERE store_id=? AND substr(date,1,7)=?').bind(storeId, month).run();
  const grouped = aggregate((events || []).filter(row => monthOf(row.date) === month && row.sku),
    row => `${row.date}|${row.sku}`,
    row => ({ date: row.date, sku: row.sku, asin: row.asin || '', fnsku: row.fnsku || '', returns: 0, sellable: 0, damaged: 0 }),
    (target, row) => {
      const count = num(row.count) || 1;
      target.returns += count;
      if (/SELLABLE/i.test(String(row.disposition || ''))) target.sellable += count;
      else target.damaged += count;
      if (!target.asin && row.asin) target.asin = row.asin;
      if (!target.fnsku && row.fnsku) target.fnsku = row.fnsku;
    });
  const statements = grouped.map(row => db.prepare(`
    INSERT INTO return_sku_daily(store_id,date,sku,asin,fnsku,returns,sellable_returns,damaged_returns,batch_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(storeId, row.date, row.sku, row.asin, row.fnsku, row.returns, row.sellable, row.damaged, batchId));
  await chunks(db, statements);

  const dispositions = aggregate((events || []).filter(row => monthOf(row.date) === month),
    row => row.disposition || 'UNKNOWN',
    row => ({ key: row.disposition || 'UNKNOWN', count: 0 }),
    (target, row) => { target.count += num(row.count) || 1; });
  await db.prepare('DELETE FROM return_disposition_monthly WHERE store_id=? AND month=?').bind(storeId, month).run();
  await chunks(db, dispositions.map(row => db.prepare(`INSERT INTO return_disposition_monthly(store_id,month,disposition,count,batch_id,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(storeId, month, row.key, row.count, batchId)));

  const statuses = aggregate((events || []).filter(row => monthOf(row.date) === month),
    row => row.status || 'UNKNOWN',
    row => ({ key: row.status || 'UNKNOWN', count: 0 }),
    (target, row) => { target.count += num(row.count) || 1; });
  await db.prepare('DELETE FROM return_status_monthly WHERE store_id=? AND month=?').bind(storeId, month).run();
  await chunks(db, statuses.map(row => db.prepare(`INSERT INTO return_status_monthly(store_id,month,status,count,batch_id,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(storeId, month, row.key, row.count, batchId)));
}

async function recalcCogsForMonth(db, storeId, month) {
  await db.prepare(`
    UPDATE daily_metrics
    SET cogs=COALESCE((
      SELECT SUM(t.units * COALESCE(c.purchase_cost+c.first_mile_cost+c.fbm_shipping_cost,0))
      FROM transaction_sku_daily t
      LEFT JOIN cost_master c ON c.store_id=t.store_id AND c.sku=t.sku
      WHERE t.store_id=daily_metrics.store_id AND t.date=daily_metrics.date
    ),0),updated_at=CURRENT_TIMESTAMP
    WHERE store_id=? AND substr(date,1,7)=?
  `).bind(storeId, month).run();
}

async function refreshCurrentInventoryOnExistingProducts(db, storeId) {
  await db.prepare(`
    UPDATE product_monthly_metrics
    SET fulfillable_units=COALESCE((
          SELECT SUM(i.fulfillable) FROM inventory_snapshots i
          WHERE i.store_id=product_monthly_metrics.store_id AND i.sku=product_monthly_metrics.sku
        ),0),
        inventory_value=COALESCE((
          SELECT SUM(i.inventory_value) FROM inventory_snapshots i
          WHERE i.store_id=product_monthly_metrics.store_id AND i.sku=product_monthly_metrics.sku
        ),0),
        updated_at=CURRENT_TIMESTAMP
    WHERE store_id=?
  `).bind(storeId).run();
}

async function refreshCostOnExistingProducts(db, storeId) {
  await db.prepare(`
    UPDATE product_monthly_metrics
    SET cogs=units*COALESCE((
          SELECT c.purchase_cost+c.first_mile_cost+c.fbm_shipping_cost
          FROM cost_master c
          WHERE c.store_id=product_monthly_metrics.store_id AND c.sku=product_monthly_metrics.sku
        ),0),
        updated_at=CURRENT_TIMESTAMP
    WHERE store_id=?
  `).bind(storeId).run();
}

async function rebuildProductMonth(db, storeId, month, batchId) {
  await db.prepare('DELETE FROM product_monthly_metrics WHERE store_id=? AND month=?').bind(storeId, month).run();
  await db.prepare(`
    INSERT INTO product_monthly_metrics(
      store_id,month,sku,asin,parent_asin,model,sales,units,sessions,cvr,buy_box,
      ad_spend,ad_sales,returns,cogs,storage_fee,contribution_profit,fulfillable_units,inventory_value,batch_id,updated_at
    )
    SELECT
      ?,?,s.sku,COALESCE(p.asin,''),'',COALESCE(NULLIF(p.model,''),'UNASSIGNED'),
      COALESCE(t.sales,0),COALESCE(t.units,0),0,0,0,0,0,COALESCE(r.returns,0),
      COALESCE(t.units,0)*COALESCE(c.purchase_cost+c.first_mile_cost+c.fbm_shipping_cost,0),0,0,
      COALESCE(i.fulfillable,0),COALESCE(i.inventory_value,0),?,CURRENT_TIMESTAMP
    FROM (
      SELECT sku FROM transaction_sku_daily WHERE store_id=? AND substr(date,1,7)=?
      UNION
      SELECT sku FROM return_sku_daily WHERE store_id=? AND substr(date,1,7)=?
    ) s
    LEFT JOIN (SELECT sku,SUM(sales) sales,SUM(units) units FROM transaction_sku_daily WHERE store_id=? AND substr(date,1,7)=? GROUP BY sku) t ON t.sku=s.sku
    LEFT JOIN (SELECT sku,SUM(returns) returns FROM return_sku_daily WHERE store_id=? AND substr(date,1,7)=? GROUP BY sku) r ON r.sku=s.sku
    LEFT JOIN product_master p ON p.store_id=? AND p.sku=s.sku
    LEFT JOIN cost_master c ON c.store_id=? AND c.sku=s.sku
    LEFT JOIN (SELECT sku,SUM(fulfillable) fulfillable,SUM(inventory_value) inventory_value FROM inventory_snapshots WHERE store_id=? GROUP BY sku) i ON i.sku=s.sku
  `).bind(
    storeId, month, batchId,
    storeId, month, storeId, month,
    storeId, month, storeId, month,
    storeId, storeId, storeId
  ).run();

  const unknown = await all(db, `SELECT sku,asin FROM product_monthly_metrics WHERE store_id=? AND month=? AND (model='' OR model='UNASSIGNED')`, storeId, month);
  await chunks(db, unknown.map(row => db.prepare(`UPDATE product_monthly_metrics SET model=? WHERE store_id=? AND month=? AND sku=? AND asin=?`)
    .bind(modelFromSku(row.sku), storeId, month, row.sku, row.asin || '')));
}

async function recalcDailyProfit(db, storeId, month) {
  await db.prepare(`UPDATE daily_metrics SET contribution_profit=
    COALESCE(settlement,0)+COALESCE(finance_ad_charge,0)+COALESCE(base_storage_charge,0)-COALESCE(ad_spend,0)-COALESCE(cogs,0)-COALESCE(storage_estimate,0),
    updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND substr(date,1,7)=?`).bind(storeId, month).run();
}

async function recalcMonthlyProfit(db, storeId, month) {
  await db.prepare(`UPDATE monthly_metrics SET
    cogs=COALESCE((SELECT SUM(cogs) FROM daily_metrics d WHERE d.store_id=monthly_metrics.store_id AND substr(d.date,1,7)=monthly_metrics.month),0),
    acos=CASE WHEN COALESCE(ad_sales,0)>0 THEN COALESCE(ad_spend,0)/ad_sales ELSE 0 END,
    tacos=CASE WHEN COALESCE(business_sales,0)>0 THEN COALESCE(ad_spend,0)/business_sales ELSE 0 END,
    contribution_profit=COALESCE(settlement,0)+COALESCE(ad_charge,0)+COALESCE(base_storage_charge,0)-COALESCE(ad_spend,0)-COALESCE(storage_estimate,0)-COALESCE(cogs,0),
    profit_margin=CASE WHEN COALESCE(finance_gross_sales,0)>0 THEN
      (COALESCE(settlement,0)+COALESCE(ad_charge,0)+COALESCE(base_storage_charge,0)-COALESCE(ad_spend,0)-COALESCE(storage_estimate,0)-COALESCE(cogs,0))/finance_gross_sales ELSE 0 END,
    updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND month=?`).bind(storeId, month).run();
}

async function postProcessCoreFive(env, storeId, batchId, roles, payload, preExistingMonth) {
  const touched = new Set();

  if (roles.has('cost')) {
    await persistDetailedCosts(env.DB, storeId, payload.costMaster || []);
    await refreshCostOnExistingProducts(env.DB, storeId);
  }
  if (roles.has('inventory')) {
    await persistInventoryIdentity(env.DB, storeId, payload.productMaster || []);
    await finalizeCurrentInventory(env.DB, storeId, batchId, payload);
    await refreshCurrentInventoryOnExistingProducts(env.DB, storeId);
    await preserveOrRemoveInventoryAuditMonth(env.DB, storeId, batchId, payload, roles, preExistingMonth);
  }

  if (roles.has('transactions') && Array.isArray(payload.transactionEvents)) {
    const months = [...new Set(payload.transactionEvents.map(row => monthOf(row.date)).filter(isMonth))];
    for (const month of months) {
      await replaceTransactionSkuMonth(env.DB, storeId, month, payload.transactionEvents, batchId);
      touched.add(month);
    }
  }

  if (roles.has('returns') && Array.isArray(payload.returnEvents)) {
    const months = [...new Set(payload.returnEvents.map(row => monthOf(row.date)).filter(isMonth))];
    for (const month of months) {
      await replaceReturnSkuMonth(env.DB, storeId, month, payload.returnEvents, batchId);
      touched.add(month);
    }
  }

  if (roles.has('cost')) {
    const months = await all(env.DB, `SELECT DISTINCT substr(date,1,7) month FROM transaction_sku_daily WHERE store_id=?`, storeId);
    for (const row of months) if (isMonth(row.month)) touched.add(row.month);
    await env.DB.prepare(`UPDATE inventory_snapshots SET inventory_value=total*COALESCE(
      (SELECT purchase_cost+first_mile_cost+fbm_shipping_cost FROM cost_master c WHERE c.store_id=inventory_snapshots.store_id AND c.sku=inventory_snapshots.sku),inventory_value,0)
      WHERE store_id=?`).bind(storeId).run();
    await env.DB.prepare(`UPDATE monthly_metrics SET inventory_units=NULL,fulfillable_units=NULL,inbound_units=NULL,inventory_value=NULL,updated_at=CURRENT_TIMESTAMP WHERE store_id=?`)
      .bind(storeId).run();
  }

  for (const month of touched) {
    await recalcCogsForMonth(env.DB, storeId, month);
    await rebuildProductMonth(env.DB, storeId, month, batchId);
    await recalcDailyProfit(env.DB, storeId, month);
    await recalcMonthlyProfit(env.DB, storeId, month);
  }
  return [...touched].sort();
}

export async function commitCoreFiveImport(request, env) {
  const body = await request.clone().json().catch(() => null);
  const batchId = body?.batchId;
  const payload = body?.payload;
  const storeId = payload?.storeId || body?.storeId || 'ytdbns';

  const preRoles = batchId ? await rolesForBatch(env.DB, batchId, storeId) : new Set();
  if (preRoles.has('inventory')) {
    const countRow = await one(env.DB, `SELECT COUNT(*) count FROM report_files WHERE batch_id=? AND store_id=? AND report_type='inventory'`, batchId, storeId);
    if (num(countRow?.count) > 1) {
      return new Response(JSON.stringify({ ok: false, error: '库存报告属于当前快照，同一批次只能提交 1 份库存文件；请只保留最新库存报告。' }), { status: 400, headers: JSON_HEADERS });
    }
  }

  const preExistingMonth = (preRoles.has('inventory') && isMonth(payload?.month))
    ? await one(env.DB, 'SELECT * FROM monthly_metrics WHERE store_id=? AND month=?', storeId, payload.month)
    : null;

  const baseResponse = await commitPartialImport(request, env);
  const baseResult = await baseResponse.clone().json().catch(() => ({}));
  if (!baseResponse.ok || baseResult?.ok === false || !batchId || !payload) return baseResponse;

  const roles = await rolesForBatch(env.DB, batchId, storeId);
  const coreTouchedMonths = await postProcessCoreFive(env, storeId, batchId, roles, payload, preExistingMonth);
  const allTouched = [...new Set([...(baseResult.affectedMonths || []), ...coreTouchedMonths])].sort();
  const result = {
    ...baseResult,
    partial: !CORE_ROLES.every(role => roles.has(role)),
    canonicalSourceModel: 'core-five',
    canonicalSources: CORE_ROLES,
    sourceCount: roles.size,
    sources: [...roles],
    affectedMonths: allTouched,
    touchedMonths: allTouched,
    inventoryMode: roles.has('inventory') ? 'CURRENT_REPLACE' : undefined
  };
  return new Response(JSON.stringify(result), { status: baseResponse.status, headers: JSON_HEADERS });
}

export async function augmentMonthWithCurrentInventory(response, env, storeId) {
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok || !payload.metrics) return response;

  const snapshot = await one(env.DB, 'SELECT MAX(snapshot_date) d FROM inventory_snapshots WHERE store_id=?', storeId);
  const snapshotDate = snapshot?.d || null;
  let inventory = [];
  if (snapshotDate) {
    inventory = await all(env.DB, 'SELECT * FROM inventory_snapshots WHERE store_id=? AND snapshot_date=? ORDER BY inventory_value DESC LIMIT 1000', storeId, snapshotDate);
    const totals = await one(env.DB, `SELECT SUM(total) inventory_units,SUM(fulfillable) fulfillable_units,SUM(inbound) inbound_units,SUM(inventory_value) inventory_value FROM inventory_snapshots WHERE store_id=? AND snapshot_date=?`, storeId, snapshotDate) || {};
    payload.metrics.inventory_units = num(totals.inventory_units);
    payload.metrics.fulfillable_units = num(totals.fulfillable_units);
    payload.metrics.inbound_units = num(totals.inbound_units);
    payload.metrics.inventory_value = num(totals.inventory_value);
  } else {
    payload.metrics.inventory_units = null;
    payload.metrics.fulfillable_units = null;
    payload.metrics.inbound_units = null;
    payload.metrics.inventory_value = null;
  }
  payload.inventory = inventory;
  payload.inventorySnapshotDate = snapshotDate;
  payload.inventoryMode = 'CURRENT_REPLACE';
  return new Response(JSON.stringify(payload), { status: response.status, headers: JSON_HEADERS });
}
