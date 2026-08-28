(() => {
  'use strict';

  const ROLE_LABELS = {
    parent: '父体业务报告',
    child: '子体业务报告',
    ads: '广告活动报告',
    transactions: '结算交易报告',
    returns: 'FBA 退货报告',
    inventory: '库存报告',
    storage: '仓储费报告',
    product: '商品主数据',
    cost: '采购成本报告',
    unknown: '未识别报表'
  };
  const COUNT_LABELS = {
    daily: '日指标', products: 'SKU', parents: '父体', campaigns: 'Campaign', returns: '退货原因',
    inventory: '库存', storage: '仓储', charges: '扣费', productMaster: '商品主数据', costMaster: '成本主数据',
    returnEvents: '退货事件', campaignEvents: '广告事件', transactionEvents: '交易事件'
  };
  const STORE_LABELS = { ytdbns: 'YTDBNS', yy: 'YY', jj: 'JJ' };
  const TIME_ZONE = 'America/Los_Angeles';
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  const globalActions = $('.global-actions');
  const importButton = $('#topImportBtn');
  if (!globalActions || !importButton) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'operationLogBtn';
  button.className = 'operation-log-button';
  button.setAttribute('aria-label', '查看操作日志');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'operationLogDrawer');
  button.setAttribute('aria-expanded', 'false');
  button.title = '操作日志';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10a2 2 0 0 1 2 2v13H5v-13a2 2 0 0 1 2-2Z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4.5"/><path d="M9 2.8h6"/></svg><span>操作日志</span>';
  globalActions.insertBefore(button, importButton);

  const backdrop = document.createElement('div');
  backdrop.id = 'operationLogBackdrop';
  backdrop.className = 'operation-log-backdrop';
  document.body.appendChild(backdrop);

  const drawer = document.createElement('aside');
  drawer.id = 'operationLogDrawer';
  drawer.className = 'operation-log-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'operationLogTitle');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <div class="operation-log-head">
      <div>
        <span class="operation-log-kicker">AUDIT TRAIL</span>
        <h2 id="operationLogTitle">操作日志</h2>
        <p>记录导入批次、每个源文件、校验结果与最终数据库写入。</p>
      </div>
      <button type="button" class="operation-log-close" id="operationLogClose" aria-label="关闭操作日志">×</button>
    </div>
    <div class="operation-log-toolbar">
      <div class="operation-log-filter-row">
        <select id="operationLogStore" aria-label="筛选店铺">
          <option value="all">全部店铺</option>
          <option value="ytdbns">YTDBNS</option>
          <option value="yy">YY</option>
          <option value="jj">JJ</option>
        </select>
        <select id="operationLogMonth" aria-label="筛选月份"><option value="all">全部月份</option></select>
        <select id="operationLogStatus" aria-label="筛选状态">
          <option value="all">全部状态</option>
          <option value="success">成功</option>
          <option value="warn">有警告</option>
          <option value="failed">失败</option>
        </select>
      </div>
      <input id="operationLogSearch" class="operation-log-search" type="search" autocomplete="off" placeholder="搜索文件名、批次号、错误信息…" aria-label="搜索操作日志">
      <div class="operation-log-summary" id="operationLogSummary"><b>—</b><span>等待加载</span></div>
    </div>
    <div class="operation-log-body" id="operationLogBody"><div class="operation-log-loading">正在读取 D1 操作日志…</div></div>
    <div class="operation-log-foot"><span>时间按 America/Los_Angeles 显示</span><button type="button" class="operation-log-refresh" id="operationLogRefresh">刷新日志</button></div>
  `;
  document.body.appendChild(drawer);

  const closeButton = $('#operationLogClose', drawer);
  const refreshButton = $('#operationLogRefresh', drawer);
  const storeFilter = $('#operationLogStore', drawer);
  const monthFilter = $('#operationLogMonth', drawer);
  const statusFilter = $('#operationLogStatus', drawer);
  const searchInput = $('#operationLogSearch', drawer);
  const body = $('#operationLogBody', drawer);
  const summary = $('#operationLogSummary', drawer);
  let logs = [];
  let loadGeneration = 0;
  let returnFocus = null;

  function currentStore() {
    const value = $('#ytStoreSwitcher select')?.value || '';
    return ['ytdbns', 'yy', 'jj'].includes(value) ? value : 'ytdbns';
  }

  function parseTimestamp(value) {
    if (!value) return null;
    const text = String(value);
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTime(value, full = false) {
    const date = parseTimestamp(value);
    if (!date) return value ? String(value) : '—';
    const options = full
      ? { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
      : { timeZone: TIME_ZONE, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }

  function monthLabel(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[1]}年${Number(match[2])}月` : (value || '月份未知');
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function eventLabel(event) {
    const type = event.event_type;
    if (type === 'IMPORT_STARTED') return '创建导入批次';
    if (type === 'IMPORT_START_FAILED') return '创建批次失败';
    if (type === 'FILE_STORED') return `${ROLE_LABELS[event.detail?.reportType] || event.detail?.reportType || '源文件'} · ${event.detail?.filename || '文件'}`;
    if (type === 'FILE_STORE_FAILED') return `文件归档失败 · ${event.detail?.filename || '文件'}`;
    if (type === 'IMPORT_COMMITTED') return '写入数据库完成';
    if (type === 'IMPORT_COMMIT_FAILED') return '写入数据库失败';
    return event.summary || type;
  }

  function eventNote(event) {
    const detail = event.detail || {};
    if (event.event_type === 'IMPORT_STARTED') return `${detail.rangeStart || '—'} → ${detail.rangeEnd || '—'}`;
    if (event.event_type === 'FILE_STORED') return `${Number(detail.rowCount || 0).toLocaleString('en-US')} 行 · ${formatBytes(detail.sizeBytes)}${detail.checksum ? ` · SHA256 ${String(detail.checksum).slice(0, 12)}…` : ''}`;
    if (event.event_type === 'FILE_STORE_FAILED' || event.event_type === 'IMPORT_START_FAILED' || event.event_type === 'IMPORT_COMMIT_FAILED') return detail.error || event.summary || '操作失败';
    if (event.event_type === 'IMPORT_COMMITTED') {
      return `${detail.fileCount || 0} 个文件 · ${detail.sourceCount || 0} 类数据源 · ${detail.warningCount || 0} 个警告`;
    }
    return event.summary || '';
  }

  function groupLogs(source) {
    const groups = new Map();
    for (const event of source) {
      const key = event.batch_id ? `batch:${event.batch_id}` : `event:${event.event_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    }
    return [...groups.values()].map(events => {
      events.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
      const failed = events.find(event => event.status === 'FAILED');
      const commit = [...events].reverse().find(event => event.event_type === 'IMPORT_COMMITTED' || event.event_type === 'IMPORT_COMMIT_FAILED');
      const latest = events.at(-1);
      const status = failed ? 'FAILED' : commit?.status === 'WARN' ? 'WARN' : 'SUCCESS';
      const detail = commit?.detail || {};
      return {
        key: latest.batch_id || latest.event_id,
        batchId: latest.batch_id || '',
        storeId: latest.store_id || 'ytdbns',
        month: latest.report_month || '',
        status,
        summary: commit?.summary || latest.summary || '操作记录',
        createdAt: events[0]?.created_at,
        updatedAt: latest.created_at,
        events,
        detail,
        searchable: JSON.stringify(events).toLowerCase()
      };
    }).sort((a, b) => Number(b.events.at(-1)?.id || 0) - Number(a.events.at(-1)?.id || 0));
  }

  function statusClass(status) {
    return status === 'FAILED' ? 'failed' : status === 'WARN' ? 'warn' : 'success';
  }

  function statusText(status) {
    return status === 'FAILED' ? '失败' : status === 'WARN' ? '有警告' : '成功';
  }

  function renderEvent(event) {
    const cls = event.status === 'FAILED' ? 'failed' : event.status === 'WARN' ? 'warn' : '';
    const symbol = event.status === 'FAILED' ? '!' : event.status === 'WARN' ? '!' : '✓';
    return `<div class="operation-log-event ${cls}">
      <span class="operation-log-dot">${symbol}</span>
      <div class="operation-log-event-copy">
        <div class="operation-log-event-top"><b title="${esc(eventLabel(event))}">${esc(eventLabel(event))}</b><time title="${esc(formatTime(event.created_at, true))}">${esc(formatTime(event.created_at))}</time></div>
        <p>${esc(eventNote(event))}</p>
      </div>
    </div>`;
  }

  function renderFiles(detail, events) {
    const files = Array.isArray(detail.files) && detail.files.length
      ? detail.files
      : events.filter(event => event.event_type === 'FILE_STORED').map(event => ({
          filename: event.detail?.filename,
          reportType: event.detail?.reportType,
          rowCount: event.detail?.rowCount,
          sizeBytes: event.detail?.sizeBytes,
          checksum: event.detail?.checksum
        }));
    if (!files.length) return '';
    return `<div class="operation-log-section"><span class="operation-log-section-title">SOURCE FILES · ${files.length}</span>${files.map(file => `<div class="operation-log-file">
      <b title="${esc(file.filename || '')}">${esc(file.filename || '未命名文件')}</b>
      <span>${esc(ROLE_LABELS[file.reportType] || file.reportType || '未识别')} · ${Number(file.rowCount || 0).toLocaleString('en-US')} 行 · ${esc(formatBytes(file.sizeBytes))}</span>
      ${file.checksum ? `<small>SHA256 ${esc(file.checksum)}</small>` : ''}
    </div>`).join('')}</div>`;
  }

  function renderCounts(detail) {
    const entries = Object.entries(detail.rowCounts || {}).filter(([, value]) => Number(value || 0) > 0);
    if (!entries.length) return '';
    return `<div class="operation-log-section"><span class="operation-log-section-title">STRUCTURED WRITE COUNTS</span><div class="operation-log-counts">${entries.map(([key, value]) => `<span>${esc(COUNT_LABELS[key] || key)} ${Number(value).toLocaleString('en-US')}</span>`).join('')}</div></div>`;
  }

  function renderChecks(detail) {
    const checks = Array.isArray(detail.checks) ? detail.checks : [];
    if (!checks.length) return '';
    return `<div class="operation-log-section"><span class="operation-log-section-title">VALIDATION · ${checks.length}</span>${checks.map(check => {
      const cls = check.status === 'FAIL' ? 'failed' : check.status === 'WARN' ? 'warn' : '';
      return `<div class="operation-log-check ${cls}"><b>${esc(check.item || '校验项')}</b><span>${esc(check.value || check.status || '—')}</span>${check.detail ? `<small>${esc(check.detail)}</small>` : ''}</div>`;
    }).join('')}</div>`;
  }

  function renderCard(group) {
    const detail = group.detail || {};
    const cls = statusClass(group.status);
    const store = STORE_LABELS[group.storeId] || group.storeId;
    const fileCount = Number(detail.fileCount || group.events.filter(event => event.event_type === 'FILE_STORED').length || 0);
    const sourceCount = Number(detail.sourceCount || new Set(group.events.filter(event => event.event_type === 'FILE_STORED').map(event => event.detail?.reportType).filter(Boolean)).size || 0);
    const warningCount = Number(detail.warningCount || 0);
    return `<article class="operation-log-card">
      <div class="operation-log-card-head">
        <div class="operation-log-title-row"><h3>${esc(group.summary)}</h3><time title="${esc(formatTime(group.updatedAt, true))}">${esc(formatTime(group.updatedAt, true))}</time></div>
        <div class="operation-log-meta">
          <span class="operation-log-chip status-${cls}">${statusText(group.status)}</span>
          <span class="operation-log-chip">${esc(store)}</span>
          <span class="operation-log-chip">${esc(monthLabel(group.month))}</span>
          ${fileCount ? `<span class="operation-log-chip">${fileCount} 文件</span>` : ''}
          ${sourceCount ? `<span class="operation-log-chip">${sourceCount} 类数据源</span>` : ''}
          ${warningCount ? `<span class="operation-log-chip status-warn">${warningCount} 警告</span>` : ''}
        </div>
      </div>
      <div class="operation-log-timeline">${group.events.map(renderEvent).join('')}</div>
      <details class="operation-log-details">
        <summary>查看完整导入明细</summary>
        <div class="operation-log-detail-body">
          ${renderFiles(detail, group.events)}
          ${renderCounts(detail)}
          ${renderChecks(detail)}
          <div class="operation-log-section"><span class="operation-log-section-title">BATCH ID</span><div class="operation-log-batch-id">${esc(group.batchId || group.key)}</div></div>
        </div>
      </details>
    </article>`;
  }

  function syncMonthOptions() {
    const selected = monthFilter.value;
    const months = [...new Set(logs.map(log => log.report_month).filter(month => /^\d{4}-\d{2}$/.test(month)))].sort().reverse();
    monthFilter.innerHTML = '<option value="all">全部月份</option>' + months.map(month => `<option value="${esc(month)}">${esc(monthLabel(month))}</option>`).join('');
    monthFilter.value = months.includes(selected) ? selected : 'all';
  }

  function render() {
    const groups = groupLogs(logs);
    const month = monthFilter.value;
    const status = statusFilter.value;
    const query = searchInput.value.trim().toLowerCase();
    const filtered = groups.filter(group => {
      if (month !== 'all' && group.month !== month) return false;
      if (status !== 'all' && statusClass(group.status) !== status) return false;
      if (query && !group.searchable.includes(query) && !String(group.batchId).toLowerCase().includes(query)) return false;
      return true;
    });
    const fileCount = filtered.reduce((total, group) => total + group.events.filter(event => event.event_type === 'FILE_STORED').length, 0);
    const failedCount = filtered.filter(group => group.status === 'FAILED').length;
    summary.innerHTML = `<b>${filtered.length} 个导入批次</b><span>${fileCount} 个文件${failedCount ? ` · ${failedCount} 个失败` : ''}</span>`;
    if (!filtered.length) {
      body.innerHTML = '<div class="operation-log-empty"><strong>暂无匹配日志</strong><span>完成下一次真实导入后，这里会自动出现批次与文件级记录。</span></div>';
      return;
    }
    body.innerHTML = `<div class="operation-log-list">${filtered.map(renderCard).join('')}</div>`;
  }

  async function loadLogs() {
    const generation = ++loadGeneration;
    refreshButton.disabled = true;
    body.innerHTML = '<div class="operation-log-loading">正在读取 D1 操作日志…</div>';
    const store = storeFilter.value || 'all';
    try {
      const response = await fetch(`/api/operation-logs?store=${encodeURIComponent(store)}&limit=120`, { headers: { accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      if (generation !== loadGeneration) return;
      logs = Array.isArray(data.logs) ? data.logs : [];
      syncMonthOptions();
      render();
      button.dataset.unread = 'false';
    } catch (error) {
      if (generation !== loadGeneration) return;
      logs = [];
      summary.innerHTML = '<b>读取失败</b><span>请稍后重试</span>';
      body.innerHTML = `<div class="operation-log-error"><strong>无法读取操作日志</strong><span>${esc(error?.message || '未知错误')}</span></div>`;
    } finally {
      if (generation === loadGeneration) refreshButton.disabled = false;
    }
  }

  function openDrawer() {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    storeFilter.value = currentStore();
    monthFilter.value = 'all';
    statusFilter.value = 'all';
    searchInput.value = '';
    backdrop.classList.add('show');
    drawer.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
    loadLogs();
  }

  function closeDrawer() {
    backdrop.classList.remove('show');
    drawer.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  button.addEventListener('click', openDrawer);
  closeButton.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  refreshButton.addEventListener('click', loadLogs);
  storeFilter.addEventListener('change', () => { monthFilter.value = 'all'; loadLogs(); });
  monthFilter.addEventListener('change', render);
  statusFilter.addEventListener('change', render);
  searchInput.addEventListener('input', render);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('show')) {
      event.preventDefault();
      closeDrawer();
    }
  });

  document.addEventListener('yt:import-committed', () => {
    button.dataset.unread = 'true';
    if (drawer.classList.contains('show')) loadLogs();
  });
})();
