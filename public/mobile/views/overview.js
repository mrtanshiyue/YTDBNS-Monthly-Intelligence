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
    const height = 132;
    const pad = { x: 8, top: 10, bottom: 22 };
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

  function insightMarkup(items, esc) {
    if (!items.length) return '<div class="v5-overview-empty-note">当前没有可生成的经营提醒</div>';
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
    const modeLabel = model.mode === 'live' ? 'LIVE DATA' : model.mode === 'demo' ? 'PREVIEW' : 'CONNECTING';
    const inventorySub = s.fulfillableUnits != null ? `${fmt.number(s.fulfillableUnits)} 可售` : '最近库存快照';

    return `
      <section class="v5-mobile-view v5-overview" data-mobile-view="overview" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading v5-overview-heading">
          <div>
            <span class="v5-mobile-eyebrow">${esc(modeLabel)}</span>
            <h1 id="v5MobileViewTitle">经营首页</h1>
            <p>先看结果，再处理异常</p>
          </div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间">
            <span>${esc(model.rangeLabel)}</span><i aria-hidden="true">›</i>
          </button>
        </div>

        ${model.error ? `<div class="v5-overview-runtime-warning"><b>数据读取异常</b><span>${esc(model.error)}</span></div>` : ''}

        <section class="v5-overview-summary" aria-label="经营摘要">
          <span>经营销售额</span>
          <strong>${fmt.money(s.sales, 0)}</strong>
          <div>
            <span><small>贡献利润</small><b>${fmt.money(s.profit, 0)}</b></span>
            <span><small>利润率</small><b>${fmt.percent(s.profitMargin)}</b></span>
          </div>
        </section>

        <section class="v5-overview-kpis" aria-label="核心指标">
          <button type="button" data-mobile-route="ads"><span>ACOS</span><strong>${fmt.percent(s.acos)}</strong><small>目标 ≤ 45%</small></button>
          <button type="button" data-mobile-route="ads"><span>TACOS</span><strong>${fmt.percent(s.tacos)}</strong><small>广告 / 全店销售</small></button>
          <button type="button" data-mobile-route="ads"><span>广告花费</span><strong>${fmt.compactMoney(s.adSpend)}</strong><small>所选期间</small></button>
          <button type="button" data-mobile-route="inventory"><span>库存资金</span><strong>${fmt.compactMoney(s.inventoryValue)}</strong><small>${esc(inventorySub)}</small></button>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewAlerts">
          <div class="v5-overview-section-head"><div><span>PRIORITY</span><h2 id="v5OverviewAlerts">经营提醒</h2></div><small>按当前期间判断</small></div>
          <div class="v5-overview-insights">${insightMarkup(model.insights, esc)}</div>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewTrend">
          <div class="v5-overview-section-head"><div><span>TREND</span><h2 id="v5OverviewTrend">销售趋势</h2></div><small>单指标视图</small></div>
          <div class="v5-overview-chart-card">
            <div class="v5-overview-chart-value"><span>销售额</span><strong>${fmt.money(s.sales, 0)}</strong></div>
            ${salesChart(model.salesSeries)}
          </div>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewFocus">
          <div class="v5-overview-section-head"><div><span>WORKSPACE</span><h2 id="v5OverviewFocus">重点入口</h2></div><small>1 tap 到达</small></div>
          <div class="v5-overview-shortcuts">
            <button type="button" data-mobile-route="ads"><span><b>广告</b><small>活动效率与花费</small></span><i>›</i></button>
            <button type="button" data-mobile-route="products"><span><b>商品</b><small>SKU / ASIN 表现</small></span><i>›</i></button>
            <button type="button" data-mobile-route="inventory"><span><b>库存</b><small>资金占用与风险</small></span><i>›</i></button>
          </div>
        </section>
      </section>`;
  };
})();
