(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const mobile = window.matchMedia('(max-width: 860px)');
  const theme = document.querySelector('meta[name="theme-color"][media*="max-width"]');

  function loadStylesheet(id, href) {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function loadRuntime(id, src, readyCheck) {
    if (readyCheck?.()) return Promise.resolve();
    const existing = document.getElementById(id);
    if (existing) {
      return new Promise(resolve => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', resolve, { once: true });
      });
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  const ensureStylesheet = () => loadStylesheet('mobileVNextStyles', './mobile/mobile-vnext.css');
  const ensureDensityStylesheet = () => loadStylesheet('mobileVNextDensityStyles', './mobile/mobile-vnext-density.css');
  const ensureRuntime = () => loadRuntime('mobileVNextRuntime', './mobile/mobile-vnext.js', () => Boolean(window.YT_MOBILE_VNEXT));
  const ensureDensityRuntime = () => loadRuntime('mobileVNextDensityRuntime', './mobile/mobile-vnext-density.js', () => Boolean(window.YT_MOBILE_VNEXT_DENSITY));

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
