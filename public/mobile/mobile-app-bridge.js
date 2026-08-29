(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const runtime = window.YT_SHARED_RUNTIME;
  const mobile = window.matchMedia('(max-width: 860px)');
  const VNEXT_HISTORY_KEY = 'ytdbnsMobileVnext';
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const nativePushState = history.pushState.bind(history);
  const nativeReplaceState = history.replaceState.bind(history);
  let pendingPeriodSelection = false;
  let pendingRestore = null;
  let restoringPeriod = false;
  let restoreSerial = 0;

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

  function enrichVnextHistoryState(candidate) {
    if (!mobile.matches || !candidate || typeof candidate !== 'object') return candidate;
    const payload = candidate[VNEXT_HISTORY_KEY];
    if (!payload || typeof payload !== 'object' || rangeFromState(candidate)) return candidate;
    const range = rangeFromState(history.state) || runtimeRange();
    if (!range) return candidate;
    return {
      ...candidate,
      [VNEXT_HISTORY_KEY]: { ...payload, ...range }
    };
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

    if (payload.from === range.from && payload.to === range.to) {
      pendingPeriodSelection = false;
      return true;
    }

    nativeReplaceState({
      ...current,
      [VNEXT_HISTORY_KEY]: { ...payload, ...range }
    }, document.title);
    pendingPeriodSelection = false;
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
        if (serial === restoreSerial) restoringPeriod = false;
      });
    return true;
  }

  function syncPeriodHistory(next = runtime?.getState?.()) {
    if (!mobile.matches) return;
    if (pendingRestore && restorePendingRange(next)) return;
    persistRuntimeRange(next);
  }

  root.addEventListener('click', event => {
    if (event.target.closest('[data-vnext-quick], [data-vnext-period-month]')) {
      pendingPeriodSelection = true;
    }
  }, true);

  window.addEventListener('popstate', event => {
    if (!mobile.matches) return;
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
    requestAnimationFrame(() => syncPeriodHistory(runtime?.getState?.()));
  });
  readyObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mobile-vnext-ready']
  });

  pendingRestore = rangeFromState(history.state);
  syncRuntimeMode(runtime?.getState?.());
  runtime?.subscribe?.(next => {
    syncRuntimeMode(next);
    syncPeriodHistory(next);
  });
  mobile.addEventListener?.('change', event => {
    if (!event.matches) return;
    pendingRestore = rangeFromState(history.state);
    requestAnimationFrame(() => syncPeriodHistory(runtime?.getState?.()));
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
      root.dispatchEvent(new CustomEvent('vnext:search', {
        bubbles: true,
        detail: { query }
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
    }
  });
})();