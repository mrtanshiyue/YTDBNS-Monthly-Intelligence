(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const media = window.matchMedia('(max-width: 860px)');
  const runtime = window.YT_SHARED_RUNTIME;
  const PRIMARY = [
    ['overview', '首页', '⌂'],
    ['ads', '广告', '◎'],
    ['products', '商品', '◇'],
    ['inventory', '库存', '▦'],
    ['more', '更多', '•••']
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

  function viewMarkup() {
    const renderer = window.YT_MOBILE_VIEWS?.[ui.route];
    if (typeof renderer === 'function') {
      return renderer({ runtimeState: ui.runtimeState, route: ui.route, esc });
    }

    const [title, subtitle] = TITLES[ui.route] || TITLES.overview;
    const state = ui.runtimeState;
    const loading = Boolean(state?.loading);
    const status = state?.mode === 'live' ? 'LIVE DATA' : state?.mode === 'demo' ? 'PREVIEW' : 'CONNECTING';
    const range = state?.rangeLabel || '选择期间';

    return `
      <section class="v5-mobile-view" data-mobile-view="${esc(ui.route)}" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div>
            <span class="v5-mobile-eyebrow">${esc(status)}</span>
            <h1 id="v5MobileViewTitle">${esc(title)}</h1>
            <p>${esc(subtitle)}</p>
          </div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="查看当前期间">
            <span>${esc(range)}</span><i aria-hidden="true">›</i>
          </button>
        </div>
        <div class="v5-mobile-phase-card" role="status">
          <span>${loading ? '正在读取经营数据' : 'V5.0 Native Mobile'}</span>
          <strong>${esc(title)}独立视图已接入 Shell</strong>
          <p>该模块仍处于 V5 分阶段重写队列中。Mobile View 不复用 Desktop 主 DOM，后续会以移动端任务流替换当前占位视图。</p>
        </div>
      </section>`;
  }

  function navMarkup() {
    const active = activePrimary();
    return PRIMARY.map(([id, label, icon]) => `
      <button class="v5-mobile-nav-item ${active === id ? 'active' : ''}" type="button" data-mobile-route="${id}" aria-current="${active === id ? 'page' : 'false'}">
        <span class="v5-mobile-nav-icon" aria-hidden="true">${esc(icon)}</span>
        <span>${esc(label)}</span>
      </button>`).join('');
  }

  function moreMarkup() {
    if (!ui.moreOpen) return '';
    return `
      <div class="v5-mobile-sheet-layer" data-mobile-action="close-more">
        <section class="v5-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="v5MoreTitle" data-mobile-sheet="more">
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

  function render() {
    root.innerHTML = `
      <div class="v5-mobile-app">
        <header class="v5-mobile-topbar">
          <div class="v5-mobile-brand"><strong>YTDBNS</strong><span>Intelligence</span></div>
          <div class="v5-mobile-top-actions">
            <button type="button" data-mobile-action="search" aria-label="搜索"><span aria-hidden="true">⌕</span></button>
            <button type="button" data-mobile-action="refresh" aria-label="刷新"><span aria-hidden="true">↻</span></button>
          </div>
        </header>
        <main class="v5-mobile-content">${viewMarkup()}</main>
        <nav class="v5-mobile-bottom-nav" aria-label="手机端主导航">${navMarkup()}</nav>
        ${moreMarkup()}
      </div>`;
  }

  function setRoute(route) {
    if (route === 'more') {
      ui.moreOpen = true;
      render();
      return;
    }
    if (!TITLES[route]) return;
    ui.route = route;
    ui.moreOpen = false;
    render();
    root.querySelector('.v5-mobile-content')?.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function refresh() {
    if (!runtime) return;
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
    const action = event.target.closest('[data-mobile-action]')?.dataset.mobileAction;
    if (!action) return;
    if (action === 'close-more') {
      if (event.target.closest('[data-mobile-sheet]') && !event.target.closest('.v5-mobile-sheet-head button')) return;
      ui.moreOpen = false;
      render();
    } else if (action === 'refresh') {
      refresh();
    } else if (action === 'period') {
      root.dispatchEvent(new CustomEvent('v5:period-request', { bubbles: true }));
    } else if (action === 'search') {
      root.dispatchEvent(new CustomEvent('v5:search-request', { bubbles: true }));
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
