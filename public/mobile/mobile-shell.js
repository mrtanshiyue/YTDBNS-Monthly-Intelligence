(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const v51StyleId = 'v51MobileUxStyles';
  if (!document.getElementById(v51StyleId)) {
    const link = document.createElement('link');
    link.id = v51StyleId;
    link.rel = 'stylesheet';
    link.href = './mobile/v51-mobile.css';
    document.head.appendChild(link);
  }

  const media = window.matchMedia('(max-width: 860px)');
  const runtime = window.YT_SHARED_RUNTIME;
  const ICONS = {
    home: '<path d="M4.5 10.7 12 4.5l7.5 6.2"/><path d="M6.5 9.8v9.2h11V9.8M9.5 19v-5.2h5V19"/>',
    ads: '<circle cx="12" cy="12" r="7.8"/><circle cx="12" cy="12" r="3.7"/><circle cx="12" cy="12" r=".8"/><path d="m16.7 7.3 2.8-2.8M17.7 4.5h1.8v1.8"/>',
    products: '<path d="m12 3.8 6.8 3.5v9.4L12 20.2l-6.8-3.5V7.3L12 3.8Z"/><path d="m5.6 7.5 6.4 3.3 6.4-3.3M12 10.8v9.1"/>',
    inventory: '<rect x="4.3" y="5.2" width="15.4" height="14.5" rx="2"/><path d="M8 5.2V3.8h8v1.4M4.3 10h15.4M9 14h6"/>',
    more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    search: '<circle cx="10.7" cy="10.7" r="5.7"/><path d="m15 15 4.2 4.2"/>',
    refresh: '<path d="M19.2 8V4.8h-3.3M4.8 16v3.2h3.3"/><path d="M17.9 6.3a7.6 7.6 0 0 0-12.6 2.1M6.1 17.7a7.6 7.6 0 0 0 12.6-2.1"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.more}</svg>`;

  const PRIMARY = [
    ['overview', '首页', 'home'],
    ['ads', '广告', 'ads'],
    ['products', '商品', 'products'],
    ['inventory', '库存', 'inventory'],
    ['more', '更多', 'more']
  ];
  const SECONDARY = [
    ['finance', '利润', '贡献利润与结算'],
    ['charges', '扣费', 'Amazon 扣费项目'],
    ['returns', '退货', '退货与退款分析'],
    ['history', '历史', '月度经营趋势'],
    ['data', '数据', '数据质量与导入状态']
  ];
  const TITLES = {
    overview: ['经营首页', '本期经营摘要'],
    ads: ['广告', '广告效率与活动'],
    products: ['商品', 'SKU / ASIN 经营表现'],
    inventory: ['库存', '库存资金与风险'],
    finance: ['利润', '利润与结算'],
    charges: ['扣费', 'Amazon 扣费'],
    returns: ['退货', '退货与退款'],
    history: ['历史', '月度经营趋势'],
    data: ['数据', '数据质量与导入']
  };

  const ui = {
    route: 'overview',
    moreOpen: false,
    runtimeState: runtime?.getState?.() || null
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function activePrimary() {
    return PRIMARY.some(([id]) => id === ui.route) ? ui.route : 'more';
  }

  function runtimeNoticeMarkup() {
    const state = ui.runtimeState;
    if (state?.loading) {
      return `
        <div class="v5-mobile-runtime-notice loading" role="status" aria-live="polite">
          <span class="v5-mobile-runtime-spinner" aria-hidden="true"></span>
          <span><b>正在更新经营数据</b><small>保持当前页面，完成后会自动刷新</small></span>
        </div>`;
    }
    if (state?.error) {
      const offline = state.mode === 'offline';
      return `
        <div class="v5-mobile-runtime-notice error" role="alert">
          <span class="v5-mobile-runtime-mark" aria-hidden="true">!</span>
          <span><b>${offline ? '实时数据服务暂时不可用' : '数据读取失败'}</b><small>${esc(state.error)}</small></span>
        </div>`;
    }
    if (state?.started && state.mode === 'live' && !state.periods?.length) {
      return `
        <div class="v5-mobile-runtime-notice empty" role="status">
          <span class="v5-mobile-runtime-mark" aria-hidden="true">·</span>
          <span><b>尚无已导入月份</b><small>实时服务已连接，但当前数据库还没有可查看的月度经营数据。</small></span>
        </div>`;
    }
    return '';
  }

  function viewMarkup() {
    const renderer = window.YT_MOBILE_VIEWS?.[ui.route];
    if (typeof renderer === 'function') return renderer({ runtimeState: ui.runtimeState, route: ui.route, esc });

    const [title, subtitle] = TITLES[ui.route] || TITLES.overview;
    return `
      <section class="v5-mobile-view" data-mobile-view="${esc(ui.route)}" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div>
            <span class="v5-mobile-eyebrow">MODULE STATUS</span>
            <h1 id="v5MobileViewTitle">${esc(title)}</h1>
            <p>${esc(subtitle)}</p>
          </div>
        </div>
        <div class="v5-mobile-phase-card" role="status">
          <span>暂时不可用</span>
          <strong>${esc(title)}视图未能完成渲染</strong>
          <p>请刷新页面后重试。该状态不会触发任何数据写入。</p>
        </div>
      </section>`;
  }

  function navMarkup() {
    const active = activePrimary();
    return PRIMARY.map(([id, label, iconName]) => {
      const current = active === id;
      const moreAttrs = id === 'more' ? ` aria-haspopup="dialog"${ui.moreOpen ? ' aria-controls="v5MoreSheet" aria-expanded="true"' : ' aria-expanded="false"'}` : '';
      return `
        <button class="v5-mobile-nav-item ${current ? 'active' : ''}" type="button" data-mobile-route="${id}"${current ? ' aria-current="page"' : ''}${moreAttrs}>
          <span class="v5-mobile-nav-icon" aria-hidden="true">${icon(iconName)}</span>
          <span>${esc(label)}</span>
        </button>`;
    }).join('');
  }

  function moreMarkup() {
    if (!ui.moreOpen) return '';
    return `
      <div class="v5-mobile-sheet-layer" data-mobile-action="close-more">
        <section class="v5-mobile-sheet" id="v5MoreSheet" role="dialog" aria-modal="true" aria-labelledby="v5MoreTitle" data-mobile-sheet="more">
          <div class="v5-mobile-sheet-handle" aria-hidden="true"></div>
          <div class="v5-mobile-sheet-head">
            <div><span>ALL MODULES</span><h2 id="v5MoreTitle">更多</h2></div>
            <button type="button" data-mobile-action="close-more" aria-label="关闭更多模块">×</button>
          </div>
          <div class="v5-mobile-module-list">
            ${SECONDARY.map(([id, label, subtitle]) => `
              <button type="button" data-mobile-route="${id}">
                <span><b>${esc(label)}</b><small>${esc(subtitle)}</small></span><i aria-hidden="true">›</i>
              </button>`).join('')}
          </div>
        </section>
      </div>`;
  }

  function selectorForFocus(element) {
    if (!(element instanceof HTMLElement) || !root.contains(element)) return null;
    const tag = element.tagName.toLowerCase();
    const action = element.dataset.mobileAction;
    if (action) return `${tag}[data-mobile-action="${action}"]`;
    const route = element.dataset.mobileRoute;
    if (route) return `${tag}[data-mobile-route="${route}"]`;
    return null;
  }

  function refineRenderedSemantics() {
    const state = ui.runtimeState;
    const periodUnavailable = state?.mode === 'offline' || (state?.mode === 'live' && !state.periods?.length);
    root.querySelectorAll('[data-mobile-action="period"]').forEach(button => {
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', '选择查看期间');
      button.setAttribute('aria-haspopup', 'dialog');
      button.disabled = Boolean(periodUnavailable);
    });
  }

  function render({ focusSelector = selectorForFocus(document.activeElement) } = {}) {
    const loading = Boolean(ui.runtimeState?.loading);
    root.innerHTML = `
      <div class="v5-mobile-app" aria-busy="${loading ? 'true' : 'false'}">
        <header class="v5-mobile-topbar">
          <div class="v5-mobile-brand"><strong>YTDBNS</strong><span>Intelligence</span></div>
          <div class="v5-mobile-top-actions">
            <button type="button" data-mobile-action="search" aria-label="搜索">${icon('search')}</button>
            <button type="button" data-mobile-action="refresh" aria-label="刷新" aria-disabled="${loading ? 'true' : 'false'}" class="${loading ? 'is-busy' : ''}">${icon('refresh')}</button>
          </div>
        </header>
        <main class="v5-mobile-content">
          ${runtimeNoticeMarkup()}
          ${viewMarkup()}
        </main>
        <nav class="v5-mobile-bottom-nav" aria-label="手机端主导航">${navMarkup()}</nav>
        ${moreMarkup()}
      </div>`;
    refineRenderedSemantics();
    if (focusSelector) requestAnimationFrame(() => root.querySelector(focusSelector)?.focus({ preventScroll: true }));
  }

  function closeMore() {
    if (!ui.moreOpen) return;
    ui.moreOpen = false;
    render({ focusSelector: '.v5-mobile-bottom-nav [data-mobile-route="more"]' });
  }

  function scrollDocumentToTop() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
    if (scrollingElement) {
      scrollingElement.scrollTop = 0;
      scrollingElement.scrollLeft = 0;
    }
    const mobileContent = root.querySelector('.v5-mobile-content');
    if (mobileContent) {
      mobileContent.scrollTop = 0;
      mobileContent.scrollLeft = 0;
    }
  }

  function setRoute(route) {
    if (route === 'more') {
      ui.moreOpen = true;
      render({ focusSelector: '[data-mobile-sheet="more"] .v5-mobile-sheet-head button' });
      return;
    }
    if (!TITLES[route]) return;
    ui.route = route;
    ui.moreOpen = false;
    render();
    requestAnimationFrame(scrollDocumentToTop);
  }

  async function refresh() {
    if (!runtime || ui.runtimeState?.loading) return;
    if (typeof runtime.refresh === 'function') {
      await runtime.refresh();
      return;
    }
    const state = runtime.getState();
    if (state?.from && state?.to) await runtime.setRange(state.from, state.to);
  }

  function activate() {
    const mobile = media.matches;
    root.hidden = !mobile;
    root.setAttribute('aria-hidden', mobile ? 'false' : 'true');
    document.body.classList.toggle('v5-native-mobile', mobile);
    document.documentElement.dataset.v5View = mobile ? 'mobile' : 'desktop';
    if (mobile) runtime?.start?.();
  }

  root.addEventListener('click', event => {
    const routeButton = event.target.closest('[data-mobile-route]');
    if (routeButton) {
      event.stopPropagation();
      setRoute(routeButton.dataset.mobileRoute);
      return;
    }
    const actionButton = event.target.closest('[data-mobile-action]');
    const action = actionButton?.dataset.mobileAction;
    if (!action) return;
    if (action === 'close-more') {
      if (event.target.closest('[data-mobile-sheet]') && !event.target.closest('.v5-mobile-sheet-head button')) return;
      closeMore();
    } else if (action === 'refresh') {
      if (actionButton.getAttribute('aria-disabled') !== 'true') refresh();
    } else if (action === 'period') {
      if (!actionButton.disabled) root.dispatchEvent(new CustomEvent('v5:period-request', { bubbles: true }));
    } else if (action === 'search') {
      root.dispatchEvent(new CustomEvent('v5:search-request', { bubbles: true }));
    }
  });

  root.addEventListener('keydown', event => {
    if (!ui.moreOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMore();
      return;
    }
    if (event.key !== 'Tab') return;
    const sheet = root.querySelector('[data-mobile-sheet="more"]');
    if (!sheet) return;
    const focusable = [...sheet.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  root.addEventListener('v5:navigate', event => {
    const route = event.detail?.route;
    if (route) setRoute(route);
  });

  runtime?.subscribe?.(next => {
    ui.runtimeState = next;
    if (media.matches) render();
  });
  media.addEventListener?.('change', activate);
  render();
  activate();
})();