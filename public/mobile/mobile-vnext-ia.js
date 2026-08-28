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
  const FILTER_MODULE_SET = new Set(['ads', 'products', 'inventory']);
  const PRIMARY_FOCUS_TAB_SET = new Set(['today', 'alerts', 'trends']);
  const DUPLICATE_PRIMARY_IDS = new Set(['today', 'alerts']);
  let syncing = false;
  let lastRevealedModule = null;
  let lastRevealedRail = null;
  let lastRevealedFilter = null;
  let lastRevealedFilterRail = null;

  function densityState() {
    return window.YT_MOBILE_VNEXT_DENSITY?.getState?.() || null;
  }

  function activeModule() {
    const module = densityState()?.module;
    return DOMAIN_SET.has(module) ? module : null;
  }

  function activeFilter(module) {
    if (!FILTER_MODULE_SET.has(module)) return null;
    const value = densityState()?.filters?.[module];
    return value || 'all';
  }

  function activePrimaryTab() {
    return root.querySelector('.vnext-app')?.dataset.tab || 'today';
  }

  function shouldShowRail() {
    return activePrimaryTab() === 'today' || Boolean(activeModule());
  }

  function revealControl(scroller, control, edge = 4) {
    if (!scroller || !control) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const visibleLeft = scrollerRect.left + edge;
    const visibleRight = scrollerRect.right - edge;
    if (controlRect.left >= visibleLeft && controlRect.right <= visibleRight) return;

    const scrollerCenter = (scrollerRect.left + scrollerRect.right) / 2;
    const controlCenter = (controlRect.left + controlRect.right) / 2;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + controlCenter - scrollerCenter));
  }

  function revealActiveDomain(rail, module) {
    if (!module) {
      lastRevealedModule = null;
      lastRevealedRail = null;
      return;
    }
    if (rail === lastRevealedRail && module === lastRevealedModule) return;

    const button = rail.querySelector(`[data-vnext-module="${module}"]`);
    if (!button || button.hidden) return;
    revealControl(rail, button);

    lastRevealedModule = module;
    lastRevealedRail = rail;
  }

  function filterRailFor(module) {
    if (!FILTER_MODULE_SET.has(module)) return null;
    return root.querySelector(`.vnext-density-module-page[data-density-module="${module}"] .vnext-filter-tags`);
  }

  function syncFilterSemantics(module) {
    const filterRail = filterRailFor(module);
    const filter = activeFilter(module);
    if (!filterRail || !filter) return;

    for (const button of filterRail.querySelectorAll('[data-density-filter]')) {
      button.setAttribute('aria-pressed', button.dataset.densityFilter === filter ? 'true' : 'false');
    }
  }

  function revealActiveFilter(module) {
    if (!FILTER_MODULE_SET.has(module)) {
      lastRevealedFilter = null;
      lastRevealedFilterRail = null;
      return;
    }

    const filterRail = filterRailFor(module);
    const filter = activeFilter(module);
    if (!filterRail || !filter) return;
    if (filterRail === lastRevealedFilterRail && filter === lastRevealedFilter) return;

    const button = filterRail.querySelector(`[data-density-filter="${filter}"]`);
    if (!button) return;
    revealControl(filterRail, button, 1);

    lastRevealedFilter = filter;
    lastRevealedFilterRail = filterRail;
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
      if (visible) revealActiveDomain(rail, module);
      else revealActiveDomain(rail, null);
      syncFilterSemantics(module);
      revealActiveFilter(module);
    } finally {
      syncing = false;
    }
  }

  function rerenderFocusTarget(event) {
    if (!media.matches || event.detail !== 0) return null;

    const tabButton = event.target.closest('.vnext-tabbar [data-vnext-tab]');
    const tab = tabButton?.dataset.vnextTab;
    if (tabButton && PRIMARY_FOCUS_TAB_SET.has(tab)) return { kind: 'tab', tab };

    const filterButton = event.target.closest('[data-density-filter]');
    if (filterButton) {
      const module = filterButton.dataset.densityFilterModule;
      const filter = filterButton.dataset.densityFilter;
      if (FILTER_MODULE_SET.has(module) && filter) return { kind: 'filter', module, filter };
    }

    const moduleButton = event.target.closest('.vnext-module-rail [data-vnext-module]');
    const module = moduleButton?.dataset.vnextModule;
    if (moduleButton && DOMAIN_SET.has(module)) return { kind: 'module', module };
    return null;
  }

  function restoreRerenderedFocus(target) {
    if (!target) return;
    let replacement = null;
    if (target.kind === 'tab') {
      replacement = root.querySelector(`.vnext-tabbar [data-vnext-tab="${target.tab}"]`);
    } else if (target.kind === 'filter') {
      replacement = filterRailFor(target.module)?.querySelector(`[data-density-filter="${target.filter}"]`) || null;
    } else if (target.kind === 'module') {
      replacement = root.querySelector(`.vnext-module-rail [data-vnext-module="${target.module}"]`);
    }
    if (!replacement || !replacement.isConnected) return;
    try { replacement.focus({ preventScroll: true }); }
    catch { replacement.focus(); }
  }

  function settlePrimaryRouteAtTop(event) {
    if (!media.matches || !event.target.closest('.vnext-tabbar [data-vnext-tab]')) return;
    /* Core render preserves scroll on rerender. Run after its queued frame so real route changes finish at the top. */
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  const observer = new MutationObserver(() => {
    if (syncing) return;
    requestAnimationFrame(syncRail);
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-tab'] });

  root.addEventListener('click', event => {
    const focusTarget = rerenderFocusTarget(event);
    if (event.target.closest('[data-vnext-tab], [data-vnext-module], [data-density-filter]')) requestAnimationFrame(syncRail);
    if (focusTarget) requestAnimationFrame(() => restoreRerenderedFocus(focusTarget));
  }, true);
  root.addEventListener('click', settlePrimaryRouteAtTop);
  window.addEventListener('popstate', () => requestAnimationFrame(syncRail));
  media.addEventListener?.('change', () => requestAnimationFrame(syncRail));

  requestAnimationFrame(syncRail);

  window.YT_MOBILE_VNEXT_IA = Object.freeze({
    refresh: syncRail,
    domainIds: DOMAIN_IDS,
    getState: () => Object.freeze({
      primaryTab: activePrimaryTab(),
      module: activeModule(),
      filter: activeFilter(activeModule()),
      railVisible: shouldShowRail()
    })
  });
})();
