(() => {
  'use strict';

  const value = (...candidates) => candidates.find(item => item != null && Number.isFinite(Number(item))) ?? null;

  function normalizeSummary(raw = {}) {
    const sales = value(raw.businessSales, raw.business_sales, raw.sales);
    const profit = value(raw.contributionProfit, raw.contribution_profit, raw.profit);
    const profitMargin = value(raw.profitMargin, raw.profit_margin, sales ? Number(profit) / Number(sales) : null);
    const adSpend = value(raw.adSpend, raw.ad_spend);
    const adSales = value(raw.adSales, raw.ad_sales);
    return Object.freeze({
      sales,
      profit,
      profitMargin,
      acos: value(raw.acos, adSales ? Number(adSpend) / Number(adSales) : null),
      tacos: value(raw.tacos, sales ? Number(adSpend) / Number(sales) : null),
      adSpend,
      adSales,
      inventoryValue: value(raw.inventoryValue, raw.inventory_value),
      fulfillableUnits: value(raw.fulfillableUnits, raw.fulfillable_units),
      units: value(raw.businessUnits, raw.business_units, raw.units),
      sessions: value(raw.sessions),
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
    const summary = normalizeSummary(rawSummary);
    const series = Array.isArray(runtimeState?.dashboard?.series) ? runtimeState.dashboard.series : [];
    return Object.freeze({
      summary,
      insights: overviewInsights(rawSummary),
      salesSeries: series.map(row => ({ label: row.label, value: value(row.sales, row.businessSales, row.business_sales) })).filter(row => row.value != null),
      loading: Boolean(runtimeState?.loading),
      mode: runtimeState?.mode || 'unknown',
      error: runtimeState?.error || null,
      rangeLabel: runtimeState?.rangeLabel || '选择期间'
    });
  }

  window.YT_SHARED_SELECTORS = Object.freeze({ normalizeSummary, overviewInsights, overviewModel });
})();
