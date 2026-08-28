(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  const statusLabel = status => {
    const value = String(status || '').toUpperCase();
    if (['PASS', 'PASSED', 'COMPLETE', 'COMPLETED'].includes(value)) return '正常';
    if (['WARN', 'WARNING'].includes(value)) return '需关注';
    if (['FAIL', 'FAILED', 'ERROR'].includes(value)) return '异常';
    if (['RUNNING', 'PROCESSING', 'UPLOADING'].includes(value)) return '处理中';
    return status || '未知';
  };

  registry.data = ({ runtimeState, esc }) => {
    const m = selectors.dataModel(runtimeState);
    const qualityRows = m.quality.slice(0, 30).map(row => `
      <div class="v5-secondary-row">
        <div class="v5-secondary-row-copy"><span>${esc(row.source || '数据质量')}</span><div class="v5-status-line"><i class="v5-status-dot ${esc(row.status.toLowerCase())}"></i><b>${esc(row.name)}</b></div><small>${esc(row.message || statusLabel(row.status))}</small></div>
        <div class="v5-secondary-row-value"><b>${esc(statusLabel(row.status))}</b><small>质量检查</small></div>
      </div>`).join('');
    const importRows = m.imports.slice(0, 12).map(row => `
      <div class="v5-secondary-row">
        <div class="v5-secondary-row-copy"><span>数据批次</span><div class="v5-status-line"><i class="v5-status-dot ${esc(row.status.toLowerCase())}"></i><b>${esc(row.month || '未标记月份')}</b></div><small>${fmt.number(row.files)} 个文件 · ${fmt.number(row.sources)} 个数据源</small></div>
        <div class="v5-secondary-row-value"><b>${esc(statusLabel(row.status))}</b><small>${esc(row.createdAt ? row.createdAt.slice(0, 10) : '')}</small></div>
      </div>`).join('');
    const pass = m.quality.filter(row => ['PASS','PASSED','COMPLETE','COMPLETED'].includes(row.status)).length;
    const warn = m.quality.filter(row => ['WARN','WARNING'].includes(row.status)).length;
    const fail = m.quality.filter(row => ['FAIL','FAILED','ERROR'].includes(row.status)).length;
    const latestImport = m.imports[0];
    const syncState = runtimeState?.error ? '同步异常' : runtimeState?.loading ? '正在更新' : runtimeState?.mode === 'live' ? '同步正常' : '预览数据';

    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="data" aria-labelledby="v5MobileViewTitle">
        <div class="v5-data-recommendation"><b>手机端只读模式 · ${esc(syncState)}</b><span>这里用于查看经营数据状态和质量结果，不提供数据写入或导入操作。</span></div>
        <section class="v5-intel-ops" aria-label="数据状态摘要">
          <div class="v5-intel-op"><span>质量检查</span><strong>${fmt.number(m.quality.length)}</strong><small>${fmt.number(pass)} 项正常</small></div>
          <div class="v5-intel-op"><span>需关注</span><strong>${fmt.number(warn)}</strong><small>质量提醒</small></div>
          <div class="v5-intel-op"><span>异常</span><strong>${fmt.number(fail)}</strong><small>需要检查</small></div>
          <div class="v5-intel-op"><span>最新批次</span><strong>${latestImport ? esc(latestImport.month || '—') : '—'}</strong><small>${latestImport ? esc(statusLabel(latestImport.status)) : '暂无批次'}</small></div>
        </section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>数据完整性</span><h2>数据质量</h2></div><small>${m.quality.length} 项检查</small></div><div class="v5-secondary-list">${qualityRows || '<div class="v5-core-empty"><strong>暂无质量检查结果</strong><span>完整月份数据就绪后会显示质量状态。</span></div>'}</div></section>
        <section class="v5-core-section"><div class="v5-core-section-head"><div><span>同步记录</span><h2>最近数据批次</h2></div><small>最近 ${Math.min(12, m.imports.length)} 条</small></div><div class="v5-secondary-list">${importRows || '<div class="v5-core-empty"><strong>暂无数据批次</strong><span>完成月度数据同步后会在这里显示最近记录。</span></div>'}</div></section>
      </section>`;
  };
})();