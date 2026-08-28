(() => {
  'use strict';

  const previewAllowed = () => location.protocol === 'file:' || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  if (previewAllowed()) {
    window.YT_DATA_TRUTH = Object.freeze({ preview: true, demoSuppressed: false });
    return;
  }

  const source = window.YT_DEMO || {};
  const currentMonth = new Date().toISOString().slice(0, 7);

  const emptyClone = (value, path = '') => {
    if (Array.isArray(value)) return [];
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        out[key] = emptyClone(child, path ? `${path}.${key}` : key);
      }
      return out;
    }
    if (typeof value === 'number') return 0;
    if (typeof value === 'boolean') return false;
    if (typeof value === 'string') {
      if (path.endsWith('.currency')) return 'USD';
      if (path.endsWith('.timezone')) return source.store?.timezone || 'America/Los_Angeles';
      return '';
    }
    return null;
  };

  const sanitized = emptyClone(source);
  sanitized.store = {
    ...(sanitized.store || {}),
    id: '',
    name: '',
    currency: 'USD',
    timezone: source.store?.timezone || 'America/Los_Angeles'
  };
  sanitized.monthly = [];
  sanitized.dailyTraffic = [];
  sanitized.imports = [];
  sanitized.current = sanitized.current && typeof sanitized.current === 'object' ? sanitized.current : {};
  sanitized.current.meta = {
    ...(sanitized.current.meta || {}),
    period: currentMonth,
    status: 'EMPTY'
  };

  for (const key of ['models', 'campaigns', 'skus', 'parents', 'inventoryRows', 'inventoryModels', 'checks', 'sources', 'chargeNames']) {
    sanitized.current[key] = [];
  }
  sanitized.current.overview = sanitized.current.overview || {};
  sanitized.current.finance = sanitized.current.finance || {};
  sanitized.current.adsTotal = sanitized.current.adsTotal || {};
  sanitized.current.quality = sanitized.current.quality || {};
  sanitized.current.returns = {
    ...(sanitized.current.returns || {}),
    reasons: [],
    models: [],
    sellable: 0,
    damaged: 0
  };

  window.YT_DEMO = sanitized;
  window.YT_DATA_TRUTH = Object.freeze({ preview: false, demoSuppressed: true });
  document.documentElement.dataset.dataTruth = 'live-only';
})();
