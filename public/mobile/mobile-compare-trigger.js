(() => {
  'use strict';
  const root = document.getElementById('mobileAppRoot');
  if (!root) return;

  function enhanceOverview() {
    const summary = root.querySelector('.v5-overview-summary');
    if (!summary || root.querySelector('[data-v5-open-compare]')) return;
    summary.insertAdjacentHTML('afterend', `
      <button class="v5-overview-compare-trigger" type="button" data-v5-open-compare>
        <span><b>对比上期</b><small>上一等长期间 · 只读 GET</small></span><i aria-hidden="true">›</i>
      </button>`);
  }

  new MutationObserver(enhanceOverview).observe(root, { childList: true, subtree: true });
  enhanceOverview();
})();
