(() => {
  'use strict';

  const engine = window.YT_ENGINE;
  const normalizer = window.YT_NORMALIZER;
  const fileInput = document.getElementById('importFiles');
  const dropzone = document.getElementById('dropzone');
  const validateButton = document.getElementById('validateBtn');
  const commitButton = document.getElementById('commitBtn');
  const monthInput = document.getElementById('importMonth');
  const fileStack = document.getElementById('fileStack');
  const sourceCount = document.getElementById('sourceCount');
  const sourceBar = document.getElementById('sourceProgressBar');
  const validationBox = document.getElementById('validationBox');
  const toastStack = document.getElementById('toastStack');

  if (!engine || !normalizer || !fileInput || !validateButton || !commitButton || !monthInput || !fileStack || !validationBox) return;
  if (window.YT_MULTI_FILE_IMPORT?.version === 1) return;

  const ROLE_LABELS = normalizer.ROLE_LABELS || {};
  const ROLE_HEADERS = Object.freeze({
    cost: Object.freeze(['sku', '采购成本']),
    parent: Object.freeze(['（父）asin', '会话数']),
    ads: Object.freeze(['广告活动名称', '日期']),
    transactions: Object.freeze(['settlement id', 'product sales']),
    product: Object.freeze(['sku', 'fnsku', 'asin']),
    returns: Object.freeze(['return-date', 'sku', 'reason']),
    inventory: Object.freeze(['sku', 'afn-fulfillable-quantity']),
    storage: Object.freeze(['fnsku', 'estimated_monthly_storage_fee']),
    child: Object.freeze(['（父）asin', '（子）asin'])
  });

  const state = {
    files: [],
    records: [],
    roleMap: {},
    normalized: null,
    validating: false,
    committing: false
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function firstSheet(parsed) {
    return Object.values(parsed?.sheets || {})[0] || [];
  }

  function findHeader(rows, tokens) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
      const text = (rows[index] || []).join('|').toLowerCase();
      if (tokens.every(token => text.includes(String(token).toLowerCase()))) return index;
    }
    return -1;
  }

  function countRows(parsed, role) {
    const rows = firstSheet(parsed);
    const header = findHeader(rows, ROLE_HEADERS[role] || []);
    if (header >= 0) {
      return rows.slice(header + 1).filter(row => row.some(value => value !== '' && value != null)).length;
    }
    return Math.max(0, rows.filter(row => row.some(value => value !== '' && value != null)).length - 1);
  }

  function mergeRoleRecords(role, records) {
    if (records.length === 1) return records[0];
    const tokens = ROLE_HEADERS[role];
    if (!tokens) throw new Error(`暂不支持合并未知数据源：${role}`);

    const unionHeaders = [];
    const unionSet = new Set();
    const objects = [];

    for (const record of records) {
      const rows = firstSheet(record.parsed);
      const headerIndex = findHeader(rows, tokens);
      if (headerIndex < 0) {
        throw new Error(`${record.file.name} 已识别为 ${ROLE_LABELS[role] || role}，但找不到可合并的表头。请确认同类文件来自有效导出。`);
      }
      const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
      for (const header of headers) {
        if (header && !unionSet.has(header)) {
          unionSet.add(header);
          unionHeaders.push(header);
        }
      }
      for (const row of rows.slice(headerIndex + 1)) {
        if (!row.some(value => value !== '' && value != null)) continue;
        const object = {};
        headers.forEach((header, index) => {
          if (header) object[header] = row[index] ?? '';
        });
        objects.push(object);
      }
    }

    const mergedRows = [
      unionHeaders,
      ...objects.map(object => unionHeaders.map(header => object[header] ?? ''))
    ];

    return {
      file: records[0].file,
      parsed: { kind: 'merged', sheets: { MERGED: mergedRows } },
      rows: records.reduce((sum, record) => sum + Number(record.rows || 0), 0),
      files: records.map(record => record.file)
    };
  }

  function groupRecords(records) {
    const groups = new Map();
    for (const record of records) {
      const list = groups.get(record.role) || [];
      list.push(record);
      groups.set(record.role, list);
    }
    const roleMap = {};
    for (const [role, list] of groups) roleMap[role] = mergeRoleRecords(role, list);
    return { groups, roleMap };
  }

  function renderRecords(records, errors = new Map()) {
    if (!state.files.length) {
      fileStack.innerHTML = '<div class="empty-mini">尚未选择文件</div>';
      return;
    }
    const byFile = new Map(records.map(record => [record.file, record]));
    fileStack.innerHTML = state.files.map(file => {
      const record = byFile.get(file);
      const error = errors.get(file);
      const role = record ? (ROLE_LABELS[record.role] || record.role) : error ? '识别失败' : '待识别';
      const detail = record ? ` · ${Number(record.rows || 0).toLocaleString('en-US')} 行` : '';
      return `<div class="file-row" data-multi-file-name="${esc(file.name)}">
        <div class="file-ico">${/\.xlsx$/i.test(file.name) ? 'XLS' : 'CSV'}</div>
        <div class="file-copy"><b>${esc(file.name)}</b><span>${(file.size / 1024).toFixed(1)} KB${detail}${error ? ` · ${esc(error)}` : ''}</span></div>
        <span class="file-role">${esc(role)}</span>
      </div>`;
    }).join('');
  }

  function renderValidation(normalized, groups, records) {
    const uniqueRoles = groups.size;
    const duplicateGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
    const checks = (normalized?.checks || []).map(check => {
      const status = check.status === 'PASS' ? 'good' : 'warn';
      return `<div class="validation-line"><b>${esc(check.item)}</b><span class="${status}">${esc(check.value || check.status)}</span></div>`;
    }).join('');
    const duplicates = duplicateGroups.length
      ? `<div class="validation-line"><b>同类多文件合并</b><span class="good">${esc(duplicateGroups.map(([role, list]) => `${ROLE_LABELS[role] || role} × ${list.length}`).join('；'))}</span></div>`
      : '';
    validationBox.innerHTML = `${checks}
      <div class="validation-line"><b>本次源文件</b><span class="good">${records.length} 个 · 全部将单独归档</span></div>
      <div class="validation-line"><b>本次识别数据源</b><span class="good">${uniqueRoles} 类 · 可独立写入</span></div>
      ${duplicates}`;
    if (sourceCount) sourceCount.textContent = `${uniqueRoles} 类`;
    if (sourceBar) sourceBar.style.width = uniqueRoles ? '100%' : '0%';
  }

  function toast(title, text = '', warn = false) {
    if (!toastStack) return;
    const element = document.createElement('div');
    element.className = `toast${warn ? ' warn' : ''}`;
    element.innerHTML = `<i></i><div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
    toastStack.appendChild(element);
    setTimeout(() => element.remove(), 4200);
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : { error: await response.text() };
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
  }

  async function liveApiAvailable() {
    try {
      await api('/api/health');
      return true;
    } catch {
      return false;
    }
  }

  function captureFiles(files) {
    state.files = [...(files || [])].filter(file => /\.(csv|xlsx)$/i.test(file.name));
    state.records = [];
    state.roleMap = {};
    state.normalized = null;
    commitButton.disabled = true;
  }

  async function validateAll() {
    if (state.validating || state.committing) return;
    if (!state.files.length) captureFiles(fileInput.files || []);
    if (!state.files.length) {
      toast('请先选择文件', '', true);
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(monthInput.value || '')) {
      toast('报告月份尚未确定', '请等待月份识别完成后再检查。', true);
      return;
    }

    state.validating = true;
    state.records = [];
    state.roleMap = {};
    state.normalized = null;
    commitButton.disabled = true;
    validateButton.disabled = true;
    validateButton.textContent = `正在解析 0/${state.files.length}…`;
    const errors = new Map();

    try {
      for (let index = 0; index < state.files.length; index += 1) {
        const file = state.files[index];
        validateButton.textContent = `正在解析 ${index + 1}/${state.files.length}…`;
        try {
          const parsed = await engine.parseFile(file);
          const role = engine.detectRole(file.name, parsed);
          if (!role) throw new Error('无法识别报表类型');
          state.records.push({ file, parsed, role, rows: countRows(parsed, role) });
        } catch (error) {
          errors.set(file, String(error?.message || error));
        }
      }

      renderRecords(state.records, errors);
      if (errors.size) {
        validationBox.innerHTML = `<div class="validation-line"><b>文件识别</b><span class="warn">${errors.size} 个失败</span></div>`;
        throw new Error(`有 ${errors.size} 个文件无法识别；本次不会遗漏文件后继续写入。`);
      }
      if (state.records.length !== state.files.length) throw new Error('文件校验数量与选择数量不一致。');

      const { groups, roleMap } = groupRecords(state.records);
      state.roleMap = roleMap;
      state.normalized = normalizer.normalizeBundle(roleMap, monthInput.value);
      renderValidation(state.normalized, groups, state.records);
      const live = await liveApiAvailable();
      commitButton.disabled = !live;
      if (!live) toast('当前不是数据库写入模式', '文件已全部解析，但当前环境不能提交到 D1/R2。', true);
    } catch (error) {
      state.normalized = null;
      commitButton.disabled = true;
      toast('检查失败', error?.message || '多文件校验失败', true);
    } finally {
      state.validating = false;
      validateButton.disabled = false;
      validateButton.textContent = '检查数据';
    }
  }

  async function commitAll() {
    if (state.committing || state.validating) return;
    if (!state.normalized || !state.records.length) {
      toast('请先检查全部文件', '通过校验后再写入数据库。', true);
      return;
    }
    if (state.records.length !== state.files.length) {
      toast('文件数量不一致', '为避免遗漏，本次写入已阻止。请重新检查。', true);
      return;
    }

    state.committing = true;
    commitButton.disabled = true;
    validateButton.disabled = true;
    const month = monthInput.value;
    const storeId = window.YT_STORE_CONTEXT?.getStoreId?.() || 'ytdbns';

    try {
      commitButton.textContent = '正在创建导入批次…';
      const start = await api('/api/imports/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId, month, createdBy: 'web' })
      });

      for (let index = 0; index < state.records.length; index += 1) {
        const record = state.records[index];
        commitButton.textContent = `正在上传 ${index + 1}/${state.records.length}…`;
        const form = new FormData();
        form.append('batchId', start.batchId);
        form.append('storeId', storeId);
        form.append('month', month);
        form.append('reportType', record.role);
        form.append('rowCount', String(record.rows || 0));
        form.append('file', record.file);
        await api('/api/imports/file', { method: 'POST', body: form });
      }

      commitButton.textContent = '正在写入结构化数据…';
      await api('/api/imports/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batchId: start.batchId, storeId, payload: state.normalized })
      });

      const uniqueRoles = new Set(state.records.map(record => record.role)).size;
      toast('全部文件已入库', `${state.records.length} 个文件 · ${uniqueRoles} 类数据源已写入；每个原文件均已独立归档。`);
      window.dispatchEvent(new CustomEvent('yt:import-committed', {
        detail: { batchId: start.batchId, month, fileCount: state.records.length, sourceCount: uniqueRoles }
      }));
      document.getElementById('importDrawer')?.classList.remove('show');
      document.getElementById('drawerBackdrop')?.classList.remove('show');
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      toast('写入失败', error?.message || '多文件写入失败', true);
      commitButton.disabled = false;
    } finally {
      state.committing = false;
      validateButton.disabled = false;
      commitButton.textContent = '写入数据库';
    }
  }

  fileInput.addEventListener('change', event => captureFiles(event.target.files || []), true);
  dropzone?.addEventListener('drop', event => captureFiles(event.dataTransfer?.files || []), true);

  validateButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    validateAll();
  }, true);

  commitButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    commitAll();
  }, true);

  window.YT_MULTI_FILE_IMPORT = Object.freeze({
    version: 1,
    getSnapshot: () => ({
      selectedFileCount: state.files.length,
      validatedFileCount: state.records.length,
      sourceCount: new Set(state.records.map(record => record.role)).size,
      roles: state.records.map(record => record.role),
      filenames: state.records.map(record => record.file.name),
      normalized: state.normalized
    }),
    mergeRoleRecords
  });
})();
