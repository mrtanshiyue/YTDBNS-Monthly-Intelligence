(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

  registry.ads = ({ runtimeState, esc }) => {
    const model = selectors.adsModel(runtimeState);
    const rows = model.campaigns.slice(0, 30);
    const roas = model.totals.spend ? Number(model.totals.sales || 0) / Number(model.totals.spend) : null;
    const highRisk = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .45).length;
    const critical = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .60).length;
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>当前期间没有 Campaign 明细</strong><span>Campaign 明细使用完整月份数据；自定义日期仍可查看顶部汇总指标。</span></div>` : '';
    const cards = rows.map(row => {
      const acos = row.acos == null ? null : Number(row.acos);
      const risk = acos == null ? 'neutral' : acos > .60 ? 'critical' : acos > .45 ? 'warning' : 'positive';
      const meter = acos == null ? 0 : clamp((acos / .75) * 100);
      return `
      <button type="button" class="v5-record-card v5-risk-${risk} v5-has-meter" style="--v5-meter:${meter.toFixed(1)}%" data-record-type="campaign" data-record-id="${esc(row.id)}" aria-label="查看广告活动 ${esc(row.campaign)} 详情">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.portfolio || 'CAMPAIGN')}</span><strong>${esc(row.campaign)}</strong><small>${risk === 'critical' ? '高风险 · ACOS 严重超线' : risk === 'warning' ? '关注 · ACOS 高于目标' : '效率监控'}</small></div>
          <div class="v5-record-primary"><span>Spend</span><strong>${fmt.money(row.spend, 0)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>ACOS</span><strong>${fmt.percent(row.acos)}</strong></div>
          <div class="v5-record-metric"><span>Sales</span><strong>${fmt.compactMoney(row.sales)}</strong></div>
          <div class="v5-record-metric"><span>Orders</span><strong>${fmt.number(row.orders)}</strong></div>
          <div class="v5-record-metric"><span>CTR</span><strong>${fmt.percent(row.ctr, 2)}</strong></div>
        </div>
        <div class="v5-record-card-foot"><span class="v5-record-chip">${esc(row.optimizationLabel)}</span><span>详情 ›</span></div>
      </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="ads" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">ADS INTELLIGENCE</span><h1 id="v5MobileViewTitle">广告</h1><p>效率、投入、风险 Campaign 一屏扫描</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(model.rangeLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-intel-efficiency" aria-label="广告核心效率">
          <div class="v5-intel-metric ${model.totals.acos != null && model.totals.acos > .60 ? 'critical' : model.totals.acos != null && model.totals.acos > .45 ? 'warning' : 'positive'}"><div class="v5-intel-metric-head"><span>ACOS</span><small>≤45%</small></div><strong>${fmt.percent(model.totals.acos)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp((Number(model.totals.acos || 0) / .75) * 100).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Ad Spend</span><small>Spend</small></div><strong>${fmt.compactMoney(model.totals.spend)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp(Number(model.summary.tacos || 0) / .35 * 100).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Ad Sales</span><small>Sales</small></div><strong>${fmt.compactMoney(model.totals.sales)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp(roas == null ? 0 : roas / 5 * 100).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>ROAS</span><small>Sales / Spend</small></div><strong>${roas == null ? '—' : roas.toFixed(2)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp(roas == null ? 0 : roas / 5 * 100).toFixed(1)}%"><i></i></div></div>
        </section>
        <section class="v5-intel-ops" aria-label="广告运行状态">
          <div class="v5-intel-op"><span>Orders</span><strong>${fmt.number(model.totals.orders)}</strong><small>Attributed</small></div>
          <div class="v5-intel-op"><span>TACOS</span><strong>${fmt.percent(model.summary.tacos)}</strong><small>Ad / Store</small></div>
          <div class="v5-intel-op"><span>风险活动</span><strong>${fmt.number(highRisk)}</strong><small>&gt;45%</small></div>
          <div class="v5-intel-op"><span>严重超线</span><strong>${fmt.number(critical)}</strong><small>&gt;60%</small></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5AdsRecords">
          <div class="v5-core-section-head"><div><span>CAMPAIGN MATRIX</span><h2 id="v5AdsRecords">广告活动</h2></div><small>${model.campaigns.length ? `Spend Top ${rows.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
