(() => {
  'use strict';

  const mobileRoot = document.getElementById('mobileAppRoot');
  const runtime = window.YT_SHARED_RUNTIME;
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  if (!mobileRoot || !runtime || !selectors) return;

  const compareRoot = document.createElement('div');
  compareRoot.id = 'v5MobileCompareRoot';
  compareRoot.className = 'v5-compare-root';
  document.body.appendChild(compareRoot);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const rangeLabel = (from, to) => runtime.helpers?.rangeLabel?.(from, to) || `${from} – ${to}`;
  let lastFocus = null;

  function focusClose() {
    requestAnimationFrame(() => compareRoot.querySelector('[data-v5-compare-close]')?.focus({ preventScroll: true }));
  }

  function close() {
    if (!compareRoot.innerHTML) return;
    compareRoot.innerHTML = '';
    document.body.classList.remove('v5-mobile-overlay-open');
    if (lastFocus instanceof HTMLElement && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function delta(current, previous, type, good = 'neutral') {
    if (current == null || previous == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return { label: '—', tone: '' };
    let rawChange;
    let label;
    if (type === 'pct') {
      rawChange = Number(current) - Number(previous);
      const pp = rawChange * 100;
      label = `${pp > 0 ? '+' : ''}${pp.toFixed(1)}pp`;
    } else {
      if (!Number(previous)) return { label: '—', tone: '' };
      rawChange = (Number(current) - Number(previous)) / Math.abs(Number(previous));
      label = `${rawChange > 0 ? '+' : ''}${(rawChange * 100).toFixed(1)}%`;
    }
    let tone = '';
    if (good === 'up') tone = rawChange > 0 ? 'up' : rawChange < 0 ? 'down' : '';
    if (good === 'down') tone = rawChange < 0 ? 'up' : rawChange > 0 ? 'down' : '';
    return { label, tone };
  }

  function format(value, type) {
    if (type === 'money') return fmt?.money ? fmt.money(value, 0) : value == null ? '—' : `$${Number(value).toLocaleString('en-US')}`;
    if (type === 'pct') return fmt?.percent ? fmt.percent(value) : value == null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
    return fmt?.number ? fmt.number(value) : value == null ? '—' : Number(value).toLocaleString('en-US');
  }

  function fullscreen(body) {
    compareRoot.innerHTML = `
      <section class="v5-fullscreen" role="dialog" aria-modal="true" aria-labelledby="v5CompareTitle">
        <header class="v5-fullscreen-head">
          <button class="v5-fullscreen-back" type="button" data-v5-compare-close aria-label="返回">‹</button>
          <div class="v5-fullscreen-title"><span>COMPARE</span><h2 id="v5CompareTitle">对比上期</h2></div>
        </header>
        <div class="v5-fullscreen-body">${body}</div>
      </section>`;
    document.body.classList.add('v5-mobile-overlay-open');
    focusClose();
  }

  async function open() {
    if (!compareRoot.innerHTML) lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const state = runtime.getState();
    fullscreen('<div class="v5-compare-loading"><strong>正在读取上一期间</strong><span>比较使用上一等长日期区间，保持与当前选择期间一致的长度。</span></div>');

    if (state.mode !== 'live') {
      fullscreen('<div class="v5-compare-unavailable"><strong>预览模式暂不生成对比</strong><span>Mobile Compare 只使用真实 GET 数据，不用 Demo 数据模拟上一期间。</span></div>');
      return;
    }

    try {
      const previous = await runtime.comparePrevious();
      if (!previous || previous.unavailable || !previous.dashboard) {
        fullscreen('<div class="v5-compare-unavailable"><strong>上一期间暂无可比数据</strong><span>当前数据源无法返回上一等长期间的经营汇总。</span></div>');
        return;
      }

      const currentSummary = selectors.normalizeSummary(state.dashboard?.summary || {});
      const previousSummary = selectors.normalizeSummary(previous.dashboard?.summary || {});
      const metrics = [
        ['销售额', 'sales', 'money', 'up'],
        ['贡献利润', 'profit', 'money', 'up'],
        ['广告花费', 'adSpend', 'money', 'neutral'],
        ['ACOS', 'acos', 'pct', 'down'],
        ['TACOS', 'tacos', 'pct', 'down']
      ];

      const rows = metrics.map(([label, key, type, good]) => {
        const d = delta(currentSummary[key], previousSummary[key], type, good);
        return `
          <article class="v5-compare-row">
            <div class="v5-compare-row-head"><span>${label}</span><b class="v5-compare-delta ${d.tone}">${d.label}</b></div>
            <div class="v5-compare-values">
              <div><small>当前期间</small><strong>${format(currentSummary[key], type)}</strong></div>
              <div><small>上一期间</small><strong>${format(previousSummary[key], type)}</strong></div>
            </div>
          </article>`;
      }).join('');

      fullscreen(`
        <div class="v5-compare-range">
          <span><small>CURRENT</small><b>${esc(rangeLabel(state.from, state.to))}</b></span>
          <i aria-hidden="true">↔</i>
          <span><small>PREVIOUS</small><b>${esc(rangeLabel(previous.from, previous.to))}</b></span>
        </div>
        <section class="v5-compare-list" aria-label="经营指标对比">${rows}</section>
        <p class="v5-compare-note">百分比指标显示百分点变化；金额指标显示相对变化。绿色表示朝有利方向变化，红色表示朝不利方向变化；广告花费本身保持中性。Compare 全程只发起 GET 请求，不修改 D1、R2 或导入状态。</p>`);
    } catch (error) {
      fullscreen(`<div class="v5-compare-unavailable"><strong>对比读取失败</strong><span>${esc(error?.message || '无法读取上一期间数据')}</span></div>`);
    }
  }

  mobileRoot.addEventListener('click', event => {
    if (event.target.closest('[data-v5-open-compare]')) open();
  });
  compareRoot.addEventListener('click', event => {
    if (event.target.closest('[data-v5-compare-close]')) close();
  });
  compareRoot.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !compareRoot.innerHTML) return;
    const focusable = [...compareRoot.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && compareRoot.innerHTML) close();
  });

  window.YT_MOBILE_COMPARE = Object.freeze({ open, close });
})();
