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
    const height = 100;
    const pad = { x: 7, top: 8, bottom: 18 };
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
          <line x1="${pad.x}" y1="${height - pad.bottom}" x2="${width - pad.x}" y2="${height - pad.bottom}" class="v5-chart-axis"/>
          <path d="${path}" class="v5-chart-sales-line"/>
        </svg>
        <div class="v5-chart-edge-labels"><span>${first}</span><span>${last}</span></div>
      </div>`;
  }

  function actionMarkup(items, esc) {
    if (!items.length) {
      return '<div class="v5-overview-empty-note"><strong>当前没有高优先级异常</strong><span>核心指标暂无需要立即处理的信号</span></div>';
    }
    return items.map(item => `
      <button type="button" class="v5-overview-insight ${esc(item.tone)}" data-mobile-route="${esc(item.route)}">
        <span class="v5-overview-insight-dot" aria-hidden="true"></span>
        <span class="v5-overview-insight-copy"><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span>
        <i aria-hidden="true">›</i>
      </button>`).join('');
  }

  registry.overview = ({ runtimeState, esc }) => {
    const model = selectors?.overviewModel?.(runtimeState) || { summary: {}, insights: [], salesSeries: [], rangeLabel: '选择期间' };
    const s = model.summary || {};
    const priority = model.insights.filter(item => item.tone === 'critical' || item.tone === 'warning' || item.tone === 'neutral');
    const actionItems = (priority.length ? priority : model.insights.filter(item => item.tone === 'positive')).slice(0, 3);
    const priorityCount = priority.filter(item => item.tone === 'critical' || item.tone === 'warning').length;

    return `
      <section class="v5-mobile-view v5-overview v51-overview" data-mobile-view="overview" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading v5-overview-heading">
          <div>
            <span class="v5-mobile-eyebrow">经营概览</span>
            <h1 id="v5MobileViewTitle">经营首页</h1>
            <p>先看经营结果，再处理异常</p>
          </div>
        </div>

        ${model.error ? `<div class="v5-overview-runtime-warning"><b>数据读取异常</b><span>${esc(model.error)}</span></div>` : ''}

        <div class="v51-overview-actions" aria-label="期间与对比">
          <button type="button" class="v51-overview-action" data-mobile-action="period" aria-label="选择查看期间"><span>查看期间</span><strong>${esc(model.rangeLabel)}</strong><i aria-hidden="true">›</i></button>
          <button type="button" class="v51-overview-action compact" data-v5-open-compare aria-label="与上一期间对比"><span>期间对比</span><strong>对比上期</strong><i aria-hidden="true">›</i></button>
        </div>

        <section class="v51-overview-results" aria-labelledby="v51OverviewResults">
          <div class="v5-overview-section-head"><div><span>核心结果</span><h2 id="v51OverviewResults">本期经营</h2></div><small>${s.sessions != null ? `${fmt.number(s.sessions)} Sessions` : '所选期间'}</small></div>
          <div class="v5-overview-summary">
            <span>销售额</span>
            <strong>${fmt.money(s.sales, 0)}</strong>
            <div>
              <span><small>贡献利润</small><b>${fmt.money(s.profit, 0)}</b></span>
              <span><small>利润率</small><b>${fmt.percent(s.profitMargin)}</b></span>
            </div>
          </div>
          <div class="v5-overview-kpis">
            <button type="button" data-mobile-route="ads" aria-label="查看广告 ACOS"><span>ACOS</span><strong>${fmt.percent(s.acos)}</strong><small>目标线 ≤45% · 查看广告活动</small></button>
            <button type="button" data-mobile-route="ads" aria-label="查看 TACOS"><span>TACOS</span><strong>${fmt.percent(s.tacos)}</strong><small>广告花费 / 总销售额</small></button>
          </div>
        </section>

        <section class="v5-overview-section v51-overview-priority" aria-labelledby="v5OverviewAlerts">
          <div class="v5-overview-section-head"><div><span>待处理事项</span><h2 id="v5OverviewAlerts">现在需要处理</h2></div><small>${priorityCount ? `${priorityCount} 项异常` : '暂无高优先异常'}</small></div>
          <div class="v5-overview-insights">${actionMarkup(actionItems, esc)}</div>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewTrend">
          <div class="v5-overview-section-head"><div><span>经营趋势</span><h2 id="v5OverviewTrend">销售趋势</h2></div><small>单指标视图</small></div>
          <div class="v5-overview-chart-card">
            <div class="v5-overview-chart-value"><span>销售额</span><strong>${fmt.money(s.sales, 0)}</strong></div>
            ${salesChart(model.salesSeries)}
          </div>
        </section>
      </section>`;
  };
})();