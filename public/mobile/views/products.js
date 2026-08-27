(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.products = ({ runtimeState, esc }) => {
    const model = selectors.productsModel(runtimeState);
    const rows = model.products.slice(0, 30);
    const summaryGrain = model.detailAvailable ? 'SKU 明细合计' : '所选期间汇总';
    const buyBoxRows = model.products.filter(row => row.buyBox != null);
    const avgBuyBox = buyBoxRows.length ? buyBoxRows.reduce((sum, row) => sum + Number(row.buyBox || 0), 0) / buyBoxRows.length : null;
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
      </button>`).join('');

    const cvrMeter = Math.max(0, Math.min(100, Number(model.totals.cvr || 0) / .20 * 100));
    const buyBoxMeter = Math.max(0, Math.min(100, Number(avgBuyBox || 0) * 100));

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="products" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">PRODUCT PERFORMANCE</span><h1 id="v5MobileViewTitle">商品</h1><p>SKU / ASIN 经营矩阵，优先扫描销售与转化</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(model.rangeLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-intel-efficiency" aria-label="商品核心指标">
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Sales</span><small>${summaryGrain}</small></div><strong>${fmt.compactMoney(model.totals.sales)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Units</span><small>销量</small></div><strong>${fmt.number(model.totals.units)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Sessions</span><small>Traffic</small></div><strong>${fmt.number(model.totals.sessions)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>CVR</span><small>20% scale</small></div><strong>${fmt.percent(model.totals.cvr)}</strong><div class="v5-intel-meter" style="--v5-meter:${cvrMeter.toFixed(1)}%"><i></i></div></div>
        </section>
        <section class="v5-intel-ops" aria-label="商品状态">
          <div class="v5-intel-op"><span>SKU</span><strong>${fmt.number(model.products.length)}</strong><small>Records</small></div>
          <div class="v5-intel-op"><span>Avg Buy Box</span><strong>${fmt.percent(avgBuyBox)}</strong><small>${avgBuyBox == null ? 'No data' : `${buyBoxMeter.toFixed(0)}%`}</small></div>
          <div class="v5-intel-op"><span>Top Sales</span><strong>${rows[0] ? fmt.compactMoney(rows[0].sales) : '—'}</strong><small>${rows[0] ? esc(rows[0].sku) : 'SKU'}</small></div>
          <div class="v5-intel-op"><span>Detail</span><strong>${model.detailAvailable ? 'LIVE' : 'SUM'}</strong><small>${model.detailAvailable ? 'Month SKU' : 'Range total'}</small></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5ProductRecords">
          <div class="v5-core-section-head"><div><span>SKU MATRIX</span><h2 id="v5ProductRecords">商品表现</h2></div><small>${model.products.length ? `Sales Top ${rows.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
