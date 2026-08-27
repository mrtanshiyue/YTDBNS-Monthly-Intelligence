(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const root = document.getElementById('mobileAppRoot');
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
  const state = { filter: 'all', sort: 'inventoryValue' };

  const FILTERS = [
    ['all', '全部'],
    ['unsellable', '不可售'],
    ['lowStock', '低库存 ≤20'],
    ['highCapital', '高资金占用'],
    ['inbound', '有在途'],
    ['normal', '正常']
  ];
  const SORTS = [
    ['inventoryValue', '库存资金 ↓'],
    ['unsellable', '不可售 ↓'],
    ['fulfillable', '可售库存 ↓'],
    ['inbound', '在途 ↓']
  ];

  function rerender(focusSelector) {
    root?.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true, detail: { focusSelector } }));
  }

  root?.addEventListener('click', event => {
    const button = event.target.closest('[data-v51-inventory-filter]');
    if (!button || !root.contains(button)) return;
    state.filter = button.dataset.v51InventoryFilter || 'all';
    rerender(`[data-v51-inventory-filter="${state.filter}"]`);
  });

  root?.addEventListener('change', event => {
    const select = event.target.closest('[data-v51-inventory-sort]');
    if (!select || !root.contains(select)) return;
    state.sort = select.value || 'inventoryValue';
    rerender('[data-v51-inventory-sort]');
  });

  function filteredRows(inventory) {
    const avgValue = inventory.length
      ? inventory.reduce((sum, row) => sum + Number(row.inventoryValue || 0), 0) / inventory.length
      : 0;
    const filtered = inventory.filter(row => {
      if (state.filter === 'unsellable') return Number(row.unsellable || 0) > 0;
      if (state.filter === 'lowStock') return Number(row.fulfillable || 0) <= 20;
      if (state.filter === 'highCapital') return Number(row.inventoryValue || 0) >= avgValue && Number(row.inventoryValue || 0) > 0;
      if (state.filter === 'inbound') return Number(row.inbound || 0) > 0;
      if (state.filter === 'normal') return Number(row.unsellable || 0) === 0 && Number(row.fulfillable || 0) > 20;
      return true;
    });
    return [...filtered].sort((a, b) => Number(b[state.sort] || 0) - Number(a[state.sort] || 0));
  }

  function controlsMarkup(total, visible) {
    return `
      <section class="v51-ops-controls" aria-label="库存筛选与排序">
        <div class="v51-ops-control-head"><b>库存风险筛选</b><span>${visible} / ${total} 个 SKU</span></div>
        <div class="v51-filter-scroll" role="group" aria-label="库存筛选">
          ${FILTERS.map(([id, label]) => `<button type="button" data-v51-filter="${id}" data-v51-inventory-filter="${id}" class="${state.filter === id ? 'active' : ''}" aria-pressed="${state.filter === id ? 'true' : 'false'}">${label}</button>`).join('')}
        </div>
        <div class="v51-sort-row"><label for="v51InventorySort">排序</label><select id="v51InventorySort" data-v51-inventory-sort aria-label="库存排序">${SORTS.map(([id, label]) => `<option value="${id}"${state.sort === id ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="v51-result-note">“高资金占用”按当前库存 SKU 平均库存资金判断；低库存阈值为可售 ≤20 件。</div>
      </section>`;
  }

  registry.inventory = ({ runtimeState, esc }) => {
    const model = selectors.inventoryModel(runtimeState);
    const filtered = filteredRows(model.inventory);
    const rows = filtered.slice(0, 30);
    const snapshotLabel = model.snapshotDate ? `库存快照 · ${model.snapshotDate}` : model.rangeLabel;
    const totalUnits = Number(model.totals.total || 0);
    const unsellableRatio = totalUnits ? Number(model.totals.unsellable || 0) / totalUnits : null;
    const riskSkus = model.inventory.filter(row => Number(row.unsellable || 0) > 0).length;
    const lowStockSkus = model.inventory.filter(row => Number(row.fulfillable || 0) <= 20).length;
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>${model.inventory.length ? '当前筛选没有匹配库存' : '没有可用库存快照'}</strong><span>${model.inventory.length ? '切换筛选条件查看其他库存记录。' : '所选期间结束月份及之前没有找到真实库存快照；系统不会把未知库存显示为 0。'}</span></div>` : '';
    const cards = rows.map(row => {
      const total = Number(row.total || 0);
      const unsellableShare = total ? Number(row.unsellable || 0) / total : 0;
      const isLow = Number(row.fulfillable || 0) <= 20;
      const risk = Number(row.unsellable || 0) > 0 ? (unsellableShare > .10 ? 'critical' : 'warning') : isLow ? 'warning' : 'positive';
      return `
      <button type="button" class="v5-record-card v5-risk-${risk} ${row.unsellable > 0 ? 'v5-has-meter' : ''}" style="--v5-meter:${clamp(unsellableShare * 100).toFixed(1)}%" data-record-type="inventory" data-record-id="${esc(row.id)}" aria-label="查看库存 ${esc(row.sku)} 详情">
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
        <div class="v5-record-card-foot"><span class="v5-record-chip">${row.unsellable > 0 ? `不可售 ${fmt.percent(unsellableShare)}` : isLow ? '低库存 · 可售≤20' : row.inbound > 0 ? '有在途库存' : '库存正常'}</span><span>详情 ›</span></div>
      </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="inventory" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">库存运营</span><h1 id="v5MobileViewTitle">库存</h1><p>优先看不可售、低库存和高资金占用，再看库存规模</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(snapshotLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-intel-efficiency" aria-label="库存核心指标">
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>库存资金</span><small>资金占用</small></div><strong>${fmt.compactMoney(model.totals.inventoryValue)}</strong></div>
          <div class="v5-intel-metric positive"><div class="v5-intel-metric-head"><span>可售库存</span><small>Fulfillable</small></div><strong>${fmt.number(model.totals.fulfillable)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>在途</span><small>Inbound</small></div><strong>${fmt.number(model.totals.inbound)}</strong></div>
          <div class="v5-intel-metric ${unsellableRatio != null && unsellableRatio > .10 ? 'critical' : unsellableRatio != null && unsellableRatio > 0 ? 'warning' : 'positive'}"><div class="v5-intel-metric-head"><span>不可售</span><small>${fmt.percent(unsellableRatio)}</small></div><strong>${fmt.number(model.totals.unsellable)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp(Number(unsellableRatio || 0) * 100).toFixed(1)}%"><i></i></div></div>
        </section>
        <section class="v5-intel-ops" aria-label="库存状态">
          <div class="v5-intel-op"><span>总库存</span><strong>${fmt.number(model.totals.total)}</strong><small>快照总量</small></div>
          <div class="v5-intel-op"><span>不可售 SKU</span><strong>${fmt.number(riskSkus)}</strong><small>不可售 &gt;0</small></div>
          <div class="v5-intel-op"><span>低库存 SKU</span><strong>${fmt.number(lowStockSkus)}</strong><small>可售 ≤20</small></div>
          <div class="v5-intel-op"><span>快照日期</span><strong>${model.snapshotDate ? esc(model.snapshotDate.slice(5)) : '—'}</strong><small>最近有效</small></div>
        </section>
        ${controlsMarkup(model.inventory.length, filtered.length)}
        <section class="v5-core-section" aria-labelledby="v5InventoryRecords">
          <div class="v5-core-section-head"><div><span>SKU 库存明细</span><h2 id="v5InventoryRecords">库存记录</h2></div><small>${model.inventory.length ? `显示 ${rows.length} / ${filtered.length}` : '快照明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();