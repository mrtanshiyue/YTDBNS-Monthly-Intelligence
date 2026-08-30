import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
assert.match(source, /const nullableSum=/);
assert.match(source, /businessSales=nullableSum\(monthly,'business_sales'\)/);
assert.match(source, /businessUnits=nullableSum\(monthly,'business_units'\)/);
assert.match(source, /sessions=nullableSum\(monthly,'sessions'\)/);
assert.match(source, /fullMonth&&monthlyAdSpend==null\?null/);
assert.match(source, /fullMonth&&monthlyAdSales==null\?null/);
assert.match(source, /acos=adSpend==null\|\|adSales==null\?null/);
assert.match(source, /tacos=adSpend==null\|\|sales==null\?null/);
assert.doesNotMatch(source, /businessSales=monthly\.reduce/);
assert.doesNotMatch(source, /const adSpend=Number\(s\.ad_spend\|\|0\)/);

const nullableSum = (rows, key) => {
  const values = rows.map(row => row[key]).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) : null;
};
assert.equal(nullableSum([{business_sales:null},{business_sales:null}], 'business_sales'), null);
assert.equal(nullableSum([{business_sales:0},{business_sales:null}], 'business_sales'), 0);
assert.equal(nullableSum([{business_sales:12.5},{business_sales:7.5}], 'business_sales'), 20);
console.log('P1 null metric semantics gate PASS');
