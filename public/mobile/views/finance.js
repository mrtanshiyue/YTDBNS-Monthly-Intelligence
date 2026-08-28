(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

  registry.finance = ({ runtimeState }) => {
    const m = selectors.financeModel(runtimeState);
    const sales = Math.abs(Number(m.sales || 0));
    const ratio = value => sales ? clamp(Math.abs(Number(value || 0)) / sales * 100) : 0;
    const costRows = [
      ['广告花费', m.adSpend, 'Advertising'],
      ['COGS', m.cogs, 'Product cost'],
      ['退款销售', m.refundSales, 'Refund'],
      ['仓储估算', m.storageEstimate, 'Storage']
    ];
    const bars = costRows.map(([label, value]) => `
      <div class="v5-cost-bar" style="--v5-meter:${ratio(value).toFixed(1)}%"><span>${label}</span><div class="v5-cost-track" aria-hidden="true"><i></i></div><b>${fmt.compactMoney(value)}</b></div>`).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="finance" aria-labelledby="v5MobileViewTitle">
        <section class="v5-secondary-hero" aria-label="贡献利润">
          <span>CONTRIBUTION PROFIT</span><strong>${fmt.money(m.profit, 0)}</strong>
          <div><small>Margin ${fmt.percent(m.profitMargin)}</small><small>Sales ${fmt.compactMoney(m.sales)}</small><small>Returns ${fmt.number(m.returns)}</small></div>
        </section>
        <section class="v5-intel-efficiency" aria-label="财务核心指标">
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Ad Spend</span><small>${fmt.percent(m.sales ? Number(m.adSpend || 0) / Number(m.sales) : null)}</small></div><strong>${fmt.compactMoney(m.adSpend)}</strong><div class="v5-intel-meter" style="--v5-meter:${ratio(m.adSpend).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>COGS</span><small>${fmt.percent(m.sales ? Number(m.cogs || 0) / Number(m.sales) : null)}</small></div><strong>${fmt.compactMoney(m.cogs)}</strong><div class="v5-intel-meter" style="--v5-meter:${ratio(m.cogs).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Refund</span><small>${fmt.percent(m.sales ? Number(m.refundSales || 0) / Number(m.sales) : null)}</small></div><strong>${fmt.compactMoney(m.refundSales)}</strong><div class="v5-intel-meter" style="--v5-meter:${ratio(m.refundSales).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Settlement</span><small>Period</small></div><strong>${fmt.compactMoney(m.settlement)}</strong></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5FinanceCostIntensity">
          <div class="v5-core-section-head"><div><span>COST INTENSITY</span><h2 id="v5FinanceCostIntensity">成本强度</h2></div><small>占销售额比例</small></div>
          <div class="v5-secondary-row"><div class="v5-secondary-row-copy" style="width:100%"><span>RELATIVE COST LOAD</span><div class="v5-cost-bars">${bars}</div></div></div>
        </section>
        <section class="v5-core-section">
          <div class="v5-core-section-head"><div><span>COST CONTROL</span><h2>费用追踪</h2></div><small>1 tap</small></div>
          <div class="v5-secondary-list">
            <div class="v5-secondary-row"><div class="v5-secondary-row-copy"><span>STORAGE</span><b>仓储成本估算</b><small>库存结构与长期仓储风险</small></div><div class="v5-secondary-row-value"><b>${fmt.money(m.storageEstimate, 0)}</b><small>Estimate</small></div></div>
            <button class="v5-secondary-row" type="button" data-mobile-route="charges"><div class="v5-secondary-row-copy"><span>AMAZON FEES</span><b>查看扣费明细</b><small>费用名称、类别、净成本</small></div><div class="v5-secondary-row-value"><b>进入</b><small>›</small></div></button>
          </div>
        </section>
      </section>`;
  };
})();
