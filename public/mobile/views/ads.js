(() => {
  'use strict';

  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  const root = document.getElementById('mobileAppRoot');
  const state = { filter: 'all', sort: 'spend' };

  const FILTER_LABELS = {
    all: '全部活动', over45: 'ACOS >45%', over60: 'ACOS >60%', highSpend: '高花费', lowConversion: '低转化'
  };
  const SORT_LABELS = {
    spend: '广告花费 ↓', acos: 'ACOS ↓', sales: '广告销售额 ↓', orders: '订单 ↓'
  };

  function rerender(focusSelector) {
    root?.dispatchEvent(new CustomEvent('v5:refresh-view', { bubbles: true, detail: { focusSelector } }));
  }

  root?.addEventListener('v52:ops-apply', event => {
    if (event.detail?.route !== 'ads') return;
    state.filter = event.detail.filter || 'all';
    state.sort = event.detail.sort || 'spend';
    rerender('[data-v52-ops-open="ads"]');
  });

  function averageSpend(campaigns) {
    const known = campaigns.filter(row => row.spend != null);
    return known.length ? known.reduce((sum, row) => sum + Number(row.spend || 0), 0) / known.length : 0;
  }

  function isLowConversion(row, avgSpend) {
    if (row.cvr != null) return Number(row.cvr) < .08;
    return row.orders != null && row.spend != null && Number(row.orders) === 0 && Number(row.spend) >= avgSpend && Number(row.spend) > 0;
  }

  function filteredRows(campaigns) {
    const avgSpend = averageSpend(campaigns);
    const filtered = campaigns.filter(row => {
      const acos = row.acos == null ? null : Number(row.acos);
      if (state.filter === 'over45') return acos != null && acos > .45;
      if (state.filter === 'over60') return acos != null && acos > .60;
      if (state.filter === 'highSpend') return row.spend != null && Number(row.spend) >= avgSpend && Number(row.spend) > 0;
      if (state.filter === 'lowConversion') return isLowConversion(row, avgSpend);
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (state.sort === 'acos') return Number(b.acos ?? -1) - Number(a.acos ?? -1);
      if (state.sort === 'sales') return Number(b.sales ?? -1) - Number(a.sales ?? -1);
      if (state.sort === 'orders') return Number(b.orders ?? -1) - Number(a.orders ?? -1);
      return Number(b.spend ?? -1) - Number(a.spend ?? -1);
    });
  }

  function controlsMarkup(total, visible) {
    const filter = FILTER_LABELS[state.filter] || FILTER_LABELS.all;
    const sort = SORT_LABELS[state.sort] || SORT_LABELS.spend;
    return `
      <button type="button" class="v52-ops-trigger" data-v52-ops-open="ads" data-v52-filter="${state.filter}" data-v52-sort="${state.sort}" aria-haspopup="dialog">
        <span><b>筛选 · 排序</b><small>${filter} · ${sort} · ${visible}/${total}</small></span><i aria-hidden="true">›</i>
      </button>`;
  }

  registry.ads = ({ runtimeState, esc }) => {
    const model = selectors.adsModel(runtimeState);
    const filtered = filteredRows(model.campaigns);
    const rows = filtered.slice(0, 30);
    const avgSpend = averageSpend(model.campaigns);
    const roas = model.totals.spend ? Number(model.totals.sales || 0) / Number(model.totals.spend) : null;
    const highRisk = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .45).length;
    const critical = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .60).length;
    const lowConversion = model.campaigns.filter(row => isLowConversion(row, avgSpend)).length;
    const issueCount = new Set(model.campaigns.filter(row =>
      (row.acos != null && Number(row.acos) > .45) || isLowConversion(row, avgSpend)
    ).map(row => row.id)).size;
    const empty = !rows.length ? `
      <div class="v5-core-empty"><strong>${model.campaigns.length ? '当前筛选没有匹配活动' : '当前期间没有 Campaign 明细'}</strong><span>${model.campaigns.length ? '调整筛选条件查看其他活动。' : 'Campaign 明细使用完整月份数据；自定义日期仍可查看汇总指标。'}</span></div>` : '';

    const cards = rows.map(row => {
      const acos = row.acos == null ? null : Number(row.acos);
      const lowConversionRisk = isLowConversion(row, avgSpend);
      const risk = acos != null && acos > .60 ? 'critical' : acos != null && acos > .45 ? 'warning' : lowConversionRisk ? 'warning' : acos != null ? 'positive' : 'neutral';
      const status = risk === 'critical' ? '严重超线' : acos != null && acos > .45 ? '高于目标线' : lowConversionRisk ? '低转化' : risk === 'positive' ? '效率正常' : '效率数据不完整';
      return `
        <button type="button" class="v5-record-card v5-risk-${risk}" data-record-type="campaign" data-record-id="${esc(row.id)}" aria-label="查看广告活动 ${esc(row.campaign)} 详情">
          <div class="v5-record-card-head">
            <div class="v5-record-card-title"><span>${esc(row.portfolio || '广告活动')}</span><strong>${esc(row.campaign)}</strong><small>${status}</small></div>
            <div class="v5-record-primary"><span>广告花费</span><strong>${fmt.money(row.spend, 0)}</strong></div>
          </div>
          <div class="v5-record-metrics">
            <div class="v5-record-metric"><span>ACOS</span><strong>${fmt.percent(row.acos)}</strong></div>
            <div class="v5-record-metric"><span>广告销售额</span><strong>${fmt.compactMoney(row.sales)}</strong></div>
            <div class="v5-record-metric"><span>订单</span><strong>${fmt.number(row.orders)}</strong></div>
            <div class="v5-record-metric"><span>CTR</span><strong>${fmt.percent(row.ctr, 2)}</strong></div>
          </div>
          <div class="v5-record-card-foot"><span class="v5-record-chip">${lowConversionRisk ? '低转化' : esc(row.optimizationLabel || '广告活动')}</span><span>详情 ›</span></div>
        </button>`;
    }).join('');

    return `
      <section class="v5-mobile-view v5-core-view v52-module-view" data-mobile-view="ads" aria-labelledby="v5MobileViewTitle">
        <section class="v52-module-hero">
          <div class="v52-module-primary"><span>ACOS</span><strong>${fmt.percent(model.totals.acos)}</strong><small>目标 ≤45%</small></div>
          <div class="v52-module-facts">
            <span><small>广告花费</small><b>${fmt.compactMoney(model.totals.spend)}</b></span>
            <span><small>广告销售额</small><b>${fmt.compactMoney(model.totals.sales)}</b></span>
            <span><small>ROAS</small><b>${roas == null ? '—' : roas.toFixed(2)}</b></span>
          </div>
        </section>

        <section class="v52-risk-strip" aria-label="广告待处理摘要">
          <div><span>需要处理</span><strong>${issueCount}</strong></div>
          <div class="v52-risk-facts"><span><b>${critical}</b> 严重超线</span><span><b>${Math.max(0, highRisk - critical)}</b> 超线</span><span><b>${lowConversion}</b> 低转化</span></div>
        </section>

        ${controlsMarkup(model.campaigns.length, filtered.length)}

        <section class="v5-core-section" aria-labelledby="v5AdsRecords">
          <div class="v5-core-section-head"><div><span>Campaign</span><h2 id="v5AdsRecords">广告活动</h2></div><small>${model.campaigns.length ? `${rows.length}/${filtered.length}` : '月级明细'}</small></div>
          <div class="v5-record-list">${cards || empty}</div>
        </section>
      </section>`;
  };
})();