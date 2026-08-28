import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/core-five-report-model.js', 'utf8');
const backend = fs.readFileSync('src/core-five-import.js', 'utf8');
const workerEntry = fs.readFileSync('src/worker-entry.js', 'utf8');
const migration = fs.readFileSync('migrations/0006_core_five_model.sql', 'utf8');

const money = value => Number(String(value ?? 0).replace(/[$,]/g, '')) || 0;
const num = value => Number(String(value ?? 0).replace(/[,％%]/g, '')) || 0;
const parseDate = value => {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const zh = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (zh) return `${zh[1]}-${zh[2].padStart(2, '0')}-${zh[3].padStart(2, '0')}`;
  return null;
};

const context = {
  console, Intl, Date,
  window: {
    YT_NORMALIZER: {
      ROLE_LABELS: {}, money, num, parseDate,
      normalizeBundle: (_roleMap, month) => ({
        month,
        productMaster: [], costMaster: [], daily: [],
        monthly: { financeGrossSales: 100, ordersQty: 5 },
        checks: [
          { item: '9类数据源', status: 'WARN', value: '2/9' },
          { item: '业务/财务销售', status: 'WARN', value: '$1' }
        ]
      })
    }
  }
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'core-five-report-model.js' });

const rows = values => ({ parsed: { sheets: { Sheet1: values } }, file: { name: 'fixture.csv' } });
const roleMap = {
  cost: rows([
    ['SKU','采购成本','头程费用','FBM运费成本','货币','更新日期'],
    ['YS001-100','4.20','0.80','1.10','USD','2026年7月14日']
  ]),
  transactions: rows([
    ['settlement id','date/time','type','description','sku','quantity','product sales','total'],
    ['S1','2026-07-02','Order','item','YS001-100','2','35.98','28.00']
  ]),
  ads: rows([
    ['广告活动名称','广告组合名称','日期','总成本','销售额','购买量','展示量','点击量'],
    ['Campaign A','Portfolio A','2026年7月2日','10.25','40.00','2','1000','20']
  ]),
  returns: rows([
    ['return-date','order-id','sku','asin','fnsku','product-name','quantity','fulfillment-center-id','detailed-disposition','reason','status','license-plate-number','customer-comments'],
    ['2026-07-31T22:34:59+00:00','O1','YS001-100','A1','F1','Reader','1','CHA1','SELLABLE','UNWANTED_ITEM','Unit returned to inventory','',''],
    ['2026-08-01T06:49:51+00:00','O2','YS001-100','A1','F1','Reader','1','IND8','CUSTOMER_DAMAGED','DEFECTIVE','IMMEDIATE_LIQUIDATION','','']
  ]),
  inventory: rows([
    ['sku','fnsku','asin','product-name','condition','your-price','mfn-listing-exists','mfn-fulfillable-quantity','afn-listing-exists','afn-warehouse-quantity','afn-fulfillable-quantity','afn-unsellable-quantity','afn-reserved-quantity','afn-total-quantity','per-unit-volume','afn-inbound-working-quantity','afn-inbound-shipped-quantity','afn-inbound-receiving-quantity','afn-researching-quantity','afn-reserved-future-supply','afn-future-supply-buyable','afn-fc-transfer-quantity','afn-onhand-buyable-quantity','store'],
    ['YS001-100','F1','A1','Reader','New','17.99','No','','Yes','25','20','1','2','30','0.01','0','5','0','1','0','3','2','27','']
  ])
};

const payload = context.window.YT_NORMALIZER.normalizeBundle(roleMap, '2026-07');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(context.window.YT_CORE_FIVE_REPORT_MODEL?.version === 1, 'core-five runtime not installed');
assert(payload.costMaster[0].purchaseCost === 4.2, 'purchase cost mapping failed');
assert(payload.costMaster[0].firstMileCost === 0.8, 'first mile mapping failed');
assert(payload.costMaster[0].fbmShippingCost === 1.1, 'FBM shipping mapping failed');
assert(payload.transactionEvents.length === 1 && payload.transactionEvents[0].sku === 'YS001-100', 'transaction event mapping failed');
assert(payload.campaignEvents.length === 1 && payload.campaignEvents[0].spend === 10.25, 'ads mapping failed');
assert(payload.returnEvents.length === 2 && payload.returnEvents[1].date === '2026-07-31', 'return timezone/month mapping failed');
assert(payload.inventoryMode === 'REPLACE_CURRENT', 'inventory mode must be replacement');
assert(payload.inventory.length === 1 && payload.inventory[0].warehouse === 25 && payload.inventory[0].fcTransfer === 2, 'inventory field mapping failed');
assert(payload.productMaster.some(row => row.sku === 'YS001-100' && row.asin === 'A1' && row.fnsku === 'F1'), 'inventory must supply product identity');
assert(!payload.checks.some(check => check.item === '9类数据源'), 'legacy 9-source check still present');
assert(payload.checks.some(check => check.item === '库存写入模式' && check.value === '全量覆盖'), 'inventory replacement check missing');
assert(backend.includes("DELETE FROM inventory_snapshots WHERE store_id=? AND batch_id<>?"), 'backend does not replace previous inventory snapshot');
assert(backend.includes('transaction_sku_daily') && backend.includes('return_sku_daily'), 'SKU event persistence missing');
assert(backend.includes("canonicalSourceModel: 'core-five'"), 'backend source model response missing');
assert(backend.includes('同一批次只能提交 1 份库存文件'), 'duplicate inventory guard missing');
assert(workerEntry.includes('commitCoreFiveImport') && workerEntry.includes('augmentMonthWithCurrentInventory'), 'worker entry not wired to five-source runtime');
assert(migration.includes('onhand_buyable') && migration.includes('return_disposition_monthly') && migration.includes('return_status_monthly'), 'core-five migration incomplete');

console.log('core-five report model check: PASS');
