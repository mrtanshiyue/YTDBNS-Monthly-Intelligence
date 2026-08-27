(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.returns = ({ runtimeState, esc }) => {
    const m = selectors.returnsModel(runtimeState);
    const rows = m.rows.slice(0, 30);
    const cards = rows.map(row => `
      <div class="v5-secondary-row">
        <div class="v5-secondary-row-copy"><span>RETURN REASON</span><b>${esc(row.reason)}</b><small>${row.share != null ? `占比 ${fmt.percent(row.share)}` : '月度退货原因'}</small></div>
        <div class="v5-secondary-row-value"><b>${fmt.number(row.count)}</b><small>${row.amount != null ? fmt.compactMoney(row.amount) : '件 / 次'}</small></div>
      </div>`).join('');
    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="returns" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">RETURNS</span><h1 id="v5MobileViewTitle">退货</h1><p>把差评与退货原因压缩成可执行信号</p></div><button class="v5-mobile-period-trigger" type="button" data-mobile-action="period"><span>${esc(m.rangeLabel)}</span><i>›</i></button></div>
        <section class="v5-secondary-hero" aria-label="退货件数"><span>退货件数</span><strong>${fmt.number(m.total)}</strong><div><small>${rows.length ? `${fmt.number(m.rows.length)} 个原因` : '原因明细仅完整月份可用'}</small></div></section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>REASONS</span><h2>主要退货原因</h2></div><small>${rows.length ? `Top ${rows.length}` : '月级明细'}</small></div><div class="v5-secondary-list">${cards || '<div class="v5-core-empty"><strong>当前期间没有原因级明细</strong><span>退货件数仍使用所选期间汇总；完整月份可进一步查看 return reason 数据。</span></div>'}</div></section>
      </section>`;
  };
})();
