(() => {
  'use strict';

  const engine = window.YT_ENGINE;
  const normalizer = window.YT_NORMALIZER;
  if (!engine || !normalizer || engine.__reportCompatV1) return;

  const DATE_HEADERS = new Set(['日期', 'date/time', 'return-date']);
  const AD_ALIASES = Object.freeze([
    Object.freeze({ legacy: '花费', current: ['总成本', '成本', '广告花费'] }),
    Object.freeze({ legacy: '7天总销售额', current: ['销售额', '总销售额'] }),
    Object.freeze({ legacy: '7天总订单数(#)', current: ['购买量', '订单量', '总订单数'] })
  ]);

  function normalizeDateValue(value) {
    if (value == null || value === '' || typeof value === 'number') return value;
    const text = String(value).trim();
    let match = text.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s.*)?$/);
    if (!match) match = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:\s.*)?$/);
    if (!match) return value;
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  function findHeaderIndex(rows) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
      const headers = (rows[index] || []).map(value => String(value ?? '').trim());
      if (headers.some(header => DATE_HEADERS.has(header) || DATE_HEADERS.has(header.toLowerCase()))) return index;
      if (headers.includes('广告活动名称') && headers.includes('日期')) return index;
    }
    return -1;
  }

  function normalizeDateColumns(rows, headerIndex) {
    if (headerIndex < 0) return;
    const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
    const dateIndexes = headers
      .map((header, index) => DATE_HEADERS.has(header) || DATE_HEADERS.has(header.toLowerCase()) ? index : -1)
      .filter(index => index >= 0);
    if (!dateIndexes.length) return;
    for (const row of rows.slice(headerIndex + 1)) {
      for (const index of dateIndexes) {
        if (index < row.length) row[index] = normalizeDateValue(row[index]);
      }
    }
  }

  function addAliasColumn(rows, headerIndex, legacy, candidates) {
    const headerRow = rows[headerIndex];
    const headers = headerRow.map(value => String(value ?? '').trim());
    if (headers.includes(legacy)) return;
    const sourceIndex = candidates.map(name => headers.indexOf(name)).find(index => index >= 0);
    if (sourceIndex == null || sourceIndex < 0) return;
    headerRow.push(legacy);
    for (const row of rows.slice(headerIndex + 1)) row.push(row[sourceIndex] ?? '');
  }

  function normalizeAdsSchema(rows, headerIndex) {
    if (headerIndex < 0) return;
    const headers = (rows[headerIndex] || []).map(value => String(value ?? '').trim());
    if (!headers.includes('广告活动名称') || !headers.includes('日期')) return;
    for (const alias of AD_ALIASES) addAliasColumn(rows, headerIndex, alias.legacy, alias.current);
  }

  function normalizeParsed(parsed) {
    for (const rows of Object.values(parsed?.sheets || {})) {
      if (!Array.isArray(rows) || !rows.length) continue;
      const headerIndex = findHeaderIndex(rows);
      normalizeDateColumns(rows, headerIndex);
      normalizeAdsSchema(rows, headerIndex);
    }
    return parsed;
  }

  const originalParseFile = engine.parseFile.bind(engine);
  engine.parseFile = async file => normalizeParsed(await originalParseFile(file));

  const originalParseDate = normalizer.parseDate.bind(normalizer);
  normalizer.parseDate = value => originalParseDate(normalizeDateValue(value));

  Object.defineProperty(engine, '__reportCompatV1', { value: true });
  window.YT_IMPORT_REPORT_COMPAT = Object.freeze({ normalizeDateValue, normalizeParsed });
})();
