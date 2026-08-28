(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const media = window.matchMedia('(max-width: 860px)');
  const DOMAIN_IDS = Object.freeze([
    'ads',
    'products',
    'inventory',
    'finance',
    'charges',
    'returns',
    'history',
    'data'
  ]);
  const DOMAIN_SET = new Set(DOMAIN_IDS);
  const DUPLICATE_PRIMARY_IDS = new Set(['today', 'alerts']);
  let syncing = false;

  function activeModule() {
    const module = window.YT_MOBILE_VNEXT_DENSITY?.getState?.().module;
    return DOMAIN_SET.has(module) ? module : null;
  }

  function activePrimaryTab() {
    return root.querySelector('.vnext-app')?.dataset.tab || 'today';
  }

  function shouldShowRail() {
    return activePrimaryTab() === 'today' || Boolean(activeModule());
  }

  function syncRail() {
    if (syncing || !media.matches || !document.body.classList.contains('mobile-vnext-active')) return;
    const rail = root.querySelector('.vnext-module-rail');
    if (!rail) return;

    syncing = true;
    try {
      rail.dataset.vnextIa = 'domain';
      rail.setAttribute('aria-label', '业务模块');

      const module = activeModule();
      for (const button of rail.querySelectorAll('[data-vnext-module]')) {
        const id = button.dataset.vnextModule;
        if (DUPLICATE_PRIMARY_IDS.has(id)) {
          button.hidden = true;
          button.tabIndex = -1;
          button.setAttribute('aria-hidden', 'true');
          button.removeAttribute('aria-current');
          button.classList.remove('active');
          continue;
        }

        if (!DOMAIN_SET.has(id)) continue;
        button.hidden = false;
        button.removeAttribute('aria-hidden');
        button.tabIndex = 0;
        const selected = module === id;
        button.classList.toggle('active', selected);
        if (selected) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }

      const visible = shouldShowRail();
      rail.hidden = !visible;
      rail.classList.toggle('vnext-domain-rail-visible', visible);
      rail.classList.toggle('vnext-domain-rail-hidden', !visible);
    } finally {
      syncing = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (syncing) return;
    requestAnimationFrame(syncRail);
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-tab'] });

  root.addEventListener('click', event => {
    if (event.target.closest('[data-vnext-tab], [data-vnext-module]')) requestAnimationFrame(syncRail);
  }, true);
  window.addEventListener('popstate', () => requestAnimationFrame(syncRail));
  media.addEventListener?.('change', () => requestAnimationFrame(syncRail));

  requestAnimationFrame(syncRail);

  window.YT_MOBILE_VNEXT_IA = Object.freeze({
    refresh: syncRail,
    domainIds: DOMAIN_IDS,
    getState: () => Object.freeze({
      primaryTab: activePrimaryTab(),
      module: activeModule(),
      railVisible: shouldShowRail()
    })
  });
})();
