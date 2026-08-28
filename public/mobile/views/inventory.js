(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const root = document.getElementById('mobileAppRoot');
  const state = { filter: 'all', sort: 'inventoryValue' };

  const FILTER_LABELS = {
    all: '全部 SKU', unsellable: '不可售', lowStock: '低库存 ≤20', highCapital: '高资金占用', inbound: '有在途', normal: '正常'
  };
  const SORT_LABELS = {
    inventoryValue: '库存资金 ↓', unsellable: '不可售 ↓', fulfillable: '可售库存 ↓', inbound: '在途 ↓'
  };

  function rerender(focusSelector) {
    root?.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true, detail: { focusSelector } }));
  }

  root?.addEventListener('v52:ops-apply', event => {
    if (event.detail?.route !== 'inventory') return;
    state.filter = event.detail.filter || 'all';
    state.sort = event.detail.sort || 'inventoryValue';
    rerender('[data-v52-ops-open="inventory"]');
  });

  function filteredRows(inventory) {
    const avgValue = inventory.length ? inventory.reduce((sum, row) => sum + Number(row.inventoryValue || 0), 0) / inventory.length : 0;
    const filtered = inventory.filter(row => {
      if (state.filter === 'unsellable') return row.unsellable != null && Number(row.unsellable) > 0;
      if (state.filter === 'lowStock') return row.fulfillable != null && Number(row.fulfillable) <= 20;
      if (state.filter === 'highCapital') return row.inventoryValue != null && Number(row.inventoryValue) >= avgValue && Number(row.inventoryValue) > 0;
      if (state.filter === 'inbound') return row.inbound != null && Number(row.inbound) > 0;
      if (state.filter === 'normal') return row.unsellable != null && row.fulfillable != null && Number(row.unsellable) === 0 && Number(row.fulfillable) > 20;
      return true;
    });
    return [...filtered].sort((a, b) => Number(b[state.sort] || 0) - Number(a[state.sort] || 0));
  }

  function controlsMarkup(total, visible) {
    const filter = FILTER_LABELS[state.filter] || FILTER_LABELS.all;
    const sort = SORT_LABELS[state.sort] || SORT_LABELS.inventoryValue;
    return `
      <button type="button" class="v52-ops-trigger" data-v52-ops-open="inventory" data-v52-filter="${state.filter}" data-v52-sort="${state.sort}" aria-haspopup="dialog">
        <span><b>筛选 · 排序</b><small>${filter} · ${sort} · ${visible}/${total}</small></span><i aria-hidden="true">›</i>
      </button>`;
  }

  registry.inventory = ({ runtimeState, esc }) => {
    const model = selectors.inventoryModel(runtimeState);
    const filtered = filteredRows(model.inventory);
    const rows = filtered.slice(0, 30);
    const riskSkus = model.inventory.filter(row => row.unsellable != null && Number(row.unsellable) > 0).length;
    const lowStockSkus = model.inventory.filter(row => row.fulfillable != null && Number(row.fulfillable) <= 20).length;
    const valuedRows = model.inventory.filter(row => row.inventoryValue != null);
    const avgValue = valuedRows.length ? valuedRows.reduce((sum, row) => sum + Number(row.inventoryValue || 0), 0) / valuedRows.length : 0;
    const highCapitalSkus = valuedRows.filter(row => Number(row.inventoryValue) >= avgValue && Number(row.inventoryValue) > 0).length;
    const issueCount = new Set(model.inventory.filter(row =>
      (row.unsellable != null && Number(row.unsellable) > 0) ||
      (row.fulfillable != null && Number(row.fulfillable) <= 20) ||
      (row.inventoryValue != null && Number(row.inventoryValue) >= avgValue && Number(row.inventoryValue) > 0)
    ).map(row => row.id)).size;

    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>${model.inventory.length ? '当前筛选没有匹配库存' : '没有可用库存快照'}</strong><span>${model.inventory.length ? '调整筛选条件查看其他库存记录。' : '所选期间结束月份及之前没有找到真实库存快照；未知库存不会显示为 0。'}</span></div>` : '';

    const cards = rows.map(row => {
      const total = row.total == null ? null : Number(row.total);
      const unsellable = row.unsellable == null ? null : Number(row.unsellable);
      const unsellableShare = total && unsellable != null ? unsellable / total : null;
      const isLow = row.fulfillable != null && Number(row.fulfillable) <= 20;
      const risk = unsellable != null && unsellable > 0 ? (unsellableShare != null && unsellableShare > .10 ? 'critical' : 'warning') : isLow ? 'warning' : 'positive';
      return `
        <button type="button" class="v5-record-card v5-risk-${risk}" data-record-type="inventory" data-record-id="${esc(row.id)}" aria-label="查看库存 ${esc(row.sku)} 详情">
          <div class="v5-record-card-head">
            <div class="v5-record-card-title"><span>${esc(row.model || '库存 SKU')}</span><strong>${esc(row.sku)}</strong><small>${esc(row.asin)}</small></div>
            <div class="v5-record-primary"><span>库存资金</span><strong>${fmt.compactMoney(row.inventoryValue)}</strong></div>
          </div>
          <div class="v5-record-metrics">
            <div class="v5-record-metric"><span>可售库存</span><strong>${fmt.number(row.fulfillable)}</strong></div>
            <div class="v5-record-metric"><span>在途</span><strong>${fmt.number(row.inbound)}</strong></div>
            <div class="v5-record-metric"><span>总库存</span><strong>${fmt.number(row.total)}</strong></div>
            <div class="v5-record-metric"><span>不可售</span><strong>${fmt.number(row.unsellable)}</strong></div>
          </div>
          <div class="v5-record-card-foot"><span class="v5-record-chip">${unsellable != null && unsellable > 0 ? `不可售 ${fmt.percent(unsellableShare)}` : isLow ? '低库存 · 可售≤20' : row.inbound != null && Number(row.inbound) > 0 ? '有在途库存' : '库存正常'}</span><span>详情 ›</span></div>
        </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view v52-module-view" data-mobile-view="inventory" aria-labelledby="v5MobileViewTitle">
        <section class="v52-module-hero">
          <div class="v52-module-primary"><span>库存资金</span><strong>${fmt.compactMoney(model.totals.inventoryValue)}</strong><small>${model.snapshotDate ? `快照 ${esc(model.snapshotDate)}` : '最近有效快照'}</small></div>
          <div class="v52-module-facts">
            <span><small>可售</small><b>${fmt.number(model.totals.fulfillable)}</b></span>
            <span><small>在途</small><b>${fmt.number(model.totals.inbound)}</b></span>
            <span><small>不可售</small><b>${fmt.number(model.totals.unsellable)}</b></span>
          </div>
        </section>

        <section class="v52-risk-strip" aria-label="库存待处理摘要">
          <div><span>需要处理</span><strong>${issueCount}</strong></div>
          <div class="v52-risk-facts"><span><b>${riskSkus}</b> 不可售</span><span><b>${lowStockSkus}</b> 低库存</span><span><b>${highCapitalSkus}</b> 高资金占用</span></div>
        </section>

        ${controlsMarkup(model.inventory.length, filtered.length)}

        <section class="v5-core-section" aria-labelledby="v5InventoryRecords">
          <div class="v5-core-section-head"><div><span>SKU</span><h2 id="v5InventoryRecords">库存记录</h2></div><small>${model.inventory.length ? `${rows.length}/${filtered.length}` : '快照明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
