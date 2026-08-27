(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.inventory = ({ runtimeState, esc }) => {
    const model = selectors.inventoryModel(runtimeState);
    const rows = model.inventory.slice(0, 30);
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>当前月份没有库存快照</strong><span>库存使用最近有效快照，不按日期区间累加。</span></div>` : '';
    const cards = rows.map(row => `
      <button type="button" class="v5-record-card" data-record-type="inventory" data-record-id="${esc(row.id)}" aria-label="查看库存 ${esc(row.sku)} 详情">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.model || 'INVENTORY')}</span><strong>${esc(row.sku)}</strong><small>${esc(row.asin)}</small></div>
          <div class="v5-record-primary"><span>Value</span><strong>${fmt.compactMoney(row.inventoryValue)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>Fulfillable</span><strong>${fmt.number(row.fulfillable)}</strong></div>
          <div class="v5-record-metric"><span>Inbound</span><strong>${fmt.number(row.inbound)}</strong></div>
          <div class="v5-record-metric"><span>Total</span><strong>${fmt.number(row.total)}</strong></div>
          <div class="v5-record-metric"><span>Unsellable</span><strong>${fmt.number(row.unsellable)}</strong></div>
        </div>
        <div class="v5-record-card-foot"><span class="v5-record-chip">${row.unsellable > 0 ? '含不可售库存' : '库存快照'}</span><span>详情 ›</span></div>
      </button>`).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="inventory" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">INVENTORY</span><h1 id="v5MobileViewTitle">库存</h1><p>优先看资金占用、可售与不可售风险</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(model.snapshotDate || model.rangeLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-core-stat-grid" aria-label="库存核心指标">
          <div class="v5-core-stat"><span>库存资金</span><strong>${fmt.compactMoney(model.totals.inventoryValue)}</strong><small>采购成本资金占用</small></div>
          <div class="v5-core-stat"><span>可售库存</span><strong>${fmt.number(model.totals.fulfillable)}</strong><small>Fulfillable</small></div>
          <div class="v5-core-stat"><span>Inbound</span><strong>${fmt.number(model.totals.inbound)}</strong><small>在途库存</small></div>
          <div class="v5-core-stat"><span>不可售</span><strong>${fmt.number(model.totals.unsellable)}</strong><small>Unsellable</small></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5InventoryRecords">
          <div class="v5-core-section-head"><div><span>SKU INVENTORY</span><h2 id="v5InventoryRecords">库存记录</h2></div><small>${model.inventory.length ? `按资金 Top ${rows.length}` : '快照明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
