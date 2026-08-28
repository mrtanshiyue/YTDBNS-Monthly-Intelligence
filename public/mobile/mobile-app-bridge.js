(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const runtime = window.YT_SHARED_RUNTIME;
  const syncRuntimeMode = next => {
    const mode = next?.mode || runtime?.getState?.()?.mode || '';
    document.body.classList.toggle('mobile-vnext-demo', mode === 'demo');
    if (mode) document.body.dataset.mobileVnextMode = mode;
    else delete document.body.dataset.mobileVnextMode;
  };

  syncRuntimeMode(runtime?.getState?.());
  runtime?.subscribe?.(syncRuntimeMode);

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
    }
  });
})();
