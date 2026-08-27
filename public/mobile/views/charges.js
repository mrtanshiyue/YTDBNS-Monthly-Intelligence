(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.charges = ({ runtimeState, esc }) => {
    const m = selectors.chargesModel(runtimeState);
    const rows = m.rows.slice(0, 40);
    const cards = rows.map(row => `
      <article class="v5-record-card" data-record-type="charge" data-record-id="${esc(row.id)}">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.category)}</span><strong>${esc(row.name)}</strong><small>${esc(row.source || 'Amazon settlement')}</small></div>
          <div class="v5-record-primary"><span>Net Cost</span><strong>${fmt.money(row.amount, 0)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>Debit</span><strong>${fmt.compactMoney(row.debit)}</strong></div>
          <div class="v5-record-metric"><span>Credit</span><strong>${fmt.compactMoney(row.credit)}</strong></div>
          <div class="v5-record-metric"><span>Rows</span><strong>${fmt.number(row.count)}</strong></div>
          <div class="v5-record-metric"><span>Share</span><strong>${fmt.percent(row.share)}</strong></div>
        </div>
      </article>`).join('');
    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="charges" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">AMAZON CHARGES</span><h1 id="v5MobileViewTitle">扣费</h1><p>按费用名称查看净成本，而不是宽表逐列找</p></div><button class="v5-mobile-period-trigger" type="button" data-mobile-action="period"><span>${esc(m.rangeLabel)}</span><i>›</i></button></div>
        <section class="v5-secondary-hero"><span>Amazon 扣费净成本</span><strong>${fmt.money(m.total, 0)}</strong><div><small>${fmt.number(m.rows.length)} 个费用项目</small></div></section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>CHARGE NAMES</span><h2>费用项目</h2></div><small>${rows.length ? `Top ${rows.length}` : '暂无数据'}</small></div><div class="v5-record-list">${cards || '<div class="v5-core-empty"><strong>没有扣费记录</strong><span>当前期间未返回 charge rows。</span></div>'}</div></section>
      </section>`;
  };
})();
