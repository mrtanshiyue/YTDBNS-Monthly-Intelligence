(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.products = ({ runtimeState, esc }) => {
    const model = selectors.productsModel(runtimeState);
    const rows = model.products.slice(0, 30);
    const summaryGrain = model.detailAvailable ? 'SKU 明细合计' : '所选期间汇总';
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>当前期间没有 SKU 明细</strong><span>商品明细使用完整月份数据；顶部汇总仍保留所选期间经营口径。</span></div>` : '';
    const cards = rows.map(row => `
      <button type="button" class="v5-record-card" data-record-type="product" data-record-id="${esc(row.id)}" aria-label="查看商品 ${esc(row.sku)} 详情">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.model || 'PRODUCT')}</span><strong>${esc(row.sku)}</strong><small>${esc(row.asin)}</small></div>
          <div class="v5-record-primary"><span>Sales</span><strong>${fmt.compactMoney(row.sales)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>Units</span><strong>${fmt.number(row.units)}</strong></div>
          <div class="v5-record-metric"><span>Sessions</span><strong>${fmt.number(row.sessions)}</strong></div>
          <div class="v5-record-metric"><span>CVR</span><strong>${fmt.percent(row.cvr)}</strong></div>
          <div class="v5-record-metric"><span>Buy Box</span><strong>${fmt.percent(row.buyBox)}</strong></div>
        </div>
        <div class="v5-record-card-foot"><span class="v5-record-chip">SKU / ASIN</span><span>详情 ›</span></div>
      </button>`).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="products" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">PRODUCTS</span><h1 id="v5MobileViewTitle">商品</h1><p>用 SKU 卡片替代宽表扫描</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(model.rangeLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-core-stat-grid" aria-label="商品核心指标">
          <div class="v5-core-stat"><span>销售额</span><strong>${fmt.compactMoney(model.totals.sales)}</strong><small>${summaryGrain}</small></div>
          <div class="v5-core-stat"><span>销量</span><strong>${fmt.number(model.totals.units)}</strong><small>${summaryGrain}</small></div>
          <div class="v5-core-stat"><span>Sessions</span><strong>${fmt.number(model.totals.sessions)}</strong><small>${model.detailAvailable ? 'SKU 流量合计' : '所选期间流量'}</small></div>
          <div class="v5-core-stat"><span>CVR</span><strong>${fmt.percent(model.totals.cvr)}</strong><small>Units / Sessions</small></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5ProductRecords">
          <div class="v5-core-section-head"><div><span>SKU PERFORMANCE</span><h2 id="v5ProductRecords">商品表现</h2></div><small>${model.products.length ? `按销售 Top ${rows.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
