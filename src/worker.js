const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const err=(message,status=400,extra={})=>json({ok:false,error:message,...extra},status);
const ok=data=>json({ok:true,...data});
const safeId=s=>String(s||'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,180);
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const isMonth=s=>/^\d{4}-\d{2}$/.test(String(s||''));

async function chunks(db,statements,size=80){for(let i=0;i<statements.length;i+=size)await db.batch(statements.slice(i,i+size));}
async function one(db,sql,...args){return await db.prepare(sql).bind(...args).first();}
async function all(db,sql,...args){return (await db.prepare(sql).bind(...args).all()).results||[];}

async function apiMeta(env,storeId){
  const store=await one(env.DB,'SELECT * FROM stores WHERE id=?',storeId);
  const latest=await one(env.DB,'SELECT * FROM monthly_metrics WHERE store_id=? ORDER BY month DESC LIMIT 1',storeId);
  const batch=await one(env.DB,'SELECT * FROM import_batches WHERE store_id=? ORDER BY created_at DESC LIMIT 1',storeId);
  return ok({store,latest,batch});
}

async function apiPeriods(env,storeId){
  const rows=await all(env.DB,`SELECT m.month,m.business_sales,m.finance_gross_sales,m.ad_spend,m.ad_sales,m.contribution_profit,m.profit_margin,m.model_status,m.updated_at,
    (SELECT status FROM import_batches b WHERE b.id=m.batch_id) batch_status
    FROM monthly_metrics m WHERE m.store_id=? ORDER BY m.month DESC`,storeId);
  return ok({periods:rows});
}

function fullMonthRange(from,to){
  if(!isDate(from)||!isDate(to)||from.slice(8)!=='01')return false;
  const [y,m]=to.slice(0,7).split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  return to===last;
}

async function apiDashboard(env,storeId,from,to){
  if(!isDate(from)||!isDate(to)||from>to)return err('日期区间无效');
  const days=(new Date(to+'T00:00:00Z')-new Date(from+'T00:00:00Z'))/86400000+1;
  const grain=days>120?'month':'day';
  const s=await one(env.DB,`SELECT
    SUM(sales) sales,SUM(units) units,SUM(sessions) sessions,SUM(page_views) page_views,AVG(buy_box) buy_box,AVG(traffic_cvr) traffic_cvr,SUM(orders) orders,SUM(refund_sales) refund_sales,SUM(refund_qty) refund_qty,
    SUM(ad_spend) ad_spend,SUM(ad_sales) ad_sales,SUM(ad_orders) ad_orders,SUM(impressions) impressions,SUM(clicks) clicks,
    SUM(cogs) cogs,SUM(settlement) settlement,SUM(storage_estimate) storage_estimate,SUM(contribution_profit) contribution_profit,SUM(returns) returns
    FROM daily_metrics WHERE store_id=? AND date BETWEEN ? AND ?`,storeId,from,to) || {};
  let series;
  if(grain==='month'){
    series=await all(env.DB,`SELECT substr(date,1,7) label,SUM(sales) sales,SUM(ad_spend) ad_spend,SUM(ad_sales) ad_sales,SUM(contribution_profit) contribution_profit,SUM(units) units
      FROM daily_metrics WHERE store_id=? AND date BETWEEN ? AND ? GROUP BY substr(date,1,7) ORDER BY label`,storeId,from,to);
  }else{
    series=await all(env.DB,`SELECT date label,sales,ad_spend,ad_sales,contribution_profit,units,orders,refund_sales,impressions,clicks
      FROM daily_metrics WHERE store_id=? AND date BETWEEN ? AND ? ORDER BY date`,storeId,from,to);
  }
  const monthly=await all(env.DB,`SELECT * FROM monthly_metrics WHERE store_id=? AND month BETWEEN ? AND ? ORDER BY month`,storeId,from.slice(0,7),to.slice(0,7));
  let sessions=s.sessions==null?null:Number(s.sessions),businessSales=null,businessUnits=null;
  if(fullMonthRange(from,to)){
    if(sessions==null) sessions=monthly.reduce((a,r)=>a+(r.sessions||0),0);businessSales=monthly.reduce((a,r)=>a+(r.business_sales||0),0);businessUnits=monthly.reduce((a,r)=>a+(r.business_units||0),0);
  }
  const adSpend=Number(s.ad_spend||0),adSales=Number(s.ad_sales||0),sales=Number(s.sales||0),profit=Number(s.contribution_profit||0);
  const summary={...s,sales,adSpend,adSales,acos:adSales?adSpend/adSales:0,tacos:sales?adSpend/sales:0,profitMargin:sales?profit/sales:0,sessions,businessSales,businessUnits,rangeDays:days,grain,trafficGrain:sessions!=null?(s.sessions==null?'month':'day'):'unavailable'};
  return ok({summary,series,monthly,from,to});
}

async function apiMonth(env,storeId,month){
  if(!isMonth(month))return err('月份格式应为 YYYY-MM');
  const metrics=await one(env.DB,'SELECT * FROM monthly_metrics WHERE store_id=? AND month=?',storeId,month);
  if(!metrics)return err('该月份尚未导入',404);
  const [products,parents,campaigns,returns,quality,charges]=await Promise.all([
    all(env.DB,'SELECT * FROM product_monthly_metrics WHERE store_id=? AND month=? ORDER BY sales DESC LIMIT 1000',storeId,month),
    all(env.DB,'SELECT * FROM parent_monthly_metrics WHERE store_id=? AND month=? ORDER BY sales DESC',storeId,month),
    all(env.DB,'SELECT * FROM campaign_monthly_metrics WHERE store_id=? AND month=? ORDER BY spend DESC LIMIT 500',storeId,month),
    all(env.DB,'SELECT * FROM return_reason_monthly WHERE store_id=? AND month=? ORDER BY count DESC',storeId,month),
    all(env.DB,`SELECT q.* FROM data_quality_checks q JOIN import_batches b ON b.id=q.batch_id WHERE q.store_id=? AND q.report_month=? ORDER BY q.id`,storeId,month),
    all(env.DB,'SELECT charge_name name,category,source_field source,gross_debit debit,credits credit,net_cost amount,row_count count,CASE WHEN SUM(net_cost) OVER()>0 THEN net_cost/SUM(net_cost) OVER() ELSE 0 END share FROM charge_name_monthly WHERE store_id=? AND month=? ORDER BY net_cost DESC',storeId,month)
  ]);
  const invDate=(await one(env.DB,'SELECT MAX(snapshot_date) d FROM inventory_snapshots WHERE store_id=? AND substr(snapshot_date,1,7)<=?',storeId,month))?.d;
  const inventory=invDate?await all(env.DB,'SELECT * FROM inventory_snapshots WHERE store_id=? AND snapshot_date=? ORDER BY inventory_value DESC LIMIT 1000',storeId,invDate):[];
  return ok({metrics,products,parents,campaigns,returns,quality,charges,inventory,inventorySnapshotDate:invDate});
}

async function apiCharges(env,storeId,from,to){
  if(!isDate(from)||!isDate(to)||from>to)return err('日期区间无效');
  const rows=await all(env.DB,`SELECT charge_name name,category,source_field source,SUM(gross_debit) debit,SUM(credits) credit,SUM(net_cost) amount,SUM(row_count) count FROM charge_daily_metrics WHERE store_id=? AND date BETWEEN ? AND ? GROUP BY charge_name,category,source_field ORDER BY amount DESC`,storeId,from,to);
  const total=rows.reduce((a,r)=>a+Number(r.amount||0),0);for(const r of rows)r.share=total?Number(r.amount||0)/total:0;
  const categories=await all(env.DB,`SELECT category,SUM(net_cost) amount,SUM(row_count) count FROM charge_daily_metrics WHERE store_id=? AND date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC`,storeId,from,to);
  return ok({from,to,total,rows,categories});
}

async function apiImports(env,storeId){
  const batches=await all(env.DB,`SELECT b.*,(SELECT COUNT(*) FROM report_files f WHERE f.batch_id=b.id) stored_files FROM import_batches b WHERE store_id=? ORDER BY created_at DESC LIMIT 60`,storeId);
  return ok({batches});
}

async function startImport(request,env){
  const body=await request.json().catch(()=>null);if(!body)return err('JSON 无效');
  const storeId=body.storeId||'yt-us',month=body.month;if(!isMonth(month))return err('report month 无效');
  const id=crypto.randomUUID(),rangeStart=body.rangeStart||month+'-01';const [y,m]=month.split('-').map(Number);const rangeEnd=body.rangeEnd||new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  await env.DB.prepare(`INSERT INTO import_batches(id,store_id,report_month,range_start,range_end,status,created_by) VALUES(?,?,?,?,?,'UPLOADING',?)`).bind(id,storeId,month,rangeStart,rangeEnd,body.createdBy||'web').run();
  return ok({batchId:id,month,rangeStart,rangeEnd});
}

async function uploadFile(request,env){
  const form=await request.formData();const file=form.get('file');if(!(file instanceof File))return err('缺少 file');
  const batchId=String(form.get('batchId')||''),storeId=String(form.get('storeId')||'yt-us'),month=String(form.get('month')||''),type=String(form.get('reportType')||'unknown');
  if(!batchId||!isMonth(month))return err('batchId/month 无效');
  const batch=await one(env.DB,'SELECT id,status FROM import_batches WHERE id=? AND store_id=?',batchId,storeId);if(!batch)return err('导入批次不存在',404);
  const fileId=crypto.randomUUID(),key=`${safeId(storeId)}/${month}/${safeId(batchId)}/${safeId(type)}/${safeId(file.name)}`;
  const buf=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',buf);const checksum=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  await env.RAW_REPORTS.put(key,buf,{httpMetadata:{contentType:file.type||'application/octet-stream'},customMetadata:{storeId,month,batchId,type,filename:file.name,checksum}});
  await env.DB.prepare(`INSERT INTO report_files(id,batch_id,store_id,report_month,report_type,filename,r2_key,size_bytes,row_count,checksum,status) VALUES(?,?,?,?,?,?,?,?,?,?,'STORED')`).bind(fileId,batchId,storeId,month,type,file.name,key,file.size,Number(form.get('rowCount')||0),checksum).run();
  await env.DB.prepare(`UPDATE import_batches SET file_count=(SELECT COUNT(*) FROM report_files WHERE batch_id=?),source_count=(SELECT COUNT(DISTINCT report_type) FROM report_files WHERE batch_id=?) WHERE id=?`).bind(batchId,batchId,batchId).run();
  return ok({fileId,key,checksum,size:file.size});
}

function mmValues(m){return [m.businessSales,m.businessUnits,m.sessions,m.financeGrossSales,m.refundSales,m.ordersQty,m.refundQty,m.adSpend,m.adSales,m.adOrders,m.impressions,m.clicks,m.acos,m.tacos,m.cogs,m.settlement,m.transferPayout,m.adCharge,m.storageEstimate,m.baseStorageCharge,m.longTermStorageFee,m.reimbursements,m.liquidationNet,m.subscription,m.contributionProfit,m.profitMargin,m.returns,m.sellableReturns,m.damagedReturns,m.inventoryUnits,m.fulfillableUnits,m.inboundUnits,m.inventoryValue];}

async function commitImport(request,env){
  const body=await request.json().catch(()=>null);if(!body)return err('JSON 无效');
  const batchId=body.batchId,p=body.payload;if(!batchId||!p)return err('缺少 batchId/payload');const storeId=p.storeId||'yt-us',month=p.month;
  const batch=await one(env.DB,'SELECT * FROM import_batches WHERE id=? AND store_id=?',batchId,storeId);if(!batch)return err('导入批次不存在',404);
  if(!isMonth(month)||month!==batch.report_month)return err('payload month 与批次不一致');
  const status=(p.checks||[]).some(x=>x.status==='FAIL')?'FAIL':(p.checks||[]).some(x=>x.status==='WARN')?'WARN':'PASS';
  const m=p.monthly||{};const vals=mmValues(m);
  await env.DB.prepare(`INSERT INTO monthly_metrics(store_id,month,business_sales,business_units,sessions,finance_gross_sales,refund_sales,orders_qty,refund_qty,ad_spend,ad_sales,ad_orders,impressions,clicks,acos,tacos,cogs,settlement,transfer_payout,ad_charge,storage_estimate,base_storage_charge,long_term_storage_fee,reimbursements,liquidation_net,subscription,contribution_profit,profit_margin,returns,sellable_returns,damaged_returns,inventory_units,fulfillable_units,inbound_units,inventory_value,model_status,batch_id,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(store_id,month) DO UPDATE SET business_sales=excluded.business_sales,business_units=excluded.business_units,sessions=excluded.sessions,finance_gross_sales=excluded.finance_gross_sales,refund_sales=excluded.refund_sales,orders_qty=excluded.orders_qty,refund_qty=excluded.refund_qty,ad_spend=excluded.ad_spend,ad_sales=excluded.ad_sales,ad_orders=excluded.ad_orders,impressions=excluded.impressions,clicks=excluded.clicks,acos=excluded.acos,tacos=excluded.tacos,cogs=excluded.cogs,settlement=excluded.settlement,transfer_payout=excluded.transfer_payout,ad_charge=excluded.ad_charge,storage_estimate=excluded.storage_estimate,base_storage_charge=excluded.base_storage_charge,long_term_storage_fee=excluded.long_term_storage_fee,reimbursements=excluded.reimbursements,liquidation_net=excluded.liquidation_net,subscription=excluded.subscription,contribution_profit=excluded.contribution_profit,profit_margin=excluded.profit_margin,returns=excluded.returns,sellable_returns=excluded.sellable_returns,damaged_returns=excluded.damaged_returns,inventory_units=excluded.inventory_units,fulfillable_units=excluded.fulfillable_units,inbound_units=excluded.inbound_units,inventory_value=excluded.inventory_value,model_status=excluded.model_status,batch_id=excluded.batch_id,updated_at=CURRENT_TIMESTAMP`).bind(storeId,month,...vals,status,batchId).run();

  const stm=[];
  for(const r of p.daily||[])stm.push(env.DB.prepare(`INSERT INTO daily_metrics(store_id,date,sales,units,sessions,page_views,buy_box,traffic_cvr,orders,refund_sales,refund_qty,ad_spend,ad_sales,ad_orders,impressions,clicks,cogs,settlement,finance_ad_charge,base_storage_charge,storage_estimate,contribution_profit,returns,batch_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id,date) DO UPDATE SET sales=excluded.sales,units=excluded.units,sessions=COALESCE(excluded.sessions,daily_metrics.sessions),page_views=COALESCE(excluded.page_views,daily_metrics.page_views),buy_box=COALESCE(excluded.buy_box,daily_metrics.buy_box),traffic_cvr=COALESCE(excluded.traffic_cvr,daily_metrics.traffic_cvr),orders=excluded.orders,refund_sales=excluded.refund_sales,refund_qty=excluded.refund_qty,ad_spend=excluded.ad_spend,ad_sales=excluded.ad_sales,ad_orders=excluded.ad_orders,impressions=excluded.impressions,clicks=excluded.clicks,cogs=excluded.cogs,settlement=excluded.settlement,finance_ad_charge=excluded.finance_ad_charge,base_storage_charge=excluded.base_storage_charge,storage_estimate=excluded.storage_estimate,contribution_profit=excluded.contribution_profit,returns=excluded.returns,batch_id=excluded.batch_id,updated_at=CURRENT_TIMESTAMP`).bind(storeId,r.date,r.sales||0,r.units||0,r.sessions??null,r.pageViews??null,r.buyBox??null,r.cvr??null,r.orders||0,r.refundSales||0,r.refundQty||0,r.adSpend||0,r.adSales||0,r.adOrders||0,r.impressions||0,r.clicks||0,r.cogs||0,r.settlement||0,r.financeAdCharge||0,r.baseStorageCharge||0,r.storageEstimate||0,r.contributionProfit||0,r.returns||0,batchId));
  await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM product_monthly_metrics WHERE store_id=? AND month=?').bind(storeId,month).run();
  for(const r of p.products||[])stm.push(env.DB.prepare(`INSERT INTO product_monthly_metrics(store_id,month,sku,asin,parent_asin,model,sales,units,sessions,cvr,buy_box,batch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(storeId,month,r.sku||'',r.asin||'',r.parentAsin||'',r.model||'UNASSIGNED',r.sales||0,r.units||0,r.sessions||0,r.cvr||0,r.buyBox||0,batchId));
  await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM parent_monthly_metrics WHERE store_id=? AND month=?').bind(storeId,month).run();
  for(const r of p.parents||[])stm.push(env.DB.prepare(`INSERT INTO parent_monthly_metrics(store_id,month,parent_asin,title,sales,units,sessions,cvr,buy_box,batch_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(storeId,month,r.parentAsin||'',r.title||'',r.sales||0,r.units||0,r.sessions||0,r.cvr||0,r.buyBox||0,batchId));
  await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM campaign_monthly_metrics WHERE store_id=? AND month=?').bind(storeId,month).run();
  for(const r of p.campaigns||[])stm.push(env.DB.prepare(`INSERT INTO campaign_monthly_metrics(store_id,month,portfolio,campaign,spend,sales,orders,impressions,clicks,acos,ctr,cvr,batch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(storeId,month,r.portfolio||'',r.campaign||'',r.spend||0,r.sales||0,r.orders||0,r.impressions||0,r.clicks||0,r.acos||0,r.ctr||0,r.cvr||0,batchId));
  await chunks(env.DB,stm);stm.length=0;
  if((p.inventory||[]).length){const snap=p.inventory[0].snapshotDate;await env.DB.prepare('DELETE FROM inventory_snapshots WHERE store_id=? AND snapshot_date=?').bind(storeId,snap).run();for(const r of p.inventory)stm.push(env.DB.prepare(`INSERT INTO inventory_snapshots(store_id,snapshot_date,model,sku,fnsku,asin,fulfillable,total,inbound,unsellable,inventory_value,batch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(storeId,r.snapshotDate,r.model||'UNASSIGNED',r.sku||'',r.fnsku||'',r.asin||'',r.fulfillable||0,r.total||0,r.inbound||0,r.unsellable||0,r.inventoryValue||0,batchId));await chunks(env.DB,stm);stm.length=0;}
  await env.DB.prepare('DELETE FROM storage_monthly_metrics WHERE store_id=? AND month=?').bind(storeId,month).run();
  for(const r of p.storage||[])stm.push(env.DB.prepare(`INSERT INTO storage_monthly_metrics(store_id,month,model,sku,fnsku,asin,fee,avg_qty,batch_id) VALUES(?,?,?,?,?,?,?,?,?)`).bind(storeId,month,r.model||'UNASSIGNED',r.sku||'',r.fnsku||'',r.asin||'',r.fee||0,r.avgQty||0,batchId));
  await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM return_reason_monthly WHERE store_id=? AND month=?').bind(storeId,month).run();for(const r of p.returnReasons||[])stm.push(env.DB.prepare(`INSERT INTO return_reason_monthly(store_id,month,reason,count,batch_id) VALUES(?,?,?,?,?)`).bind(storeId,month,r.reason||'UNKNOWN',r.count||0,batchId));await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM charge_name_monthly WHERE store_id=? AND month=?').bind(storeId,month).run();
  for(const r of p.chargeNames||[])stm.push(env.DB.prepare(`INSERT INTO charge_name_monthly(store_id,month,charge_name,category,source_field,gross_debit,credits,net_cost,row_count,batch_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(storeId,month,r.name||'未命名费用',r.category||'其他费用',r.source||'',r.debit||0,r.credit||0,r.amount??((r.debit||0)-(r.credit||0)),r.count||0,batchId));await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM charge_daily_metrics WHERE store_id=? AND date BETWEEN ? AND ?').bind(storeId,month+'-01',batch.range_end).run();
  for(const r of p.chargeDaily||[])stm.push(env.DB.prepare(`INSERT INTO charge_daily_metrics(store_id,date,charge_name,category,source_field,gross_debit,credits,net_cost,row_count,batch_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(storeId,r.date,r.name||'未命名费用',r.category||'其他费用',r.source||'',r.debit||0,r.credit||0,r.amount??((r.debit||0)-(r.credit||0)),r.count||0,batchId));await chunks(env.DB,stm);stm.length=0;
  for(const r of p.productMaster||[])if(r.sku)stm.push(env.DB.prepare(`INSERT INTO product_master(store_id,sku,model,internal_code,fnsku,asin,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id,sku) DO UPDATE SET model=excluded.model,internal_code=excluded.internal_code,fnsku=excluded.fnsku,asin=excluded.asin,updated_at=CURRENT_TIMESTAMP`).bind(storeId,r.sku,r.model||'',r.internal||'',r.fnsku||'',r.asin||''));await chunks(env.DB,stm);stm.length=0;
  for(const r of p.costMaster||[])if(r.sku)stm.push(env.DB.prepare(`INSERT INTO cost_master(store_id,sku,purchase_cost,currency,source_updated_at,updated_at) VALUES(?,?,?,'USD',?,CURRENT_TIMESTAMP) ON CONFLICT(store_id,sku) DO UPDATE SET purchase_cost=excluded.purchase_cost,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`).bind(storeId,r.sku,r.cost||0,r.updated||''));await chunks(env.DB,stm);stm.length=0;
  await env.DB.prepare('DELETE FROM data_quality_checks WHERE batch_id=?').bind(batchId).run();for(const r of p.checks||[])stm.push(env.DB.prepare(`INSERT INTO data_quality_checks(batch_id,store_id,report_month,item,status,value,detail) VALUES(?,?,?,?,?,?,?)`).bind(batchId,storeId,month,r.item||'',r.status||'WARN',r.value||'',r.detail||''));await chunks(env.DB,stm);
  const warns=(p.checks||[]).filter(x=>x.status!=='PASS').length;await env.DB.prepare(`UPDATE import_batches SET status='COMMITTED',model_status=?,warning_count=?,committed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,warns,batchId).run();
  return ok({batchId,month,status,warningCount:warns});
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    try{
      const storeId=url.searchParams.get('store')||'yt-us';
      if(request.method==='GET'&&url.pathname==='/api/health')return ok({service:'YTDBNS Monthly Intelligence',version:'4.5.0'});
      if(request.method==='GET'&&url.pathname==='/api/meta')return apiMeta(env,storeId);
      if(request.method==='GET'&&url.pathname==='/api/periods')return apiPeriods(env,storeId);
      if(request.method==='GET'&&url.pathname==='/api/dashboard')return apiDashboard(env,storeId,url.searchParams.get('from'),url.searchParams.get('to'));
      if(request.method==='GET'&&url.pathname==='/api/month')return apiMonth(env,storeId,url.searchParams.get('month'));
      if(request.method==='GET'&&url.pathname==='/api/charges')return apiCharges(env,storeId,url.searchParams.get('from'),url.searchParams.get('to'));
      if(request.method==='GET'&&url.pathname==='/api/imports')return apiImports(env,storeId);
      if(request.method==='POST'&&url.pathname==='/api/imports/start')return startImport(request,env);
      if(request.method==='POST'&&url.pathname==='/api/imports/file')return uploadFile(request,env);
      if(request.method==='POST'&&url.pathname==='/api/imports/commit')return commitImport(request,env);
      return err('API route not found',404);
    }catch(e){console.error(e);return err(e?.message||'Internal error',500);}
  }
};
