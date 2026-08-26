(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  document.body.classList.add('studio-v43');
  const page=()=>$('.nav-item.active')?.dataset.page||'overview';

  const TAB_CONFIG={
    overview:[['summary','经营概览','KPI'],['intelligence','经营智能','AI'],['trend','趋势结构','趋势'],['actions','风险行动','行动']],
    finance:[['summary','利润总览','KPI'],['intelligence','利润结构','结构'],['trend','结算对账','现金'],['detail','经营口径','口径']],
    charges:[['summary','扣费总览','总览'],['projects','扣费项目','项目'],['trend','费用结构','结构'],['detail','扣费明细','明细']],
    ads:[['summary','广告总览','KPI'],['intelligence','效率诊断','诊断'],['trend','趋势结构','趋势'],['detail','活动明细','活动']],
    products:[['summary','产品组合','组合'],['intelligence','经营质量','诊断'],['trend','产品线趋势','趋势'],['detail','SKU 明细','SKU']],
    inventory:[['summary','库存总览','KPI'],['intelligence','风险补货','风险'],['trend','资金结构','资金'],['detail','SKU 库存','SKU']],
    returns:[['summary','退货总览','KPI'],['intelligence','原因结构','原因'],['trend','产品风险','产品'],['detail','退货明细','明细']],
    history:[['summary','月份概览','月份'],['intelligence','季节节奏','12M'],['trend','历史趋势','趋势'],['detail','月度明细','明细']],
    data:[['summary','数据健康','健康'],['intelligence','治理管线','管线'],['trend','数据源','9类'],['detail','导入历史','批次']]
  };

  function candidateTargets(p){
    const content=$('#content'); if(!content)return {};
    const top=(sel)=>$(sel,content);
    const all=(sel)=>$$(sel,content);
    const grids=all(':scope > .grid-2');
    const sections=all(':scope > .section-head');
    const tables=all(':scope > .table-card');
    const map={};
    if(p==='overview'){
      map.summary=top(':scope > .executive-strip')||top(':scope > .metric-grid');
      map.intelligence=top(':scope > .studio-overview-board')||top('.intel-board');
      map.trend=grids[0]||top('.panel');
      map.actions=top('.signal-dock')||top('.studio-overview-board .intel-card.dark');
    }else if(p==='charges'){
      map.summary=top(':scope > .charge-page-intro')||top(':scope > .charge-project-panels');
      map.projects=top(':scope > .charge-project-tab-shell')||top('.charge-project-tabs');
      map.trend=top(':scope > .charge-overview-grid')||grids[0];
      map.detail=top(':scope > .charge-table-card')||tables[tables.length-1];
    }else{
      map.summary=top(':scope > .metric-grid')||top(':scope > .annotation')||top(':scope > .history-strip')||top(':scope > .grid-2');
      if(p==='finance')map.charges=top(':scope > .charge-name-section')||top('.charge-name-section');
      map.intelligence=top('.studio-prelude .intel-board')||top('.studio-prelude')||top('.intel-board');
      map.trend=grids[0]||sections[0]||top(':scope > .source-cards');
      map.detail=tables[tables.length-1]||sections[sections.length-1]||top(':scope > .source-cards');
    }
    return map;
  }

  function countFor(tab,p){
    const content=$('#content');
    if(tab==='detail')return $('.table-meta',content)?.textContent?.replace(/\s/g,'')||'明细';
    if(tab==='charges')return String($$('.charge-filter-tabs button',content).length-1||'费用');
    if(tab==='intelligence')return String($$('.intel-card',content).length||'深度');
    if(tab==='trend')return String($$('.panel',content).length||'趋势');
    if(tab==='actions')return $('#studioActionBtn .badge')?.textContent||'行动';
    return p==='history'?String($$('.month-tile',content).length||12):'总览';
  }

  function buildTabs(){
    const content=$('#content'); if(!content)return;
    const injected=$(':scope > .studio-injected',content); if(!injected)return;
    const p=page(), sig=`${p}|${$('#periodLabel')?.textContent||''}`;
    let shell=$(':scope > .v43-tabs-shell',content);
    if(shell?.dataset.sig===sig)return;
    shell?.remove();
    shell=document.createElement('div');shell.className='v43-tabs-shell';shell.dataset.sig=sig;
    const cfg=TAB_CONFIG[p]||TAB_CONFIG.overview;
    shell.innerHTML=`<nav class="v43-tabs" aria-label="${p} 页面标签">${cfg.map((x,i)=>`<button class="v43-tab ${i===0?'active':''}" data-v43-tab="${x[0]}"><span>${x[1]}</span><span class="v43-tab-count">${countFor(x[0],p)}</span></button>`).join('')}</nav>`;
    injected.insertAdjacentElement('afterend',shell);
    const targets=candidateTargets(p);
    Object.entries(targets).forEach(([k,el])=>{if(el){el.dataset.v43Anchor=k;el.classList.add('v43-anchor')}});
    $$('.v43-tab',shell).forEach(btn=>btn.onclick=()=>{
      $$('.v43-tab',shell).forEach(x=>x.classList.toggle('active',x===btn));
      const target=targets[btn.dataset.v43Tab];
      if(target){target.scrollIntoView({behavior:document.body.classList.contains('motion-off')?'auto':'smooth',block:'start'});target.classList.remove('v43-anchor-flash');requestAnimationFrame(()=>target.classList.add('v43-anchor-flash'));setTimeout(()=>target.classList.remove('v43-anchor-flash'),850)}
    });
    observeAnchors(shell,targets);
  }

  let io=null;
  function observeAnchors(shell,targets){
    io?.disconnect();
    const entries=Object.entries(targets).filter(x=>x[1]);
    io=new IntersectionObserver(items=>{
      const visible=items.filter(x=>x.isIntersecting).sort((a,b)=>Math.abs(a.boundingClientRect.top-190)-Math.abs(b.boundingClientRect.top-190))[0];
      if(!visible)return;const key=visible.target.dataset.v43Anchor;
      $$('.v43-tab',shell).forEach(x=>x.classList.toggle('active',x.dataset.v43Tab===key));
    },{rootMargin:'-185px 0px -58% 0px',threshold:[0,.1,.5]});
    entries.forEach(([,el])=>io.observe(el));
  }

  const WIDE=/活动名称|Campaign|退货原因|创建时间|文件|数据源|校验|产品线销售额/i;
  const IDS=/SKU|ASIN|FNSKU|父体|Parent/i;
  const SHORT=/月份|订单|销量|Sessions|可售|在途|总库存|不可售|件数|警告|源文件|CTR|CVR|ACOS|TACOS|Buy Box|状态/i;
  function enhanceTable(card){
    if(card.dataset.v43Enhanced)return;card.dataset.v43Enhanced='1';
    const table=$('table',card), tools=$('.table-tools',card);if(!table||!tools)return;
    const ths=$$('thead th',table);
    ths.forEach((th,i)=>{
      const label=th.textContent.trim();let cls='col-medium';
      if(WIDE.test(label))cls='col-wide';else if(IDS.test(label))cls='col-id';else if(SHORT.test(label))cls='col-short';
      th.classList.add(cls);$$(`tbody tr`,table).forEach(r=>r.cells[i]?.classList.add(cls));
    });
    if(!$('.v43-table-caption',tools)){
      const cap=document.createElement('div');cap.className='v43-table-caption';
      let prev=card.previousElementSibling;while(prev&&!prev.matches?.('.section-head'))prev=prev.previousElementSibling;const title=prev?.querySelector?.('h2')?.textContent||$('#pageTitle')?.textContent||'经营明细';
      cap.innerHTML=`<strong>${title}</strong><span>${ths.length} 个字段</span><i class="v43-table-divider"></i><div class="v43-table-legend"><span><i class="id-dot"></i>标识列</span><span><i class="num-dot"></i>数值右对齐</span></div>`;
      const search=$('.table-search',tools);search?.insertAdjacentElement('beforebegin',cap);
    }
  }
  function enhanceTables(){const root=$('#content');if(root)$$('.table-card',root).forEach(enhanceTable)}

  function refineSemanticColors(){
    // Make inline score-ring colors less noisy while preserving semantic meaning.
    const palette=['#6f8a77','#b08a5c','#5f8490','#b87876','#75878e'];
    const root=$('#content');if(root)$$('.score-ring',root).forEach((r,i)=>r.style.setProperty('--c',palette[i%palette.length]));
  }

  let busy=false;
  function run(){
    if(busy)return;busy=true;requestAnimationFrame(()=>{try{buildTabs();enhanceTables();refineSemanticColors();}finally{busy=false}})
  }
  const content=$('#content');if(content)new MutationObserver(run).observe(content,{childList:true,subtree:true});
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setTimeout(run,40)));
  run();setTimeout(run,300);setTimeout(run,1000);
})();
