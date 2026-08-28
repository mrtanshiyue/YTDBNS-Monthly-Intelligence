const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const ok = data => json({ ok: true, ...data });
const err = (message, status = 400, extra = {}) => json({ ok: false, error: message, ...extra }, status);
const isMonth = value => /^\d{4}-\d{2}$/.test(String(value || ''));
const monthOf = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).slice(0, 7) : '';
const num = value => Number(value || 0) || 0;

async function one(db, sql, ...args) {
  return await db.prepare(sql).bind(...args).first();
}
async function all(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).all()).results || [];
}
async function chunks(db, statements, size = 80) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}

function groupByMonth(rows, dateKey = 'date') {
  const map = new Map();
  for (const row of rows || []) {
    const month = monthOf(row?.[dateKey]);
    if (!month) continue;
    const list = map.get(month) || [];
    list.push(row);
    map.set(month, list);
  }
  return map;
}
function sum(rows, key) {
  return (rows || []).reduce((total, row) => total + num(row?.[key]), 0);
}
function aggregate(rows, keyFn, seedFn, addFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    const current = map.get(key) || seedFn(row);
    addFn(current, row);
    map.set(key, current);
  }
  return [...map.values()];
}

async function ensureMonthly(db, storeId, month) {
  if (!isMonth(month)) return;
  await db.prepare(`INSERT INTO monthly_metrics(store_id,month) VALUES(?,?)
    ON CONFLICT(store_id,month) DO NOTHING`).bind(storeId, month).run();
}
async function updateMonthly(db, storeId, month, fields, status, batchId) {
  if (!isMonth(month)) return;
  await ensureMonthly(db, storeId, month);
  const entries = Object.entries(fields || {}).filter(([key, value]) => key && value !== undefined);
  const set = entries.map(([key]) => `${key}=?`);
  const values = entries.map(([, value]) => value);
  set.push('model_status=?', 'batch_id=?', 'updated_at=CURRENT_TIMESTAMP');
  values.push(status, batchId, storeId, month);
  await db.prepare(`UPDATE monthly_metrics SET ${set.join(',')} WHERE store_id=? AND month=?`).bind(...values).run();
}
async function recalcMonthly(db, storeId, month) {
  if (!isMonth(month)) return;
  await db.prepare(`UPDATE monthly_metrics SET
    acos=CASE WHEN COALESCE(ad_sales,0)>0 THEN COALESCE(ad_spend,0)/ad_sales ELSE 0 END,
    tacos=CASE WHEN COALESCE(business_sales,0)>0 THEN COALESCE(ad_spend,0)/business_sales ELSE 0 END,
    contribution_profit=COALESCE(settlement,0)+COALESCE(ad_charge,0)+COALESCE(base_storage_charge,0)-COALESCE(ad_spend,0)-COALESCE(storage_estimate,0)-COALESCE(cogs,0),
    profit_margin=CASE WHEN COALESCE(finance_gross_sales,0)>0 THEN
      (COALESCE(settlement,0)+COALESCE(ad_charge,0)+COALESCE(base_storage_charge,0)-COALESCE(ad_spend,0)-COALESCE(storage_estimate,0)-COALESCE(cogs,0))/finance_gross_sales ELSE 0 END,
    updated_at=CURRENT_TIMESTAMP
    WHERE store_id=? AND month=?`).bind(storeId, month).run();
}

function dailyFields(row, roles) {
  const fields = {};
  if (roles.has('transactions')) {
    fields.sales = num(row.sales);
    fields.units = num(row.units);
    fields.orders = num(row.orders);
    fields.refund_sales = num(row.refundSales);
    fields.refund_qty = num(row.refundQty);
    fields.settlement = num(row.settlement);
    fields.finance_ad_charge = num(row.financeAdCharge);
    fields.base_storage_charge = num(row.baseStorageCharge);
    if (roles.has('cost') || num(row.cogs) !== 0) fields.cogs = num(row.cogs);
  }
  if (roles.has('ads')) {
    fields.ad_spend = num(row.adSpend);
    fields.ad_sales = num(row.adSales);
    fields.ad_orders = num(row.adOrders);
    fields.impressions = num(row.impressions);
    fields.clicks = num(row.clicks);
  }
  if (roles.has('returns')) fields.returns = num(row.returns);
  if (roles.has('storage') && row.storageEstimate != null) fields.storage_estimate = num(row.storageEstimate);
  return fields;
}
async function upsertDaily(db, storeId, rows, roles, batchId) {
  const statements = [];
  for (const row of rows || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || ''))) continue;
    const fields = dailyFields(row, roles);
    const entries = Object.entries(fields);
    if (!entries.length) continue;
    const columns = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    statements.push(db.prepare(`INSERT INTO daily_metrics(store_id,date,${columns.join(',')},batch_id)
      VALUES(?,?,${columns.map(() => '?').join(',')},?)
      ON CONFLICT(store_id,date) DO UPDATE SET
      ${columns.map(key => `${key}=excluded.${key}`).join(',')},batch_id=excluded.batch_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(storeId, row.date, ...values, batchId));
  }
  await chunks(db, statements);
}
async function recalcDailyMonth(db, storeId, month) {
  await db.prepare(`UPDATE daily_metrics SET contribution_profit=
    COALESCE(settlement,0)+COALESCE(finance_ad_charge,0)+COALESCE(base_storage_charge,0)-COALESCE(ad_spend,0)-COALESCE(cogs,0)-COALESCE(storage_estimate,0),
    updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND substr(date,1,7)=?`).bind(storeId, month).run();
}

async function replaceParents(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM parent_monthly_metrics WHERE store_id=? AND month=?').bind(storeId, month).run();
  const statements = (rows || []).map(row => db.prepare(`INSERT INTO parent_monthly_metrics(store_id,month,parent_asin,title,sales,units,sessions,cvr,buy_box,batch_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(storeId, month, row.parentAsin || '', row.title || '', num(row.sales), num(row.units), num(row.sessions), num(row.cvr), num(row.buyBox), batchId));
  await chunks(db, statements);
}
async function replaceProducts(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM product_monthly_metrics WHERE store_id=? AND month=?').bind(storeId, month).run();
  const statements = (rows || []).map(row => db.prepare(`INSERT INTO product_monthly_metrics(store_id,month,sku,asin,parent_asin,model,sales,units,sessions,cvr,buy_box,batch_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(storeId, month, row.sku || '', row.asin || '', row.parentAsin || '', row.model || 'UNASSIGNED', num(row.sales), num(row.units), num(row.sessions), num(row.cvr), num(row.buyBox), batchId));
  await chunks(db, statements);
}
async function replaceCampaigns(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM campaign_monthly_metrics WHERE store_id=? AND month=?').bind(storeId, month).run();
  const statements = (rows || []).map(row => db.prepare(`INSERT INTO campaign_monthly_metrics(store_id,month,portfolio,campaign,spend,sales,orders,impressions,clicks,acos,ctr,cvr,batch_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(storeId, month, row.portfolio || '', row.campaign || '未命名', num(row.spend), num(row.sales), num(row.orders), num(row.impressions), num(row.clicks), row.sales ? num(row.spend) / num(row.sales) : 0, row.impressions ? num(row.clicks) / num(row.impressions) : 0, row.clicks ? num(row.orders) / num(row.clicks) : 0, batchId));
  await chunks(db, statements);
}
async function replaceReturnReasons(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM return_reason_monthly WHERE store_id=? AND month=?').bind(storeId, month).run();
  const statements = (rows || []).map(row => db.prepare(`INSERT INTO return_reason_monthly(store_id,month,reason,count,batch_id) VALUES(?,?,?,?,?)`)
    .bind(storeId, month, row.reason || 'UNKNOWN', num(row.count), batchId));
  await chunks(db, statements);
}
async function replaceCharges(db, storeId, month, rows, batchId) {
  await db.prepare('DELETE FROM charge_daily_metrics WHERE store_id=? AND substr(date,1,7)=?').bind(storeId, month).run();
  const statements = (rows || []).map(row => db.prepare(`INSERT INTO charge_daily_metrics(store_id,date,charge_name,category,source_field,gross_debit,credits,net_cost,row_count,batch_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(storeId, row.date, row.name || '未命名费用', row.category || '其他费用', row.source || '', num(row.debit), num(row.credit), row.amount == null ? num(row.debit) - num(row.credit) : num(row.amount), num(row.count), batchId));
  await chunks(db, statements);

  await db.prepare('DELETE FROM charge_name_monthly WHERE store_id=? AND month=?').bind(storeId, month).run();
  const grouped = aggregate(rows, row => `${row.name || '未命名费用'}|${row.category || '其他费用'}|${row.source || ''}`,
    row => ({ name: row.name || '未命名费用', category: row.category || '其他费用', source: row.source || '', debit: 0, credit: 0, amount: 0, count: 0 }),
    (target, row) => { target.debit += num(row.debit); target.credit += num(row.credit); target.amount += row.amount == null ? num(row.debit) - num(row.credit) : num(row.amount); target.count += num(row.count); });
  const monthlyStatements = grouped.map(row => db.prepare(`INSERT INTO charge_name_monthly(store_id,month,charge_name,category,source_field,gross_debit,credits,net_cost,row_count,batch_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(storeId, month, row.name, row.category, row.source, row.debit, row.credit, row.amount, row.count, batchId));
  await chunks(db, monthlyStatements);
}

async function upsertMasters(db, storeId, payload, roles) {
  const statements = [];
  if (roles.has('product')) {
    for (const row of payload.productMaster || []) {
      if (!row.sku) continue;
      statements.push(db.prepare(`INSERT INTO product_master(store_id,sku,model,internal_code,fnsku,asin,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(store_id,sku) DO UPDATE SET model=excluded.model,internal_code=excluded.internal_code,fnsku=excluded.fnsku,asin=excluded.asin,updated_at=CURRENT_TIMESTAMP`)
        .bind(storeId, row.sku, row.model || '', row.internal || '', row.fnsku || '', row.asin || ''));
    }
  }
  if (roles.has('cost')) {
    for (const row of payload.costMaster || []) {
      if (!row.sku) continue;
      statements.push(db.prepare(`INSERT INTO cost_master(store_id,sku,purchase_cost,currency,source_updated_at,updated_at) VALUES(?,?,?,'USD',?,CURRENT_TIMESTAMP)
        ON CONFLICT(store_id,sku) DO UPDATE SET purchase_cost=excluded.purchase_cost,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`)
        .bind(storeId, row.sku, num(row.cost), row.updated || ''));
    }
  }
  await chunks(db, statements);
}

function normalizeStorageMonth(value, fallback) {
  const text = String(value || '');
  const direct = text.match(/^(\d{4})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 7);
}

function relevantChecks(checks, roles) {
  return (checks || []).filter(check => {
    const item = String(check?.item || '');
    if (item === '9类数据源' || item === '本次数据源') return false;
    if (item === '采购成本覆盖') return roles.has('transactions');
    if (item === '广告对账') return roles.has('ads') && roles.has('transactions');
    if (item === '业务/财务销售') return roles.has('parent') && roles.has('transactions');
    return true;
  });
}

export async function commitPartialImport(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return err('JSON 无效');
  const batchId = body.batchId;
  const payload = body.payload;
  if (!batchId || !payload) return err('缺少 batchId/payload');
  const storeId = payload.storeId || body.storeId || 'ytdbns';
  const batch = await one(env.DB, 'SELECT * FROM import_batches WHERE id=? AND store_id=?', batchId, storeId);
  if (!batch) return err('导入批次不存在', 404);
  if (!isMonth(payload.month) || payload.month !== batch.report_month) return err('payload month 与批次不一致');

  const fileRoles = await all(env.DB, 'SELECT DISTINCT report_type FROM report_files WHERE batch_id=? AND store_id=?', batchId, storeId);
  const roles = new Set(fileRoles.map(row => String(row.report_type || '')).filter(Boolean));
  if (!roles.size) return err('本次批次没有可识别的数据源');

  const checks = relevantChecks(payload.checks, roles);
  const status = checks.some(item => item.status === 'FAIL') ? 'FAIL' : checks.some(item => item.status === 'WARN') ? 'WARN' : 'PASS';
  const touchedMonths = new Set();
  const dailyGroups = groupByMonth(payload.daily || []);

  await upsertMasters(env.DB, storeId, payload, roles);

  if (roles.has('parent')) {
    const month = payload.month;
    await updateMonthly(env.DB, storeId, month, {
      business_sales: num(payload.monthly?.businessSales),
      business_units: num(payload.monthly?.businessUnits),
      sessions: num(payload.monthly?.sessions)
    }, status, batchId);
    await replaceParents(env.DB, storeId, month, payload.parents || [], batchId);
    touchedMonths.add(month);
  }

  if (roles.has('child')) {
    const month = payload.month;
    await replaceProducts(env.DB, storeId, month, payload.products || [], batchId);
    touchedMonths.add(month);
  }

  if (roles.has('ads')) {
    const groups = dailyGroups.size ? dailyGroups : new Map([[payload.month, payload.daily || []]]);
    for (const [month, rows] of groups) {
      await updateMonthly(env.DB, storeId, month, {
        ad_spend: sum(rows, 'adSpend'),
        ad_sales: sum(rows, 'adSales'),
        ad_orders: sum(rows, 'adOrders'),
        impressions: sum(rows, 'impressions'),
        clicks: sum(rows, 'clicks')
      }, status, batchId);
      touchedMonths.add(month);
    }
    if (Array.isArray(payload.campaignEvents) && payload.campaignEvents.length) {
      const byMonth = groupByMonth(payload.campaignEvents);
      for (const [month, rows] of byMonth) {
        const campaigns = aggregate(rows, row => `${row.portfolio || ''}|${row.campaign || ''}`,
          row => ({ portfolio: row.portfolio || '', campaign: row.campaign || '未命名', spend: 0, sales: 0, orders: 0, impressions: 0, clicks: 0 }),
          (target, row) => { target.spend += num(row.spend); target.sales += num(row.sales); target.orders += num(row.orders); target.impressions += num(row.impressions); target.clicks += num(row.clicks); });
        await replaceCampaigns(env.DB, storeId, month, campaigns, batchId);
        touchedMonths.add(month);
      }
    } else if (groups.size <= 1) {
      await replaceCampaigns(env.DB, storeId, payload.month, payload.campaigns || [], batchId);
    }
  }

  if (roles.has('returns')) {
    const groups = dailyGroups.size ? dailyGroups : new Map([[payload.month, payload.daily || []]]);
    const eventGroups = Array.isArray(payload.returnEvents) ? groupByMonth(payload.returnEvents) : new Map();
    for (const [month, rows] of groups) {
      const events = eventGroups.get(month) || [];
      const fields = { returns: sum(rows, 'returns') };
      if (events.length) {
        fields.sellable_returns = events.filter(row => /SELLABLE/i.test(String(row.disposition || ''))).reduce((total, row) => total + num(row.count), 0);
        fields.damaged_returns = events.filter(row => !/SELLABLE/i.test(String(row.disposition || ''))).reduce((total, row) => total + num(row.count), 0);
      }
      await updateMonthly(env.DB, storeId, month, fields, status, batchId);
      if (events.length) {
        const reasons = aggregate(events, row => row.reason || 'UNKNOWN', row => ({ reason: row.reason || 'UNKNOWN', count: 0 }), (target, row) => { target.count += num(row.count); });
        await replaceReturnReasons(env.DB, storeId, month, reasons, batchId);
      } else if (groups.size <= 1) {
        await replaceReturnReasons(env.DB, storeId, month, payload.returnReasons || [], batchId);
      }
      touchedMonths.add(month);
    }
  }

  if (roles.has('transactions')) {
    const groups = dailyGroups.size ? dailyGroups : new Map([[payload.month, payload.daily || []]]);
    const eventGroups = Array.isArray(payload.transactionEvents) ? groupByMonth(payload.transactionEvents) : new Map();
    for (const [month, rows] of groups) {
      const fields = {
        finance_gross_sales: sum(rows, 'sales'),
        refund_sales: sum(rows, 'refundSales'),
        orders_qty: sum(rows, 'orders'),
        refund_qty: sum(rows, 'refundQty'),
        settlement: sum(rows, 'settlement'),
        ad_charge: sum(rows, 'financeAdCharge'),
        base_storage_charge: sum(rows, 'baseStorageCharge')
      };
      if (roles.has('cost') || sum(rows, 'cogs') !== 0) fields.cogs = sum(rows, 'cogs');
      const events = eventGroups.get(month) || [];
      if (events.length) {
        fields.transfer_payout = sum(events, 'transferPayout');
        fields.long_term_storage_fee = sum(events, 'longTermStorageFee');
        fields.reimbursements = sum(events, 'reimbursements');
        fields.liquidation_net = sum(events, 'liquidationNet');
        fields.subscription = sum(events, 'subscription');
      } else if (groups.size <= 1) {
        fields.transfer_payout = num(payload.monthly?.transferPayout);
        fields.long_term_storage_fee = num(payload.monthly?.longTermStorageFee);
        fields.reimbursements = num(payload.monthly?.reimbursements);
        fields.liquidation_net = num(payload.monthly?.liquidationNet);
        fields.subscription = num(payload.monthly?.subscription);
      }
      await updateMonthly(env.DB, storeId, month, fields, status, batchId);
      const chargeRows = (payload.chargeDaily || []).filter(row => monthOf(row.date) === month);
      await replaceCharges(env.DB, storeId, month, chargeRows, batchId);
      touchedMonths.add(month);
    }
  }

  if (roles.has('inventory')) {
    const month = payload.month;
    const snapshotDate = payload.inventory?.[0]?.snapshotDate || `${month}-01`;
    await env.DB.prepare('DELETE FROM inventory_snapshots WHERE store_id=? AND snapshot_date=?').bind(storeId, snapshotDate).run();
    const statements = (payload.inventory || []).map(row => env.DB.prepare(`INSERT INTO inventory_snapshots(store_id,snapshot_date,model,sku,fnsku,asin,fulfillable,total,inbound,unsellable,inventory_value,batch_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(storeId, row.snapshotDate || snapshotDate, row.model || 'UNASSIGNED', row.sku || '', row.fnsku || '', row.asin || '', num(row.fulfillable), num(row.total), num(row.inbound), num(row.unsellable), num(row.inventoryValue), batchId));
    await chunks(env.DB, statements);
    await env.DB.prepare(`UPDATE inventory_snapshots SET inventory_value=total*COALESCE((SELECT purchase_cost+first_mile_cost+fbm_shipping_cost FROM cost_master c WHERE c.store_id=inventory_snapshots.store_id AND c.sku=inventory_snapshots.sku),inventory_value,0)
      WHERE store_id=? AND snapshot_date=?`).bind(storeId, snapshotDate).run();
    const aggregateRow = await one(env.DB, `SELECT SUM(total) inventory_units,SUM(fulfillable) fulfillable_units,SUM(inbound) inbound_units,SUM(inventory_value) inventory_value
      FROM inventory_snapshots WHERE store_id=? AND snapshot_date=?`, storeId, snapshotDate) || {};
    await updateMonthly(env.DB, storeId, month, {
      inventory_units: num(aggregateRow.inventory_units),
      fulfillable_units: num(aggregateRow.fulfillable_units),
      inbound_units: num(aggregateRow.inbound_units),
      inventory_value: num(aggregateRow.inventory_value)
    }, status, batchId);
    touchedMonths.add(month);
  }

  if (roles.has('storage')) {
    const grouped = new Map();
    for (const row of payload.storage || []) {
      const month = normalizeStorageMonth(row.month, payload.month);
      const list = grouped.get(month) || [];
      list.push(row);
      grouped.set(month, list);
    }
    if (!grouped.size) grouped.set(payload.month, []);
    for (const [month, rows] of grouped) {
      await env.DB.prepare('DELETE FROM storage_monthly_metrics WHERE store_id=? AND month=?').bind(storeId, month).run();
      const statements = rows.map(row => env.DB.prepare(`INSERT INTO storage_monthly_metrics(store_id,month,model,sku,fnsku,asin,fee,avg_qty,batch_id)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(storeId, month, row.model || 'UNASSIGNED', row.sku || '', row.fnsku || '', row.asin || '', num(row.fee), num(row.avgQty), batchId));
      await chunks(env.DB, statements);
      const total = rows.reduce((value, row) => value + num(row.fee), 0);
      await updateMonthly(env.DB, storeId, month, { storage_estimate: total }, status, batchId);
      const [year, monthNumber] = month.split('-').map(Number);
      const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      const dailyValue = days ? total / days : 0;
      const dayStatements = [];
      for (let day = 1; day <= days; day += 1) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        dayStatements.push(env.DB.prepare(`INSERT INTO daily_metrics(store_id,date,storage_estimate,batch_id) VALUES(?,?,?,?)
          ON CONFLICT(store_id,date) DO UPDATE SET storage_estimate=excluded.storage_estimate,batch_id=excluded.batch_id,updated_at=CURRENT_TIMESTAMP`)
          .bind(storeId, date, dailyValue, batchId));
      }
      await chunks(env.DB, dayStatements);
      touchedMonths.add(month);
    }
  }

  await upsertDaily(env.DB, storeId, payload.daily || [], roles, batchId);

  if (roles.has('cost')) {
    await env.DB.prepare(`UPDATE inventory_snapshots SET inventory_value=total*COALESCE((SELECT purchase_cost+first_mile_cost+fbm_shipping_cost FROM cost_master c WHERE c.store_id=inventory_snapshots.store_id AND c.sku=inventory_snapshots.sku),inventory_value,0)
      WHERE store_id=?`).bind(storeId).run();
    const inventoryMonths = await all(env.DB, `SELECT DISTINCT substr(snapshot_date,1,7) month FROM inventory_snapshots WHERE store_id=?`, storeId);
    for (const row of inventoryMonths) {
      const month = row.month;
      if (!isMonth(month)) continue;
      const snapshot = await one(env.DB, 'SELECT MAX(snapshot_date) d FROM inventory_snapshots WHERE store_id=? AND substr(snapshot_date,1,7)=?', storeId, month);
      if (!snapshot?.d) continue;
      const totals = await one(env.DB, 'SELECT SUM(inventory_value) inventory_value FROM inventory_snapshots WHERE store_id=? AND snapshot_date=?', storeId, snapshot.d) || {};
      await ensureMonthly(env.DB, storeId, month);
      await env.DB.prepare('UPDATE monthly_metrics SET inventory_value=?,updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND month=?').bind(num(totals.inventory_value), storeId, month).run();
    }
  }

  for (const month of touchedMonths) {
    await recalcDailyMonth(env.DB, storeId, month);
    await recalcMonthly(env.DB, storeId, month);
  }

  await env.DB.prepare('DELETE FROM data_quality_checks WHERE batch_id=?').bind(batchId).run();
  const checkStatements = checks.map(check => env.DB.prepare(`INSERT INTO data_quality_checks(batch_id,store_id,report_month,item,status,value,detail)
    VALUES(?,?,?,?,?,?,?)`).bind(batchId, storeId, payload.month, check.item || '', check.status || 'WARN', check.value || '', check.detail || ''));
  await chunks(env.DB, checkStatements);

  const dates = (payload.daily || []).map(row => row?.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(String(date))).sort();
  const warningCount = checks.filter(check => check.status !== 'PASS').length;
  const rangeStart = dates[0] || batch.range_start;
  const rangeEnd = dates[dates.length - 1] || batch.range_end;
  await env.DB.prepare(`UPDATE import_batches SET status='COMMITTED',model_status=?,warning_count=?,range_start=?,range_end=?,committed_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(status, warningCount, rangeStart, rangeEnd, batchId).run();

  return ok({
    batchId,
    month: payload.month,
    status,
    warningCount,
    partial: roles.size < 9,
    sourceCount: roles.size,
    sources: [...roles],
    affectedMonths: [...touchedMonths].sort()
  });
}
