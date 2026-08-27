(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
  const meter = (value, ceiling) => value == null || !ceiling ? 0 : clamp((Number(value) / Number(ceiling)) * 100);
  const efficiencyTone = (value, warning, critical) => value == null ? 'neutral' : Number(value) > critical ? 'critical' : Number(value) > warning ? 'warning' : 'positive';

  function salesSparkline(rows = []) {
    if (!rows.length) return '';
    const width = 180;
    const height = 28;
    const values = rows.map(row => Number(row.value || 0));
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const x = index => rows.length === 1 ? width / 2 : (width * index) / (rows.length - 1);
    const y = value => 3 + (height - 6) * (1 - (Number(value || 0) - min) / span);
    const path = rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row.value).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${height - 2}" x2="${width}" y2="${height - 2}"/><path d="${path}"/></svg>`;
  }

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

  function insightMarkup(items, esc) {
    if (!items.length) return '<div class="v5-overview-empty-note">当前没有可生成的经营提醒</div>';
    return items.map(item => `
      <button type="button" class="v5-overview-insight ${esc(item.tone)}" data-mobile-route="${esc(item.route)}">
        <span class="v5-overview-insight-dot" aria-hidden="true"></span>
        <span class="v5-overview-insight-copy"><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></span>
        <i aria-hidden="true">›</i>
      </button>`).join('');
  }

  function metric(label, value, hint, width, tone = 'neutral') {
    return `
      <div class="v5-intel-metric ${tone}">
        <div class="v5-intel-metric-head"><span>${label}</span><small>${hint}</small></div>
        <strong>${value}</strong>
        <div class="v5-intel-meter" aria-hidden="true" style="--v5-meter:${clamp(width).toFixed(1)}%"><i></i></div>
      </div>`;
  }

  registry.overview = ({ runtimeState, esc }) => {
    const model = selectors?.overviewModel?.(runtimeState) || { summary: {}, insights: [], salesSeries: [], rangeLabel: '选择期间' };
    const s = model.summary || {};
    const modeLabel = model.mode === 'live' ? 'LIVE' : model.mode === 'demo' ? 'PREVIEW' : 'SYNC';
    const dataLabel = model.error ? 'Issue' : model.mode === 'live' ? 'Ready' : model.mode === 'demo' ? 'Preview' : 'Sync';
    const dataTone = model.error ? 'critical' : '';
    const inventorySub = s.fulfillableUnits != null ? `${fmt.number(s.fulfillableUnits)} 可售` : '最近快照';
    const sessionLabel = s.sessions != null ? `${fmt.number(s.sessions)} Sessions` : '所选期间';
    const adSalesShare = s.sales && s.adSales != null ? Number(s.adSales) / Math.abs(Number(s.sales)) : null;

    return `
      <section class="v5-mobile-view v5-overview" data-mobile-view="overview" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading v5-overview-heading">
          <div>
            <span class="v5-mobile-eyebrow">EXECUTIVE INTELLIGENCE</span>
            <h1 id="v5MobileViewTitle">经营驾驶舱</h1>
            <p>高速扫描结果、效率、库存与风险</p>
          </div>
        </div>

        ${model.error ? `<div class="v5-overview-runtime-warning"><b>数据读取异常</b><span>${esc(model.error)}</span></div>` : ''}

        <section class="v5-intel-status" aria-label="运行状态与期间">
          <div class="v5-intel-status-cell ${dataTone}"><span class="v5-intel-status-label">MODE</span><span class="v5-intel-status-value"><i></i>${esc(modeLabel)}</span></div>
          <button class="v5-intel-status-button" type="button" data-mobile-action="period" aria-label="选择查看期间"><span class="v5-intel-status-label">PERIOD</span><span class="v5-intel-status-value">${esc(model.rangeLabel)}</span></button>
          <button class="v5-intel-status-button" type="button" data-v5-open-compare aria-label="对比上一期间"><span class="v5-intel-status-label">COMPARE</span><span class="v5-intel-status-value">上期</span></button>
          <div class="v5-intel-status-cell ${dataTone}"><span class="v5-intel-status-label">DATA</span><span class="v5-intel-status-value"><i></i>${esc(dataLabel)}</span></div>
        </section>

        <section class="v5-intel-primary" aria-label="核心经营结果">
          <div class="v5-intel-sales">
            <span>BUSINESS SALES</span>
            <strong>${fmt.money(s.sales, 0)}</strong>
            <small>${esc(sessionLabel)}</small>
            <span class="v5-intel-sparkline">${salesSparkline(model.salesSeries)}</span>
          </div>
          <div class="v5-intel-primary-side"><span>贡献利润</span><strong>${fmt.money(s.profit, 0)}</strong><small>Contribution</small></div>
          <div class="v5-intel-primary-side"><span>利润率</span><strong>${fmt.percent(s.profitMargin)}</strong><small>Margin</small></div>
        </section>

        <section class="v5-intel-efficiency" aria-label="经营效率">
          ${metric('ACOS', fmt.percent(s.acos), '≤45%', meter(s.acos, .60), efficiencyTone(s.acos, .45, .60))}
          ${metric('TACOS', fmt.percent(s.tacos), 'Ads / Sales', meter(s.tacos, .35), efficiencyTone(s.tacos, .23, .32))}
          ${metric('Ad Spend', fmt.compactMoney(s.adSpend), '投入强度', meter(s.tacos, .35), 'neutral')}
          ${metric('Ad Sales', fmt.compactMoney(s.adSales), '销售占比', meter(adSalesShare, 1), 'neutral')}
        </section>

        <section class="v5-intel-ops" aria-label="经营状态">
          <div class="v5-intel-op"><span>库存资金</span><strong>${fmt.compactMoney(s.inventoryValue)}</strong><small>${esc(inventorySub)}</small></div>
          <div class="v5-intel-op"><span>可售</span><strong>${fmt.number(s.fulfillableUnits)}</strong><small>Fulfillable</small></div>
          <div class="v5-intel-op"><span>CVR</span><strong>${fmt.percent(s.cvr)}</strong><small>${s.units != null ? `${fmt.number(s.units)} Units` : 'Conversion'}</small></div>
          <div class="v5-intel-op"><span>Returns</span><strong>${fmt.number(s.returns)}</strong><small>${s.refundSales != null ? fmt.compactMoney(s.refundSales) : 'Refund'}</small></div>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewAlerts">
          <div class="v5-overview-section-head"><div><span>INTELLIGENCE SIGNALS</span><h2 id="v5OverviewAlerts">经营信号</h2></div><small>${model.insights.length} signals</small></div>
          <div class="v5-overview-insights">${insightMarkup(model.insights, esc)}</div>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewTrend">
          <div class="v5-overview-section-head"><div><span>TREND</span><h2 id="v5OverviewTrend">销售趋势</h2></div><small>Daily</small></div>
          <div class="v5-overview-chart-card">
            <div class="v5-overview-chart-value"><span>销售额</span><strong>${fmt.money(s.sales, 0)}</strong></div>
            ${salesChart(model.salesSeries)}
          </div>
        </section>

        <section class="v5-overview-section" aria-labelledby="v5OverviewFocus">
          <div class="v5-overview-section-head"><div><span>WORKSPACE</span><h2 id="v5OverviewFocus">快速工作区</h2></div><small>1 tap</small></div>
          <div class="v5-overview-shortcuts">
            <button type="button" data-mobile-route="ads"><span><b>广告</b><small>活动效率与花费</small></span><i>›</i></button>
            <button type="button" data-mobile-route="products"><span><b>商品</b><small>SKU / ASIN 表现</small></span><i>›</i></button>
            <button type="button" data-mobile-route="inventory"><span><b>库存</b><small>资金占用与风险</small></span><i>›</i></button>
          </div>
        </section>
      </section>`;
  };
})();
