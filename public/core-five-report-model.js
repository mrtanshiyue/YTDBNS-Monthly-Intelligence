(() => {
  'use strict';

  const normalizer = window.YT_NORMALIZER;
  if (!normalizer || window.YT_CORE_FIVE_REPORT_MODEL?.version === 1) return;

  const CORE_ROLES = Object.freeze(['cost', 'transactions', 'ads', 'returns', 'inventory']);
  const CORE_LABELS = Object.freeze({
    cost: '商品成本',
    transactions: '联合报告',
    ads: '广告报表',
    returns: '退货报告',
    inventory: '库存报告'
  });

  Object.assign(normalizer.ROLE_LABELS || {}, CORE_LABELS);

  const money = normalizer.money;
  const num = normalizer.num;
  const baseParseDate = normalizer.parseDate.bind(normalizer);
  const originalNormalizeBundle = normalizer.normalizeBundle.bind(normalizer);

  function parseBusinessDate(value) {
    const text = String(value ?? '').trim();
    if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
      const date = new Date(text);
      if (!Number.isNaN(date.getTime())) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date);
        const part = type => parts.find(item => item.type === type)?.value || '';
        return `${part('year')}-${part('month')}-${part('day')}`;
      }
    }
    return baseParseDate(value);
  }

  normalizer.parseDate = parseBusinessDate;
  const parseDate = parseBusinessDate;

  function firstSheet(parsed) {
    return Object.values(parsed?.sheets || {})[0] || [];
  }

  function findHeader(rows, tokens) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
      const text = (rows[index] || []).join('|').toLowerCase();
      if (tokens.every(token => text.includes(String(token).toLowerCase()))) return index;
    }
    return -1;
  }

  function objects(rows, headerIndex) {
    if (headerIndex < 0) return [];
    const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
    return rows.slice(headerIndex + 1)
      .filter(row => row.some(value => value !== '' && value != null))
      .map(row => {
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

  function modelFromSku(sku) {
    const match = String(sku || '').match(/^(YS\d{3})/i);
    return match ? match[1].toUpperCase() : 'UNASSIGNED';
  }

  function pacificDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  function parsedRows(roleMap, role) {
    return firstSheet(roleMap?.[role]?.parsed);
  }

  function parseCostMaster(roleMap) {
    const rows = parsedRows(roleMap, 'cost');
    const headerIndex = findHeader(rows, ['sku', '采购成本']);
    const bySku = new Map();
    for (const row of objects(rows, headerIndex)) {
      const sku = String(get(row, 'SKU') || '').trim();
      if (!sku) continue;
      const purchaseCost = money(get(row, '采购成本'));
      const firstMileCost = money(get(row, '头程费用'));
      const fbmShippingCost = money(get(row, 'FBM运费成本'));
      bySku.set(sku, {
        sku,
        purchaseCost,
        firstMileCost,
        fbmShippingCost,
        totalCost: purchaseCost + firstMileCost + fbmShippingCost,
        currency: String(get(row, '货币') || 'USD').trim() || 'USD',
        updated: String(get(row, '更新日期') || '').trim()
      });
    }
    return [...bySku.values()];
  }

  function parseTransactionEvents(roleMap) {
    const rows = parsedRows(roleMap, 'transactions');
    const headerIndex = findHeader(rows, ['settlement id', 'product sales']);
    const events = [];
    for (const row of objects(rows, headerIndex)) {
      const date = parseDate(get(row, 'date/time'));
      if (!date) continue;
      const type = String(get(row, 'type') || '').trim();
      const quantity = Math.abs(num(get(row, 'quantity')));
      const productSales = money(get(row, 'product sales'));
      const total = money(get(row, 'total'));
      const description = String(get(row, 'description') || '').trim();
      const event = {
        date,
        type,
        description,
        sku: String(get(row, 'sku') || '').trim(),
        quantity,
        productSales,
        total,
        transferPayout: 0,
        longTermStorageFee: 0,
        reimbursements: 0,
        liquidationNet: 0,
        subscription: 0
      };
      if (type === 'Transfer') event.transferPayout = Math.abs(total);
      else if (type === 'FBA Inventory Fee' && /Long-Term/i.test(description)) event.longTermStorageFee = Math.abs(total);
      else if (type === 'Adjustment') event.reimbursements = total;
      else if (type === 'Liquidations') event.liquidationNet = total;
      else if (type === 'Service Fee' && /subscription/i.test(description)) event.subscription = Math.abs(total);
      events.push(event);
    }
    return events;
  }

  function parseCampaignEvents(roleMap) {
    const rows = parsedRows(roleMap, 'ads');
    const headerIndex = findHeader(rows, ['广告活动名称', '日期']);
    const events = [];
    for (const row of objects(rows, headerIndex)) {
      const date = parseDate(get(row, '日期'));
      if (!date) continue;
      events.push({
        date,
        portfolio: String(get(row, '广告组合名称') || '未分组').trim() || '未分组',
        campaign: String(get(row, '广告活动名称') || '未命名').trim() || '未命名',
        spend: money(get(row, '花费', '总成本', '成本', '广告花费')),
        sales: money(get(row, '7天总销售额', '销售额', '总销售额')),
        orders: num(get(row, '7天总订单数(#)', '购买量', '订单量', '总订单数')),
        impressions: num(get(row, '展示量')),
        clicks: num(get(row, '点击量'))
      });
    }
    return events;
  }

  function parseReturnEvents(roleMap) {
    const rows = parsedRows(roleMap, 'returns');
    const headerIndex = findHeader(rows, ['return-date', 'sku', 'reason']);
    const events = [];
    for (const row of objects(rows, headerIndex)) {
      const date = parseDate(get(row, 'return-date'));
      if (!date) continue;
      events.push({
        date,
        orderId: String(get(row, 'order-id') || '').trim(),
        sku: String(get(row, 'sku') || '').trim(),
        asin: String(get(row, 'asin') || '').trim(),
        fnsku: String(get(row, 'fnsku') || '').trim(),
        productName: String(get(row, 'product-name') || '').trim(),
        count: num(get(row, 'quantity')) || 1,
        disposition: String(get(row, 'detailed-disposition') || '').trim(),
        reason: String(get(row, 'reason') || 'UNKNOWN').trim() || 'UNKNOWN',
        status: String(get(row, 'status') || '').trim()
      });
    }
    return events;
  }

  function parseInventory(roleMap, costMaster) {
    const rows = parsedRows(roleMap, 'inventory');
    const headerIndex = findHeader(rows, ['sku', 'afn-fulfillable-quantity']);
    const snapshotDate = pacificDate();
    const costBySku = new Map((costMaster || []).map(row => [row.sku, Number(row.totalCost || 0)]));
    const inventory = [];
    const productMaster = [];
    for (const row of objects(rows, headerIndex)) {
      const sku = String(get(row, 'sku') || '').trim();
      if (!sku) continue;
      const fnsku = String(get(row, 'fnsku') || '').trim();
      const asin = String(get(row, 'asin') || '').trim();
      const inboundWorking = num(get(row, 'afn-inbound-working-quantity'));
      const inboundShipped = num(get(row, 'afn-inbound-shipped-quantity'));
      const inboundReceiving = num(get(row, 'afn-inbound-receiving-quantity'));
      const total = num(get(row, 'afn-total-quantity'));
      const unitCost = costBySku.get(sku) || 0;
      inventory.push({
        snapshotDate,
        model: modelFromSku(sku),
        sku,
        fnsku,
        asin,
        productName: String(get(row, 'product-name') || '').trim(),
        condition: String(get(row, 'condition') || '').trim(),
        yourPrice: money(get(row, 'your-price')),
        mfnListingExists: String(get(row, 'mfn-listing-exists') || '').trim(),
        mfnFulfillable: num(get(row, 'mfn-fulfillable-quantity')),
        afnListingExists: String(get(row, 'afn-listing-exists') || '').trim(),
        warehouse: num(get(row, 'afn-warehouse-quantity')),
        fulfillable: num(get(row, 'afn-fulfillable-quantity')),
        unsellable: num(get(row, 'afn-unsellable-quantity')),
        reserved: num(get(row, 'afn-reserved-quantity')),
        total,
        perUnitVolume: num(get(row, 'per-unit-volume')),
        inboundWorking,
        inboundShipped,
        inboundReceiving,
        inbound: inboundWorking + inboundShipped + inboundReceiving,
        researching: num(get(row, 'afn-researching-quantity')),
        reservedFutureSupply: num(get(row, 'afn-reserved-future-supply')),
        futureSupplyBuyable: num(get(row, 'afn-future-supply-buyable')),
        fcTransfer: num(get(row, 'afn-fc-transfer-quantity')),
        onhandBuyable: num(get(row, 'afn-onhand-buyable-quantity')),
        storeLabel: String(get(row, 'store') || '').trim(),
        inventoryValue: total * unitCost
      });
      productMaster.push({ sku, fnsku, asin, model: modelFromSku(sku), internal: '' });
    }
    return { snapshotDate, inventory, productMaster };
  }

  function rebaseReturnDaily(payload, returnEvents) {
    const numericKeys = [
      'sales','units','orders','refundSales','refundQty','adSpend','adSales','adOrders',
      'impressions','clicks','cogs','settlement','financeAdCharge','baseStorageCharge',
      'storageEstimate','contributionProfit'
    ];
    const map = new Map();
    for (const row of payload.daily || []) {
      const copy = { ...row, returns: 0 };
      map.set(copy.date, copy);
    }
    for (const event of returnEvents || []) {
      if (!event.date) continue;
      const row = map.get(event.date) || {
        date: event.date, sales: 0, units: 0, orders: 0, refundSales: 0, refundQty: 0,
        adSpend: 0, adSales: 0, adOrders: 0, impressions: 0, clicks: 0, cogs: 0,
        settlement: 0, financeAdCharge: 0, baseStorageCharge: 0, storageEstimate: 0,
        contributionProfit: 0, returns: 0
      };
      row.returns = Number(row.returns || 0) + Number(event.count || 0);
      map.set(event.date, row);
    }
    payload.daily = [...map.values()]
      .filter(row => Number(row.returns || 0) !== 0 || numericKeys.some(key => Number(row[key] || 0) !== 0))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function sourceLabels(roleMap) {
    return Object.keys(roleMap || {}).map(role => CORE_LABELS[role] || normalizer.ROLE_LABELS?.[role] || role);
  }

  normalizer.normalizeBundle = function normalizeCoreFiveBundle(roleMap, month) {
    const payload = originalNormalizeBundle(roleMap, month);
    const roles = new Set(Object.keys(roleMap || {}));

    const costMaster = roles.has('cost') ? parseCostMaster(roleMap) : (payload.costMaster || []);
    const transactionEvents = roles.has('transactions') ? parseTransactionEvents(roleMap) : [];
    const campaignEvents = roles.has('ads') ? parseCampaignEvents(roleMap) : [];
    const returnEvents = roles.has('returns') ? parseReturnEvents(roleMap) : [];
    const inventoryState = roles.has('inventory') ? parseInventory(roleMap, costMaster) : null;

    if (roles.has('cost')) payload.costMaster = costMaster;
    if (transactionEvents.length) payload.transactionEvents = transactionEvents;
    if (campaignEvents.length) payload.campaignEvents = campaignEvents;
    if (returnEvents.length) {
      payload.returnEvents = returnEvents;
      rebaseReturnDaily(payload, returnEvents);
    }

    if (inventoryState) {
      payload.inventory = inventoryState.inventory;
      payload.inventorySnapshotDate = inventoryState.snapshotDate;
      payload.inventoryMode = 'REPLACE_CURRENT';
      const bySku = new Map((payload.productMaster || []).map(row => [row.sku, row]));
      for (const product of inventoryState.productMaster) bySku.set(product.sku, { ...(bySku.get(product.sku) || {}), ...product });
      payload.productMaster = [...bySku.values()];
      payload.monthly.inventoryUnits = inventoryState.inventory.reduce((sum, row) => sum + Number(row.total || 0), 0);
      payload.monthly.fulfillableUnits = inventoryState.inventory.reduce((sum, row) => sum + Number(row.fulfillable || 0), 0);
      payload.monthly.inboundUnits = inventoryState.inventory.reduce((sum, row) => sum + Number(row.inbound || 0), 0);
      payload.monthly.inventoryValue = inventoryState.inventory.reduce((sum, row) => sum + Number(row.inventoryValue || 0), 0);
    }

    if (roles.has('transactions')) {
      payload.monthly.businessSales = payload.monthly.financeGrossSales;
      payload.monthly.businessUnits = payload.monthly.ordersQty;
    }

    const checks = (payload.checks || []).filter(check => {
      const item = String(check?.item || '');
      if (item === '9类数据源' || item === '业务/财务销售') return false;
      if (item === '采购成本覆盖' && !(roles.has('cost') && roles.has('transactions'))) return false;
      return true;
    });
    checks.unshift({
      item: '核心数据模型',
      status: 'PASS',
      value: '5类字段模型',
      detail: '商品成本、联合报告、广告报表、退货报告、库存报告；不再要求旧9类报表。'
    });
    checks.push({
      item: '本次数据覆盖',
      status: 'PASS',
      value: sourceLabels(roleMap).join('、') || '无',
      detail: '按字段能力独立更新；无需凑齐全部来源后才能写入。'
    });
    if (roles.has('inventory')) checks.push({
      item: '库存写入模式',
      status: 'PASS',
      value: '全量覆盖',
      detail: `库存为当前快照；本次 ${payload.inventory.length} 个 SKU 将替换该店之前的库存快照。`
    });
    if (returnEvents.length) {
      const dates = returnEvents.map(row => row.date).sort();
      checks.push({
        item: '退货日期覆盖',
        status: 'PASS',
        value: `${dates[0]}～${dates[dates.length - 1]}`,
        detail: `${returnEvents.reduce((sum, row) => sum + Number(row.count || 0), 0)} 件退货按 return-date 自动分月。`
      });
    }
    payload.checks = checks;
    payload.coreModel = { version: 1, roles: CORE_ROLES, activeRoles: [...roles] };
    return payload;
  };

  window.YT_CORE_FIVE_REPORT_MODEL = Object.freeze({
    version: 1,
    coreRoles: CORE_ROLES,
    labels: CORE_LABELS
  });
})();
