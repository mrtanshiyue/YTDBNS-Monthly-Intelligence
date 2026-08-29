(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const runtime = window.YT_SHARED_RUNTIME;
  const mobile = window.matchMedia('(max-width: 860px)');
  const VNEXT_HISTORY_KEY = 'ytdbnsMobileVnext';
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const NAVIGATION_SEVERITIES = new Set(['all', 'critical', 'warning']);
  const QUERY_LIMIT = 256;
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);
  let pendingPeriodSelection = false;
  let pendingRestore = null;
  let restoringPeriod = false;
  let restoreSerial = 0;
  let navigationContext = Object.freeze({ severity: 'all', query: '' });
  let restoringNavigationContext = false;
  let navigationPersistFrame = 0;
  let navigationRestoreFrame = 0;

  const syncRuntimeMode = next => {
    const mode = next?.mode || runtime?.getState?.()?.mode || '';
    document.body.classList.toggle('mobile-vnext-demo', mode === 'demo');
    if (mode) document.body.dataset.mobileVnextMode = mode;
    else delete document.body.dataset.mobileVnextMode;
  };

  function validRange(from, to) {
    return DATE_RE.test(String(from || '')) && DATE_RE.test(String(to || '')) && from <= to;
  }

  function rangeFromState(source = history.state) {
    const payload = source?.[VNEXT_HISTORY_KEY];
    if (!payload || typeof payload !== 'object') return null;
    const from = String(payload.from || '');
    const to = String(payload.to || '');
    return validRange(from, to) ? { from, to } : null;
  }

  function runtimeRange(next = runtime?.getState?.()) {
    const from = String(next?.from || '');
    const to = String(next?.to || '');
    return validRange(from, to) ? { from, to } : null;
  }

  function sameRange(a, b) {
    return Boolean(a && b && a.from === b.from && a.to === b.to);
  }

  function normalizeSeverity(value, fallback = 'all') {
    const candidate = String(value || '');
    return NAVIGATION_SEVERITIES.has(candidate) ? candidate : fallback;
  }

  function normalizeQuery(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    return value.slice(0, QUERY_LIMIT);
  }

  function navigationContextFromState(source = history.state, fallback = { severity: 'all', query: '' }) {
    const payload = source?.[VNEXT_HISTORY_KEY];
    if (!payload || typeof payload !== 'object') {
      return {
        severity: normalizeSeverity(fallback?.severity),
        query: normalizeQuery(fallback?.query)
      };
    }
    return {
      severity: normalizeSeverity(payload.severity, normalizeSeverity(fallback?.severity)),
      query: normalizeQuery(payload.query, normalizeQuery(fallback?.query))
    };
  }

  function setNavigationContext(next) {
    navigationContext = Object.freeze({
      severity: normalizeSeverity(next?.severity, navigationContext.severity),
      query: normalizeQuery(next?.query, navigationContext.query)
    });
    return navigationContext;
  }

  function enrichVnextHistoryState(candidate) {
    if (!mobile.matches || !candidate || typeof candidate !== 'object') return candidate;
    const payload = candidate[VNEXT_HISTORY_KEY];
    if (!payload || typeof payload !== 'object') return candidate;
    const range = rangeFromState(candidate) || rangeFromState(history.state) || runtimeRange();
    const context = navigationContextFromState(candidate, navigationContext);
    return {
      ...candidate,
      [VNEXT_HISTORY_KEY]: {
        ...payload,
        ...context,
        ...(range || {})
      }
    };
  }

  function queueNavigationRestore() {
    if (!mobile.matches) return;
    if (navigationRestoreFrame) cancelAnimationFrame(navigationRestoreFrame);
    navigationRestoreFrame = requestAnimationFrame(() => {
      navigationRestoreFrame = 0;
      restoreNavigationContext();
    });
  }

  history.pushState = function mobilePeriodPushState(state, title, url) {
    return nativePushState(enrichVnextHistoryState(state), title, url);
  };

  history.replaceState = function mobilePeriodReplaceState(state, title, url) {
    return nativeReplaceState(enrichVnextHistoryState(state), title, url);
  };

  function persistRuntimeRange(next = runtime?.getState?.()) {
    if (!mobile.matches) return false;
    const range = runtimeRange(next);
    const current = history.state || {};
    const payload = current[VNEXT_HISTORY_KEY];
    if (!range || !payload || typeof payload !== 'object') return false;
    if (pendingPeriodSelection && payload.sheet === 'period') return false;

    const storedRange = rangeFromState(current);
    if (sameRange(storedRange, range)) {
      pendingPeriodSelection = false;
      return true;
    }

    // Once a Browser History entry owns a valid range, generic runtime publishes
    // must never rewrite it. This protects a Forward target from a late response
    // belonging to the Back entry. Only an explicit user period selection may
    // intentionally change the range owned by the current working entry.
    if (storedRange && !pendingPeriodSelection) return false;

    nativeReplaceState({
      ...current,
      [VNEXT_HISTORY_KEY]: { ...payload, ...range }
    }, document.title);
    pendingPeriodSelection = false;
    return true;
  }

  function persistNavigationContext() {
    if (!mobile.matches || restoringNavigationContext) return false;
    const current = history.state || {};
    const payload = current[VNEXT_HISTORY_KEY];
    if (!payload || typeof payload !== 'object') return false;
    const stored = navigationContextFromState(current);
    if (stored.severity === navigationContext.severity && stored.query === navigationContext.query) return true;
    nativeReplaceState({
      ...current,
      [VNEXT_HISTORY_KEY]: {
        ...payload,
        severity: navigationContext.severity,
        query: navigationContext.query
      }
    }, document.title);
    return true;
  }

  function queueNavigationPersist() {
    if (!mobile.matches || restoringNavigationContext) return;
    if (navigationPersistFrame) cancelAnimationFrame(navigationPersistFrame);
    navigationPersistFrame = requestAnimationFrame(() => {
      navigationPersistFrame = 0;
      persistNavigationContext();
    });
  }

  function restoreNavigationContext() {
    if (!mobile.matches || document.documentElement.dataset.mobileVnextReady !== 'true') return false;
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    if (!core) return false;

    if (core.tab === 'alerts' && core.severity !== navigationContext.severity) {
      const button = root.querySelector(`[data-vnext-page="alerts"] [data-vnext-severity="${navigationContext.severity}"]`);
      if (button) {
        restoringNavigationContext = true;
        try { button.click(); } finally { restoringNavigationContext = false; }
      }
    }

    const refreshed = window.YT_MOBILE_VNEXT?.getState?.();
    if (refreshed?.tab === 'search' && refreshed.query !== navigationContext.query) {
      const input = root.querySelector('[data-vnext-search-input]');
      if (input) {
        restoringNavigationContext = true;
        try {
          input.value = navigationContext.query;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } finally {
          restoringNavigationContext = false;
        }
      }
    }
    return true;
  }

  function mobileRuntimeReady(next) {
    return document.documentElement.dataset.mobileVnextReady === 'true' &&
      mobile.matches &&
      (next?.mode === 'live' || next?.mode === 'demo');
  }

  function restorePendingRange(next = runtime?.getState?.()) {
    if (!pendingRestore || restoringPeriod || !mobileRuntimeReady(next) || !runtime?.setRange) return false;
    const target = pendingRestore;
    const current = runtimeRange(next);
    if (sameRange(current, target)) {
      pendingRestore = null;
      persistRuntimeRange(next);
      return true;
    }

    const serial = ++restoreSerial;
    pendingRestore = null;
    restoringPeriod = true;
    Promise.resolve(runtime.setRange(target.from, target.to))
      .catch(() => null)
      .finally(() => {
        if (serial !== restoreSerial) return;
        restoringPeriod = false;
        // A newer Back/Forward target can arrive while this restore is in flight.
        // Resume the latest queued target immediately when the current range load
        // settles so Browser Forward cannot strand history and runtime on different periods.
        if (pendingRestore) requestAnimationFrame(() => restorePendingRange(runtime?.getState?.()));
      });
    return true;
  }

  function syncPeriodHistory(next = runtime?.getState?.()) {
    if (!mobile.matches) return;
    if (pendingRestore && restorePendingRange(next)) return;
    persistRuntimeRange(next);
  }

  root.addEventListener('click', event => {
    if (event.target.closest('[data-vnext-quick], [data-vnext-period-month], [data-vnext-month], [data-density-month]')) {
      pendingPeriodSelection = true;
    }
    if (restoringNavigationContext) return;

    const severity = event.target.closest('[data-vnext-severity]')?.dataset.vnextSeverity;
    if (NAVIGATION_SEVERITIES.has(String(severity || ''))) {
      setNavigationContext({ severity });
      queueNavigationPersist();
    }

    const query = event.target.closest('[data-vnext-query]')?.dataset.vnextQuery;
    if (typeof query === 'string') {
      setNavigationContext({ query });
      queueNavigationPersist();
    } else if (event.target.closest('[data-vnext-clear-search]')) {
      setNavigationContext({ query: '' });
      queueNavigationPersist();
    }
  }, true);

  root.addEventListener('input', event => {
    if (restoringNavigationContext || !event.target.matches('[data-vnext-search-input]')) return;
    setNavigationContext({ query: event.target.value });
    queueNavigationPersist();
  }, true);

  root.addEventListener('vnext:search', event => {
    if (restoringNavigationContext) return;
    setNavigationContext({ query: normalizeQuery(event.detail?.query) });
  }, true);

  window.addEventListener('popstate', event => {
    if (!mobile.matches) return;
    setNavigationContext(navigationContextFromState(event.state));
    queueNavigationRestore();
    if (pendingPeriodSelection) {
      pendingRestore = null;
      requestAnimationFrame(() => persistRuntimeRange(runtime?.getState?.()));
      return;
    }
    pendingRestore = rangeFromState(event.state);
    if (pendingRestore) requestAnimationFrame(() => restorePendingRange(runtime?.getState?.()));
  });

  const readyObserver = new MutationObserver(() => {
    if (document.documentElement.dataset.mobileVnextReady !== 'true') return;
    setNavigationContext(navigationContextFromState(history.state, navigationContext));
    requestAnimationFrame(() => {
      persistNavigationContext();
      restoreNavigationContext();
      syncPeriodHistory(runtime?.getState?.());
    });
  });
  readyObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mobile-vnext-ready']
  });

  navigationContext = Object.freeze(navigationContextFromState(history.state));
  pendingRestore = rangeFromState(history.state);
  syncRuntimeMode(runtime?.getState?.());
  runtime?.subscribe?.(next => {
    syncRuntimeMode(next);
    syncPeriodHistory(next);
  });
  mobile.addEventListener?.('change', event => {
    if (!event.matches) return;
    setNavigationContext(navigationContextFromState(history.state));
    pendingRestore = rangeFromState(history.state);
    requestAnimationFrame(() => {
      persistNavigationContext();
      restoreNavigationContext();
      syncPeriodHistory(runtime?.getState?.());
    });
  });

  window.YT_MOBILE_APP = Object.freeze({
    navigate(destination, detail = null) {
      if (!destination) return;
      root.dispatchEvent(new CustomEvent('vnext:navigate', {
        bubbles: true,
        detail: { destination, detail }
      }));
    },
    openSearch(query = '') {
      const normalizedQuery = normalizeQuery(query);
      setNavigationContext({ query: normalizedQuery });
      root.dispatchEvent(new CustomEvent('vnext:search', {
        bubbles: true,
        detail: { query: normalizedQuery }
      }));
    },
    getPeriodContext() {
      const historyRange = rangeFromState(history.state);
      const currentRange = runtimeRange(runtime?.getState?.());
      return Object.freeze({
        history: historyRange ? { ...historyRange } : null,
        runtime: currentRange ? { ...currentRange } : null,
        pendingSelection: pendingPeriodSelection,
        restoring: restoringPeriod
      });
    },
    getNavigationContext() {
      const core = window.YT_MOBILE_VNEXT?.getState?.() || null;
      const historyContext = navigationContextFromState(history.state);
      const activeSeverity = root.querySelector('[data-vnext-page="alerts"] [data-vnext-severity][aria-pressed="true"]')?.dataset.vnextSeverity || null;
      const searchInput = root.querySelector('[data-vnext-search-input]');
      return Object.freeze({
        history: Object.freeze({ ...historyContext }),
        memory: Object.freeze({ ...navigationContext }),
        core: core ? Object.freeze({
          tab: core.tab,
          severity: core.severity,
          query: core.query
        }) : null,
        view: Object.freeze({
          severity: activeSeverity,
          query: searchInput ? searchInput.value : null
        }),
        restoring: restoringNavigationContext
      });
    }
  });
})();
