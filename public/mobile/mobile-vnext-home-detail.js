(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  const runtime = window.YT_SHARED_RUNTIME;
  const selectors = window.YT_SHARED_SELECTORS;
  const secondary = window.YT_SHARED_SECONDARY_SELECTORS;
  if (!root || !runtime || !selectors || !secondary) return;

  function models() {
    const state = runtime.getState();
    return {
      ads: selectors.adsModel(state),
      products: selectors.productsModel(state),
      inventory: selectors.inventoryModel(state),
      charges: secondary.chargesModel(state),
      returns: secondary.returnsModel(state),
      data: secondary.dataModel(state)
    };
  }

  function titleOf(record) {
    return (record.querySelector('.vnext-dense-record-copy strong')?.textContent || '').trim();
  }

  function match(rows, id, title, fields) {
    const key = String(id || '').trim();
    if (key) {
      const byId = rows.find(row => String(row?.id ?? '') === key);
      if (byId) return byId;
    }
    const visible = String(title || '').trim();
    if (!visible) return null;
    return rows.find(row => fields.some(field => String(row?.[field] ?? '').trim() === visible)) || null;
  }

  function detailFromHomeRecord(type, id, title) {
    const m = models();
    if (type === 'campaign') {
      const item = match(m.ads.campaigns, id, title, ['campaign']);
      return item ? { type: 'campaign', title: item.campaign, item } : null;
    }
    if (type === 'product') {
      const item = match(m.products.products, id, title, ['sku', 'asin']);
      return item ? { type: 'product', title: item.sku === '—' ? item.asin : item.sku, item } : null;
    }
    if (type === 'inventory') {
      const item = match(m.inventory.inventory, id, title, ['sku', 'asin']);
      return item ? { type: 'inventory', title: item.sku === '—' ? item.asin : item.sku, item } : null;
    }
    if (type === 'charge') {
      const item = match(m.charges.rows, id, title, ['name']);
      return item ? { type: 'charge', title: item.name, item } : null;
    }
    if (type === 'return') {
      const item = match(m.returns.rows, id, title, ['reason']);
      return item ? { type: 'return', title: item.reason, item } : null;
    }
    if (type === 'quality') {
      const item = match(m.data.quality, id, title, ['name']);
      return item ? { type: 'quality', title: item.name, item } : null;
    }
    return null;
  }

  root.addEventListener('click', event => {
    const record = event.target.closest('.vnext-home-all-modules [data-density-detail-type]');
    if (!record) return;

    const detail = detailFromHomeRecord(
      record.dataset.densityDetailType,
      record.dataset.densityDetailId,
      titleOf(record)
    );
    if (!detail) return;

    event.preventDefault();
    root.dispatchEvent(new CustomEvent('vnext:navigate', {
      bubbles: true,
      detail: { detail }
    }));
  }, true);

  window.YT_MOBILE_VNEXT_HOME_DETAIL = Object.freeze({ ready: true });
})();
