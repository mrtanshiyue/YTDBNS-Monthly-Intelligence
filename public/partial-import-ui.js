(() => {
  'use strict';

  const engine = window.YT_ENGINE;
  const normalizer = window.YT_NORMALIZER;
  const sourceCount = document.getElementById('sourceCount');
  const sourceBar = document.getElementById('sourceProgressBar');
  const validationBox = document.getElementById('validationBox');
  const commitButton = document.getElementById('commitBtn');
  const validateButton = document.getElementById('validateBtn');
  const monthInput = document.getElementById('importMonth');
  const fileInput = document.getElementById('importFiles');
  const toastStack = document.getElementById('toastStack');
  if (!engine || !normalizer || !sourceCount || !sourceBar || !validationBox || !commitButton || !validateButton || !monthInput || !fileInput) return;

  const DATE_HEADER_RE = /(date|日期|时间|month|月份|更新|snapshot|period|charge)/i;
  const ROLE_LABELS = normalizer.ROLE_LABELS || {};
  let fallbackGeneration = 0;

  function firstSheet(parsed) {
    return Object.values(parsed?.sheets || {})[0] || [];
  }
  function findHeader(rows, tokens) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
      const text = (rows[index] || []).join('|').toLowerCase();
      if (tokens.every(token => text.includes(token.toLowerCase()))) return index;
    }
    return -1;
  }
  function objects(rows, headerIndex) {
    if (headerIndex < 0) return [];
    const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
    return rows.slice(headerIndex + 1)
      .filter(row => row.some(value => value !== '' && value != null))
      .map(row => {
        const object = {};
        headers.forEach((header, index) => { if (header) object[header] = row[index] ?? ''; });
        return object;
      });
  }
  function get(object, keys) {
    for (const key of keys) if (key in object) return object[key];
    const entries = Object.entries(object);
    for (const key of keys) {
      const lower = key.toLowerCase();
      const found = entries.find(([name]) => name.toLowerCase() === lower);
      if (found) return found[1];
    }
    return '';
  }
  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function buildReturnEvents(roleMap) {
    const item = roleMap.returns;
    if (!item) return [];
    const rows = firstSheet(item.parsed);
    const header = findHeader(rows, ['return-date', 'sku', 'reason']);
    const events = [];
    for (const object of objects(rows, header)) {
      const date = normalizer.parseDate(get(object, ['return-date']));
      if (!date) continue;
      events.push({
        date,
        reason: String(get(object, ['reason']) || 'UNKNOWN'),
        disposition: String(get(object, ['detailed-disposition']) || ''),
        count: normalizer.num(get(object, ['quantity'])) || 1
      });
    }
    return events;
  }

  function buildCampaignEvents(roleMap) {
    const item = roleMap.ads;
    if (!item) return [];
    const rows = firstSheet(item.parsed);
    const header = findHeader(rows, ['广告活动名称', '7天总销售额']);
    const events = [];
    for (const object of objects(rows, header)) {
      const date = normalizer.parseDate(get(object, ['日期']));
      if (!date) continue;
      events.push({
        date,
        portfolio: String(get(object, ['广告组合名称']) || '未分组'),
        campaign: String(get(object, ['广告活动名称']) || '未命名'),
        spend: normalizer.money(get(object, ['花费'])),
        sales: normalizer.money(get(object, ['7天总销售额'])),
        orders: normalizer.num(get(object, ['7天总订单数(#)'])),
        impressions: normalizer.num(get(object, ['展示量'])),
        clicks: normalizer.num(get(object, ['点击量']))
      });
    }
    return events;
  }

  function buildTransactionEvents(roleMap) {
    const item = roleMap.transactions;
    if (!item) return [];
    const rows = firstSheet(item.parsed);
    const header = findHeader(rows, ['settlement id', 'product sales']);
    const events = [];
    for (const object of objects(rows, header)) {
      const date = normalizer.parseDate(get(object, ['date/time']));
      if (!date) continue;
      const type = String(get(object, ['type']) || '').trim();
      const description = String(get(object, ['description']) || '');
      const total = normalizer.money(get(object, ['total']));
      events.push({
        date,
        transferPayout: type === 'Transfer' ? Math.abs(total) : 0,
        longTermStorageFee: type === 'FBA Inventory Fee' && /Long-Term/i.test(description) ? Math.abs(total) : 0,
        reimbursements: type === 'Adjustment' ? total : 0,
        liquidationNet: type === 'Liquidations' ? total : 0,
        subscription: type === 'Service Fee' && /subscription/i.test(description) ? Math.abs(total) : 0
      });
    }
    return events;
  }

  if (!normalizer.__partialImportWrapped) {
    const originalNormalize = normalizer.normalizeBundle.bind(normalizer);
    normalizer.normalizeBundle = (roleMap, month) => {
      const result = originalNormalize(roleMap, month);
      const roles = new Set(Object.keys(roleMap || {}));
      result.returnEvents = buildReturnEvents(roleMap || {});
      result.campaignEvents = buildCampaignEvents(roleMap || {});
      result.transactionEvents = buildTransactionEvents(roleMap || {});
      result.checks = (result.checks || []).filter(check => {
        const item = String(check?.item || '');
        if (item === '9类数据源') return false;
        if (item === '采购成本覆盖') return roles.has('transactions');
        if (item === '广告对账') return roles.has('ads') && roles.has('transactions');
        if (item === '业务/财务销售') return roles.has('parent') && roles.has('transactions');
        return true;
      });
      result.checks.unshift({
        item: '本次数据源',
        status: roles.size ? 'PASS' : 'FAIL',
        value: `${roles.size} 类`,
        detail: '支持单个或多个报表分批导入；未上传模块保持原数据。'
      });
      return result;
    };
    Object.defineProperty(normalizer, '__partialImportWrapped', { value: true });
  }

  function ensureStyles() {
    if (document.getElementById('ytPartialImportStyles')) return;
    const style = document.createElement('style');
    style.id = 'ytPartialImportStyles';
    style.textContent = `
      .yt-partial-import-note{margin:10px 0 0;font-size:12px;line-height:1.5;color:#65747d}
      .yt-partial-import-note b{color:#1e6f5c}
      .source-progress[data-partial-ready="true"] .progress-track i{width:100%!important;background:#1e6f5c}
    `;
    document.head.appendChild(style);
  }

  function ensureNote() {
    ensureStyles();
    const progress = sourceCount.closest('.source-progress');
    if (!progress) return;
    let note = document.getElementById('ytPartialImportNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'ytPartialImportNote';
      note.className = 'yt-partial-import-note';
      note.innerHTML = '<b>支持分批上传：</b>单个报表也可检查并写入；后续可继续补充其他报表，未上传模块不会被清空。';
      progress.appendChild(note);
    }
    const label = progress.querySelector('.source-progress-top b');
    setText(label, '本次识别数据源');
  }

  function countFromUi() {
    const match = String(sourceCount.textContent || '').match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function syncPartialState() {
    ensureNote();
    const count = countFromUi();
    const validated = Boolean(validationBox.querySelector('.validation-line')) && !validationBox.textContent.includes('计算失败');
    const monthReady = /^\d{4}-\d{2}$/.test(monthInput.value || '');
    const live = document.documentElement.dataset.dataTruth === 'live-only' || /D1/.test(document.getElementById('dbModeLabel')?.textContent || '');
    const countLabel = count ? `${count} 类` : '0 类';
    setText(sourceCount, countLabel);
    const progress = sourceCount.closest('.source-progress');
    const readyValue = count > 0 ? 'true' : 'false';
    if (progress && progress.dataset.partialReady !== readyValue) progress.dataset.partialReady = readyValue;
    const width = count > 0 ? '100%' : '0%';
    if (sourceBar.style.width !== width) sourceBar.style.width = width;

    for (const line of [...validationBox.querySelectorAll('.validation-line')]) {
      const title = line.querySelector('b');
      const value = line.querySelector('span');
      if (!title || !value) continue;
      const titleText = title.textContent.trim();
      if (titleText === '识别数据源') {
        line.remove();
        continue;
      }
      if (titleText === '9类数据源' || titleText === '本次数据源' || titleText === '本次识别数据源') {
        setText(title, '本次识别数据源');
        setText(value, `${count} 类 · 可独立写入`);
        value.classList.remove('warn');
        value.classList.add('good');
      }
    }

    if (validated && count > 0 && monthReady && live && commitButton.textContent.trim() !== '正在写入…' && commitButton.disabled) {
      commitButton.disabled = false;
    }
  }

  function removeLegacyCompletenessToast() {
    for (const toast of toastStack?.querySelectorAll('.toast') || []) {
      if (toast.textContent.includes('数据源未齐全')) toast.remove();
    }
  }

  const observer = new MutationObserver(() => {
    syncPartialState();
    removeLegacyCompletenessToast();
  });
  observer.observe(validationBox, { childList: true, subtree: true, characterData: true });
  observer.observe(sourceCount, { childList: true, subtree: true, characterData: true });
  if (toastStack) observer.observe(toastStack, { childList: true, subtree: true });

  function genericDateEvidence(parsed, role) {
    const rows = firstSheet(parsed);
    let best = null;
    for (let headerIndex = 0; headerIndex < Math.min(rows.length, 40); headerIndex += 1) {
      const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
      const dateColumns = headers.map((header, index) => DATE_HEADER_RE.test(header) ? index : -1).filter(index => index >= 0);
      if (!dateColumns.length) continue;
      const dates = [];
      for (const row of rows.slice(headerIndex + 1)) {
        for (const index of dateColumns) {
          const date = normalizer.parseDate(row?.[index]);
          if (date) dates.push(date);
        }
      }
      if (!dates.length) continue;
      if (!best || dates.length > best.dates.length) best = { role, headers, dateColumns, dates };
    }
    return best;
  }

  function chooseMonth(evidence) {
    const counts = new Map();
    for (const item of evidence) {
      for (const date of item.dates) {
        const month = date.slice(0, 7);
        counts.set(month, (counts.get(month) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] || '';
  }

  function setFallbackStatus(month, evidence) {
    const box = document.getElementById('importPeriodStatus');
    if (!box || !month) return;
    const value = box.querySelector('#importPeriodValue');
    const detail = box.querySelector('#importPeriodDetail');
    const [year, number] = month.split('-');
    box.dataset.state = 'warn';
    setText(value, `${year}年${Number(number)}月`);
    setText(detail, `已从 ${evidence.map(item => ROLE_LABELS[item.role] || item.role).join('、')} 的日期字段自动识别；本次可单独写入。`);
    monthInput.value = month;
    validateButton.disabled = false;
  }

  async function fallbackMonthDetection(files) {
    const run = ++fallbackGeneration;
    const selected = [...files].filter(file => /\.(csv|xlsx)$/i.test(file.name));
    if (!selected.length) return;
    const evidence = [];
    for (const file of selected) {
      try {
        const parsed = await engine.parseFile(file);
        if (run !== fallbackGeneration) return;
        const role = engine.detectRole(file.name, parsed);
        if (!role) continue;
        const item = genericDateEvidence(parsed, role);
        if (item) evidence.push(item);
      } catch {}
    }
    if (run !== fallbackGeneration || monthInput.value || !evidence.length) return;
    const month = chooseMonth(evidence);
    if (month) setFallbackStatus(month, evidence);
  }

  fileInput.addEventListener('change', event => {
    setTimeout(() => fallbackMonthDetection(event.target.files || []), 0);
    setTimeout(syncPartialState, 0);
  });
  document.getElementById('dropzone')?.addEventListener('drop', event => {
    setTimeout(() => fallbackMonthDetection(event.dataTransfer?.files || []), 0);
  });

  ensureNote();
  syncPartialState();
})();
