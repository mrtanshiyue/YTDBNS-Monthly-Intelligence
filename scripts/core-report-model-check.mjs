import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const money=v=>{if(v==null||v==='')return 0;const n=parseFloat(String(v).replace(/[$,]/g,''));return Number.isFinite(n)?n:0};
const num=v=>{const n=parseFloat(String(v??'').replace(/[,%]/g,''));return Number.isFinite(n)?n:0};
const parseDate=v=>{const s=String(v||'');let m=s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:null};
const baseNormalizer={
  ROLE_LABELS:{cost:'采购成本库',transactions:'联合报告',ads:'广告每日视图'},money,num,parseDate,
  normalizeBundle(){return {month:'2025-07',daily:[{date:'2025-06-02',settlement:70,financeAdCharge:10,adSpend:12,cogs:13,baseStorageCharge:0,storageEstimate:0},{date:'2025-07-03',settlement:48,financeAdCharge:0,adSpend:0,cogs:6.5,baseStorageCharge:0,storageEstimate:0}],monthly:{financeGrossSales:160,ordersQty:3,businessSales:0,businessUnits:0,settlement:118,adCharge:10,adSpend:12,cogs:19.5,baseStorageCharge:0,storageEstimate:0},checks:[{item:'9类数据源',status:'WARN'}]};}
};
const context={window:{YT_NORMALIZER:baseNormalizer},setTimeout};vm.createContext(context);vm.runInContext(read('public/core-report-model.js'),context);
const n=context.window.YT_NORMALIZER;assert.deepEqual([...n.CORE_ROLES],['transactions','ads','cost']);
const sheet=rows=>({sheets:{Sheet1:rows}});
const roleMap={
 cost:{file:{name:'采购成本库.xlsx'},parsed:sheet([['SKU','采购成本','头程费用','FBM运费成本','货币','更新日期'],['SKU-A',5,1,.5,'USD','2026年7月14日']])},
 transactions:{file:{name:'联合报告.csv'},parsed:sheet([['settlement id','date/time','type','description','sku','quantity','product sales','total'],['S1','2025-06-02','Order','Order','SKU-A',2,100,80],['S2','2025-07-03','Order','Order','SKU-A',1,60,48]])},
 ads:{file:{name:'广告.csv'},parsed:sheet([['广告组合名称','广告活动编号','广告活动名称','广告组编号','广告组名称','搜索词','日期','投放方案编号','目标竞价','投放类型','投放状态','投放方案','投放匹配类型-Targeting match type','展示量','点击量','总成本','购买量','销售额','已售商品数量'],['P1','C1','C','G1','G','reading glasses','2025年6月2日','T1',.75,'关键词','已启用','reading glasses','EXACT',1000,25,12,3,75,4]])}
};
const result=n.normalizeBundle(roleMap,'2025-07');
assert.equal(result.sourceModel,'core-v2');assert.deepEqual([...result.coreSources],['transactions','ads','cost']);
assert.equal(result.costMaster[0].purchaseCost,5);assert.equal(result.costMaster[0].firstMileCost,1);assert.equal(result.costMaster[0].fbmShippingCost,.5);assert.equal(result.costMaster[0].cost,6.5);
assert.equal(result.transactionSkuEvents.length,2);assert.equal(result.adSearchEvents.length,1);assert.equal(result.adSearchEvents[0].searchTerm,'reading glasses');assert.equal(result.adSearchEvents[0].spend,12);
assert.equal(result.monthly.businessSales,160);assert.equal(result.monthly.businessUnits,3);assert.equal(result.monthly.tacos,12/160);assert.equal(result.monthly.contributionProfit,96.5);
assert.ok(!result.checks.some(x=>x.item==='9类数据源'));
const server=read('src/core-report-model.js');assert.match(server,/transaction_daily_sku/);assert.match(server,/ad_search_term_monthly/);assert.match(server,/business_sales=CASE/);assert.match(server,/storage_estimate,0\)>0/);assert.match(server,/partial: false/);
const migration=read('migrations/0006_core_report_model.sql');assert.match(migration,/CREATE TABLE IF NOT EXISTS transaction_daily_sku/);assert.match(migration,/CREATE TABLE IF NOT EXISTS ad_search_term_monthly/);
const entry=read('src/worker-entry.js');assert.match(entry,/enhanceCoreCommit/);assert.match(entry,/api\/ad-search-terms/);assert.match(entry,/result\.affectedMonths \|\| result\.touchedMonths/);
const v44=read('public/v44.js');assert.match(v44,/core-report-model\.js/);assert.ok(v44.indexOf('loadCoreReportModel();')<v44.indexOf('loadMultiFileImport();'));
console.log('Core report model v2 regression: PASS');
