(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  const OPS = {
    ads: {
      title: '筛选广告',
      filters: [
        ['all', '全部'],
        ['over45', '超线 >45%'],
        ['over60', '严重 >60%'],
        ['highSpend', '高花费'],
        ['lowConversion', '低转化']
      ],
      sorts: [
        ['spend', '广告花费 ↓'],
        ['acos', 'ACOS ↓'],
        ['sales', '广告销售额 ↓'],
        ['orders', '订单 ↓']
      ]
    },
    products: {
      title: '筛选商品',
      filters: [
        ['all', '全部'],
        ['trafficLowCvr', '高流量低CVR'],
        ['buyBoxLow', 'Buy Box偏低'],
        ['topSeller', 'Top Seller'],
        ['lowVelocity', '低动销']
      ],
      sorts: [
        ['sales', '销售额 ↓'],
        ['cvr', 'CVR ↓'],
        ['sessions', 'Sessions ↓'],
        ['buyBox', 'Buy Box ↓'],
        ['units', '销量 ↓']
      ]
    },
    inventory: {
      title: '筛选库存',
      filters: [
        ['all', '全部'],
        ['unsellable', '不可售'],
        ['lowStock', '低库存 ≤20'],
        ['highCapital', '高资金占用'],
        ['inbound', '有在途'],
        ['normal', '正常']
      ],
      sorts: [
        ['inventoryValue', '库存资金 ↓'],
        ['unsellable', '不可售 ↓'],
        ['fulfillable', '可售库存 ↓'],
        ['inbound', '在途 ↓']
      ]
    }
  };

  const overlayRoot = document.createElement('div');
  overlayRoot.className = 'v52-ops-overlay-root';
  overlayRoot.id = 'v52OpsOverlayRoot';
  document.body.appendChild(overlayRoot);

  let current = null;
  let lastFocus = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function closeOps() {
    current = null;
    overlayRoot.classList.remove('open');
    overlayRoot.innerHTML = '';
    document.body.classList.remove('v52-ops-open');
    if (lastFocus instanceof HTMLElement && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function openOps(route, filter, sort) {
    const config = OPS[route];
    if (!config) return;
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    current = { route, filter: filter || config.filters[0][0], sort: sort || config.sorts[0][0] };
    overlayRoot.classList.add('open');
    document.body.classList.add('v52-ops-open');
    overlayRoot.innerHTML = `
      <div class="v52-ops-backdrop" data-v52-close="backdrop">
        <section class="v52-ops-sheet" role="dialog" aria-modal="true" aria-labelledby="v52OpsTitle" data-v52-surface>
          <div class="v52-ops-handle" aria-hidden="true"></div>
          <div class="v52-ops-head">
            <h2 id="v52OpsTitle">${esc(config.title)}</h2>
            <button type="button" class="v52-ops-close" data-v52-close aria-label="关闭筛选">×</button>
          </div>
          <div class="v52-ops-group" data-v52-filter-group>
            <span>筛选</span>
            ${config.filters.map(([id, label]) => `<button type="button" class="v52-ops-option ${current.filter === id ? 'active' : ''}" data-v52-filter="${esc(id)}"><span>${esc(label)}</span><i aria-hidden="true">${current.filter === id ? '✓' : ''}</i></button>`).join('')}
          </div>
          <div class="v52-ops-group" data-v52-sort-group>
            <span>排序</span>
            ${config.sorts.map(([id, label]) => `<button type="button" class="v52-ops-option ${current.sort === id ? 'active' : ''}" data-v52-sort="${esc(id)}"><span>${esc(label)}</span><i aria-hidden="true">${current.sort === id ? '✓' : ''}</i></button>`).join('')}
          </div>
          <div class="v52-ops-actions">
            <button type="button" class="v52-ops-reset" data-v52-reset>重置</button>
            <button type="button" class="v52-ops-apply" data-v52-apply>应用</button>
          </div>
        </section>
      </div>`;
    requestAnimationFrame(() => overlayRoot.querySelector('[data-v52-close]')?.focus({ preventScroll: true }));
  }

  function repaintChoices(kind) {
    if (!current) return;
    const selector = kind === 'filter' ? '[data-v52-filter]' : '[data-v52-sort]';
    const key = current[kind];
    overlayRoot.querySelectorAll(selector).forEach(button => {
      const id = kind === 'filter' ? button.dataset.v52Filter : button.dataset.v52Sort;
      const active = id === key;
      button.classList.toggle('active', active);
      const mark = button.querySelector('i');
      if (mark) mark.textContent = active ? '✓' : '';
    });
  }

  overlayRoot.addEventListener('click', event => {
    if (!current) return;
    if (event.target.matches('[data-v52-close="backdrop"]') || event.target.closest('[data-v52-close]')) {
      closeOps();
      return;
    }
    const filterButton = event.target.closest('[data-v52-filter]');
    if (filterButton) {
      current.filter = filterButton.dataset.v52Filter;
      repaintChoices('filter');
      return;
    }
    const sortButton = event.target.closest('[data-v52-sort]');
    if (sortButton) {
      current.sort = sortButton.dataset.v52Sort;
      repaintChoices('sort');
      return;
    }
    if (event.target.closest('[data-v52-reset]')) {
      const config = OPS[current.route];
      current.filter = config.filters[0][0];
      current.sort = config.sorts[0][0];
      repaintChoices('filter');
      repaintChoices('sort');
      return;
    }
    if (event.target.closest('[data-v52-apply]')) {
      root.dispatchEvent(new CustomEvent('v52:ops-apply', {
        bubbles: true,
        detail: { route: current.route, filter: current.filter, sort: current.sort }
      }));
      closeOps();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && current) closeOps();
  });

  function money(value) {
    return fmt?.compactMoney ? fmt.compactMoney(value) : fmt?.money ? fmt.money(value, 0) : `$${Number(value || 0).toLocaleString('en-US')}`;
  }
  function pct(value) {
    return fmt?.percent ? fmt.percent(value) : value == null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
  }
  function num(value) {
    return fmt?.number ? fmt.number(value) : Number(value || 0).toLocaleString('en-US');
  }

  function collectTasks(runtimeState) {
    const tasks = [];
    try {
      const ads = selectors?.adsModel?.(runtimeState);
      const campaigns = ads?.campaigns || [];
      campaigns.forEach(row => {
        const acos = row.acos == null ? null : Number(row.acos);
        if (acos != null && acos > .60) {
          tasks.push({ route: 'ads', tone: 'critical', group: '广告', title: row.campaign || '广告活动', detail: `ACOS ${pct(acos)} · 花费 ${money(row.spend)}`, score: 300 + Number(row.spend || 0) });
        } else if (acos != null && acos > .45) {
          tasks.push({ route: 'ads', tone: 'warning', group: '广告', title: row.campaign || '广告活动', detail: `ACOS ${pct(acos)} · 高于45%目标线`, score: 220 + Number(row.spend || 0) });
        }
      });
    } catch {}

    try {
      const products = selectors?.productsModel?.(runtimeState);
      const rows = products?.products || [];
      const withSessions = rows.filter(row => row.sessions != null);
      const avgSessions = withSessions.length ? withSessions.reduce((sum, row) => sum + Number(row.sessions || 0), 0) / withSessions.length : 0;
      rows.forEach(row => {
        const buyBox = row.buyBox == null ? null : Number(row.buyBox);
        const cvr = row.cvr == null ? null : Number(row.cvr);
        const totalCvr = products?.totals?.cvr == null ? null : Number(products.totals.cvr);
        if (buyBox != null && buyBox < .90) {
          tasks.push({ route: 'products', tone: 'warning', group: '商品', title: row.sku || row.asin || 'SKU', detail: `Buy Box ${pct(buyBox)} · 销售 ${money(row.sales)}`, score: 180 + Number(row.sales || 0) / 10 });
        } else if (Number(row.sessions || 0) >= avgSessions && cvr != null && totalCvr != null && cvr < totalCvr) {
          tasks.push({ route: 'products', tone: 'warning', group: '商品', title: row.sku || row.asin || 'SKU', detail: `高流量低转化 · CVR ${pct(cvr)}`, score: 160 + Number(row.sessions || 0) });
        }
      });
    } catch {}

    try {
      const inventory = selectors?.inventoryModel?.(runtimeState);
      (inventory?.inventory || []).forEach(row => {
        const unsellable = Number(row.unsellable || 0);
        const total = Number(row.total || 0);
        const share = total ? unsellable / total : 0;
        const fulfillable = Number(row.fulfillable || 0);
        if (unsellable > 0) {
          tasks.push({ route: 'inventory', tone: share > .10 ? 'critical' : 'warning', group: '库存', title: row.sku || row.asin || 'SKU', detail: `不可售 ${num(unsellable)} · 库存资金 ${money(row.inventoryValue)}`, score: (share > .10 ? 280 : 190) + Number(row.inventoryValue || 0) / 10 });
        } else if (fulfillable <= 20) {
          tasks.push({ route: 'inventory', tone: 'warning', group: '库存', title: row.sku || row.asin || 'SKU', detail: `可售库存 ${num(fulfillable)} · 低库存`, score: 170 + (20 - fulfillable) });
        }
      });
    } catch {}

    try {
      const overview = selectors?.overviewModel?.(runtimeState);
      (overview?.insights || []).forEach(item => {
        if (!item?.route || ['ads', 'products', 'inventory'].includes(item.route)) return;
        if (!['critical', 'warning'].includes(item.tone)) return;
        tasks.push({ route: item.route, tone: item.tone, group: '经营', title: item.title || '经营异常', detail: item.detail || '需要进一步查看', score: item.tone === 'critical' ? 260 : 150 });
      });
    } catch {}

    return tasks.sort((a, b) => b.score - a.score).slice(0, 24);
  }

  registry.tasks = ({ runtimeState, esc: escape }) => {
    const tasks = collectTasks(runtimeState);
    const critical = tasks.filter(item => item.tone === 'critical');
    const warning = tasks.filter(item => item.tone === 'warning');
    const card = item => `
      <button type="button" class="v52-task-card ${escape(item.tone)}" data-mobile-route="${escape(item.route)}">
        <span class="v52-task-copy"><span>${escape(item.group)}</span><b>${escape(item.title)}</b><small>${escape(item.detail)}</small></span>
        <i aria-hidden="true">›</i>
      </button>`;
    return `
      <section class="v5-mobile-view v52-tasks" data-mobile-view="tasks" aria-labelledby="v5MobileViewTitle">
        <section class="v52-task-brief" aria-label="待办摘要">
          <span>需要处理</span>
          <strong>${tasks.length}</strong>
          <small>${critical.length ? `${critical.length} 项严重异常需要优先查看` : warning.length ? `${warning.length} 项经营信号值得关注` : '当前没有高优先级经营异常'}</small>
        </section>
        <section class="v52-task-section">
          <div class="v52-task-section-head"><h2>高优先级</h2><span>${critical.length} 项</span></div>
          <div class="v52-task-list">${critical.length ? critical.map(card).join('') : '<div class="v52-task-empty"><strong>暂无严重异常</strong><span>广告、商品和库存目前没有需要立即处理的高风险信号。</span></div>'}</div>
        </section>
        <section class="v52-task-section">
          <div class="v52-task-section-head"><h2>其他关注</h2><span>${warning.length} 项</span></div>
          <div class="v52-task-list">${warning.length ? warning.map(card).join('') : '<div class="v52-task-empty"><strong>暂无其他关注项</strong><span>经营状态稳定时，这里保持安静，不制造无效任务。</span></div>'}</div>
        </section>
      </section>`;
  };

  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-v52-ops-open]');
    if (!trigger || !root.contains(trigger)) return;
    openOps(trigger.dataset.v52OpsOpen, trigger.dataset.v52Filter, trigger.dataset.v52Sort);
  });

  window.YT_MOBILE_REDESIGN = Object.freeze({
    openOps,
    closeOps,
    collectTasks
  });

  root.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true }));
})();
