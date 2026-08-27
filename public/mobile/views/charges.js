(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

  registry.charges = ({ runtimeState, esc }) => {
    const m = selectors.chargesModel(runtimeState);
    const rows = m.rows.slice(0, 40);
    const totalAbs = Math.abs(Number(m.total || 0));
    const cards = rows.map(row => {
      const share = row.share != null ? Number(row.share) : totalAbs ? Math.abs(Number(row.amount || 0)) / totalAbs : null;
      const meter = share == null ? 0 : clamp(share * 100);
      return `
      <button type="button" class="v5-record-card ${share != null ? 'v5-has-meter' : ''}" style="--v5-meter:${meter.toFixed(1)}%" data-record-type="charge" data-record-id="${esc(row.id)}" aria-label="查看扣费项目 ${esc(row.name)} 详情">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.category)}</span><strong>${esc(row.name)}</strong><small>${esc(row.source || 'Amazon settlement')}</small></div>
          <div class="v5-record-primary"><span>Net Cost</span><strong>${fmt.money(row.amount, 0)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>Debit</span><strong>${fmt.compactMoney(row.debit)}</strong></div>
          <div class="v5-record-metric"><span>Credit</span><strong>${fmt.compactMoney(row.credit)}</strong></div>
          <div class="v5-record-metric"><span>Rows</span><strong>${fmt.number(row.count)}</strong></div>
          <div class="v5-record-metric"><span>Share</span><strong>${fmt.percent(share)}</strong></div>
        </div>
      </button>`;
    }).join('');
    const topShare = rows[0] ? (rows[0].share != null ? Number(rows[0].share) : totalAbs ? Math.abs(Number(rows[0].amount || 0)) / totalAbs : null) : null;

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="charges" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">COST INTELLIGENCE</span><h1 id="v5MobileViewTitle">扣费</h1><p>费用净成本、借贷方向与成本占比集中扫描</p></div><button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(m.rangeLabel)}</span><i aria-hidden="true">›</i></button></div>
        <section class="v5-secondary-hero"><span>AMAZON CHARGE NET COST</span><strong>${fmt.money(m.total, 0)}</strong><div><small>${fmt.number(m.rows.length)} 个费用项目</small><small>Top Share ${fmt.percent(topShare)}</small></div></section>
        <section class="v5-intel-ops" aria-label="扣费状态">
          <div class="v5-intel-op"><span>Charge Names</span><strong>${fmt.number(m.rows.length)}</strong><small>Categories</small></div>
          <div class="v5-intel-op"><span>Top Cost</span><strong>${rows[0] ? fmt.compactMoney(rows[0].amount) : '—'}</strong><small>${rows[0] ? esc(rows[0].name) : '—'}</small></div>
          <div class="v5-intel-op"><span>Top Share</span><strong>${fmt.percent(topShare)}</strong><small>Net cost</small></div>
          <div class="v5-intel-op"><span>Rows</span><strong>${fmt.number(m.rows.reduce((sum,row)=>sum+Number(row.count||0),0))}</strong><small>Source rows</small></div>
        </section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>CHARGE MATRIX</span><h2>费用项目</h2></div><small>${rows.length ? `Top ${rows.length}` : '暂无数据'}</small></div><div class="v5-record-list">${cards || '<div class="v5-core-empty"><strong>没有扣费记录</strong><span>当前期间未返回 charge rows。</span></div>'}</div></section>
      </section>`;
  };
})();
