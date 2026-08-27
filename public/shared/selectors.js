(() => {
  'use strict';

  const value = (...candidates) => candidates.find(item => item != null && Number.isFinite(Number(item))) ?? null;
  const text = (...candidates) => candidates.find(item => item != null && String(item).trim()) ?? '';

  function normalizeSummary(raw = {}) {
    const sales = value(raw.businessSales, raw.business_sales, raw.sales);
    const profit = value(raw.contributionProfit, raw.contribution_profit, raw.profit);
    const adSpend = value(raw.adSpend, raw.ad_spend);
    const adSales = value(raw.adSales, raw.ad_sales);
    const units = value(raw.businessUnits, raw.business_units, raw.units);
    const sessions = value(raw.sessions);
    const profitMarginFallback = sales != null && Number(sales) !== 0 && profit != null ? Number(profit) / Number(sales) : null;
    const acosFallback = adSales != null && Number(adSales) !== 0 && adSpend != null ? Number(adSpend) / Number(adSales) : null;
    const tacosFallback = sales != null && Number(sales) !== 0 && adSpend != null ? Number(adSpend) / Number(sales) : null;
    const cvrFallback = sessions != null && Number(sessions) !== 0 && units != null ? Number(units) / Number(sessions) : null;
    return Object.freeze({
      sales,
      profit,
      profitMargin: value(raw.profitMargin, raw.profit_margin, profitMarginFallback),
      acos: value(raw.acos, acosFallback),
      tacos: value(raw.tacos, tacosFallback),
      adSpend,
      adSales,
      inventoryValue: value(raw.inventoryValue, raw.inventory_value),
      fulfillableUnits: value(raw.fulfillableUnits, raw.fulfillable_units),
      units,
      sessions,
      cvr: value(raw.cvr, raw.traffic_cvr, cvrFallback),
      returns: value(raw.returns),
      refundSales: value(raw.refundSales, raw.refund_sales)
    });
  }

  function overviewInsights(summary) {
    const s = normalizeSummary(summary);
    const rows = [];
    if (s.acos != null) {
      rows.push(s.acos > 0.45
        ? { tone: 'warning', title: '广告效率高于目标线', detail: `ACOS ${(s.acos * 100).toFixed(1)}%，优先查看高花费低转化活动`, route: 'ads' }
        : { tone: 'positive', title: '广告效率处于目标区间', detail: `ACOS ${(s.acos * 100).toFixed(1)}%，可继续观察高回报活动的放量空间`, route: 'ads' });
    }
    if (s.tacos != null && s.tacos > 0.23) {
      rows.push({ tone: 'warning', title: '广告依赖偏高', detail: `TACOS ${(s.tacos * 100).toFixed(1)}%，需要关注自然销售是否同步增长`, route: 'ads' });
    }
    if (s.profit != null) {
      rows.push(s.profit >= 0
        ? { tone: 'positive', title: '贡献利润为正', detail: '继续同时观察利润率、广告投入与退款变化', route: 'finance' }
        : { tone: 'critical', title: '贡献利润为负', detail: '优先拆解退款、Amazon 扣费、广告与采购成本', route: 'finance' });
    }
    if (s.inventoryValue != null) {
      rows.push({ tone: 'neutral', title: '库存资金需要持续跟踪', detail: s.fulfillableUnits != null ? `当前可售库存 ${Math.round(s.fulfillableUnits).toLocaleString('en-US')} 件` : '进入库存模块查看 SKU 资金占用与不可售库存', route: 'inventory' });
    }
    return rows.slice(0, 4);
  }

  function overviewModel(runtimeState) {
    const rawSummary = runtimeState?.dashboard?.summary || {};
    const baseSummary = normalizeSummary(rawSummary);
    const inventory = inventoryModel(runtimeState);
    const summary = Object.freeze({
      ...baseSummary,
      inventoryValue: baseSummary.inventoryValue ?? (inventory.detailAvailable ? inventory.totals.inventoryValue : null),
      fulfillableUnits: baseSummary.fulfillableUnits ?? (inventory.detailAvailable ? inventory.totals.fulfillable : null)
    });
    const series = Array.isArray(runtimeState?.dashboard?.series) ? runtimeState.dashboard.series : [];
    return Object.freeze({
      summary,
      insights: overviewInsights(summary),
      salesSeries: series.map(row => ({ label: row.label, value: value(row.sales, row.businessSales, row.business_sales) })).filter(row => row.value != null),
      loading: Boolean(runtimeState?.loading),
      mode: runtimeState?.mode || 'unknown',
      error: runtimeState?.error || null,
      rangeLabel: runtimeState?.rangeLabel || '选择期间'
    });
  }

  function campaignRows(runtimeState) {
    const rows = runtimeState?.monthDetail?.campaigns || [];
    return rows.map((row, index) => {
      const acos = value(row.acos);
      return {
        id: text(row.id, row.campaign_id, row.campaign, `campaign-${index}`),
        portfolio: text(row.portfolio, row.portfolio_name),
        campaign: text(row.campaign, row.campaign_name, '未命名活动'),
        spend: value(row.spend, row.ad_spend) ?? 0,
        sales: value(row.sales, row.ad_sales) ?? 0,
        acos,
        orders: value(row.orders, row.ad_orders) ?? 0,
        ctr: value(row.ctr),
        cvr: value(row.cvr),
        optimizationLabel: acos != null && acos > 0.45 ? '需要优化' : '持续观察'
      };
    }).sort((a, b) => b.spend - a.spend);
  }

  function adsModel(runtimeState) {
    const campaigns = campaignRows(runtimeState);
    const spend = campaigns.reduce((sum, row) => sum + Number(row.spend || 0), 0);
    const sales = campaigns.reduce((sum, row) => sum + Number(row.sales || 0), 0);
    const orders = campaigns.reduce((sum, row) => sum + Number(row.orders || 0), 0);
    const summary = normalizeSummary(runtimeState?.dashboard?.summary || {});
    return Object.freeze({
      summary,
      campaigns,
      totals: Object.freeze({
        spend: campaigns.length ? spend : summary.adSpend,
        sales: campaigns.length ? sales : summary.adSales,
        orders: campaigns.length ? orders : null,
        acos: campaigns.length && sales ? spend / sales : summary.acos
      }),
      rangeLabel: runtimeState?.rangeLabel || '选择期间',
      detailAvailable: campaigns.length > 0
    });
  }

  function productRows(runtimeState) {
    const rows = runtimeState?.monthDetail?.products || [];
    return rows.map((row, index) => ({
      id: text(row.sku, row.asin, `product-${index}`),
      model: text(row.model, row.product_line),
      sku: text(row.sku, '—'),
      asin: text(row.asin, '—'),
      sales: value(row.sales, row.business_sales) ?? 0,
      units: value(row.units, row.business_units) ?? 0,
      sessions: value(row.sessions),
      cvr: value(row.cvr, row.traffic_cvr),
      buyBox: value(row.buy_box, row.buyBox)
    })).sort((a, b) => b.sales - a.sales);
  }

  function productsModel(runtimeState) {
    const products = productRows(runtimeState);
    const sales = products.reduce((sum, row) => sum + Number(row.sales || 0), 0);
    const units = products.reduce((sum, row) => sum + Number(row.units || 0), 0);
    const sessions = products.reduce((sum, row) => sum + Number(row.sessions || 0), 0);
    const hasProductSessions = products.some(row => row.sessions != null);
    const summary = normalizeSummary(runtimeState?.dashboard?.summary || {});
    return Object.freeze({
      summary,
      products,
      totals: Object.freeze({
        sales: products.length ? sales : summary.sales,
        units: products.length ? units : summary.units,
        sessions: hasProductSessions ? sessions : summary.sessions,
        cvr: hasProductSessions && sessions ? units / sessions : summary.cvr
      }),
      rangeLabel: runtimeState?.rangeLabel || '选择期间',
      detailAvailable: products.length > 0
    });
  }

  function inventorySource(runtimeState) {
    if (runtimeState?.inventoryDetail) return runtimeState.inventoryDetail;
    const monthDetail = runtimeState?.monthDetail;
    if (monthDetail && ((Array.isArray(monthDetail.inventory) && monthDetail.inventory.length > 0) || monthDetail.inventorySnapshotDate)) return monthDetail;
    return null;
  }

  function inventoryRows(runtimeState) {
    const detail = inventorySource(runtimeState);
    const rows = detail?.inventory || [];
    return rows.map((row, index) => ({
      id: text(row.sku, row.asin, `inventory-${index}`),
      model: text(row.model, row.product_line),
      sku: text(row.sku, '—'),
      asin: text(row.asin, '—'),
      fulfillable: value(row.fulfillable) ?? 0,
      inbound: value(row.inbound) ?? 0,
      total: value(row.total, row.inventory_units) ?? 0,
      inventoryValue: value(row.inventory_value, row.inventoryValue) ?? 0,
      unsellable: value(row.unsellable) ?? 0
    })).sort((a, b) => b.inventoryValue - a.inventoryValue);
  }

  function inventoryModel(runtimeState) {
    const detail = inventorySource(runtimeState);
    const inventory = inventoryRows(runtimeState);
    return Object.freeze({
      inventory,
      totals: Object.freeze({
        total: inventory.reduce((sum, row) => sum + Number(row.total || 0), 0),
        fulfillable: inventory.reduce((sum, row) => sum + Number(row.fulfillable || 0), 0),
        inbound: inventory.reduce((sum, row) => sum + Number(row.inbound || 0), 0),
        inventoryValue: inventory.reduce((sum, row) => sum + Number(row.inventoryValue || 0), 0),
        unsellable: inventory.reduce((sum, row) => sum + Number(row.unsellable || 0), 0)
      }),
      snapshotDate: detail?.inventorySnapshotDate || null,
      rangeLabel: runtimeState?.rangeLabel || '选择期间',
      detailAvailable: inventory.length > 0 || Boolean(detail?.inventorySnapshotDate)
    });
  }

  window.YT_SHARED_SELECTORS = Object.freeze({
    normalizeSummary,
    overviewInsights,
    overviewModel,
    adsModel,
    productsModel,
    inventoryModel
  });
})();
