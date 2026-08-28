(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const mobile = window.matchMedia('(max-width: 860px)');
  const theme = document.querySelector('meta[name="theme-color"][media*="max-width"]');

  function ensureStylesheet() {
    if (document.getElementById('mobileVNextStyles')) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = 'mobileVNextStyles';
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-vnext.css';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function ensureRuntime() {
    if (window.YT_MOBILE_VNEXT) return Promise.resolve();
    if (document.getElementById('mobileVNextRuntime')) {
      return new Promise(resolve => document.getElementById('mobileVNextRuntime').addEventListener('load', resolve, { once: true }));
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'mobileVNextRuntime';
      script.src = './mobile/mobile-vnext.js';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureDensityStylesheet() {
    if (document.getElementById('mobileVNextDensityStyles')) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = 'mobileVNextDensityStyles';
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-vnext-density.css';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function ensureDensityRuntime() {
    if (window.YT_MOBILE_VNEXT_DENSITY) return Promise.resolve();
    if (document.getElementById('mobileVNextDensityRuntime')) {
      return new Promise(resolve => document.getElementById('mobileVNextDensityRuntime').addEventListener('load', resolve, { once: true }));
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'mobileVNextDensityRuntime';
      script.src = './mobile/mobile-vnext-density.js';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  function syncSurface() {
    const enabled = mobile.matches;
    const ready = document.documentElement.dataset.mobileVnextReady === 'true';
    root.hidden = !enabled || !ready;
    root.setAttribute('aria-hidden', enabled && ready ? 'false' : 'true');
    document.body.classList.toggle('mobile-vnext-active', enabled);
    document.documentElement.dataset.v5View = enabled ? 'mobile' : 'desktop';
    if (theme && enabled) theme.setAttribute('content', '#F4F3EF');
  }

  document.documentElement.dataset.mobileVnextReady = 'false';
  syncSurface();

  Promise.all([ensureStylesheet(), ensureRuntime()])
    .then(() => Promise.all([ensureDensityStylesheet(), ensureDensityRuntime()]))
    .then(() => {
      document.documentElement.dataset.mobileVnextReady = 'true';
      syncSurface();
      window.YT_MOBILE_VNEXT?.activate?.();
    });

  mobile.addEventListener?.('change', () => {
    syncSurface();
    if (mobile.matches) window.YT_MOBILE_VNEXT?.activate?.();
    else window.YT_MOBILE_VNEXT?.deactivate?.();
  });
})();
