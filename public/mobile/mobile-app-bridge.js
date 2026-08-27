(() => {
  'use strict';
  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const TOP_TABS = [
    ['overview', '总览'],
    ['finance', '利润'],
    ['charges', '扣费'],
    ['ads', '广告'],
    ['products', '商品'],
    ['inventory', '库存'],
    ['returns', '退货'],
    ['history', '历史'],
    ['data', '数据']
  ];

  const styleId = 'v5MobileTopTabsStyles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = './mobile/mobile-top-tabs.css';
    document.head.appendChild(link);
  }

  let scheduled = false;

  function currentRoute() {
    const view = root.querySelector('[data-mobile-view]');
    const route = view?.dataset.mobileView;
    return TOP_TABS.some(([id]) => id === route) ? route : 'overview';
  }

  function tabMarkup(active) {
    return TOP_TABS.map(([id, label]) => `
      <button class="v5-mobile-nav-item ${active === id ? 'active' : ''}" type="button" data-mobile-route="${id}"${active === id ? ' aria-current="page"' : ''}>
        <span>${label}</span>
      </button>`).join('');
  }

  function syncGeometry(nav) {
    const topbar = root.querySelector('.v5-mobile-topbar');
    if (!nav || !topbar) return;
    const height = Math.ceil(topbar.getBoundingClientRect().height);
    if (height > 0) nav.style.setProperty('--v5-mobile-topbar-height', `${height}px`);
  }

  function upgradeNavigation() {
    const app = root.querySelector('.v5-mobile-app');
    const main = root.querySelector('.v5-mobile-content');
    const nav = root.querySelector('.v5-mobile-bottom-nav');
    if (!app || !main || !nav) return;

    const active = currentRoute();
    const ready = nav.classList.contains('v5-mobile-top-tabs') &&
      nav.dataset.v5TopRoute === active &&
      nav.querySelectorAll(':scope > .v5-mobile-nav-item').length === TOP_TABS.length;

    if (!ready) {
      nav.classList.add('v5-mobile-top-tabs');
      nav.dataset.v5TopRoute = active;
      nav.setAttribute('aria-label', '经营模块');
      nav.innerHTML = tabMarkup(active);
    }

    if (nav.nextElementSibling !== main) app.insertBefore(nav, main);
    syncGeometry(nav);
  }

  function scheduleUpgrade() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      upgradeNavigation();
    });
  }

  const observer = new MutationObserver(scheduleUpgrade);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleUpgrade, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleUpgrade, { passive: true });
  scheduleUpgrade();

  window.YT_MOBILE_APP = Object.freeze({
    navigate(route) {
      if (!route) return;
      root.dispatchEvent(new CustomEvent('v5:navigate', { bubbles: true, detail: { route } }));
    }
  });
})();