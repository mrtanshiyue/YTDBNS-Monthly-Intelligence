(() => {
  'use strict';

  const engine = window.YT_ENGINE;
  const normalizer = window.YT_NORMALIZER;
  const input = document.getElementById('importFiles');
  const dropzone = document.getElementById('dropzone');
  const monthInput = document.getElementById('importMonth');
  const validateButton = document.getElementById('validateBtn');
  const drawerBody = document.querySelector('#importDrawer .drawer-body');
  if (!engine || !normalizer || !input || !dropzone || !monthInput || !validateButton || !drawerBody) return;

  const ROLE_LABELS = normalizer.ROLE_LABELS || {};
  const DATE_ROLES = Object.freeze({
    transactions: Object.freeze({ header: ['settlement id', 'product sales'], keys: ['date/time'], anchor: true }),
    ads: Object.freeze({ header: ['广告活动名称', '7天总销售额'], keys: ['日期'], anchor: true }),
    returns: Object.freeze({ header: ['return-date', 'sku', 'reason'], keys: ['return-date'], anchor: false })
  });

  let generation = 0;
  let currentFiles = [];
  let statusBox = null;

  function ensureStyle() {
    if (document.getElementById('ytImportAutoPeriodStyles')) return;
    const style = document.createElement('style');
    style.id = 'ytImportAutoPeriodStyles';
    style.textContent = `
      .yt-import-month-control{display:none!important}
      .yt-import-auto-period{margin:0 0 22px;padding:15px 16px;border:1px solid rgba(37,62,76,.12);border-radius:15px;background:#f7f9fb;display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center}
      .yt-import-auto-period>span{font-size:12px;font-weight:700;color:#697680}
      .yt-import-auto-period>strong{font-size:17px;line-height:1.25;color:#1f2b33;letter-spacing:-.01em}
      .yt-import-auto-period>small{grid-column:1/-1;font-size:12px;line-height:1.55;color:#74818a}
      .yt-import-auto-period[data-state="loading"]>strong{color:#52636d}
      .yt-import-auto-period[data-state="ready"]{border-color:rgba(30,111,92,.18);background:rgba(30,111,92,.055)}
      .yt-import-auto-period[data-state="ready"]>strong{color:#1e6f5c}
      .yt-import-auto-period[data-state="warn"]{border-color:rgba(168,113,31,.22);background:rgba(168,113,31,.06)}
      .yt-import-auto-period[data-state="warn"]>strong{color:#8a5b18}
      .yt-import-auto-period[data-state="error"]{border-color:rgba(167,67,67,.2);background:rgba(167,67,67,.055)}
      .yt-import-auto-period[data-state="error"]>strong{color:#9a3f3f}
    `;
    document.head.appendChild(style);
  }

  function setStep(step, number, title, text) {
    const badge = step?.querySelector(':scope > span');
    const titleNode = step?.querySelector('b');
    const textNode = step?.querySelector('p');
    if (badge) badge.textContent = String(number);
    if (titleNode) titleNode.textContent = title;
    if (textNode) textNode.textContent = text;
  }

  function reshapeDrawer() {
    ensureStyle();
    const steps = [...drawerBody.querySelectorAll(':scope > .import-step')];
    const monthLabel = monthInput.closest('.field-label');
    if (monthLabel) monthLabel.classList.add('yt-import-month-control');
    monthInput.type = 'hidden';
    monthInput.removeAttribute('min');
    monthInput.removeAttribute('max');

    if (steps.length >= 3) {
      setStep(steps[0], 1, '加入月度源文件', '支持 CSV / XLSX，自动识别 9 类报表。');
      setStep(steps[1], 2, '自动识别报告月份', '系统读取报表内日期；跨月记录会保留原日期，不需要手动选择月份。');
      setStep(steps[2], 3, '检查并写入', '先解析、校验日期与数据源，再保存原文件和结构化历史数据。');

      const fileStack = document.getElementById('fileStack');
      if (fileStack && steps[1].previousElementSibling !== fileStack) fileStack.after(steps[1]);

      statusBox = document.getElementById('importPeriodStatus');
      if (!statusBox) {
        statusBox = document.createElement('div');
        statusBox.id = 'importPeriodStatus';
        statusBox.className = 'yt-import-auto-period';
        statusBox.innerHTML = '<span>报告月份</span><strong id="importPeriodValue">等待源文件</strong><small id="importPeriodDetail">上传报表后，系统会综合各报表日期自动判定月份。</small>';
        steps[1].after(statusBox);
      }
    }
  }

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

  function roleEvidence(role, item) {
    const config = DATE_ROLES[role];
    if (!config) return null;
    const rows = firstSheet(item.parsed);
    const headerIndex = findHeader(rows, config.header);
    const counts = new Map();
    const dates = [];
    let total = 0;
    for (const object of objects(rows, headerIndex)) {
      const date = normalizer.parseDate(get(object, config.keys));
      if (!date) continue;
      const month = date.slice(0, 7);
      counts.set(month, (counts.get(month) || 0) + 1);
      dates.push(date);
      total += 1;
    }
    if (!total) return null;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]));
    const [month, count] = ranked[0];
    dates.sort();
    return {
      role,
      label: ROLE_LABELS[role] || role,
      anchor: Boolean(config.anchor),
      month,
      total,
      confidence: count / total,
      counts: Object.fromEntries(ranked),
      months: ranked.map(([value]) => value).sort(),
      minDate: dates[0],
      maxDate: dates[dates.length - 1]
    };
  }

  function shareFor(evidence, month) {
    return Number(evidence.counts?.[month] || 0) / Math.max(1, evidence.total || 0);
  }

  function intersectionMonthCandidates(items) {
    if (!items.length) return [];
    let candidates = new Set(items[0].months);
    for (const item of items.slice(1)) {
      candidates = new Set([...candidates].filter(month => item.months.includes(month)));
    }
    return [...candidates];
  }

  function bestSupportedMonth(items, candidates = null) {
    const pool = candidates?.length
      ? [...candidates]
      : [...new Set(items.flatMap(item => item.months))];
    if (!pool.length) return '';
    return pool
      .map(month => ({
        month,
        score: items.reduce((sum, item) => sum + shareFor(item, month), 0)
      }))
      .sort((a, b) => b.score - a.score || b.month.localeCompare(a.month))[0]?.month || '';
  }

  function inferMonth(roleMap) {
    const evidence = Object.entries(roleMap).map(([role, item]) => roleEvidence(role, item)).filter(Boolean);
    if (!evidence.length) {
      throw new Error('尚未找到可用于判定月份的日期字段；请至少加入联合报告、广告每日视图或退货报告。');
    }

    const anchors = evidence.filter(item => item.anchor);
    let month = '';
    let usedFallback = false;

    if (anchors.length >= 2) {
      const sharedMonths = intersectionMonthCandidates(anchors);
      if (!sharedMonths.length) {
        throw new Error(`主报表日期范围没有共同月份：${anchors.map(item => `${item.label} ${item.months.join('/')}`).join('；')}。请检查是否混入不同报告周期的文件。`);
      }
      month = bestSupportedMonth(anchors, sharedMonths);
    } else if (anchors.length === 1) {
      month = anchors[0].month;
    } else {
      month = bestSupportedMonth(evidence);
      usedFallback = true;
    }

    if (!month) throw new Error('无法从报表日期中确定报告月份。');

    const contradictory = evidence.filter(item => !item.months.includes(month));
    if (contradictory.length) {
      throw new Error(`报表月份不一致：目标月份 ${month} 未出现在 ${contradictory.map(item => `${item.label}（${item.months.join('/')}）`).join('、')} 中。请检查是否混入其他报告周期文件。`);
    }

    const crossMonth = evidence.filter(item => item.months.length > 1);
    return {
      month,
      evidence,
      crossMonth,
      usedFallback
    };
  }

  function formatMonth(month) {
    const [year, value] = month.split('-');
    return `${year}年${Number(value)}月`;
  }

  function formatRange(item) {
    if (!item?.minDate || !item?.maxDate) return item?.label || '';
    if (item.minDate === item.maxDate) return `${item.label} ${item.minDate}`;
    return `${item.label} ${item.minDate}～${item.maxDate}`;
  }

  function updateStatus(state, value, detail) {
    if (!statusBox) reshapeDrawer();
    if (!statusBox) return;
    statusBox.dataset.state = state;
    const valueNode = statusBox.querySelector('#importPeriodValue');
    const detailNode = statusBox.querySelector('#importPeriodDetail');
    if (valueNode) valueNode.textContent = value;
    if (detailNode) detailNode.textContent = detail;
  }

  function wrapParserCache() {
    if (engine.__autoPeriodCacheWrapped) return;
    const original = engine.parseFile.bind(engine);
    const cache = new WeakMap();
    engine.parseFile = file => {
      if (cache.has(file)) return cache.get(file);
      const promise = Promise.resolve(original(file)).catch(error => {
        cache.delete(file);
        throw error;
      });
      cache.set(file, promise);
      return promise;
    };
    Object.defineProperty(engine, '__autoPeriodCacheWrapped', { value: true });
  }

  async function detectFromFiles(files) {
    const run = ++generation;
    currentFiles = [...files].filter(file => /\.(csv|xlsx)$/i.test(file.name));
    monthInput.value = '';
    validateButton.disabled = true;
    if (!currentFiles.length) {
      updateStatus('idle', '等待源文件', '上传报表后，系统会综合各报表日期自动判定月份。');
      return;
    }
    updateStatus('loading', '正在识别…', '正在读取报表日期并核对各数据源的日期覆盖范围。');
    try {
      const roleMap = {};
      for (const file of currentFiles) {
        const parsed = await engine.parseFile(file);
        if (run !== generation) return;
        const role = engine.detectRole(file.name, parsed);
        if (role) roleMap[role] = { file, parsed };
      }
      const result = inferMonth(roleMap);
      if (run !== generation) return;
      monthInput.value = result.month;
      const labels = result.evidence.map(item => item.label).join('、');
      const crossMonthDetail = result.crossMonth.map(formatRange).join('；');
      updateStatus(
        result.crossMonth.length || result.usedFallback ? 'warn' : 'ready',
        formatMonth(result.month),
        result.crossMonth.length
          ? `已综合 ${labels} 判定为 ${formatMonth(result.month)}。存在跨月记录：${crossMonthDetail}；跨月本身不会阻止导入。`
          : result.usedFallback
            ? `当前缺少联合报告/广告每日视图主锚点，已按现有日期记录占比自动判定；建议检查后继续。`
            : `已由 ${labels} 的报表日期一致确认；无需手动选择月份。`
      );
      validateButton.disabled = false;
    } catch (error) {
      if (run !== generation) return;
      monthInput.value = '';
      updateStatus('error', '无法确定月份', error?.message || '报表日期识别失败。');
      validateButton.disabled = true;
    }
  }

  wrapParserCache();
  reshapeDrawer();

  input.addEventListener('change', event => detectFromFiles(event.target.files || []));
  dropzone.addEventListener('drop', event => detectFromFiles(event.dataTransfer?.files || []));

  validateButton.addEventListener('click', event => {
    if (monthInput.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (currentFiles.length) detectFromFiles(currentFiles);
    else updateStatus('error', '等待源文件', '请先加入本月报表，系统会自动读取其中的日期。');
  }, true);
})();
