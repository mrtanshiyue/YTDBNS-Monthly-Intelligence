(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.history = ({ runtimeState, esc }) => {
    const m = selectors.historyModel(runtimeState);
    const rows = m.rows.slice(0, 18);
    const cards = rows.map(row => `
      <article class="v5-history-month">
        <div class="v5-history-month-head"><b>${esc(row.month)}</b><span>${esc(row.status || 'MONTH')}</span></div>
        <div class="v5-history-metrics">
          <span><small>Sales</small><b>${fmt.compactMoney(row.sales)}</b></span>
          <span><small>Profit</small><b>${fmt.compactMoney(row.profit)}</b></span>
          <span><small>Margin</small><b>${fmt.percent(row.profitMargin)}</b></span>
          <span><small>ACOS</small><b>${fmt.percent(row.acos)}</b></span>
        </div>
      </article>`).join('');
    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="history" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">MONTHLY HISTORY</span><h1 id="v5MobileViewTitle">历史</h1><p>按月快速回看销售、利润与广告效率</p></div></div>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>MONTHS</span><h2>月度经营记录</h2></div><small>${rows.length ? `最近 ${rows.length} 月` : '暂无历史'}</small></div><div class="v5-secondary-list">${cards || '<div class="v5-core-empty"><strong>暂无月度历史</strong><span>导入月度数据后会在这里形成时间轴。</span></div>'}</div></section>
      </section>`;
  };
})();
