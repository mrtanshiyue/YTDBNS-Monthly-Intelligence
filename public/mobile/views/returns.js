(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

  registry.returns = ({ runtimeState, esc }) => {
    const m = selectors.returnsModel(runtimeState);
    const rows = m.rows.slice(0, 30);
    const total = Number(m.total || 0);
    const cards = rows.map(row => {
      const share = row.share != null ? Number(row.share) : total ? Number(row.count || 0) / total : null;
      return `
      <div class="v5-secondary-row">
        <div class="v5-secondary-row-copy"><span>RETURN REASON</span><b>${esc(row.reason)}</b><small>${share != null ? `占比 ${fmt.percent(share)}` : '月度退货原因'}</small><div class="v5-intel-meter" aria-hidden="true" style="--v5-meter:${clamp(Number(share || 0) * 100).toFixed(1)}%"><i></i></div></div>
        <div class="v5-secondary-row-value"><b>${fmt.number(row.count)}</b><small>${row.amount != null ? fmt.compactMoney(row.amount) : '件 / 次'}</small></div>
      </div>`;
    }).join('');
    const topShare = rows[0] ? (rows[0].share != null ? Number(rows[0].share) : total ? Number(rows[0].count || 0) / total : null) : null;
    const refundAmount = m.refundSales;

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="returns" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">RETURN INTELLIGENCE</span><h1 id="v5MobileViewTitle">退货</h1><p>数量、原因占比与退款影响集中扫描</p></div><button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(m.rangeLabel)}</span><i aria-hidden="true">›</i></button></div>
        <section class="v5-secondary-hero" aria-label="退货件数"><span>TOTAL RETURNS</span><strong>${fmt.number(m.total)}</strong><div><small>${rows.length ? `${fmt.number(m.rows.length)} 个原因` : '原因明细仅完整月份可用'}</small><small>Refund ${fmt.compactMoney(refundAmount)}</small></div></section>
        <section class="v5-intel-ops" aria-label="退货状态">
          <div class="v5-intel-op"><span>Reasons</span><strong>${fmt.number(m.rows.length)}</strong><small>Categories</small></div>
          <div class="v5-intel-op"><span>Top Share</span><strong>${fmt.percent(topShare)}</strong><small>Reason</small></div>
          <div class="v5-intel-op"><span>Top Count</span><strong>${rows[0] ? fmt.number(rows[0].count) : '—'}</strong><small>${rows[0] ? esc(rows[0].reason) : '—'}</small></div>
          <div class="v5-intel-op"><span>Refund</span><strong>${fmt.compactMoney(refundAmount)}</strong><small>${refundAmount == null ? 'No data' : 'Summary'}</small></div>
        </section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>REASON MATRIX</span><h2>主要退货原因</h2></div><small>${rows.length ? `Top ${rows.length}` : '月级明细'}</small></div><div class="v5-secondary-list">${cards || '<div class="v5-core-empty"><strong>当前期间没有原因级明细</strong><span>退货件数仍使用所选期间汇总；完整月份可进一步查看 return reason 数据。</span></div>'}</div></section>
      </section>`;
  };
})();
