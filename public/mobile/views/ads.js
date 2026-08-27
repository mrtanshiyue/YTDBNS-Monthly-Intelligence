(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const root = document.getElementById('mobileAppRoot');
  const clamp = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));
  const state = { filter: 'all', sort: 'spend' };

  const FILTERS = [
    ['all', '全部'],
    ['over45', '超线 >45%'],
    ['over60', '严重 >60%'],
    ['highSpend', '高花费'],
    ['lowConversion', '低转化']
  ];
  const SORTS = [
    ['spend', '广告花费 ↓'],
    ['acos', 'ACOS ↓'],
    ['sales', '广告销售额 ↓'],
    ['orders', '订单 ↓']
  ];

  function rerender(focusSelector) {
    root?.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true, detail: { focusSelector } }));
  }

  root?.addEventListener('click', event => {
    const button = event.target.closest('[data-v51-ads-filter]');
    if (!button || !root.contains(button)) return;
    state.filter = button.dataset.v51AdsFilter || 'all';
    rerender(`[data-v51-ads-filter="${state.filter}"]`);
  });

  root?.addEventListener('change', event => {
    const select = event.target.closest('[data-v51-ads-sort]');
    if (!select || !root.contains(select)) return;
    state.sort = select.value || 'spend';
    rerender('[data-v51-ads-sort]');
  });

  function filteredRows(campaigns) {
    const avgSpend = campaigns.length
      ? campaigns.reduce((sum, row) => sum + Number(row.spend || 0), 0) / campaigns.length
      : 0;
    const filtered = campaigns.filter(row => {
      const acos = row.acos == null ? null : Number(row.acos);
      if (state.filter === 'over45') return acos != null && acos > .45;
      if (state.filter === 'over60') return acos != null && acos > .60;
      if (state.filter === 'highSpend') return Number(row.spend || 0) >= avgSpend && Number(row.spend || 0) > 0;
      if (state.filter === 'lowConversion') {
        if (row.cvr != null) return Number(row.cvr) < .08;
        return Number(row.orders || 0) === 0 && Number(row.spend || 0) >= avgSpend && Number(row.spend || 0) > 0;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (state.sort === 'acos') return Number(b.acos ?? -1) - Number(a.acos ?? -1);
      if (state.sort === 'sales') return Number(b.sales || 0) - Number(a.sales || 0);
      if (state.sort === 'orders') return Number(b.orders || 0) - Number(a.orders || 0);
      return Number(b.spend || 0) - Number(a.spend || 0);
    });
  }

  function controlsMarkup(total, visible) {
    return `
      <section class="v51-ops-controls" aria-label="广告活动筛选与排序">
        <div class="v51-ops-control-head"><b>运营筛选</b><span>${visible} / ${total} 个活动</span></div>
        <div class="v51-filter-scroll" role="group" aria-label="广告活动筛选">
          ${FILTERS.map(([id, label]) => `<button type="button" data-v51-filter="${id}" data-v51-ads-filter="${id}" class="${state.filter === id ? 'active' : ''}" aria-pressed="${state.filter === id ? 'true' : 'false'}">${label}</button>`).join('')}
        </div>
        <div class="v51-sort-row"><label for="v51AdsSort">排序</label><select id="v51AdsSort" data-v51-ads-sort aria-label="广告活动排序">${SORTS.map(([id, label]) => `<option value="${id}"${state.sort === id ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="v51-result-note">筛选和排序仅作用于当前已读取数据，不会修改广告或触发任何 Amazon 操作。</div>
      </section>`;
  }

  registry.ads = ({ runtimeState, esc }) => {
    const model = selectors.adsModel(runtimeState);
    const filtered = filteredRows(model.campaigns);
    const rows = filtered.slice(0, 30);
    const roas = model.totals.spend ? Number(model.totals.sales || 0) / Number(model.totals.spend) : null;
    const adSalesShare = model.summary.sales && model.totals.sales != null
      ? Number(model.totals.sales) / Math.abs(Number(model.summary.sales))
      : null;
    const acosTone = model.totals.acos == null ? 'neutral' : model.totals.acos > .60 ? 'critical' : model.totals.acos > .45 ? 'warning' : 'positive';
    const highRisk = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .45).length;
    const critical = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .60).length;
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>${model.campaigns.length ? '当前筛选没有匹配活动' : '当前期间没有 Campaign 明细'}</strong><span>${model.campaigns.length ? '切换筛选条件查看其他活动。' : 'Campaign 明细使用完整月份数据；自定义日期仍可查看顶部汇总指标。'}</span></div>` : '';
    const cards = rows.map(row => {
      const acos = row.acos == null ? null : Number(row.acos);
      const risk = acos == null ? 'neutral' : acos > .60 ? 'critical' : acos > .45 ? 'warning' : 'positive';
      const meter = acos == null ? 0 : clamp((acos / .75) * 100);
      return `
      <button type="button" class="v5-record-card v5-risk-${risk} v5-has-meter" style="--v5-meter:${meter.toFixed(1)}%" data-record-type="campaign" data-record-id="${esc(row.id)}" aria-label="查看广告活动 ${esc(row.campaign)} 详情">
        <div class="v5-record-card-head">
          <div class="v5-record-card-title"><span>${esc(row.portfolio || '广告活动')}</span><strong>${esc(row.campaign)}</strong><small>${risk === 'critical' ? '高风险 · ACOS 严重超线' : risk === 'warning' ? '关注 · ACOS 高于目标' : risk === 'positive' ? '效率处于目标区间' : 'ACOS 暂无数据'}</small></div>
          <div class="v5-record-primary"><span>广告花费</span><strong>${fmt.money(row.spend, 0)}</strong></div>
        </div>
        <div class="v5-record-metrics">
          <div class="v5-record-metric"><span>ACOS</span><strong>${fmt.percent(row.acos)}</strong></div>
          <div class="v5-record-metric"><span>广告销售额</span><strong>${fmt.compactMoney(row.sales)}</strong></div>
          <div class="v5-record-metric"><span>订单</span><strong>${fmt.number(row.orders)}</strong></div>
          <div class="v5-record-metric"><span>CTR</span><strong>${fmt.percent(row.ctr, 2)}</strong></div>
        </div>
        <div class="v5-record-card-foot"><span class="v5-record-chip">${esc(row.optimizationLabel)}</span><span>详情 ›</span></div>
      </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="ads" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">广告运营</span><h1 id="v5MobileViewTitle">广告</h1><p>先找超线、高花费和低转化活动，再看整体效率</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period" aria-label="选择查看期间"><span>${esc(model.rangeLabel)}</span><i aria-hidden="true">›</i></button>
        </div>
        <section class="v5-intel-efficiency" aria-label="广告核心效率">
          <div class="v5-intel-metric ${acosTone}"><div class="v5-intel-metric-head"><span>ACOS</span><small>目标 ≤45%</small></div><strong>${fmt.percent(model.totals.acos)}</strong><div class="v5-intel-meter" style="--v5-meter:${clamp((Number(model.totals.acos || 0) / .75) * 100).toFixed(1)}%"><i></i></div></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>广告花费</span><small>TACOS ${fmt.percent(model.summary.tacos)}</small></div><strong>${fmt.compactMoney(model.totals.spend)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>广告销售额</span><small>占总销售 ${fmt.percent(adSalesShare)}</small></div><strong>${fmt.compactMoney(model.totals.sales)}</strong></div>
          <div class="v5-intel-metric"><div class="v5-intel-metric-head"><span>ROAS</span><small>销售 / 花费</small></div><strong>${roas == null ? '—' : roas.toFixed(2)}</strong></div>
        </section>
        <section class="v5-intel-ops" aria-label="广告运行状态">
          <div class="v5-intel-op"><span>订单</span><strong>${fmt.number(model.totals.orders)}</strong><small>广告归因</small></div>
          <div class="v5-intel-op"><span>TACOS</span><strong>${fmt.percent(model.summary.tacos)}</strong><small>广告 / 总销售</small></div>
          <div class="v5-intel-op"><span>超线活动</span><strong>${fmt.number(highRisk)}</strong><small>ACOS &gt;45%</small></div>
          <div class="v5-intel-op"><span>严重超线</span><strong>${fmt.number(critical)}</strong><small>ACOS &gt;60%</small></div>
        </section>
        ${controlsMarkup(model.campaigns.length, filtered.length)}
        <section class="v5-core-section" aria-labelledby="v5AdsRecords">
          <div class="v5-core-section-head"><div><span>活动明细</span><h2 id="v5AdsRecords">广告活动</h2></div><small>${model.campaigns.length ? `显示 ${rows.length} / ${filtered.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();