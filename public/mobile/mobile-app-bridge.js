(() => {
  'use strict';
  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  window.YT_MOBILE_APP = Object.freeze({
    navigate(route) {
      if (!route) return;
      root.dispatchEvent(new CustomEvent('v5:navigate', { bubbles: true, detail: { route } }));
    }
  });
})();
