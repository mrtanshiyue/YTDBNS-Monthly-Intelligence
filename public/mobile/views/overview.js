(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  function salesChart(rows = []) {
    if (!rows.length) {
      return '<div class="v5-overview-chart-empty"><strong>暂无趋势数据</strong><span>当前期间没有可展示的日级销售趋势</span></div>';
    }
    const width = 340;
    const height = 92;
    const pad = { x: 6, top: 8, bottom: 16 };
    const values = rows.map(row => Number(row.value || 0));
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const span = max - min || 1;
    const x = index => pad.x + (width - pad.x * 2) * (rows.length === 1 ? 0.5 : index / (rows.length - 1));
    const y = value => pad.top + (height - pad.top - pad.bottom) * (1 - (Number(value || 0) - min) / span);
    const path = rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row.value).toFixed(1)}`).join(' ');
    const first = String(rows[0]?.label || '').slice(5);
    const last = String(rows.at(-1)?.label || '').slice(5);
    return `
      <div class="v5-overview-chart" aria-label="销售额趋势">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="所选期间销售额趋势折线图">
          <path d="${path}" class="v5-chart-sales-line"/>
        </svg>
        <div class="v5-chart-edge-labels"><span>${first}</span><span>${last}</span></div>
      </div>`;
  }

  function actionMarkup(items, esc) {
    if (!items.length) {
      return '<div class="v52-task-empty"><strong>当前没有高优先级异常</strong><span>核心经营指标暂无需要立即处理的信号。</span></div>';
    }
    return items.map(item => `
      <button type="button" class="v52-home-action ${esc(item.tone)}" data-mobile-route="${esc(item.route)}">
        <span class="v52-home-action-dot" aria-hidden="true"></span>
        <span><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span>
        <i aria-hidden="true">›</i>
      </button>`).join('');
  }

  registry.overview = ({ runtimeState, esc }) => {
    const model = selectors?.overviewModel?.(runtimeState) || { summary: {}, insights: [], salesSeries: [] };
    const s = model.summary || {};
    const fallbackPriority = model.insights.filter(item => item.tone === 'critical' || item.tone === 'warning');
    const actionQueue = window.YT_MOBILE_REDESIGN?.collectTasks?.(runtimeState) || fallbackPriority;
    const actionItems = actionQueue.slice(0, 3);
    const pulse = [
      ['ACOS', fmt.percent(s.acos), 'ads'],
      ['TACOS', fmt.percent(s.tacos), 'ads'],
      ['利润率', fmt.percent(s.profitMargin), 'finance'],
      ['Sessions', fmt.number(s.sessions), 'products']
    ];

    return `
      <section class="v5-mobile-view v52-home" data-mobile-view="overview" aria-labelledby="v5MobileViewTitle">
        ${model.error ? `<div class="v5-overview-runtime-warning"><b>数据读取异常</b><span>${esc(model.error)}</span></div>` : ''}

        <section class="v52-home-hero" aria-label="本期经营结果">
          <span>销售额</span>
          <strong>${fmt.money(s.sales, 0)}</strong>
          <div class="v52-home-profit">
            <button type="button" data-mobile-route="finance"><small>贡献利润</small><b>${fmt.money(s.profit, 0)}</b></button>
            <button type="button" data-mobile-route="finance"><small>利润率</small><b>${fmt.percent(s.profitMargin)}</b></button>
          </div>
          <button type="button" class="v52-compare-link" data-v5-open-compare>对比上期 <span aria-hidden="true">›</span></button>
        </section>

        <section class="v52-home-section" aria-labelledby="v52HomeActions">
          <div class="v52-home-section-head">
            <div><span>异常优先</span><h2 id="v52HomeActions">现在需要处理</h2></div>
            <button type="button" data-mobile-route="tasks">查看全部 ${actionQueue.length ? `· ${actionQueue.length}` : ''}</button>
          </div>
          <div class="v52-home-actions">${actionMarkup(actionItems, esc)}</div>
        </section>

        <section class="v52-home-section" aria-labelledby="v52HomePulse">
          <div class="v52-home-section-head"><div><span>经营脉搏</span><h2 id="v52HomePulse">关键指标</h2></div></div>
          <div class="v52-pulse-grid">
            ${pulse.map(([label, value, route]) => `<button type="button" data-mobile-route="${route}"><span>${label}</span><strong>${value}</strong></button>`).join('')}
          </div>
        </section>

        <section class="v52-home-section" aria-labelledby="v52HomeTrend">
          <div class="v52-home-section-head"><div><span>趋势</span><h2 id="v52HomeTrend">销售趋势</h2></div><small>所选期间</small></div>
          <div class="v52-home-chart">
            <div><span>销售额</span><strong>${fmt.money(s.sales, 0)}</strong></div>
            ${salesChart(model.salesSeries)}
          </div>
        </section>
      </section>`;
  };
})();