from pathlib import Path

worker = Path('src/worker.js')
text = worker.read_text()
old = """  let sessions=s.sessions==null?null:Number(s.sessions),businessSales=null,businessUnits=null;
  if(fullMonthRange(from,to)){
    if(sessions==null) sessions=monthly.reduce((a,r)=>a+(r.sessions||0),0);businessSales=monthly.reduce((a,r)=>a+(r.business_sales||0),0);businessUnits=monthly.reduce((a,r)=>a+(r.business_units||0),0);
  }
  const adSpend=Number(s.ad_spend||0),adSales=Number(s.ad_sales||0),sales=Number(s.sales||0),profit=Number(s.contribution_profit||0);
  const summary={...s,sales,adSpend,adSales,acos:adSales?adSpend/adSales:0,tacos:sales?adSpend/sales:0,profitMargin:sales?profit/sales:0,sessions,businessSales,businessUnits,rangeDays:days,grain,trafficGrain:sessions!=null?(s.sessions==null?'month':'day'):'unavailable'};
"""
new = """  const nullableSum=(rows,key)=>{const values=rows.map(row=>row[key]).filter(value=>value!=null);return values.length?values.reduce((sum,value)=>sum+Number(value||0),0):null;};
  let sessions=s.sessions==null?null:Number(s.sessions),businessSales=null,businessUnits=null;
  const fullMonth=fullMonthRange(from,to);
  if(fullMonth){
    if(sessions==null) sessions=nullableSum(monthly,'sessions');
    businessSales=nullableSum(monthly,'business_sales');
    businessUnits=nullableSum(monthly,'business_units');
  }
  const monthlyAdSpend=fullMonth?nullableSum(monthly,'ad_spend'):undefined;
  const monthlyAdSales=fullMonth?nullableSum(monthly,'ad_sales'):undefined;
  const adSpend=fullMonth&&monthlyAdSpend==null?null:(s.ad_spend==null?null:Number(s.ad_spend));
  const adSales=fullMonth&&monthlyAdSales==null?null:(s.ad_sales==null?null:Number(s.ad_sales));
  const sales=s.sales==null?null:Number(s.sales),profit=s.contribution_profit==null?null:Number(s.contribution_profit);
  const acos=adSpend==null||adSales==null?null:(adSales?adSpend/adSales:0);
  const tacos=adSpend==null||sales==null?null:(sales?adSpend/sales:0);
  const profitMargin=sales==null||profit==null?null:(sales?profit/sales:0);
  const summary={...s,sales,adSpend,adSales,acos,tacos,profitMargin,sessions,businessSales,businessUnits,rangeDays:days,grain,trafficGrain:sessions!=null?(s.sessions==null?'month':'day'):'unavailable'};
"""
if old not in text:
    raise SystemExit('expected apiDashboard block not found; refusing broad patch')
worker.write_text(text.replace(old, new, 1))

gate = Path('scripts/p1-null-metric-semantics-check.mjs')
gate.write_text("""import fs from 'node:fs';
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
""")

workflow = Path('.github/workflows/ui-integrity.yml')
yml = workflow.read_text()
anchor = '      - name: JavaScript syntax\n'
step = "      - name: P1 null metric semantics\n        run: node scripts/p1-null-metric-semantics-check.mjs\n"
if step not in yml:
    if anchor not in yml:
        raise SystemExit('UI Integrity anchor not found')
    workflow.write_text(yml.replace(anchor, step + anchor, 1))

Path('.github/workflows/p1-null-metric-bootstrap.yml').unlink()
Path('scripts/apply-p1-null-metric-patch.py').unlink()
