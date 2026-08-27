(() => {
  'use strict';

  const mobileRoot = document.getElementById('mobileAppRoot');
  const runtime = window.YT_SHARED_RUNTIME;
  if (!mobileRoot || !runtime) return;

  const overlayRoot = document.createElement('div');
  overlayRoot.id = 'v5MobileOverlayRoot';
  overlayRoot.className = 'v5-mobile-overlay-root';
  overlayRoot.setAttribute('aria-live', 'polite');
  document.body.appendChild(overlayRoot);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const text = value => String(value ?? '').trim();
  const pick = (...values) => values.find(value => value != null && String(value).trim() !== '');
  const MODULES = [
    ['overview', '首页', '经营摘要、核心 KPI、异常提醒与趋势'],
    ['ads', '广告', 'Campaign、广告花费、ACOS、CTR、CVR'],
    ['products', '商品', 'SKU、ASIN、销售、销量、Sessions、CVR'],
    ['inventory', '库存', 'Fulfillable、Inbound、库存资金、不可售'],
    ['finance', '利润', '贡献利润、利润率与结算'],
    ['charges', '扣费', 'Amazon 扣费项目与费用结构'],
    ['returns', '退货', '退货原因、退款与退货率'],
    ['history', '历史', '月度经营趋势与历史数据'],
    ['data', '数据', '数据质量、导入状态与数据源']
  ];

  let overlay = null;
  let lastFocus = null;
  let searchItems = [];

  function lock(open) {
    document.body.classList.toggle('v5-mobile-overlay-open', open);
  }

  function closeOverlay({ restoreFocus = true } = {}) {
    if (!overlay) return;
    overlay = null;
    overlayRoot.innerHTML = '';
    lock(false);
    if (restoreFocus && lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function mount(kind, markup, focusSelector) {
    closeOverlay({ restoreFocus: false });
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay = kind;
    overlayRoot.innerHTML = markup;
    lock(true);
    requestAnimationFrame(() => overlayRoot.querySelector(focusSelector)?.focus({ preventScroll: true }));
  }

  function monthEnd(month) {
    const [year, value] = month.split('-').map(Number);
    return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  }
  function monthStart(month) { return `${month}-01`; }
  function addDays(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function latestMonth(state) {
    return state.periods?.map(item => typeof item === 'string' ? item : item.month).find(Boolean)
      || window.YT_DEMO?.current?.meta?.period
      || window.YT_DEMO?.monthly?.at(-1)?.month
      || null;
  }
  function quickRanges(state) {
    const latest = latestMonth(state);
    if (!latest) return {};
    const end = monthEnd(latest);
    const d = new Date(`${monthStart(latest)}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const previous = d.toISOString().slice(0, 7);
    return {
      current: [monthStart(latest), end],
      previous: [monthStart(previous), monthEnd(previous)],
      '30': [addDays(end, -29), end],
      '90': [addDays(end, -89), end],
      ytd: [`${latest.slice(0, 4)}-01-01`, end]
    };
  }
  function activeQuick(state) {
    const ranges = quickRanges(state);
    return Object.entries(ranges).find(([, [from, to]]) => from === state.from && to === state.to)?.[0] || null;
  }

  function openPeriod() {
    const state = runtime.getState();
    const active = activeQuick(state);
    const options = [
      ['current', '本月', '当前最新完整月份'],
      ['previous', '上月', '上一个完整月份'],
      ['30', '最近 30 天', '截止最新数据日'],
      ['90', '最近 90 天', '观察中期趋势'],
      ['ytd', '今年', '年初至最新数据日']
    ];
    mount('period', `
      <div class="v5-interaction-backdrop" data-v5-close-overlay="backdrop">
        <section class="v5-interaction-sheet" role="dialog" aria-modal="true" aria-labelledby="v5PeriodTitle" data-v5-surface>
          <div class="v5-interaction-handle" aria-hidden="true"></div>
          <div class="v5-interaction-head">
            <div><span>PERIOD</span><h2 id="v5PeriodTitle">选择期间</h2></div>
            <button class="v5-interaction-close" type="button" data-v5-close-overlay aria-label="关闭期间选择">×</button>
          </div>
          <div class="v5-period-options">
            ${options.map(([key, label, note]) => `
              <button class="v5-period-option ${active === key ? 'active' : ''}" type="button" data-v5-quick="${key}">
                <span><b>${label}</b><small>${note}</small></span><i aria-hidden="true">${active === key ? '✓' : '›'}</i>
              </button>`).join('')}
          </div>
          <div class="v5-period-divider"></div>
          <div class="v5-period-custom">
            <span>CUSTOM RANGE</span>
            <div class="v5-period-date-grid">
              <label>开始日期<input type="date" data-v5-date-from value="${esc(state.from || '')}"></label>
              <label>结束日期<input type="date" data-v5-date-to value="${esc(state.to || '')}"></label>
            </div>
            <button class="v5-period-apply" type="button" data-v5-apply-custom>应用自定义区间</button>
            <p class="v5-period-note" data-v5-period-note>财务和广告可按日聚合；Sessions / CVR 保留真实月级口径，不制造日级假精度。</p>
          </div>
        </section>
      </div>`, '[data-v5-close-overlay]');
  }

  function normalizeRecord(route, kind, title, subtitle, meta, detail) {
    const haystack = [title, subtitle, meta, route, kind, ...Object.values(detail || {})].join(' ').toLowerCase();
    return { route, kind, title: text(title) || '未命名记录', subtitle: text(subtitle), meta: text(meta), detail: detail || {}, haystack };
  }

  function buildSearchIndex() {
    const state = runtime.getState();
    const detail = state.monthDetail || {};
    const rows = MODULES.map(([route, title, subtitle]) => normalizeRecord(route, 'module', title, subtitle, 'MODULE', {}));

    const campaigns = detail.campaigns || window.YT_DEMO?.current?.campaigns || [];
    campaigns.slice(0, 120).forEach(row => rows.push(normalizeRecord(
      'ads', 'campaign', pick(row.campaign, row.name, row.campaign_name), pick(row.portfolio, '广告活动'), 'CAMPAIGN', {
        Spend: pick(row.spend, row.ad_spend), Sales: pick(row.sales, row.ad_sales), ACOS: row.acos, Orders: row.orders, CTR: row.ctr, CVR: row.cvr
      }
    )));

    const products = detail.products || window.YT_DEMO?.current?.skus || [];
    products.slice(0, 160).forEach(row => rows.push(normalizeRecord(
      'products', 'product', pick(row.sku, row.asin), pick(row.asin, row.model, '商品'), 'SKU / ASIN', {
        Sales: row.sales, Units: row.units, Sessions: row.sessions, CVR: row.cvr, 'Buy Box': pick(row.buy_box, row.buyBox)
      }
    )));

    const inventory = detail.inventory || window.YT_DEMO?.current?.inventoryRows || [];
    inventory.slice(0, 160).forEach(row => rows.push(normalizeRecord(
      'inventory', 'inventory', pick(row.sku, row.asin), pick(row.asin, row.model, '库存'), 'INVENTORY', {
        Fulfillable: row.fulfillable, Inbound: row.inbound, Total: row.total, 'Inventory Value': pick(row.inventory_value, row.inventoryValue), Unsellable: row.unsellable
      }
    )));

    const charges = state.charges?.rows || detail.charges || window.YT_DEMO?.current?.chargeNames || [];
    charges.slice(0, 100).forEach(row => rows.push(normalizeRecord(
      'charges', 'charge', pick(row.name, row.charge_name), pick(row.category, 'Amazon 扣费'), 'CHARGE', {
        Debit: pick(row.debit, row.gross_debit), Credit: pick(row.credit, row.credits), Amount: pick(row.amount, row.net_cost), Count: pick(row.count, row.row_count)
      }
    )));
    return rows;
  }

  function searchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) return searchItems.filter(item => item.kind === 'module');
    const tokens = q.split(/\s+/).filter(Boolean);
    return searchItems.filter(item => tokens.every(token => item.haystack.includes(token))).slice(0, 60);
  }

  function renderSearchResults(query) {
    const host = overlayRoot.querySelector('[data-v5-search-results]');
    const summary = overlayRoot.querySelector('[data-v5-search-summary]');
    if (!host || !summary) return;
    const results = searchResults(query);
    summary.textContent = query.trim() ? `找到 ${results.length} 个结果` : '页面、指标与当前月份经营记录';
    host.innerHTML = results.length ? results.map((item, index) => `
      <button class="v5-search-result" type="button" data-v5-search-index="${index}">
        <span><b>${esc(item.title)}</b><small>${esc(item.subtitle || item.route)}</small></span><em>${esc(item.meta || item.kind)}</em>
      </button>`).join('') : `
      <div class="v5-search-empty"><strong>没有匹配结果</strong><span>可以搜索页面名称、SKU、ASIN、Campaign 或扣费项目。</span></div>`;
    host._v5Results = results;
  }

  function openSearch() {
    searchItems = buildSearchIndex();
    mount('search', `
      <section class="v5-fullscreen" role="dialog" aria-modal="true" aria-labelledby="v5SearchTitle">
        <header class="v5-fullscreen-head">
          <button class="v5-fullscreen-back" type="button" data-v5-close-overlay aria-label="返回">‹</button>
          <div class="v5-fullscreen-title"><span>SEARCH</span><h2 id="v5SearchTitle">全局搜索</h2></div>
        </header>
        <div class="v5-fullscreen-body">
          <label class="v5-search-field"><span aria-hidden="true">⌕</span><input type="search" inputmode="search" autocomplete="off" enterkeyhint="search" data-v5-search-input placeholder="搜索页面、SKU、ASIN、Campaign…"></label>
          <p class="v5-search-summary" data-v5-search-summary></p>
          <div class="v5-search-results" data-v5-search-results></div>
        </div>
      </section>`, '[data-v5-search-input]');
    renderSearchResults('');
  }

  function formatDetailValue(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (Math.abs(value) <= 1 && value !== 0) return `${(value * 100).toFixed(1)}%`;
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return String(value);
  }

  function openDetail(record) {
    const metrics = Object.entries(record.detail || {}).filter(([, value]) => value != null && value !== '');
    mount('detail', `
      <section class="v5-fullscreen" role="dialog" aria-modal="true" aria-labelledby="v5DetailTitle">
        <header class="v5-fullscreen-head">
          <button class="v5-fullscreen-back" type="button" data-v5-close-overlay aria-label="返回">‹</button>
          <div class="v5-fullscreen-title"><span>${esc((record.meta || record.kind || 'DETAIL').toUpperCase())}</span><h2 id="v5DetailTitle">详情</h2></div>
        </header>
        <div class="v5-fullscreen-body">
          <section class="v5-detail-hero">
            <span>${esc(record.meta || 'DETAIL')}</span>
            <strong>${esc(record.title)}</strong>
            <small>${esc(record.subtitle || '当前期间经营记录')}</small>
          </section>
          <section class="v5-detail-grid" aria-label="详情指标">
            ${metrics.length ? metrics.map(([label, value]) => `<div class="v5-detail-metric"><span>${esc(label)}</span><strong>${esc(formatDetailValue(value))}</strong></div>`).join('') : '<div class="v5-detail-metric"><span>状态</span><strong>暂无更多字段</strong></div>'}
          </section>
          <p class="v5-detail-footnote">这是 V5.0 Mobile Full-screen Detail，不使用 Desktop Detail Drawer。当前为只读查看，不触发任何数据写入。</p>
        </div>
      </section>`, '[data-v5-close-overlay]');
  }

  function detailFromCard(card) {
    const title = card.querySelector('.v5-record-card-title strong')?.textContent || '详情';
    const subtitleParts = [
      card.querySelector('.v5-record-card-title span')?.textContent,
      card.querySelector('.v5-record-card-title small')?.textContent
    ].filter(Boolean);
    const detail = {};
    const primary = card.querySelector('.v5-record-primary');
    if (primary) detail[text(primary.querySelector('span')?.textContent) || 'Value'] = text(primary.querySelector('strong')?.textContent);
    card.querySelectorAll('.v5-record-metric').forEach(metric => {
      const label = text(metric.querySelector('span')?.textContent);
      if (label) detail[label] = text(metric.querySelector('strong')?.textContent);
    });
    const type = card.dataset.recordType || 'record';
    const labels = { campaign: 'CAMPAIGN', product: 'SKU / ASIN', inventory: 'INVENTORY', charge: 'CHARGE' };
    return normalizeRecord('', type, title, subtitleParts.join(' · '), labels[type] || 'DETAIL', detail);
  }

  mobileRoot.addEventListener('v5:period-request', openPeriod);
  mobileRoot.addEventListener('v5:search-request', openSearch);
  mobileRoot.addEventListener('click', event => {
    const card = event.target.closest('.v5-record-card');
    if (card) openDetail(detailFromCard(card));
  });

  overlayRoot.addEventListener('input', event => {
    if (event.target.matches('[data-v5-search-input]')) renderSearchResults(event.target.value);
  });

  overlayRoot.addEventListener('click', async event => {
    if (event.target.matches('[data-v5-close-overlay="backdrop"]')) {
      closeOverlay();
      return;
    }
    if (event.target.closest('[data-v5-close-overlay]')) {
      closeOverlay();
      return;
    }
    const quick = event.target.closest('[data-v5-quick]')?.dataset.v5Quick;
    if (quick) {
      const button = event.target.closest('[data-v5-quick]');
      button.disabled = true;
      try { await runtime.setQuickRange(quick); closeOverlay(); }
      catch (error) { button.disabled = false; overlayRoot.querySelector('[data-v5-period-note]').textContent = error?.message || '期间切换失败'; }
      return;
    }
    if (event.target.closest('[data-v5-apply-custom]')) {
      const from = overlayRoot.querySelector('[data-v5-date-from]')?.value;
      const to = overlayRoot.querySelector('[data-v5-date-to]')?.value;
      const note = overlayRoot.querySelector('[data-v5-period-note]');
      if (!from || !to || from > to) { if (note) note.textContent = '日期区间无效，请检查开始和结束日期。'; return; }
      try { await runtime.setRange(from, to); closeOverlay(); }
      catch (error) { if (note) note.textContent = error?.message || '期间切换失败'; }
      return;
    }
    const resultButton = event.target.closest('[data-v5-search-index]');
    if (resultButton) {
      const host = overlayRoot.querySelector('[data-v5-search-results]');
      const item = host?._v5Results?.[Number(resultButton.dataset.v5SearchIndex)];
      if (!item) return;
      closeOverlay({ restoreFocus: false });
      window.YT_MOBILE_APP?.navigate?.(item.route);
      if (item.kind !== 'module') requestAnimationFrame(() => openDetail(item));
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay) closeOverlay();
  });

  window.YT_MOBILE_INTERACTIONS = Object.freeze({
    openPeriod,
    openSearch,
    openDetail,
    close: closeOverlay,
    get activeOverlay() { return overlay; }
  });
})();
