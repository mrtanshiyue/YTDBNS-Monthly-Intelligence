(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  function ensureStylesheet() {
    const id = 'v52MobileRedesignStyles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = './mobile/mobile-redesign.css';
    document.head.appendChild(link);
  }

  function ensureScript() {
    const id = 'v52MobileRedesignRuntime';
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = './mobile/mobile-redesign.js';
    script.async = false;
    document.head.appendChild(script);
  }

  ensureStylesheet();
  ensureScript();

  window.YT_MOBILE_APP = Object.freeze({
    navigate(route) {
      if (!route) return;
      root.dispatchEvent(new CustomEvent('v5:navigate', { bubbles: true, detail: { route } }));
    }
  });
})();
