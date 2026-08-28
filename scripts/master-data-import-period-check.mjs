import fs from 'node:fs';

const source = fs.readFileSync('public/master-data-import-period.js', 'utf8');
const loader = fs.readFileSync('public/v44.js', 'utf8');

const required = [
  "new Set(['cost', 'product', 'inventory'])",
  "monthInput.dataset.periodMode = 'master'",
  "statusBox.dataset.periodMode = 'master'",
  "'当前库存 / 主数据导入'",
  "'主数据导入'",
  "'America/Los_Angeles'",
  '不要求报告月份',
  '库存按本次上传时间作为当前快照',
  '全量替换上一份库存'
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`master/current-state import period invariant missing: ${token}`);
}
if (!loader.includes("script.src='./master-data-import-period.js'")) {
  throw new Error('v44 loader does not load master-data-import-period.js');
}
if (!loader.includes("script.src='./core-five-report-model.js'")) {
  throw new Error('v44 loader does not load canonical five-source model');
}
console.log('Master-data/current-inventory period static invariants: PASS');
