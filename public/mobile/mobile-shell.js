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

  function ensureHomeBriefStylesheet() {
    if (document.getElementById('mobileVNextHomeBriefStyles')) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = 'mobileVNextHomeBriefStyles';
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-vnext-home-briefs.css';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function ensureHomeBriefRuntime() {
    if (window.YT_MOBILE_VNEXT_HOME_BRIEFS) return Promise.resolve();
    if (document.getElementById('mobileVNextHomeBriefRuntime')) {
      return new Promise(resolve => document.getElementById('mobileVNextHomeBriefRuntime').addEventListener('load', resolve, { once: true }));
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'mobileVNextHomeBriefRuntime';
      script.src = './mobile/mobile-vnext-home-briefs.js';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureHomeDetailRuntime() {
    if (window.YT_MOBILE_VNEXT_HOME_DETAIL) return Promise.resolve();
    if (document.getElementById('mobileVNextHomeDetailRuntime')) {
      return new Promise(resolve => document.getElementById('mobileVNextHomeDetailRuntime').addEventListener('load', resolve, { once: true }));
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'mobileVNextHomeDetailRuntime';
      script.src = './mobile/mobile-vnext-home-detail.js';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureIaStylesheet() {
    if (document.getElementById('mobileVNextIaStyles')) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = 'mobileVNextIaStyles';
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-vnext-ia.css';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function ensureIaRuntime() {
    if (window.YT_MOBILE_VNEXT_IA) return Promise.resolve();
    if (document.getElementById('mobileVNextIaRuntime')) {
      return new Promise(resolve => document.getElementById('mobileVNextIaRuntime').addEventListener('load', resolve, { once: true }));
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'mobileVNextIaRuntime';
      script.src = './mobile/mobile-vnext-ia.js';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureFocusReturnRuntime() {
    if (window.YT_MOBILE_VNEXT_FOCUS_RETURN) return Promise.resolve();
    if (document.getElementById('mobileVNextFocusReturnRuntime')) {
      return new Promise(resolve => document.getElementById('mobileVNextFocusReturnRuntime').addEventListener('load', resolve, { once: true }));
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'mobileVNextFocusReturnRuntime';
      script.src = './mobile/mobile-vnext-focus-return.js';
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureFirstScreenStylesheet() {
    if (document.getElementById('mobileVNextFirstScreenStyles')) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = 'mobileVNextFirstScreenStyles';
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-vnext-first-screen.css';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function ensureFontStylesheet() {
    if (document.getElementById('mobileVNextFontStyles')) return Promise.resolve();
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.id = 'mobileVNextFontStyles';
      link.rel = 'stylesheet';
      link.href = './mobile/mobile-vnext-fonts.css';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.appendChild(link);
    });
  }

  function promoteResponsiveStylesheet() {
    const link = document.getElementById('responsiveUiStyles');
    if (link) document.head.appendChild(link);
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
    .then(() => Promise.all([ensureHomeBriefStylesheet(), ensureHomeBriefRuntime()]))
    .then(() => ensureHomeDetailRuntime())
    .then(() => Promise.all([ensureIaStylesheet(), ensureIaRuntime(), ensureFocusReturnRuntime(), ensureFirstScreenStylesheet(), ensureFontStylesheet()]))
    .then(() => {
      // Dynamic mobile layers load after the document head. Move the shared
      // responsive convergence layer last so its semantic tokens remain final.
      promoteResponsiveStylesheet();
      document.documentElement.dataset.mobileVnextReady = 'true';
      syncSurface();
      window.YT_MOBILE_VNEXT?.activate?.();
      window.YT_MOBILE_VNEXT_HOME_BRIEFS?.refresh?.();
      window.YT_MOBILE_VNEXT_IA?.refresh?.();
    });

  mobile.addEventListener?.('change', () => {
    syncSurface();
    if (mobile.matches) {
      window.YT_MOBILE_VNEXT?.activate?.();
      window.YT_MOBILE_VNEXT_HOME_BRIEFS?.refresh?.();
      window.YT_MOBILE_VNEXT_IA?.refresh?.();
    } else window.YT_MOBILE_VNEXT?.deactivate?.();
  });
})();
