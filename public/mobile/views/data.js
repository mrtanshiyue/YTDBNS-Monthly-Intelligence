(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.data = ({ runtimeState, esc }) => {
    const m = selectors.dataModel(runtimeState);
    const qualityRows = m.quality.slice(0, 30).map(row => `
      <div class="v5-secondary-row">
        <div class="v5-secondary-row-copy"><span>${esc(row.source || 'DATA QUALITY')}</span><div class="v5-status-line"><i class="v5-status-dot ${esc(row.status.toLowerCase())}"></i><b>${esc(row.name)}</b></div><small>${esc(row.message || row.status)}</small></div>
        <div class="v5-secondary-row-value"><b>${esc(row.status)}</b><small>check</small></div>
      </div>`).join('');
    const importRows = m.imports.slice(0, 12).map(row => `
      <div class="v5-secondary-row">
        <div class="v5-secondary-row-copy"><span>IMPORT</span><div class="v5-status-line"><i class="v5-status-dot ${esc(row.status.toLowerCase())}"></i><b>${esc(row.month || '未标记月份')}</b></div><small>${fmt.number(row.files)} files · ${fmt.number(row.sources)} sources</small></div>
        <div class="v5-secondary-row-value"><b>${esc(row.status)}</b><small>${esc(row.createdAt ? row.createdAt.slice(0, 10) : '')}</small></div>
      </div>`).join('');
    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="data" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">DATA CONTROL</span><h1 id="v5MobileViewTitle">数据</h1><p>手机端优先看数据质量与导入状态</p></div></div>
        <div class="v5-data-recommendation"><b>复杂导入建议使用 Desktop</b><span>V5 Mobile 当前保持 GET-only，只展示报告月份、文件/数据源状态与 Validation 结果，不执行 Import Commit。</span></div>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>QUALITY</span><h2>数据质量</h2></div><small>${m.quality.length} checks</small></div><div class="v5-secondary-list">${qualityRows || '<div class="v5-core-empty"><strong>暂无质量检查结果</strong><span>完整月份导入后会显示 Validation 状态。</span></div>'}</div></section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>IMPORT HISTORY</span><h2>最近导入</h2></div><small>只读</small></div><div class="v5-secondary-list">${importRows || '<div class="v5-core-empty"><strong>暂无导入历史</strong><span>Live API 会通过 GET /api/imports 返回最近批次。</span></div>'}</div></section>
      </section>`;
  };
})();
