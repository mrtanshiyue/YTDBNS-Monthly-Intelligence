(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

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
