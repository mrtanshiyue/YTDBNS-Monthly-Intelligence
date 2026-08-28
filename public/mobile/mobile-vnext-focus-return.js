(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  const media = window.matchMedia('(max-width: 860px)');
  const returnStack = [];

  function descriptorFor(element) {
    if (!element) return null;
    if (element.matches('[data-density-detail-type][data-density-detail-id]')) {
      return {
        kind: 'density',
        type: element.dataset.densityDetailType || '',
        id: element.dataset.densityDetailId || ''
      };
    }
    if (element.matches('[data-density-metric]')) {
      return { kind: 'metric', id: element.dataset.densityMetric || '' };
    }
    if (element.matches('[data-vnext-signal]')) {
      return { kind: 'signal', id: element.dataset.vnextSignal || '' };
    }
    if (element.matches('[data-vnext-result]')) {
      return { kind: 'result', id: element.dataset.vnextResult || '' };
    }
    return null;
  }

  function selectorFor(descriptor) {
    if (!descriptor) return '';
    const esc = value => CSS.escape(String(value ?? ''));
    if (descriptor.kind === 'density') {
      return `[data-density-detail-type="${esc(descriptor.type)}"][data-density-detail-id="${esc(descriptor.id)}"]`;
    }
    if (descriptor.kind === 'metric') return `[data-density-metric="${esc(descriptor.id)}"]`;
    if (descriptor.kind === 'signal') return `[data-vnext-signal="${esc(descriptor.id)}"]`;
    if (descriptor.kind === 'result') return `[data-vnext-result="${esc(descriptor.id)}"]`;
    return '';
  }

  function currentTrigger(event) {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest?.('[data-density-detail-type][data-density-detail-id], [data-density-metric], [data-vnext-signal], [data-vnext-result]') || null;
  }

  function confirmAndPush(descriptor) {
    queueMicrotask(() => {
      if (!descriptor || !root.querySelector('.vnext-detail-screen')) return;
      returnStack.push(descriptor);
    });
  }

  function restoreLatest() {
    if (!returnStack.length || !media.matches) return;
    const descriptor = returnStack[returnStack.length - 1];
    const selector = selectorFor(descriptor);
    if (!selector) returnStack.pop();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = selector ? root.querySelector(selector) : null;
      if (!target) return;
      returnStack.pop();
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }));
  }

  root.addEventListener('click', event => {
    const trigger = currentTrigger(event);
    const descriptor = descriptorFor(trigger);
    if (descriptor) confirmAndPush(descriptor);
  }, true);

  window.addEventListener('popstate', () => restoreLatest());

  media.addEventListener?.('change', () => {
    if (!media.matches) returnStack.length = 0;
  });

  window.YT_MOBILE_VNEXT_FOCUS_RETURN = Object.freeze({
    getState: () => Object.freeze({ depth: returnStack.length })
  });
})();
