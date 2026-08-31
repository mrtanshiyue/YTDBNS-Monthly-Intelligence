import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert.match(source,/const roles=new Set\(\(p\.sources\|\|\[\]\)/);
assert.match(source,/preserve\('ads',\[\['adSpend','ad_spend'\]/);
assert.match(source,/keep\('ads',\[\['adSpend','ad_spend'\]/);
assert.match(source,/if\(roles\.has\('ads'\)\)\{await env\.DB\.prepare\('DELETE FROM campaign_monthly_metrics/);
assert.match(source,/if\(roles\.has\('parent'\)\)\{await env\.DB\.prepare\('DELETE FROM parent_monthly_metrics/);
assert.match(source,/if\(roles\.has\('child'\)\)\{await env\.DB\.prepare\('DELETE FROM product_monthly_metrics/);
assert.match(source,/if\(roles\.has\('storage'\)\)\{await env\.DB\.prepare\('DELETE FROM storage_monthly_metrics/);
assert.match(source,/if\(roles\.has\('returns'\)\)\{await env\.DB\.prepare\('DELETE FROM return_reason_monthly/);
assert.match(source,/if\(roles\.has\('transactions'\)\)\{await env\.DB\.prepare\('DELETE FROM charge_name_monthly/);
assert.doesNotMatch(source,/const m=p\.monthly\|\|\{\};const vals=mmValues\(m\)/);
console.log('P1 partial import preservation gate PASS');
