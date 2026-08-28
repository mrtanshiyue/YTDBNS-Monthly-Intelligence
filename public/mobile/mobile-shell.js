(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const ensureStylesheet = (id, href) => {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };

  ensureStylesheet('v51MobileUxStyles', './mobile/v51-mobile.css');
  ensureStylesheet('v51IphoneStandaloneStyles', './mobile/iphone-standalone.css');

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest';
    document.head.appendChild(manifest);
  }

  if (!document.querySelector('link[rel="icon"]')) {
    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/svg+xml';
    iconLink.href = './yt-icon.svg';
    document.head.appendChild(iconLink);
  }

  if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
    const capable = document.createElement('meta');
    capable.name = 'mobile-web-app-capable';
    capable.content = 'yes';
    document.head.appendChild(capable);
  }

  const standaloneMedia = window.matchMedia('(display-mode: standalone)');
  const mobileTheme = document.querySelector('meta[name="theme-color"][media*="max-width"]');
  function syncStandaloneMode() {
    const standalone = Boolean(standaloneMedia.matches || window.navigator.standalone === true);
    document.documentElement.classList.toggle('v5-standalone', standalone);
    document.documentElement.dataset.v5Display = standalone ? 'standalone' : 'browser';
    if (mobileTheme) mobileTheme.setAttribute('content', '#F5F5F7');
  }
  syncStandaloneMode();
  standaloneMedia.addEventListener?.('change', syncStandaloneMode);

  const media = window.matchMedia('(max-width: 860px)');
  const runtime = window.YT_SHARED_RUNTIME;
  const HISTORY_KEY = 'ytdbnsMobileRoute';

  const ICONS = {
    home: '<path d="M4.5 10.7 12 4.5l7.5 6.2"/><path d="M6.5 9.8v9.2h11V9.8M9.5 19v-5.2h5V19"/>',
    tasks: '<path d="M7 5.5h10M7 10.2h10M7 14.9h6"/><circle cx="5" cy="5.5" r=".8"/><circle cx="5" cy="10.2" r=".8"/><circle cx="5" cy="14.9" r=".8"/><path d="m14.8 18 1.7 1.7 3.1-3.7"/>',
    ads: '<circle cx="12" cy="12" r="7.8"/><circle cx="12" cy="12" r="3.7"/><circle cx="12" cy="12" r=".8"/><path d="m16.7 7.3 2.8-2.8M17.7 4.5h1.8v1.8"/>',
    products: '<path d="m12 3.8 6.8 3.5v9.4L12 20.2l-6.8-3.5V7.3L12 3.8Z"/><path d="m5.6 7.5 6.4 3.3 6.4-3.3M12 10.8v9.1"/>',
    inventory: '<rect x="4.3" y="5.2" width="15.4" height="14.5" rx="2"/><path d="M8 5.2V3.8h8v1.4M4.3 10h15.4M9 14h6"/>',
    search: '<circle cx="10.7" cy="10.7" r="5.7"/><path d="m15 15 4.2 4.2"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.home}</svg>`;

  const PRIMARY = [
    ['overview', '首页', 'home'],
    ['tasks', '待办', 'tasks'],
    ['ads', '广告', 'ads'],
    ['products', '商品', 'products'],
    ['inventory', '库存', 'inventory']
  ];

  const TITLES = {
    overview: ['经营', '本期经营摘要'],
    tasks: ['待办', '跨业务异常与经营信号'],
    ads: ['广告', '广告效率与活动'],
    products: ['商品', 'SKU / ASIN 经营表现'],
    inventory: ['库存', '库存资金与风险'],
    finance: ['利润', '利润与结算'],
    charges: ['扣费', 'Amazon 扣费'],
    returns: ['退货', '退货与退款'],
    history: ['历史', '月度经营趋势'],
    data: ['数据', '数据质量与同步']
  };

  const ui = {
    route: 'overview',
    runtimeState: runtime?.getState?.() || null
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function activePrimary() {
    return PRIMARY.some(([id]) => id === ui.route) ? ui.route : 'overview';
  }

  function routeTitle() {
    return TITLES[ui.route]?.[0] || TITLES.overview[0];
  }

  function periodLabel() {
    const state = ui.runtimeState || {};
    if (state.rangeLabel) return state.rangeLabel;
    if (state.from && state.to) {
      const sameMonth = state.from.slice(0, 7) === state.to.slice(0, 7);
      return sameMonth ? state.from.slice(0, 7) : `${state.from.slice(5)}–${state.to.slice(5)}`;
    }
    return '查看期间';
  }

  function runtimeNoticeMarkup() {
    const state = ui.runtimeState;
    if (state?.loading) {
      return `
        <div class="v5-mobile-runtime-notice loading" role="status" aria-live="polite">
          <span class="v5-mobile-runtime-spinner" aria-hidden="true"></span>
          <span><b>正在更新经营数据</b><small>当前页面会在读取完成后自动刷新</small></span>
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
        <div class="v5-mobile-phase-card" role="status">
          <span>模块状态</span>
          <strong>${esc(title)}视图正在准备</strong>
          <p>${esc(subtitle)}。该状态不会触发任何数据写入。</p>
        </div>
      </section>`;
  }

  function navMarkup() {
    const active = activePrimary();
    return PRIMARY.map(([id, label, iconName]) => {
      const current = active === id;
      return `
        <button class="v5-mobile-nav-item ${current ? 'active' : ''}" type="button" data-mobile-route="${id}"${current ? ' aria-current="page"' : ''}>
          <span class="v5-mobile-nav-icon" aria-hidden="true">${icon(iconName)}</span>
          <span>${esc(label)}</span>
        </button>`;
    }).join('');
  }

  function selectorForFocus(element) {
    if (!(element instanceof HTMLElement) || !root.contains(element)) return null;
    const tag = element.tagName.toLowerCase();
    const action = element.dataset.mobileAction;
    if (action) return `${tag}[data-mobile-action="${action}"]`;
    const route = element.dataset.mobileRoute;
    if (route) return `${tag}[data-mobile-route="${route}"]`;
    const ops = element.dataset.v52OpsOpen;
    if (ops) return `${tag}[data-v52-ops-open="${ops}"]`;
    return null;
  }

  function refineRenderedSemantics() {
    const state = ui.runtimeState;
    const periodUnavailable = state?.mode === 'offline' || (state?.mode === 'live' && !state.periods?.length);
    root.querySelectorAll('[data-mobile-action="period"]').forEach(button => {
      button.setAttribute('aria-label', '选择查看期间');
      button.setAttribute('aria-haspopup', 'dialog');
      button.disabled = Boolean(periodUnavailable);
    });
  }

  function render({ focusSelector = selectorForFocus(document.activeElement) } = {}) {
    const loading = Boolean(ui.runtimeState?.loading);
    root.innerHTML = `
      <div class="v5-mobile-app" aria-busy="${loading ? 'true' : 'false'}">
        <header class="v5-mobile-topbar">
          <div class="v52-mobile-context">
            <h1 id="v5MobileViewTitle">${esc(routeTitle())}</h1>
            <button type="button" class="v52-period-pill" data-mobile-action="period"><span>${esc(periodLabel())}</span><i aria-hidden="true">⌄</i></button>
          </div>
          <div class="v5-mobile-top-actions">
            <button type="button" data-mobile-action="search" aria-label="搜索">${icon('search')}</button>
          </div>
        </header>
        <main class="v5-mobile-content">
          ${runtimeNoticeMarkup()}
          ${viewMarkup()}
        </main>
        <nav class="v5-mobile-bottom-nav" aria-label="手机端主导航">${navMarkup()}</nav>
      </div>`;
    refineRenderedSemantics();
    if (focusSelector) requestAnimationFrame(() => root.querySelector(focusSelector)?.focus({ preventScroll: true }));
  }

  function resetRouteScroll() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement) {
      scrollingElement.scrollTop = 0;
      scrollingElement.scrollLeft = 0;
    }
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function rerenderView(focusSelector = selectorForFocus(document.activeElement)) {
    const scrollingElement = document.scrollingElement || document.documentElement;
    const x = scrollingElement?.scrollLeft ?? window.scrollX;
    const y = scrollingElement?.scrollTop ?? window.scrollY;
    render({ focusSelector });
    requestAnimationFrame(() => window.scrollTo(x, y));
  }

  function syncHistory(route, mode) {
    if (!media.matches) return;
    const state = { ...(history.state || {}), [HISTORY_KEY]: route };
    if (mode === 'replace') history.replaceState(state, document.title);
    else if (mode === 'push') history.pushState(state, document.title);
  }

  function setRoute(route, { historyMode = 'push' } = {}) {
    if (!TITLES[route]) return;
    const changed = ui.route !== route;
    ui.route = route;
    render();
    resetRouteScroll();
    if (changed && historyMode !== 'none') syncHistory(route, historyMode);
  }

  function activate() {
    const mobile = media.matches;
    syncStandaloneMode();
    root.hidden = !mobile;
    root.setAttribute('aria-hidden', mobile ? 'false' : 'true');
    document.body.classList.toggle('v5-native-mobile', mobile);
    document.documentElement.dataset.v5View = mobile ? 'mobile' : 'desktop';
    if (mobile) {
      runtime?.start?.();
      const storedRoute = history.state?.[HISTORY_KEY];
      if (storedRoute && TITLES[storedRoute]) ui.route = storedRoute;
      else syncHistory(ui.route, 'replace');
      render();
    }
  }

  root.addEventListener('click', event => {
    const routeButton = event.target.closest('[data-mobile-route]');
    if (routeButton) {
      event.preventDefault();
      event.stopPropagation();
      setRoute(routeButton.dataset.mobileRoute);
      return;
    }
    const actionButton = event.target.closest('[data-mobile-action]');
    const action = actionButton?.dataset.mobileAction;
    if (action === 'period' && !actionButton.disabled) {
      root.dispatchEvent(new CustomEvent('v5:period-request', { bubbles: true }));
    } else if (action === 'search') {
      root.dispatchEvent(new CustomEvent('v5:search-request', { bubbles: true }));
    }
  });

  root.addEventListener('v5:navigate', event => {
    const route = event.detail?.route;
    if (route) setRoute(route);
  });

  root.addEventListener('v5:refresh-view', event => {
    rerenderView(event.detail?.focusSelector || null);
  });

  window.addEventListener('popstate', event => {
    if (!media.matches) return;
    const route = event.state?.[HISTORY_KEY] || 'overview';
    if (!TITLES[route]) return;
    ui.route = route;
    render();
    resetRouteScroll();
  });

  runtime?.subscribe?.(next => {
    ui.runtimeState = next;
    if (media.matches) render();
  });

  media.addEventListener?.('change', activate);
  render();
  activate();
})();
