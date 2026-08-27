(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  const deltaLabel = (current, previous) => {
    if (current == null || previous == null) return '—';
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return '—';
    const delta = (c - p) / Math.abs(p);
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    return `${arrow} ${Math.abs(delta * 100).toFixed(1)}%`;
  };

  registry.history = ({ runtimeState, esc }) => {
    const m = selectors.historyModel(runtimeState);
    const rows = m.rows.slice(0, 18);
    const cards = rows.map((row, index) => {
      const previous = rows[index + 1];
      return `
      <article class="v5-history-month">
        <div class="v5-history-month-head"><b>${esc(row.month)}</b><span>${esc(previous ? deltaLabel(row.sales, previous.sales) : row.status || 'MONTH')}</span></div>
        <div class="v5-history-metrics">
          <span><small>Sales</small><b>${fmt.compactMoney(row.sales)}</b></span>
          <span><small>Profit</small><b>${fmt.compactMoney(row.profit)}</b></span>
          <span><small>Margin</small><b>${fmt.percent(row.profitMargin)}</b></span>
          <span><small>ACOS</small><b>${fmt.percent(row.acos)}</b></span>
        </div>
      </article>`;
    }).join('');
    const latest = rows[0];
    const previous = rows[1];

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="history" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">MONTHLY INTELLIGENCE</span><h1 id="v5MobileViewTitle">历史</h1><p>12–18 个月经营记录高密度扫描</p></div></div>
        ${latest ? `<section class="v5-intel-ops" aria-label="历史最新状态"><div class="v5-intel-op"><span>Latest</span><strong>${esc(latest.month)}</strong><small>Month</small></div><div class="v5-intel-op"><span>Sales</span><strong>${fmt.compactMoney(latest.sales)}</strong><small>${previous ? esc(deltaLabel(latest.sales, previous.sales)) : '—'}</small></div><div class="v5-intel-op"><span>Profit</span><strong>${fmt.compactMoney(latest.profit)}</strong><small>${previous ? esc(deltaLabel(latest.profit, previous.profit)) : '—'}</small></div><div class="v5-intel-op"><span>ACOS</span><strong>${fmt.percent(latest.acos)}</strong><small>Latest</small></div></section>` : ''}
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>MONTH MATRIX</span><h2>月度经营记录</h2></div><small>${rows.length ? `最近 ${rows.length} 月` : '暂无历史'}</small></div><div class="v5-secondary-list">${cards || '<div class="v5-core-empty"><strong>暂无月度历史</strong><span>导入月度数据后会在这里形成时间轴。</span></div>'}</div></section>
      </section>`;
  };
})();
