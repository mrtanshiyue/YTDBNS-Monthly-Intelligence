(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const D = window.YT_DEMO || {};
  const C = D.current || {};
  const safeStorageGet = k => { try { return window.localStorage.getItem(k); } catch { return null; } };
  const safeStorageSet = (k,v) => { try { window.localStorage.setItem(k,v); } catch {} };
  let compareEnabled = false;
  let activeCommandIndex = 0;
  let hoverSeriesCache = null;
  let hoverSeriesKey = '';
  let enhancing = false;
  let lastCompareSignature = '';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthStart = m => m + '-01';
  const monthEnd = m => { const [y,mo] = m.split('-').map(Number); return new Date(Date.UTC(y,mo,0)).toISOString().slice(0,10); };
  const addDays = (s,n) => { const d = new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const daysBetween = (a,b) => Math.round((new Date(b+'T00:00:00Z') - new Date(a+'T00:00:00Z'))/86400000)+1;
  const isFullMonth = (from,to) => from?.endsWith('-01') && to === monthEnd(to.slice(0,7));
  const money = (v,d=0) => v == null ? '—' : '$'+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
  const num = (v,d=0) => v == null ? '—' : Number(v||0).toLocaleString('en-US',{maximumFractionDigits:d});
  const pct = (v,d=1) => v == null ? '—' : (Number(v||0)*100).toFixed(d)+'%';
  const parseNumeric = txt => {
    const s = String(txt||'').trim().replaceAll(',','');
    if(!s || s==='—') return null;
    const m = s.match(/-?\d+(?:\.\d+)?/); if(!m) return null;
    let v = Number(m[0]); if(s.includes('%')) v /= 100; return v;
  };
  const getRange = () => ({from: $('#dateFrom')?.value, to: $('#dateTo')?.value});
  const previousRange = () => { const {from,to}=getRange(); const n=daysBetween(from,to); return {from:addDays(from,-n),to:addDays(from,-1)}; };
  const isDemo = () => location.protocol === 'file:' || !$('#dbModeLabel') || $('#dbModeLabel').textContent.includes('DEMO');

  function monthOverlapDays(month,from,to){const s=monthStart(month),e=monthEnd(month),a=s>from?s:from,b=e<to?e:to;return a>b?0:daysBetween(a,b)}
  function proratedMonthly(key,from,to){let sum=0;for(const m of (D.monthly||[])){const overlap=monthOverlapDays(m.month,from,to);if(overlap)sum+=(Number(m[key]||0))*overlap/daysBetween(monthStart(m.month),monthEnd(m.month))}return sum}
  function demoSummary(from,to){
    const rows=(D.dailyTraffic||[]).filter(r=>r.date>=from&&r.date<=to);
    let sales=rows.reduce((a,r)=>a+Number(r.sales||0),0),units=rows.reduce((a,r)=>a+Number(r.units||0),0),sessions=rows.reduce((a,r)=>a+Number(r.sessions||0),0);
    let adSpend=proratedMonthly('adSpend',from,to),adSales=proratedMonthly('adSales',from,to),impressions=proratedMonthly('impressions',from,to);
    let profit=null,profitMargin=null,refundSales=null,returns=null,inventoryValue=null,fulfillableUnits=null;
    if(C.meta && from===monthStart(C.meta.period) && to===monthEnd(C.meta.period)){
      const o=C.overview||{}; sales=o.businessSales??sales;units=o.businessUnits??units;sessions=o.sessions??sessions;adSpend=o.adSpend??adSpend;adSales=o.adSales??adSales;profit=o.profit??null;profitMargin=o.profitMargin??null;refundSales=C.finance?.refundSales??null;returns=o.returns??null;inventoryValue=o.inventoryValue??null;fulfillableUnits=o.fulfillableUnits??null;
    } else if(isFullMonth(from,to) && from.slice(0,7)===to.slice(0,7)){
      const m=(D.monthly||[]).find(x=>x.month===from.slice(0,7));
      if(m){sales=m.sales??sales;units=m.units??units;sessions=m.sessions??sessions;adSpend=m.adSpend??adSpend;adSales=m.adSales??adSales;profit=m.profit??null;profitMargin=m.profitMargin??null;refundSales=m.refundSales??null;returns=m.returns??null;inventoryValue=m.inventoryValue??null;fulfillableUnits=m.fulfillableUnits??null;impressions=m.impressions??impressions;}
    }
    return {sales,units,sessions,adSpend,adSales,impressions,profit,profitMargin,refundSales,returns,inventoryValue,fulfillableUnits,acos:adSales?adSpend/adSales:null,tacos:sales?adSpend/sales:null,cvr:sessions?units/sessions:null,returnRate:units&&returns!=null?returns/units:null};
  }
  function demoSeries(from,to){
    const n=daysBetween(from,to);
    if(n>100)return (D.monthly||[]).filter(m=>m.month>=from.slice(0,7)&&m.month<=to.slice(0,7)).map(m=>({label:m.month,sales:m.sales,adSpend:m.adSpend,adSales:m.adSales,units:m.units||0}));
    return (D.dailyTraffic||[]).filter(r=>r.date>=from&&r.date<=to).map(r=>{const mm=(D.monthly||[]).find(m=>m.month===r.date.slice(0,7));const md=daysBetween(monthStart(r.date.slice(0,7)),monthEnd(r.date.slice(0,7)));return {label:r.date,sales:r.sales,units:r.units,sessions:r.sessions,adSpend:mm?(mm.adSpend/md):0,adSales:mm?(mm.adSales/md):0}});
  }
  async function getSummary(from,to){
    if(isDemo()) return demoSummary(from,to);
    try{ const r=await fetch(`/api/dashboard?store=yt-us&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); const j=await r.json(); return j.summary||{}; }catch{return null}
  }
  async function getSeries(from,to){
    const key=from+'|'+to; if(hoverSeriesKey===key&&hoverSeriesCache)return hoverSeriesCache;
    if(isDemo()){hoverSeriesCache=demoSeries(from,to);hoverSeriesKey=key;return hoverSeriesCache;}
    try{const r=await fetch(`/api/dashboard?store=yt-us&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);const j=await r.json();hoverSeriesCache=j.series||[];hoverSeriesKey=key;return hoverSeriesCache}catch{return []}
  }

  const metricDefs = [
    {test:/经营销售额|订单销售额|区间销售|业务报告销售/,key:'sales',type:'money',title:'经营销售额',route:'finance',def:'业务报告或所选期间聚合后的销售额，是经营层的顶层收入指标。',good:'up'},
    {test:/贡献利润/,key:'profit',type:'money',title:'贡献利润',route:'finance',def:'销售收入扣除退款、Amazon费用、广告、仓储与采购成本后的经营贡献。',good:'up'},
    {test:/利润率/,key:'profitMargin',type:'pct',title:'贡献利润率',route:'finance',def:'贡献利润 ÷ 经营销售额，用于判断规模增长是否真正创造利润。',good:'up'},
    {test:/广告 ACOS|^ACOS$/,key:'acos',type:'pct',title:'广告 ACOS',route:'ads',def:'广告花费 ÷ 广告归因销售额。数值越低通常代表广告效率越高。',good:'down'},
    {test:/TACOS/,key:'tacos',type:'pct',title:'TACOS',route:'ads',def:'广告花费 ÷ 全店销售额，用于判断整体业务对广告投入的依赖程度。',good:'down'},
    {test:/广告花费/,key:'adSpend',type:'money',title:'广告花费',route:'ads',def:'所选期间广告发生额。建议结合广告销售、ACOS、TACOS与自然销售一起判断。',good:'down'},
    {test:/广告销售/,key:'adSales',type:'money',title:'广告销售',route:'ads',def:'Amazon Ads 归因窗口内产生的广告销售额。',good:'up'},
    {test:/^销量$/,key:'units',type:'num',title:'销量',route:'products',def:'业务报告的商品销量，用于计算转化率、退货率和库存周转。',good:'up'},
    {test:/Sessions/,key:'sessions',type:'num',title:'Sessions',route:'products',def:'Amazon 业务报告中的访问会话。当前源数据为月粒度，不对自定义日期区间制造假精度。',good:'up'},
    {test:/^CVR$/,key:'cvr',type:'pct',title:'转化率 CVR',route:'products',def:'销量 ÷ Sessions，用于衡量流量进入详情页后的购买效率。',good:'up'},
    {test:/财务退款|^退款$/,key:'refundSales',type:'money',title:'财务退款',route:'returns',def:'联合报告中的退款金额，与 FBA 退货事件的发生时间可能不同。',good:'down'},
    {test:/退货件数/,key:'returns',type:'num',title:'退货件数',route:'returns',def:'FBA Returns 退货件数。应与退货原因、可售/客损状态及退款金额交叉分析。',good:'down'},
    {test:/退货率/,key:'returnRate',type:'pct',title:'退货率',route:'returns',def:'退货件数 ÷ 业务销量。用于识别产品质量、预期差和Listing表达问题。',good:'down'},
    {test:/库存资金/,key:'inventoryValue',type:'money',title:'库存资金',route:'inventory',def:'库存数量 × 采购成本形成的资金占用。库存采用快照事实，不按日期区间累加。',good:'down'},
    {test:/可售库存/,key:'fulfillableUnits',type:'num',title:'可售库存',route:'inventory',def:'最近库存快照中的 Fulfillable 数量。',good:'neutral'}
  ];
  function findMetricDef(label){return metricDefs.find(d=>d.test.test(label))}
  function rawMetric(label,summary){const d=findMetricDef(label);return d?summary?.[d.key]:null}
  function formatByType(v,type){return type==='money'?money(v,0):type==='pct'?pct(v,type==='pct'?1:0):num(v,0)}
  function deltaCopy(cur,prev,def){
    if(cur==null||prev==null||!Number.isFinite(Number(cur))||!Number.isFinite(Number(prev)))return '上期暂无可比数据';
    if(def?.type==='pct'){const pp=(cur-prev)*100;const sign=pp>0?'+':'';return `上期 ${pct(prev)} · ${sign}${pp.toFixed(1)}pp`;}
    if(!prev)return `上期 ${formatByType(prev,def?.type)} · 无法计算变化`;
    const r=(cur-prev)/Math.abs(prev);const sign=r>0?'+':'';return `上期 ${formatByType(prev,def?.type)} · ${sign}${(r*100).toFixed(1)}%`;
  }

  function buildContextRail(){
    const content=$('#content'); if(!content||content.querySelector(':scope > .context-rail'))return;
    const {from,to}=getRange(); if(!from||!to)return;
    const range=$('#periodLabel')?.textContent||`${from} – ${to}`;
    const mode=$('#dbStateText')?.textContent||'本地预览模式';
    const grain=$('#grainChip')?.textContent||'日级财务 + 月级流量';
    const days=daysBetween(from,to);
    const health=C.overview?.modelStatus||C.meta?.status||'PASS';
    const rail=document.createElement('div');rail.className='context-rail';
    rail.innerHTML=`
      <div class="context-cell primary-context"><span class="context-label">ACTIVE PERIOD</span><div class="context-main"><b>${esc(range)}</b><span>${days} 天</span></div><div class="context-sub">全站筛选已同步 · 点击顶部日期可切换</div></div>
      <div class="context-cell"><span class="context-label">DATA MODE</span><div class="context-main"><b>${esc(mode)}</b><span>${isDemo()?'Preview':'Live'}</span></div><div class="context-sub">${esc(grain)}</div></div>
      <div class="context-cell"><span class="context-label">COMPARE</span><div class="context-main"><b>${compareEnabled?'已开启':'未开启'}</b><span>${compareEnabled?'上一等长期间':'可选'}</span></div><div class="context-sub">打开后 KPI 同时展示上期基准与变化</div></div>
      <div class="context-cell"><span class="context-label">MODEL HEALTH</span><div class="context-main"><b>${esc(health)}</b><span>${health==='PASS'?'健康':'需关注'}</span></div><div class="context-sub">导入校验、主数据映射与口径一致性</div></div>`;
    content.prepend(rail);
  }

  function readMetric(label){
    const cards=$$('.metric-card,.executive-card');
    for(const card of cards){const l=(card.querySelector('.metric-label,.executive-label')?.textContent||'').trim();if(l===label||l.includes(label)){const v=card.querySelector('.metric-value,.executive-value')?.textContent;return v||'—'}}return '—';
  }
  function buildPageInsights(){
    const content=$('#content'); if(!content||content.querySelector('.page-insights'))return;
    const page=$('#pageTitle')?.textContent||''; const range=$('#periodLabel')?.textContent||'';
    let items=[];
    if(page.includes('经营驾驶舱')) items=[
      ['info','↗','规模','销售 '+readMetric('经营销售额'),'点击 KPI 可下钻口径和上期比较'],
      [parseNumeric(readMetric('广告 ACOS'))>0.45?'warn':'good','◎','广告效率','ACOS '+readMetric('广告 ACOS'),'45% 作为当前经营目标线'],
      [parseNumeric(readMetric('贡献利润'))>=0?'good':'warn','$','利润质量','利润 '+readMetric('贡献利润'),'同时观察利润率与广告依赖'],
      ['info','◷','期间',range,$('#grainChip')?.textContent||'全局日期联动']
    ];
    else if(page.includes('利润')) items=[['good','$','利润口径','经营利润与现金结算分开','Transfer 不作为经营费用'],['info','⇄','对账','发生制 vs 实际扣款','识别广告/仓储时间差'],['warn','↩','退款影响','退款 '+readMetric('退款'),'与退货事件分开建模'],['info','⌘','操作','点击指标或图表','打开右侧详情与聚焦视图']];
    else if(page.includes('广告')) items=[[parseNumeric(readMetric('ACOS'))>0.45?'warn':'good','◎','效率','ACOS '+readMetric('ACOS'),'目标线 45%'],['info','↗','产出','广告销售 '+readMetric('广告销售'),'结合 TACOS 判断自然增量'],['info','⌁','流量质量','CTR '+readMetric('CTR'),'展示 → 点击效率'],['good','✓','转化','CVR '+readMetric('CVR'),'点击 → 订单效率']];
    else if(page.includes('商品')) items=[['info','#','产品粒度','SKU / ASIN / 产品线','点击任意表格行打开详情'],['good','↗','收入贡献','产品线销售结构','识别核心规模产品'],['good','$','利润贡献','销售与成本交叉','避免只看销售额'],['warn','S','流量粒度','Sessions 保留月级','不对日区间做虚假拆分']];
    else if(page.includes('库存')) items=[['info','◫','快照事实','库存不按日期累计','使用不晚于期间的最近快照'],['warn','$','资金占用','库存资金 '+readMetric('库存资金'),'重点看高资金低周转 SKU'],['good','✓','可售','可售 '+readMetric('可售库存'),'Fulfillable 可直接支撑销售'],['warn','!','异常','不可售 '+readMetric('不可售'),'需配合退货和移除策略']];
    else if(page.includes('退货')) items=[['warn','↩','退货规模','退货 '+readMetric('退货件数'),'结合销量计算真实退货率'],['info','$','退款','财务退款 '+readMetric('财务退款'),'退款时间与退货事件可能错位'],['good','✓','可售退货','可售 '+readMetric('可售退货'),'可再次销售的退回库存'],['warn','!','客损','客损 '+readMetric('客损退货'),'需要拆原因与产品线']];
    else if(page.includes('历史')) items=[['info','◷','历史累计','月份长期累积','点击月份卡片直接切换'],['good','D1','结构化数据','D1 按日期/月/SKU保存','支持跨月聚合'],['good','R2','原始归档','每次上传均保留原文件','数字可追溯'],['warn','↻','版本','同月允许重传','新结果更新，旧文件保留']];
    else if(page.includes('数据')) items=[['good','✓','导入闭环','9 类核心数据源','先校验再写入历史库'],['info','D1','结构化','日期与维度事实表','用于筛选与聚合'],['info','R2','原文件','批次级永久归档','用于审计与回溯'],['warn','!','质量门禁','WARN / FAIL 显性提示','不让异常静默进入月报']];
    if(!items.length)return;
    const box=document.createElement('div');box.className='page-insights';box.innerHTML=items.map(x=>`<div class="page-insight ${x[0]}"><div class="page-insight-icon">${esc(x[1])}</div><div class="page-insight-copy"><b>${esc(x[2])} · ${esc(x[3])}</b><span>${esc(x[4])}</span></div></div>`).join('');
    const metrics=content.querySelector('.metric-grid');
    if(metrics)metrics.insertAdjacentElement('afterend',box); else content.querySelector('.context-rail')?.insertAdjacentElement('afterend',box);
  }

  function addSparklines(){
    const {from,to}=getRange(); const series=demoSeries(from,to); if(!series.length)return;
    const values=series.map(r=>Number(r.sales||0)); const max=Math.max(1,...values),min=Math.min(...values); const W=180,H=32;
    const path=values.map((v,i)=>`${i?'L':'M'}${(i/(Math.max(1,values.length-1))*W).toFixed(1)},${(H-4-(H-8)*(v-min)/(max-min||1)).toFixed(1)}`).join(' ');
    $$('.executive-card').forEach((card,i)=>{if(card.querySelector('.exec-spark'))return;const spark=document.createElement('div');spark.className='exec-spark';spark.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${path}"/></svg>`;const value=card.querySelector('.executive-value');if(value)value.insertAdjacentElement('afterend',spark);if(i===0){const orb=document.createElement('i');orb.className='exec-orb';card.appendChild(orb)}});
  }

  function enhanceCards(){
    $$('.metric-card,.executive-card').forEach(card=>{
      if(card.dataset.richEnhanced)return;card.dataset.richEnhanced='1';card.classList.add('rich-clickable');card.tabIndex=0;card.setAttribute('role','button');
      const hint=document.createElement('span');hint.className='card-click-hint';hint.textContent='›';card.appendChild(hint);
      const open=()=>openMetricDetail(card);card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    });
  }

  async function refreshComparison(){
    const rr=getRange(); lastCompareSignature=compareEnabled?`${$('#pageTitle')?.textContent||''}|${rr.from}|${rr.to}|${$$('.metric-card,.executive-card').length}`:'';
    document.body.classList.toggle('compare-on',compareEnabled); $('#compareToggle')?.setAttribute('aria-pressed',compareEnabled?'true':'false');
    const label=$('#compareToggle span:last-child');if(label)label.textContent=compareEnabled?'已对比':'对比上期';
    if(!compareEnabled){$$('.metric-compare').forEach(x=>x.remove());buildContextRailRefresh();return;}
    const {from,to}=getRange(),prev=previousRange();
    const [cur,ps]=await Promise.all([getSummary(from,to),getSummary(prev.from,prev.to)]);
    $$('.metric-card,.executive-card').forEach(card=>{
      card.querySelector('.metric-compare')?.remove(); const label=(card.querySelector('.metric-label,.executive-label')?.textContent||'').trim();const def=findMetricDef(label);if(!def)return;
      const cv=rawMetric(label,cur),pv=rawMetric(label,ps); if(cv==null||pv==null)return;
      const el=document.createElement('div');el.className='metric-compare';el.textContent=deltaCopy(cv,pv,def);card.appendChild(el);
    });
    buildContextRailRefresh();
  }
  function buildContextRailRefresh(){const r=$('#content > .context-rail');if(r)r.remove();buildContextRail()}

  function enhancePanels(){
    $$('.panel').forEach(panel=>{
      if(panel.dataset.richEnhanced)return;panel.dataset.richEnhanced='1';const head=panel.querySelector('.panel-head');if(!head)return;
      const actions=document.createElement('div');actions.className='panel-rich-actions';actions.innerHTML=`<button class="panel-rich-btn" data-act="focus" title="聚焦查看"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></button>`;
      const legacy=head.querySelector('.panel-action'); if(legacy)legacy.before(actions); else head.appendChild(actions);
      actions.querySelector('[data-act="focus"]').onclick=e=>{e.stopPropagation();openPanelFocus(panel)};
    });
  }

  function enhanceCharts(){
    $$('.chart-wrap').forEach(w=>{
      if(w.dataset.richEnhanced)return;w.dataset.richEnhanced='1';
      w.insertAdjacentHTML('beforeend','<i class="chart-hover-line"></i><i class="chart-hover-dot"></i><div class="chart-tooltip"><b>趋势</b><span>移动鼠标查看期间位置</span></div>');
      const line=w.querySelector('.chart-hover-line'),dot=w.querySelector('.chart-hover-dot'),tip=w.querySelector('.chart-tooltip');
      w.addEventListener('mousemove',async e=>{
        const r=w.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));line.style.left=(ratio*100)+'%';
        const salesPath=w.querySelector('.chart-line-sales'); if(salesPath){try{const len=salesPath.getTotalLength();let lo=0,hi=len,p=null;for(let i=0;i<14;i++){const mid=(lo+hi)/2,q=salesPath.getPointAtLength(mid);if(q.x/760<ratio)lo=mid;else hi=mid;p=q}if(p){dot.style.left=(p.x/760*100)+'%';dot.style.top=(p.y/240*100)+'%'}}catch{}}
        const {from,to}=getRange();const series=await getSeries(from,to);if(series.length){const idx=Math.min(series.length-1,Math.round(ratio*(series.length-1))),x=series[idx];tip.innerHTML=`<b>${esc(x.label||'趋势')}</b><span>销售 ${money(x.sales,0)} · 广告 ${money(x.adSpend,0)}</span>`;const tw=150;tip.style.left=Math.min(r.width-tw-8,Math.max(8,ratio*r.width+10))+'px'}
      });
    });
  }

  function sortTable(table,idx,th){
    const tbody=table.tBodies[0]; if(!tbody)return; const asc=th.dataset.sortDir!=='asc'; table.querySelectorAll('th').forEach(x=>{x.classList.remove('sort-asc','sort-desc');delete x.dataset.sortDir});th.dataset.sortDir=asc?'asc':'desc';th.classList.add(asc?'sort-asc':'sort-desc');
    const rows=[...tbody.rows];rows.sort((a,b)=>{const av=a.cells[idx]?.innerText.trim()||'',bv=b.cells[idx]?.innerText.trim()||'';const an=parseNumeric(av),bn=parseNumeric(bv);let cmp=(an!=null&&bn!=null)?an-bn:av.localeCompare(bv,'zh-CN',{numeric:true});return asc?cmp:-cmp});rows.forEach(r=>tbody.appendChild(r));
  }
  function exportTable(card){
    const table=card.querySelector('table');if(!table)return;const rows=[...table.querySelectorAll('tr')].filter(r=>r.style.display!=='none');const csv=rows.map(r=>[...r.cells].map(c=>'"'+c.innerText.replaceAll('"','""').trim()+'"').join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=($('#pageTitle')?.textContent||'report')+'_'+($('#periodLabel')?.textContent||'period').replaceAll(/[\\/:*?"<>|\s]/g,'_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function enhanceTables(){
    $$('.table-card').forEach(card=>{
      if(card.dataset.richEnhanced)return;card.dataset.richEnhanced='1';const table=card.querySelector('table'),tools=card.querySelector('.table-tools');if(!table||!tools)return;
      const extra=document.createElement('div');extra.className='table-extra-tools';extra.innerHTML=`<button class="table-tool-btn" data-act="density" title="切换密度"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg><span>密度</span></button><button class="table-tool-btn" data-act="export" title="导出当前结果"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4M5 21h14"/></svg><span>导出</span></button><button class="table-tool-btn" data-act="focus" title="全屏查看"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg><span>全屏</span></button>`;tools.appendChild(extra);
      extra.querySelector('[data-act="density"]').onclick=()=>{document.body.classList.toggle('compact-density');syncDensityPopover();};extra.querySelector('[data-act="export"]').onclick=()=>exportTable(card);extra.querySelector('[data-act="focus"]').onclick=()=>openPanelFocus(card,$('#pageTitle')?.textContent+' · 明细');
      [...table.tHead?.rows?.[0]?.cells||[]].forEach((th,i)=>th.addEventListener('click',()=>sortTable(table,i,th)));
      [...table.tBodies[0]?.rows||[]].forEach(row=>row.addEventListener('click',()=>openRowDetail(table,row)));
    });
  }

  function openDetail(title,kicker,subtitle,body){$('#detailTitle').textContent=title;$('#detailKicker').textContent=kicker||'DETAIL';$('#detailSubtitle').textContent=subtitle||'';$('#detailBody').innerHTML=body;$('#detailBackdrop').classList.add('show');$('#detailDrawer').classList.add('show');document.body.classList.add('drawer-lock')}
  function closeDetail(){$('#detailBackdrop')?.classList.remove('show');$('#detailDrawer')?.classList.remove('show');document.body.classList.remove('drawer-lock')}
  async function openMetricDetail(card){
    const label=(card.querySelector('.metric-label,.executive-label')?.textContent||'指标').trim(),value=(card.querySelector('.metric-value,.executive-value')?.textContent||'—').trim(),def=findMetricDef(label)||{title:label,def:'当前经营指标。',route:null,type:'num'};
    const {from,to}=getRange(),prev=previousRange();let compareText='未开启上期对比',prevValue='—';
    try{const ps=await getSummary(prev.from,prev.to),pv=rawMetric(label,ps);if(pv!=null){prevValue=formatByType(pv,def.type);const cv=parseNumeric(value),delta=cv!=null?deltaCopy(cv,pv,def):'';compareText=delta||`上期 ${prevValue}`}}catch{}
    const routeLabel={finance:'利润',ads:'广告',products:'商品',inventory:'库存',returns:'退货'}[def.route]||'相关分析';
    const body=`<div class="detail-hero"><span>${esc(label)} · ${esc($('#periodLabel')?.textContent||'')}</span><b>${esc(value)}</b><small>${esc(def.def)}</small></div><div class="detail-grid"><div class="detail-stat"><span>上一等长期间</span><b>${esc(prevValue)}</b></div><div class="detail-stat"><span>对比解释</span><b style="font-size:13px;line-height:1.3">${esc(compareText)}</b></div></div><div class="detail-section"><h3>指标口径</h3><div class="detail-list"><div class="detail-row"><span>当前期间</span><b>${esc($('#periodLabel')?.textContent||'')}</b></div><div class="detail-row"><span>数据粒度</span><b>${esc($('#grainChip')?.textContent||'')}</b></div><div class="detail-row"><span>数据模式</span><b>${esc($('#dbStateText')?.textContent||'')}</b></div></div></div><div class="detail-section"><h3>建议的联动分析</h3><div class="detail-list"><div class="detail-row"><span>不要单独看一个 KPI</span><b>结合趋势与相关指标</b></div><div class="detail-row"><span>异常判断</span><b>与上期 + 目标线交叉</b></div></div></div>${def.route?`<div class="detail-actions"><button class="detail-action" data-go-page="${def.route}">打开${routeLabel}模块</button><button class="detail-action secondary" data-copy-value="${esc(label)}: ${esc(value)}">复制指标</button></div>`:''}`;
    openDetail(def.title,'METRIC DETAIL','指标定义、上期基准与联动分析',body);$('#detailBody [data-go-page]')?.addEventListener('click',e=>{closeDetail();document.querySelector(`.nav-item[data-page="${e.currentTarget.dataset.goPage}"]`)?.click()});$('#detailBody [data-copy-value]')?.addEventListener('click',e=>copyText(e.currentTarget.dataset.copyValue));
  }
  function openRowDetail(table,row){
    [...table.tBodies[0].rows].forEach(r=>r.classList.toggle('selected',r===row));const heads=[...table.tHead.rows[0].cells].map(x=>x.innerText.trim());const cells=[...row.cells].map(x=>x.innerText.trim());const title=cells.find(Boolean)||'明细记录';const body=`<div class="detail-hero"><span>${esc($('#pageTitle')?.textContent||'明细')} · ${esc($('#periodLabel')?.textContent||'')}</span><b style="font-size:28px">${esc(title)}</b><small>当前表格行的完整字段明细。可用于快速核对，不需要横向滚动表格。</small></div><div class="detail-section"><h3>全部字段</h3><div class="detail-list">${heads.map((h,i)=>`<div class="detail-row"><span>${esc(h||'字段')}</span><b>${esc(cells[i]||'—')}</b></div>`).join('')}</div></div><div class="detail-actions"><button class="detail-action secondary" id="copyRowDetail">复制此行</button></div>`;openDetail(title,'ROW DETAIL','表格下钻详情',body);$('#copyRowDetail').onclick=()=>copyText(heads.map((h,i)=>`${h}: ${cells[i]}`).join('\n'));
  }
  function copyText(text){navigator.clipboard?.writeText(text).then(()=>showMiniToast('已复制')).catch(()=>{});}
  function showMiniToast(text){const stack=$('#toastStack');if(!stack)return;const el=document.createElement('div');el.className='toast';el.innerHTML=`<i></i><div><b>${esc(text)}</b></div>`;stack.appendChild(el);setTimeout(()=>el.remove(),1800)}

  function openPanelFocus(source,title){
    const clone=source.cloneNode(true);clone.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));clone.querySelectorAll('.panel-rich-actions,.table-extra-tools').forEach(x=>x.remove());$('#panelModalTitle').textContent=title||source.querySelector('.panel-title strong')?.textContent||'聚焦查看';$('#panelModalBody').innerHTML='';$('#panelModalBody').appendChild(clone);$('#panelModalBackdrop').classList.add('show');$('#panelModal').classList.add('show');document.body.classList.add('drawer-lock');
  }
  function closePanelFocus(){$('#panelModalBackdrop')?.classList.remove('show');$('#panelModal')?.classList.remove('show');document.body.classList.remove('drawer-lock')}

  const commands = [
    {group:'页面',icon:'⌂',title:'经营总览',desc:'核心 KPI、趋势与经营关注事项',keywords:'总览 驾驶舱 overview',run:()=>nav('overview')},
    {group:'页面',icon:'$',title:'利润与结算',desc:'贡献利润、利润桥、现金结算',keywords:'利润 财务 结算 profit finance',run:()=>nav('finance')},
    {group:'页面',icon:'−',title:'扣费中心',desc:'FBA配送费、广告费、佣金、仓储等独立扣费',keywords:'扣费 扣款 费用 fee charge fba commission',run:()=>nav('charges')},
    {group:'页面',icon:'◎',title:'广告效率',desc:'ACOS、TACOS、活动诊断',keywords:'广告 acos tacos ads',run:()=>nav('ads')},
    {group:'页面',icon:'#',title:'商品经营',desc:'产品线、SKU、ASIN、流量转化',keywords:'商品 sku asin 产品',run:()=>nav('products')},
    {group:'页面',icon:'▦',title:'库存资金',desc:'库存快照、资金占用、不可售',keywords:'库存 inventory stock',run:()=>nav('inventory')},
    {group:'页面',icon:'↩',title:'退货分析',desc:'退货率、退款与退货原因',keywords:'退货 退款 returns',run:()=>nav('returns')},
    {group:'页面',icon:'◷',title:'历史趋势',desc:'月度历史与跨月趋势',keywords:'历史 月份 history trend',run:()=>nav('history')},
    {group:'页面',icon:'D',title:'数据与导入',desc:'导入批次、质量校验与数据源',keywords:'数据 导入 database import',run:()=>nav('data')},
    {group:'期间',icon:'M',title:'查看本月',desc:'切换到最新完整月份',keywords:'本月 current month',run:()=>quick('current')},
    {group:'期间',icon:'30',title:'最近 30 天',desc:'全站切换为最近 30 天',keywords:'30天 日期 range',run:()=>quick('30')},
    {group:'期间',icon:'90',title:'最近 90 天',desc:'全站切换为最近 90 天',keywords:'90天 日期 range',run:()=>quick('90')},
    {group:'操作',icon:'⇄',title:'切换上期对比',desc:'KPI 增加上一等长期间基准',keywords:'对比 compare previous',run:()=>$('#compareToggle')?.click()},
    {group:'操作',icon:'＋',title:'导入月报',desc:'打开月度数据导入中心',keywords:'上传 import 月报',run:()=>$('#topImportBtn')?.click()},
    {group:'操作',icon:'↻',title:'刷新数据',desc:'重新读取数据库/预览数据',keywords:'刷新 refresh',run:()=>$('#refreshBtn')?.click()},
    {group:'视图',icon:'≡',title:'切换紧凑表格',desc:'提高明细表的信息密度',keywords:'紧凑 密度 compact',run:()=>{document.body.classList.toggle('compact-density');syncDensityPopover()}}
  ];
  function nav(page){closeCommand();document.querySelector(`.nav-item[data-page="${page}"]`)?.click()}
  function quick(q){closeCommand();document.querySelector(`#quickRangeBar [data-quick="${q}"]`)?.click()}
  function renderCommands(q=''){
    const text=q.trim().toLowerCase();let items=commands.filter(c=>!text||(`${c.title} ${c.desc} ${c.keywords}`).toLowerCase().includes(text));activeCommandIndex=Math.min(activeCommandIndex,Math.max(0,items.length-1));const groups=[...new Set(items.map(x=>x.group))];$('#commandResults').innerHTML=groups.map(g=>`<div class="command-group-label">${esc(g)}</div>${items.filter(x=>x.group===g).map(c=>{const idx=items.indexOf(c);return `<button class="command-item ${idx===activeCommandIndex?'active':''}" data-command-index="${commands.indexOf(c)}"><span class="command-item-icon">${esc(c.icon)}</span><span class="command-item-copy"><b>${esc(c.title)}</b><span>${esc(c.desc)}</span></span><kbd>↵</kbd></button>`}).join('')}`).join('')||'<div class="empty-state"><strong>没有匹配结果</strong><span>试试“广告”、“库存”或“30天”。</span></div>';$$('#commandResults .command-item').forEach(b=>b.onclick=()=>{commands[Number(b.dataset.commandIndex)]?.run();closeCommand()});
  }
  function openCommand(){activeCommandIndex=0;$('#commandBackdrop').classList.add('show');$('#commandPalette').classList.add('show');$('#commandInput').value='';renderCommands('');setTimeout(()=>$('#commandInput').focus(),40);document.body.classList.add('drawer-lock')}
  function closeCommand(){$('#commandBackdrop')?.classList.remove('show');$('#commandPalette')?.classList.remove('show');document.body.classList.remove('drawer-lock')}
  function commandKey(e){
    if(!$('#commandPalette')?.classList.contains('show'))return;const visible=$$('#commandResults .command-item');if(e.key==='ArrowDown'){e.preventDefault();activeCommandIndex=Math.min(visible.length-1,activeCommandIndex+1);renderCommands($('#commandInput').value)}else if(e.key==='ArrowUp'){e.preventDefault();activeCommandIndex=Math.max(0,activeCommandIndex-1);renderCommands($('#commandInput').value)}else if(e.key==='Enter'){e.preventDefault();visible[activeCommandIndex]?.click()}
  }

  function syncDensityPopover(){const compact=document.body.classList.contains('compact-density');$$('#viewPopover [data-density]').forEach(b=>b.classList.toggle('active',b.dataset.density===(compact?'compact':'comfortable')))}
  function setDensity(mode){document.body.classList.toggle('compact-density',mode==='compact');safeStorageSet('yt-density',mode);syncDensityPopover()}
  function setMotion(on){document.body.classList.toggle('motion-off',!on);safeStorageSet('yt-motion',on?'on':'off');const small=$('#toggleMotion small');if(small)small.textContent=on?'开启':'关闭'}

  function enhanceContent(){
    if(enhancing)return;enhancing=true;try{buildContextRail();buildPageInsights();addSparklines();enhanceCards();enhancePanels();enhanceCharts();enhanceTables();if(compareEnabled){const rr=getRange(),sig=`${$('#pageTitle')?.textContent||''}|${rr.from}|${rr.to}|${$$('.metric-card,.executive-card').length}`;if(sig!==lastCompareSignature)refreshComparison();}}finally{enhancing=false}
  }

  function bindShell(){
    $('#commandButton')?.addEventListener('click',openCommand);$('#commandBackdrop')?.addEventListener('click',closeCommand);$('#commandInput')?.addEventListener('input',e=>{activeCommandIndex=0;renderCommands(e.target.value)});$('#commandInput')?.addEventListener('keydown',commandKey);
    $('#detailBackdrop')?.addEventListener('click',closeDetail);$('#detailClose')?.addEventListener('click',closeDetail);$('#panelModalBackdrop')?.addEventListener('click',closePanelFocus);$('#panelModalClose')?.addEventListener('click',closePanelFocus);
    $('#compareToggle')?.addEventListener('click',()=>{compareEnabled=!compareEnabled;lastCompareSignature='';refreshComparison();showMiniToast(compareEnabled?'已开启上期对比':'已关闭上期对比')});
    $('#viewMenuBtn')?.addEventListener('click',e=>{e.stopPropagation();$('#viewPopover').classList.toggle('show')});$$('#viewPopover [data-density]').forEach(b=>b.onclick=()=>setDensity(b.dataset.density));$('#toggleMotion')?.addEventListener('click',()=>setMotion(document.body.classList.contains('motion-off')));
    document.addEventListener('click',e=>{if(!$('#viewPopover')?.contains(e.target)&&!$('#viewMenuBtn')?.contains(e.target))$('#viewPopover')?.classList.remove('show')});
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand()}else if(e.key==='Escape'){closeCommand();closeDetail();closePanelFocus();$('#viewPopover')?.classList.remove('show')}else if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();openCommand()}});
    const density=safeStorageGet('yt-density');if(density)setDensity(density);const motion=safeStorageGet('yt-motion');if(motion==='off')setMotion(false);else setMotion(true);
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(enhanceContent));
  const content=$('#content');if(content)observer.observe(content,{childList:true,subtree:true});
  bindShell();
  // app.js bootstrap is async; repeatedly enhance the first fully-rendered frame without blocking it.
  requestAnimationFrame(enhanceContent);setTimeout(enhanceContent,250);setTimeout(enhanceContent,900);
})();
