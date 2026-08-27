(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.ads = ({ runtimeState, esc }) => {
    const model = selectors.adsModel(runtimeState);
    const rows = model.campaigns.slice(0, 30);
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>当前期间没有 Campaign 明细</strong><span>Campaign 明细使用完整月份数据；自定义日期仍可查看顶部汇总指标。</span></div>` : '';
    const cards = rows.map(row => `
      <article class="v5-record-card" data-record-type="campaign" data-record-id="${esc(row.id)}">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.portfolio || 'CAMPAIGN')}</span><strong>${esc(row.campaign)}</strong><small>广告活动</small></div>
          <div class="v5-record-primary"><span>Spend</span><strong>${fmt.money(row.spend, 0)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>ACOS</span><strong>${fmt.percent(row.acos)}</strong></div>
          <div class="v5-record-metric"><span>Sales</span><strong>${fmt.compactMoney(row.sales)}</strong></div>
          <div class="v5-record-metric"><span>Orders</span><strong>${fmt.number(row.orders)}</strong></div>
          <div class="v5-record-metric"><span>CTR</span><strong>${fmt.percent(row.ctr, 2)}</strong></div>
        </div>
        <div class="v5-record-card-foot"><span class="v5-record-chip">${esc(row.optimizationLabel)}</span><span>详情 ›</span></div>
      </article>`).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="ads" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">ADVERTISING</span><h1 id="v5MobileViewTitle">广告</h1><p>先看效率，再处理高花费活动</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period"><span>${esc(model.rangeLabel)}</span><i>›</i></button>
        </div>
        <section class="v5-core-stat-grid" aria-label="广告核心指标">
          <div class="v5-core-stat"><span>ACOS</span><strong>${fmt.percent(model.totals.acos)}</strong><small>Spend / Ad Sales</small></div>
          <div class="v5-core-stat"><span>广告花费</span><strong>${fmt.compactMoney(model.totals.spend)}</strong><small>所选期间</small></div>
          <div class="v5-core-stat"><span>广告销售</span><strong>${fmt.compactMoney(model.totals.sales)}</strong><small>归因销售</small></div>
          <div class="v5-core-stat"><span>Orders</span><strong>${fmt.number(model.totals.orders)}</strong><small>Campaign 明细合计</small></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5AdsRecords">
          <div class="v5-core-section-head"><div><span>CAMPAIGNS</span><h2 id="v5AdsRecords">广告活动</h2></div><small>${model.campaigns.length ? `按花费 Top ${rows.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
