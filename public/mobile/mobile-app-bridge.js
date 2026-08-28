(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const mobileMedia = window.matchMedia('(max-width: 860px)');
  const restoreVisibility = () => {
    const mobile = mobileMedia.matches;
    const ready = document.documentElement.dataset.v52Ready === 'true';
    root.hidden = !mobile || !ready;
    root.setAttribute('aria-hidden', mobile && ready ? 'false' : 'true');
  };

  function ensureStylesheet() {
    const id = 'v52MobileRedesignStyles';
    const existing = document.getElementById(id);
    if (existing) return Promise.resolve(existing);
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-redesign.css';
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => resolve(link), { once: true });
      document.head.appendChild(link);
    });
  }

  function ensureScript() {
    const id = 'v52MobileRedesignRuntime';
    const existing = document.getElementById(id);
    if (existing) return Promise.resolve(existing);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = id;
      script.src = './mobile/mobile-redesign.js';
      script.async = false;
      script.addEventListener('load', () => resolve(script), { once: true });
      script.addEventListener('error', () => resolve(script), { once: true });
      document.head.appendChild(script);
    });
  }

  document.documentElement.dataset.v52Ready = 'false';
  restoreVisibility();

  Promise.all([ensureStylesheet(), ensureScript()]).then(() => {
    document.documentElement.dataset.v52Ready = 'true';
    restoreVisibility();
    root.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true }));
  });

  mobileMedia.addEventListener?.('change', restoreVisibility);

  window.YT_MOBILE_APP = Object.freeze({
    navigate(route) {
      if (!route) return;
      root.dispatchEvent(new CustomEvent('v5:navigate', { bubbles: true, detail: { route } }));
    }
  });
})();
