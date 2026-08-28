import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rows = [
  ['广告组合名称', '广告活动名称', '日期', '总成本', '购买量', '销售额', '展示量', '点击量'],
  ['Portfolio A', 'Campaign A', '2025年6月2日', '10.50', '2', '30.00', '100', '5'],
  ['Portfolio A', 'Campaign A', '2025年6月16日', '12.25', '3', '45.00', '120', '7']
];

globalThis.window = {
  YT_ENGINE: {
    parseFile: async () => ({ kind: 'csv', sheets: { CSV: rows.map(row => [...row]) } })
  },
  YT_NORMALIZER: {
    parseDate: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null
  }
};

vm.runInThisContext(fs.readFileSync('public/import-report-compat.js', 'utf8'), { filename: 'import-report-compat.js' });

const parsed = await window.YT_ENGINE.parseFile({ name: '202506.csv' });
const output = parsed.sheets.CSV;
const headers = output[0];

for (const header of ['日期', '花费', '7天总销售额', '7天总订单数(#)']) {
  assert.ok(headers.includes(header), `missing compatibility header: ${header}`);
}

const dateIndex = headers.indexOf('日期');
const spendIndex = headers.indexOf('花费');
const salesIndex = headers.indexOf('7天总销售额');
const ordersIndex = headers.indexOf('7天总订单数(#)');

assert.equal(output[1][dateIndex], '2025-06-02');
assert.equal(output[2][dateIndex], '2025-06-16');
assert.equal(window.YT_NORMALIZER.parseDate('2025年6月30日'), '2025-06-30');
assert.deepEqual(new Set(output.slice(1).map(row => window.YT_NORMALIZER.parseDate(row[dateIndex]).slice(0, 7))), new Set(['2025-06']));

assert.equal(output.slice(1).reduce((sum, row) => sum + Number(row[spendIndex] || 0), 0), 22.75);
assert.equal(output.slice(1).reduce((sum, row) => sum + Number(row[salesIndex] || 0), 0), 75);
assert.equal(output.slice(1).reduce((sum, row) => sum + Number(row[ordersIndex] || 0), 0), 5);

const headerText = headers.join('|').toLowerCase();
assert.ok(['广告活动名称', '7天总销售额'].every(token => headerText.includes(token.toLowerCase())), 'auto-period Ads anchor remains detectable');

console.log('Localized/current Amazon Ads import compatibility: PASS');
