(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const root = document.getElementById('mobileAppRoot');
  const state = { filter: 'all', sort: 'sales' };

  const FILTER_LABELS = {
    all: '全部 SKU', trafficLowCvr: '高流量低CVR', buyBoxLow: 'Buy Box偏低', topSeller: 'Top Seller', lowVelocity: '低动销'
  };
  const SORT_LABELS = {
    sales: '销售额 ↓', cvr: 'CVR ↓', sessions: 'Sessions ↓', buyBox: 'Buy Box ↓', units: '销量 ↓'
  };

  function rerender(focusSelector) {
    root?.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true, detail: { focusSelector } }));
  }

  root?.addEventListener('v52:ops-apply', event => {
    if (event.detail?.route !== 'products') return;
    state.filter = event.detail.filter || 'all';
    state.sort = event.detail.sort || 'sales';
    rerender('[data-v52-ops-open="products"]');
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
    const filter = FILTER_LABELS[state.filter] || FILTER_LABELS.all;
    const sort = SORT_LABELS[state.sort] || SORT_LABELS.sales;
    return `
      <button type="button" class="v52-ops-trigger" data-v52-ops-open="products" data-v52-filter="${state.filter}" data-v52-sort="${state.sort}" aria-haspopup="dialog">
        <span><b>筛选 · 排序</b><small>${filter} · ${sort} · ${visible}/${total}</small></span><i aria-hidden="true">›</i>
      </button>`;
  }

  registry.products = ({ runtimeState, esc }) => {
    const model = selectors.productsModel(runtimeState);
    const filtered = filteredRows(model.products, model.totals.cvr);
    const rows = filtered.slice(0, 30);
    const buyBoxRows = model.products.filter(row => row.buyBox != null);
    const avgBuyBox = buyBoxRows.length ? buyBoxRows.reduce((sum, row) => sum + Number(row.buyBox || 0), 0) / buyBoxRows.length : null;
    const withSessions = model.products.filter(row => row.sessions != null);
    const avgSessions = withSessions.length ? withSessions.reduce((sum, row) => sum + Number(row.sessions || 0), 0) / withSessions.length : 0;
    const trafficLowCvr = model.products.filter(row => row.sessions != null && Number(row.sessions) >= avgSessions && row.cvr != null && model.totals.cvr != null && Number(row.cvr) < Number(model.totals.cvr)).length;
    const buyBoxLow = model.products.filter(row => row.buyBox != null && Number(row.buyBox) < .90).length;
    const lowVelocity = model.products.filter(row => Number(row.units || 0) <= 1).length;
    const issueCount = new Set(model.products.filter(row => (row.buyBox != null && Number(row.buyBox) < .90) || (row.sessions != null && Number(row.sessions) >= avgSessions && row.cvr != null && model.totals.cvr != null && Number(row.cvr) < Number(model.totals.cvr)) || Number(row.units || 0) <= 1).map(row => row.id)).size;

    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>${model.products.length ? '当前筛选没有匹配 SKU' : '当前期间没有 SKU 明细'}</strong><span>${model.products.length ? '调整筛选条件查看其他商品。' : '商品明细使用完整月份数据；顶部仍保留所选期间经营汇总。'}</span></div>` : '';

    const cards = rows.map(row => {
      const lowCvr = row.cvr != null && model.totals.cvr != null && Number(row.cvr) < Number(model.totals.cvr);
      const lowBuyBox = row.buyBox != null && Number(row.buyBox) < .90;
      const lowVelocityRow = Number(row.units || 0) <= 1;
      const risk = lowBuyBox || lowCvr || lowVelocityRow ? 'warning' : 'positive';
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
          <div class="v5-record-card-foot"><span class="v5-record-chip">${lowBuyBox ? 'Buy Box 需关注' : lowCvr ? '高流量低转化' : lowVelocityRow ? '低动销' : '表现正常'}</span><span>详情 ›</span></div>
        </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view v52-module-view" data-mobile-view="products" aria-labelledby="v5MobileViewTitle">
        <section class="v52-module-hero">
          <div class="v52-module-primary"><span>销售额</span><strong>${fmt.compactMoney(model.totals.sales)}</strong><small>${model.detailAvailable ? 'SKU 明细合计' : '所选期间汇总'}</small></div>
          <div class="v52-module-facts">
            <span><small>销量</small><b>${fmt.number(model.totals.units)}</b></span>
            <span><small>CVR</small><b>${fmt.percent(model.totals.cvr)}</b></span>
            <span><small>Sessions</small><b>${fmt.number(model.totals.sessions)}</b></span>
          </div>
        </section>

        <section class="v52-risk-strip" aria-label="商品待处理摘要">
          <div><span>需要处理</span><strong>${issueCount}</strong></div>
          <div class="v52-risk-facts"><span><b>${trafficLowCvr}</b> 高流量低CVR</span><span><b>${buyBoxLow}</b> Buy Box</span><span><b>${lowVelocity}</b> 低动销</span></div>
        </section>

        ${controlsMarkup(model.products.length, filtered.length)}

        <section class="v5-core-section" aria-labelledby="v5ProductRecords">
          <div class="v5-core-section-head"><div><span>SKU</span><h2 id="v5ProductRecords">商品表现</h2></div><small>${model.products.length ? `${rows.length}/${filtered.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
