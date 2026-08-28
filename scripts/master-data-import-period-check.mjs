import fs from 'node:fs';

const source = fs.readFileSync('public/master-data-import-period.js', 'utf8');
const loader = fs.readFileSync('public/v44.js', 'utf8');

const required = [
  "new Set(['cost', 'product'])",
  "monthInput.dataset.periodMode = 'master'",
  "statusBox.dataset.periodMode = 'master'",
  "'主数据导入'",
  "'America/Los_Angeles'",
  '不要求报告月份',
  '不会因此生成该月份的业务月报数据'
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`master-data import period invariant missing: ${token}`);
}
if (!loader.includes("script.src='./master-data-import-period.js'")) {
  throw new Error('v44 loader does not load master-data-import-period.js');
}
console.log('Master-data import period static invariants: PASS');
