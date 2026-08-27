(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const root = document.getElementById('mobileAppRoot');
  const state = { filter: 'all', sort: 'sales' };

  const FILTERS = [
    ['all', '全部'],
    ['trafficLowCvr', '高流量低CVR'],
    ['buyBoxLow', 'Buy Box偏低'],
    ['topSeller', 'Top Seller'],
    ['lowVelocity', '低动销']
  ];
  const SORTS = [
    ['sales', '销售额 ↓'],
    ['cvr', 'CVR ↓'],
    ['sessions', 'Sessions ↓'],
    ['buyBox', 'Buy Box ↓'],
    ['units', '销量 ↓']
  ];

  function rerender(focusSelector) {
    root?.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true, detail: { focusSelector } }));
  }

  root?.addEventListener('click', event => {
    const button = event.target.closest('[data-v51-products-filter]');
    if (!button || !root.contains(button)) return;
    state.filter = button.dataset.v51ProductsFilter || 'all';
    rerender(`[data-v51-products-filter="${state.filter}"]`);
  });

  root?.addEventListener('change', event => {
    const select = event.target.closest('[data-v51-products-sort]');
    if (!select || !root.contains(select)) return;
    state.sort = select.value || 'sales';
    rerender('[data-v51-products-sort]');
  });

  function filteredRows(products, totalCvr) {
    const withSessions = products.filter(row => row.sessions != null);
    const avgSessions = withSessions.length ? withSessions.reduce((sum, row) => sum + Number(row.sessions || 0), 0) / withSessions.length : 0;
    const topCount = Math.max(1, Math.ceil(products.length * .20));
    const topIds = new Set([...products].sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0)).slice(0, topCount).map(row => row.id));
    const filtered = products.filter(row => {
      if (state.filter === 'trafficLowCvr') return row.sessions != null && Number(row.sessions) >= avgSessions && row.cvr != null && totalCvr != null && Number(row.cvr) < Number(totalCvr);
      if (state.filter === 'buyBoxLow') return row.buyBox != null && Number(row.buyBox) < .90;
      if (state.filter === 'topSeller') return topIds.has(row.id);
      if (state.filter === 'lowVelocity') return Number(row.units || 0) <= 1;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (state.sort === 'cvr') return Number(b.cvr ?? -1) - Number(a.cvr ?? -1);
      if (state.sort === 'sessions') return Number(b.sessions ?? -1) - Number(a.sessions ?? -1);
      if (state.sort === 'buyBox') return Number(b.buyBox ?? -1) - Number(a.buyBox ?? -1);
      if (state.sort === 'units') return Number(b.units || 0) - Number(a.units || 0);
      return Number(b.sales || 0) - Number(a.sales || 0);
    });
  }

  function controlsMarkup(total, visible) {
    return `
      <section class="v51-ops-controls" aria-label="商品筛选与排序">
        <div class="v51-ops-control-head"><b>SKU 筛选</b><span>${visible} / ${total} 个 SKU</span></div>
        <div class="v51-filter-scroll" role="group" aria-label="商品筛选">
          ${FILTERS.map(([id, label]) => `<button type="button" data-v51-filter="${id}" data-v51-products-filter="${id}" class="${state.filter === id ? 'active' : ''}" aria-pressed="${state.filter === id ? 'true' : 'false'}">${label}</button>`).join('')}
        </div>
        <div class="v51-sort-row"><label for="v51ProductsSort">排序</label><select id="v51ProductsSort" data-v51-products-sort aria-label="商品排序">${SORTS.map(([id, label]) => `<option value="${id}"${state.sort === id ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="v51-result-note">“高流量低CVR”按当前 SKU 平均 Sessions 与本期整体 CVR 判断；筛选仅用于经营定位。</div>
      </section>`;
  }

  registry.products = ({ runtimeState, esc }) => {
    const model = selectors.productsModel(runtimeState);
    const filtered = filteredRows(model.products, model.totals.cvr);
    const rows = filtered.slice(0, 30);
    const summaryGrain = model.detailAvailable ? 'SKU 明细合计' : '所选期间汇总';
    const buyBoxRows = model.products.filter(row => row.buyBox != null);
    const avgBuyBox = buyBoxRows.length ? buyBoxRows.reduce((sum, row) => sum + Number(row.buyBox || 0), 0) / buyBoxRows.length : null;
    const cvrMeter = Math.max(0, Math.min(100, Number(model.totals.cvr || 0) / .20 * 100));
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>${model.products.length ? '当前筛选没有匹配 SKU' : '当前期间没有 SKU 明细'}</strong><span>${model.products.length ? '切换筛选条件查看其他商品。' : '商品明细使用完整月份数据；顶部汇总仍保留所选期间经营口径。'}</span></div>` : '';
    const cards = rows.map(row => {
      const lowCvr = row.cvr != null && model.totals.cvr != null && Number(row.cvr) < Number(model.totals.cvr);
      const lowBuyBox = row.buyBox != null && Number(row.buyBox) < .90;
      const risk = lowBuyBox || lowCvr ? 'warning' : 'positive';
      return `
      <button type="button" class="v5-record-card v5-risk-${risk}" data-record-type="product" data-record-id="${esc(row.id)}" aria-label="查看商品 ${esc(row.sku)} 详情">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.model || '商品')}</span><strong>${esc(row.sku)}</strong><small>${esc(row.asin)}</small></div>
          <div class="v5-record-primary"><span>销售额</span><strong>${fmt.compactMoney(row.sales)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>销量</span><strong>${fmt.number(row.units)}</strong></div>
          <div class="v5-record-metric"><span>Sessions</span><strong>${fmt.number(row.sessions)}</strong></div>
          <div class="v5-record-metric"><span>CVR</span><strong>${fmt.percent(row.cvr)}</strong></div>
          <div class="v5-record-metric"><span>Buy Box</span><strong>${fmt.percent(row.buyBox)}</strong></div>
        </div>
        <div class="v5-record-card-foot"><span class="v5-record-chip">${lowBuyBox ? 'Buy Box 需关注' : lowCvr ? 'CVR 低于整体' : Number(row.units || 0) <= 1 ? '低动销' : '表现正常'}</span><span>详情 ›</span></div>
      </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="products" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">商品运营</span><h1 id="v5MobileViewTitle">商品</h1><p>优先定位高流量低转化、Buy Box 异常和低动销 SKU</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(model.rangeLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-intel-efficiency" aria-label="商品核心指标">
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>销售额</span><small>${summaryGrain}</small></div><strong>${fmt.compactMoney(model.totals.sales)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>销量</span><small>Units</small></div><strong>${fmt.number(model.totals.units)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Sessions</span><small>流量</small></div><strong>${fmt.number(model.totals.sessions)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>CVR</span><small>转化率</small></div><strong>${fmt.percent(model.totals.cvr)}</strong><div class="v5-intel-meter" style="--v5-meter:${cvrMeter.toFixed(1)}%"><i></i></div></div>
        </section>
        <section class="v5-intel-ops" aria-label="商品状态">
          <div class="v5-intel-op"><span>SKU 数</span><strong>${fmt.number(model.products.length)}</strong><small>当前明细</small></div>
          <div class="v5-intel-op"><span>平均 Buy Box</span><strong>${fmt.percent(avgBuyBox)}</strong><small>${avgBuyBox == null ? '暂无数据' : 'SKU 均值'}</small></div>
          <div class="v5-intel-op"><span>最高销售</span><strong>${model.products[0] ? fmt.compactMoney(model.products[0].sales) : '—'}</strong><small>${model.products[0] ? esc(model.products[0].sku) : 'SKU'}</small></div>
          <div class="v5-intel-op"><span>数据粒度</span><strong>${model.detailAvailable ? 'SKU' : '汇总'}</strong><small>${model.detailAvailable ? '月级明细' : '期间合计'}</small></div>
        </section>
        ${controlsMarkup(model.products.length, filtered.length)}
        <section class="v5-core-section" aria-labelledby="v5ProductRecords">
          <div class="v5-core-section-head"><div><span>SKU 明细</span><h2 id="v5ProductRecords">商品表现</h2></div><small>${model.products.length ? `显示 ${rows.length} / ${filtered.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();