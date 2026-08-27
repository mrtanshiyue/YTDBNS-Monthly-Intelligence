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
    const pass = m.quality.filter(row => ['PASS','PASSED','COMPLETE','COMPLETED'].includes(row.status)).length;
    const warn = m.quality.filter(row => ['WARN','WARNING'].includes(row.status)).length;
    const fail = m.quality.filter(row => ['FAIL','FAILED','ERROR'].includes(row.status)).length;
    const latestImport = m.imports[0];
    const mode = runtimeState?.mode === 'live' ? 'LIVE' : runtimeState?.mode === 'demo' ? 'PREVIEW' : 'SYNC';

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="data" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading"><div><span class="v5-mobile-eyebrow">SYSTEM HEALTH CONSOLE</span><h1 id="v5MobileViewTitle">数据</h1><p>质量、来源、批次与 freshness，只读监控</p></div></div>
        <div class="v5-data-recommendation"><b>Mobile GET-only · ${esc(mode)}</b><span>手机端只读取报告月份、数据质量、来源和最近导入批次，不执行 Import Commit，不修改 D1 / R2。</span></div>
        <section class="v5-intel-ops" aria-label="数据系统状态">
          <div class="v5-intel-op"><span>Checks</span><strong>${fmt.number(m.quality.length)}</strong><small>${fmt.number(pass)} pass</small></div>
          <div class="v5-intel-op"><span>Warnings</span><strong>${fmt.number(warn)}</strong><small>Quality</small></div>
          <div class="v5-intel-op"><span>Failures</span><strong>${fmt.number(fail)}</strong><small>Quality</small></div>
          <div class="v5-intel-op"><span>Latest Batch</span><strong>${latestImport ? esc(latestImport.month || '—') : '—'}</strong><small>${latestImport ? esc(latestImport.status) : 'No batch'}</small></div>
        </section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>QUALITY MATRIX</span><h2>数据质量</h2></div><small>${m.quality.length} checks</small></div><div class="v5-secondary-list">${qualityRows || '<div class="v5-core-empty"><strong>暂无质量检查结果</strong><span>完整月份导入后会显示 Validation 状态。</span></div>'}</div></section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>IMPORT HISTORY</span><h2>最近导入</h2></div><small>GET-only</small></div><div class="v5-secondary-list">${importRows || '<div class="v5-core-empty"><strong>暂无导入历史</strong><span>Live API 会通过 GET /api/imports 返回最近批次。</span></div>'}</div></section>
      </section>`;
  };
})();
