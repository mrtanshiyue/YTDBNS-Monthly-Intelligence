(() => {
  'use strict';

  const normalizer = window.YT_NORMALIZER;
  if (!normalizer || normalizer.__coreReportModelV2) return;

  const CORE_ROLES = Object.freeze(['transactions', 'ads', 'cost']);
  const CORE_LABELS = Object.freeze({
    transactions: '联合财务报告',
    ads: '广告搜索词报告',
    cost: '采购成本库'
  });
  const OPTIONAL_LABELS = Object.freeze({
    product: '商品信息（可选）', parent: '父体业务报告（可选）', child: '子体业务报告（可选）',
    returns: '退货报告（可选）', inventory: 'FBA库存（可选）', storage: '月度仓储费（可选）'
  });
  Object.assign(normalizer.ROLE_LABELS || {}, CORE_LABELS, OPTIONAL_LABELS);
  normalizer.CORE_ROLES = CORE_ROLES;

  const money = normalizer.money || (value => Number(value || 0) || 0);
  const num = normalizer.num || (value => Number(value || 0) || 0);
  const parseDate = normalizer.parseDate;
  const originalNormalize = normalizer.normalizeBundle.bind(normalizer);

  function firstSheet(parsed) { return Object.values(parsed?.sheets || {})[0] || []; }
  function findHeader(rows, tokens) {
    for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
      const text = (rows[i] || []).join('|').toLowerCase();
      if (tokens.every(token => text.includes(String(token).toLowerCase()))) return i;
    }
    return -1;
  }
  function objects(rows, headerIndex) {
    if (headerIndex < 0) return [];
    const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
    return rows.slice(headerIndex + 1).filter(row => row.some(value => value !== '' && value != null)).map(row => {
      const object = {};
      headers.forEach((header, index) => { if (header) object[header] = row[index] ?? ''; });
      return object;
    });
  }
  function get(object, ...keys) {
    for (const key of keys) if (key in object) return object[key];
    const entries = Object.entries(object);
    for (const key of keys) {
      const lower = String(key).toLowerCase();
      const found = entries.find(([name]) => name.toLowerCase() === lower);
      if (found) return found[1];
    }
    return '';
  }
  function endOfMonth(month) {
    const [year, value] = String(month || '').split('-').map(Number);
    return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  }

  function costMaster(roleMap) {
    const item = roleMap.cost;
    if (!item) return null;
    const rows = firstSheet(item.parsed), header = findHeader(rows, ['sku', '采购成本']);
    const result = [];
    for (const row of objects(rows, header)) {
      const sku = String(get(row, 'SKU') || '').trim();
      if (!sku) continue;
      const purchaseCost = money(get(row, '采购成本'));
      const firstMileCost = money(get(row, '头程费用'));
      const fbmShippingCost = money(get(row, 'FBM运费成本'));
      result.push({
        sku, purchaseCost, firstMileCost, fbmShippingCost,
        cost: purchaseCost + firstMileCost + fbmShippingCost,
        currency: String(get(row, '货币') || 'USD').trim() || 'USD',
        updated: String(get(row, '更新日期') || '')
      });
    }
    return result;
  }

  function transactionDetail(roleMap) {
    const item = roleMap.transactions;
    if (!item) return { skuEvents: [], events: [] };
    const rows = firstSheet(item.parsed), header = findHeader(rows, ['settlement id', 'product sales']);
    const skuEvents = [], events = [];
    for (const row of objects(rows, header)) {
      const date = parseDate(get(row, 'date/time'));
      if (!date) continue;
      const type = String(get(row, 'type') || '').trim().toLowerCase();
      const desc = String(get(row, 'description') || '');
      const sku = String(get(row, 'sku') || '').trim();
      const qty = Math.abs(num(get(row, 'quantity')));
      const sales = money(get(row, 'product sales'));
      const total = money(get(row, 'total'));
      if (type === 'order' && sku) skuEvents.push({ date, sku, sales, units: qty, refundSales: 0, refundQty: 0 });
      if (type === 'refund' && sku) skuEvents.push({ date, sku, sales: 0, units: 0, refundSales: Math.abs(sales), refundQty: qty || 1 });
      const event = { date, transferPayout: 0, longTermStorageFee: 0, reimbursements: 0, liquidationNet: 0, subscription: 0 };
      if (type === 'transfer') event.transferPayout = Math.abs(total);
      else if (type === 'fba inventory fee' && /Long-Term/i.test(desc)) event.longTermStorageFee = Math.abs(total);
      else if (type === 'adjustment') event.reimbursements = total;
      else if (type === 'liquidations') event.liquidationNet = total;
      else if (type === 'service fee' && /subscription/i.test(desc)) event.subscription = Math.abs(total);
      if (event.transferPayout || event.longTermStorageFee || event.reimbursements || event.liquidationNet || event.subscription) events.push(event);
    }
    return { skuEvents, events };
  }

  function adSearchDetail(roleMap) {
    const item = roleMap.ads;
    if (!item) return [];
    const rows = firstSheet(item.parsed), header = findHeader(rows, ['广告活动名称', '日期']);
    const result = [];
    for (const row of objects(rows, header)) {
      const date = parseDate(get(row, '日期'));
      if (!date) continue;
      result.push({
        date,
        portfolio: String(get(row, '广告组合名称') || '未分组'),
        campaignId: String(get(row, '广告活动编号') || ''),
        campaign: String(get(row, '广告活动名称') || '未命名'),
        adGroupId: String(get(row, '广告组编号') || ''),
        adGroup: String(get(row, '广告组名称') || ''),
        searchTerm: String(get(row, '搜索词') || ''),
        targetingId: String(get(row, '投放方案编号') || ''),
        targeting: String(get(row, '投放方案') || ''),
        targetingType: String(get(row, '投放类型') || ''),
        targetingState: String(get(row, '投放状态') || ''),
        matchType: String(get(row, '投放匹配类型-Targeting match type', '匹配类型') || ''),
        targetBid: money(get(row, '目标竞价')),
        spend: money(get(row, '总成本', '花费', '成本', '广告花费')),
        sales: money(get(row, '销售额', '7天总销售额', '总销售额')),
        orders: num(get(row, '购买量', '7天总订单数(#)', '订单量', '总订单数')),
        units: num(get(row, '已售商品数量', '7天总销售数量')),
        impressions: num(get(row, '展示量')),
        clicks: num(get(row, '点击量'))
      });
    }
    return result;
  }

  function enhance(roleMap, month, base) {
    const result = base && typeof base === 'object' ? base : {};
    const costs = costMaster(roleMap);
    if (costs) result.costMaster = costs;
    const transaction = transactionDetail(roleMap);
    result.transactionSkuEvents = transaction.skuEvents;
    result.transactionEvents = transaction.events;
    const adSearchEvents = adSearchDetail(roleMap);
    result.adSearchEvents = adSearchEvents;
    result.campaignEvents = adSearchEvents;
    result.sourceModel = 'core-v2';
    result.coreSources = CORE_ROLES.filter(role => roleMap[role]);

    result.monthly = result.monthly || {};
    if (roleMap.transactions && !roleMap.parent) {
      result.monthly.businessSales = Number(result.monthly.financeGrossSales || 0);
      result.monthly.businessUnits = Number(result.monthly.ordersQty || 0);
    }
    const denominator = Number(result.monthly.businessSales || result.monthly.financeGrossSales || 0);
    result.monthly.tacos = denominator ? Number(result.monthly.adSpend || 0) / denominator : 0;
    const storageAdjustment = Number(result.monthly.storageEstimate || 0) > 0
      ? Number(result.monthly.baseStorageCharge || 0) - Number(result.monthly.storageEstimate || 0) : 0;
    result.monthly.contributionProfit = Number(result.monthly.settlement || 0) + Number(result.monthly.adCharge || 0)
      - Number(result.monthly.adSpend || 0) - Number(result.monthly.cogs || 0) + storageAdjustment;
    result.monthly.profitMargin = Number(result.monthly.financeGrossSales || 0)
      ? result.monthly.contributionProfit / Number(result.monthly.financeGrossSales) : 0;

    for (const row of result.daily || []) {
      const adjustment = Number(row.storageEstimate || 0) > 0 ? Number(row.baseStorageCharge || 0) - Number(row.storageEstimate || 0) : 0;
      row.contributionProfit = Number(row.settlement || 0) + Number(row.financeAdCharge || 0) - Number(row.adSpend || 0) - Number(row.cogs || 0) + adjustment;
    }
    result.checks = (result.checks || []).filter(check => !['9类数据源', '本次数据源'].includes(String(check?.item || '')));
    result.checks.unshift({
      item: '本次数据能力', status: 'PASS',
      value: result.coreSources.length ? result.coreSources.map(role => CORE_LABELS[role]).join('、') : '兼容数据源',
      detail: '核心模型允许采购成本、联合财务、广告搜索词分批独立导入；不再要求凑齐 9 类报表'
    });
    const dates = (result.daily || []).map(row => row.date).filter(Boolean).sort();
    if (dates.length) { result.rangeStart = dates[0]; result.rangeEnd = dates[dates.length - 1]; }
    result.month = result.month || month;
    result.rangeStart = result.rangeStart || `${month}-01`;
    result.rangeEnd = result.rangeEnd || endOfMonth(month);
    return result;
  }

  normalizer.normalizeBundle = (roleMap, month) => enhance(roleMap || {}, month, originalNormalize(roleMap, month));
  Object.defineProperty(normalizer, '__coreReportModelV2', { value: true });
  window.YT_CORE_REPORT_MODEL = Object.freeze({ version: 2, CORE_ROLES, enhance });

  const engine = window.YT_ENGINE;
  const input = typeof document !== 'undefined' ? document.getElementById('importFiles') : null;
  const monthInput = typeof document !== 'undefined' ? document.getElementById('importMonth') : null;
  const validateButton = typeof document !== 'undefined' ? document.getElementById('validateBtn') : null;
  function dateConfig(role) {
    if (role === 'transactions') return { header: ['settlement id', 'product sales'], key: 'date/time' };
    if (role === 'ads') return { header: ['广告活动名称', '日期'], key: '日期' };
    if (role === 'returns') return { header: ['return-date', 'sku', 'reason'], key: 'return-date' };
    return null;
  }
  async function overridePeriod(files) {
    if (!engine || !monthInput || !validateButton) return;
    const selected = [...(files || [])].filter(file => /\.(csv|xlsx)$/i.test(file.name));
    if (!selected.length) return;
    const months = new Set(), dates = [], labels = new Set();
    for (const file of selected) {
      try {
        const parsed = await engine.parseFile(file), role = engine.detectRole(file.name, parsed), config = dateConfig(role);
        if (!config) continue;
        const rows = firstSheet(parsed), header = findHeader(rows, config.header);
        for (const row of objects(rows, header)) {
          const date = parseDate(get(row, config.key));
          if (!date) continue;
          dates.push(date); months.add(date.slice(0, 7)); labels.add((normalizer.ROLE_LABELS || {})[role] || role);
        }
      } catch {}
    }
    if (!months.size) return;
    const orderedMonths = [...months].sort(), orderedDates = dates.sort();
    const anchor = orderedMonths[orderedMonths.length - 1];
    monthInput.value = anchor;
    validateButton.disabled = false;
    const box = document.getElementById('importPeriodStatus'), value = document.getElementById('importPeriodValue'), detail = document.getElementById('importPeriodDetail');
    if (!box || !value || !detail) return;
    const format = value => { const [y,m] = value.split('-'); return `${y}年${Number(m)}月`; };
    box.dataset.state = 'ready';
    box.querySelector('span') && (box.querySelector('span').textContent = '数据周期');
    if (orderedMonths.length > 1) {
      value.textContent = `跨月数据 · ${format(orderedMonths[0])}～${format(orderedMonths[orderedMonths.length - 1])}`;
      detail.textContent = `已读取 ${[...labels].join('、')}，实际覆盖 ${orderedDates[0]}～${orderedDates[orderedDates.length - 1]}，共 ${orderedMonths.length} 个自然月。写入时按每行真实日期自动分月；${format(anchor)} 仅作为批次审计锚点。`;
    } else {
      value.textContent = format(anchor);
      detail.textContent = `已由 ${[...labels].join('、')} 的行级日期确认数据周期；无需手动选择月份。`;
    }
  }
  input?.addEventListener('change', event => setTimeout(() => overridePeriod(event.target.files || []), 0));
  if (typeof document !== 'undefined') document.getElementById('dropzone')?.addEventListener('drop', event => setTimeout(() => overridePeriod(event.dataTransfer?.files || []), 0));
})();
