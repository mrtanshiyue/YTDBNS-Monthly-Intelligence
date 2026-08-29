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
  const SORT_MODULE_SET = new Set(['ads', 'products', 'inventory']);
  const PRIMARY_FOCUS_TAB_SET = new Set(['today', 'alerts', 'trends', 'search']);
  const ALERT_SEVERITY_SET = new Set(['all', 'critical', 'warning']);
  const DUPLICATE_PRIMARY_IDS = new Set(['today', 'alerts']);
  let syncing = false;
  let lastRevealedModule = null;
  let lastRevealedRail = null;
  let lastRevealedFilter = null;
  let lastRevealedFilterRail = null;
  let lastRevealedSort = null;
  let lastRevealedSortRail = null;
  let periodFocusOrigin = null;
  let periodSheetObservedOpen = false;
  let periodRestoreScheduled = false;

  function densityState() {
    return window.YT_MOBILE_VNEXT_DENSITY?.getState?.() || null;
  }

  function vnextState() {
    return window.YT_MOBILE_VNEXT?.getState?.() || null;
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

  function activeSort(module) {
    if (!SORT_MODULE_SET.has(module)) return null;
    return densityState()?.sorts?.[module] || null;
  }

  function activeSeverity() {
    const value = vnextState()?.severity;
    return ALERT_SEVERITY_SET.has(value) ? value : 'all';
  }

  function activePrimaryTab() {
    return root.querySelector('.vnext-app')?.dataset.tab || 'today';
  }

  function shouldShowRail() {
    return activePrimaryTab() === 'today' || Boolean(activeModule());
  }

  function focusWithoutScroll(control) {
    if (!control || !control.isConnected) return false;
    try { control.focus({ preventScroll: true }); }
    catch { control.focus(); }
    return document.activeElement === control;
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

  function sortRailFor(module) {
    if (!SORT_MODULE_SET.has(module)) return null;
    return root.querySelector(`.vnext-density-module-page[data-density-module="${module}"] .vnext-sort-tags`);
  }

  function syncFilterSemantics(module) {
    const filterRail = filterRailFor(module);
    const filter = activeFilter(module);
    if (!filterRail || !filter) return;

    for (const button of filterRail.querySelectorAll('[data-density-filter]')) {
      button.setAttribute('aria-pressed', button.dataset.densityFilter === filter ? 'true' : 'false');
    }
  }

  function syncSortSemantics(module) {
    const sortRail = sortRailFor(module);
    const sort = activeSort(module);
    if (!sortRail || !sort) return;

    for (const button of sortRail.querySelectorAll('[data-density-sort]')) {
      button.setAttribute('aria-pressed', button.dataset.densitySort === sort ? 'true' : 'false');
    }
  }

  function syncSeveritySemantics() {
    const group = root.querySelector('.vnext-segmented[aria-label="异常级别"]');
    if (!group) return;
    const severity = activeSeverity();
    for (const button of group.querySelectorAll('[data-vnext-severity]')) {
      button.setAttribute('aria-pressed', button.dataset.vnextSeverity === severity ? 'true' : 'false');
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

  function revealActiveSort(module) {
    if (!SORT_MODULE_SET.has(module)) {
      lastRevealedSort = null;
      lastRevealedSortRail = null;
      return;
    }

    const sortRail = sortRailFor(module);
    const sort = activeSort(module);
    if (!sortRail || !sort) return;
    if (sortRail === lastRevealedSortRail && sort === lastRevealedSort) return;

    const button = sortRail.querySelector(`[data-density-sort="${sort}"]`);
    if (!button) return;
    revealControl(sortRail, button, 1);

    lastRevealedSort = sort;
    lastRevealedSortRail = sortRail;
  }

  function capturePeriodFocusOrigin(event) {
    if (!media.matches || event.detail !== 0) return;
    const trigger = event.target.closest('[data-vnext-period]');
    if (!trigger) return;
    periodFocusOrigin = {
      tab: activePrimaryTab(),
      search: Boolean(trigger.closest('.vnext-search-toolbar'))
    };
    periodSheetObservedOpen = false;
    periodRestoreScheduled = false;
  }

  function replacementPeriodTrigger(origin) {
    if (!origin || activePrimaryTab() !== origin.tab) return null;
    return origin.search
      ? root.querySelector('.vnext-search-toolbar [data-vnext-period]')
      : root.querySelector('.vnext-toolbar [data-vnext-period]');
  }

  function syncPeriodSheetFocus() {
    const sheetOpen = Boolean(root.querySelector('.vnext-sheet[role="dialog"]'));
    if (sheetOpen) {
      if (periodFocusOrigin) periodSheetObservedOpen = true;
      return;
    }
    if (!periodFocusOrigin || !periodSheetObservedOpen || periodRestoreScheduled) return;

    periodRestoreScheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      periodRestoreScheduled = false;
      if (!periodFocusOrigin || root.querySelector('.vnext-sheet[role="dialog"]')) return;
      const origin = periodFocusOrigin;
      const replacement = replacementPeriodTrigger(origin);
      if (!replacement || !focusWithoutScroll(replacement)) {
        requestAnimationFrame(syncPeriodSheetFocus);
        return;
      }

      /* Keep the logical origin alive for one more frame so a queued history render cannot silently detach the focused replacement. */
      requestAnimationFrame(() => {
        if (!periodFocusOrigin || root.querySelector('.vnext-sheet[role="dialog"]')) return;
        const settledReplacement = replacementPeriodTrigger(periodFocusOrigin);
        if (settledReplacement && document.activeElement === settledReplacement) {
          periodFocusOrigin = null;
          periodSheetObservedOpen = false;
          return;
        }
        requestAnimationFrame(syncPeriodSheetFocus);
      });
    }));
  }

  function syncRail() {
    if (syncing || !media.matches || !document.body.classList.contains('mobile-vnext-active')) return;

    syncing = true;
    try {
      syncSeveritySemantics();
      syncPeriodSheetFocus();

      const rail = root.querySelector('.vnext-module-rail');
      if (!rail) return;
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
      syncSortSemantics(module);
      revealActiveSort(module);
    } finally {
      syncing = false;
    }
  }

  function rerenderFocusTarget(event) {
    if (!media.matches || event.detail !== 0) return null;

    const tabButton = event.target.closest('.vnext-tabbar [data-vnext-tab]');
    const tab = tabButton?.dataset.vnextTab;
    if (tabButton && PRIMARY_FOCUS_TAB_SET.has(tab)) return { kind: 'tab', tab };

    const severityButton = event.target.closest('[data-vnext-severity]');
    const severity = severityButton?.dataset.vnextSeverity;
    if (severityButton && ALERT_SEVERITY_SET.has(severity)) return { kind: 'severity', severity };

    const filterButton = event.target.closest('[data-density-filter]');
    if (filterButton) {
      const module = filterButton.dataset.densityFilterModule;
      const filter = filterButton.dataset.densityFilter;
      if (FILTER_MODULE_SET.has(module) && filter) return { kind: 'filter', module, filter };
    }

    const sortButton = event.target.closest('[data-density-sort]');
    if (sortButton) {
      const module = sortButton.dataset.densitySortModule;
      const sort = sortButton.dataset.densitySort;
      if (SORT_MODULE_SET.has(module) && sort) return { kind: 'sort', module, sort };
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
    } else if (target.kind === 'severity') {
      replacement = root.querySelector(`[data-vnext-severity="${target.severity}"]`);
    } else if (target.kind === 'filter') {
      replacement = filterRailFor(target.module)?.querySelector(`[data-density-filter="${target.filter}"]`) || null;
    } else if (target.kind === 'sort') {
      replacement = sortRailFor(target.module)?.querySelector(`[data-density-sort="${target.sort}"]`) || null;
    } else if (target.kind === 'module') {
      replacement = root.querySelector(`.vnext-module-rail [data-vnext-module="${target.module}"]`);
    }
    focusWithoutScroll(replacement);
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
    capturePeriodFocusOrigin(event);
    const focusTarget = rerenderFocusTarget(event);
    if (event.target.closest('[data-vnext-tab], [data-vnext-module], [data-density-filter], [data-density-sort], [data-vnext-severity]')) requestAnimationFrame(syncRail);
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
      sort: activeSort(activeModule()),
      severity: activeSeverity(),
      railVisible: shouldShowRail()
    })
  });
})();
