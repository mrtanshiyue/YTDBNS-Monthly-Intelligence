(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

  registry.inventory = ({ runtimeState, esc }) => {
    const model = selectors.inventoryModel(runtimeState);
    const rows = model.inventory.slice(0, 30);
    const snapshotLabel = model.snapshotDate ? `库存快照 · ${model.snapshotDate}` : model.rangeLabel;
    const totalUnits = Number(model.totals.total || 0);
    const unsellableRatio = totalUnits ? Number(model.totals.unsellable || 0) / totalUnits : null;
    const riskSkus = model.inventory.filter(row => Number(row.unsellable || 0) > 0).length;
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>没有可用库存快照</strong><span>所选期间结束月份及之前没有找到真实库存快照；系统不会把未知库存显示为 0。</span></div>` : '';
    const cards = rows.map(row => {
      const total = Number(row.total || 0);
      const unsellableShare = total ? Number(row.unsellable || 0) / total : 0;
      const risk = Number(row.unsellable || 0) > 0 ? (unsellableShare > .10 ? 'critical' : 'warning') : 'positive';
      return `
      <button type="button" class="v5-record-card v5-risk-${risk} ${row.unsellable > 0 ? 'v5-has-meter' : ''}" style="--v5-meter:${clamp(unsellableShare * 100).toFixed(1)}%" data-record-type="inventory" data-record-id="${esc(row.id)}" aria-label="查看库存 ${esc(row.sku)} 详情">
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
        <div class="v5-record-card-foot"><span class="v5-record-chip">${row.unsellable > 0 ? `不可售 ${fmt.percent(unsellableShare)}` : '库存正常'}</span><span>详情 ›</span></div>
      </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="inventory" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">INVENTORY INTELLIGENCE</span><h1 id="v5MobileViewTitle">库存</h1><p>资金、可售、在途与不可售风险同时扫描</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(snapshotLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-intel-efficiency" aria-label="库存核心指标">
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Inventory Value</span><small>Capital</small></div><strong>${fmt.compactMoney(model.totals.inventoryValue)}</strong></div>
          <div class="v5-intel-metric positive"><div class="v5-intel-metric-head"><span>Fulfillable</span><small>Sellable</small></div><strong>${fmt.number(model.totals.fulfillable)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>Inbound</span><small>Incoming</small></div><strong>${fmt.number(model.totals.inbound)}</strong></div>
          <div class="v5-intel-metric ${unsellableRatio != null && unsellableRatio > .10 ? 'critical' : unsellableRatio != null && unsellableRatio > 0 ? 'warning' : 'positive'}"><div class="v5-intel-metric-head"><span>Unsellable</span><small>${fmt.percent(unsellableRatio)}</small></div><strong>${fmt.number(model.totals.unsellable)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp(Number(unsellableRatio || 0) * 100).toFixed(1)}%"><i></i></div></div>
        </section>
        <section class="v5-intel-ops" aria-label="库存状态">
          <div class="v5-intel-op"><span>Total Units</span><strong>${fmt.number(model.totals.total)}</strong><small>Snapshot</small></div>
          <div class="v5-intel-op"><span>风险 SKU</span><strong>${fmt.number(riskSkus)}</strong><small>Unsellable &gt; 0</small></div>
          <div class="v5-intel-op"><span>SKU</span><strong>${fmt.number(model.inventory.length)}</strong><small>Records</small></div>
          <div class="v5-intel-op"><span>Snapshot</span><strong>${model.snapshotDate ? esc(model.snapshotDate.slice(5)) : '—'}</strong><small>Recent valid</small></div>
        </section>
        <section class="v5-core-section" aria-labelledby="v5InventoryRecords">
          <div class="v5-core-section-head"><div><span>SKU INVENTORY MATRIX</span><h2 id="v5InventoryRecords">库存记录</h2></div><small>${model.inventory.length ? `Value Top ${rows.length}` : '快照明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();
