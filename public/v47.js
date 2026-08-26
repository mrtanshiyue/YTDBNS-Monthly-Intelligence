(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  document.body.classList.add('studio-v47');

  const ICONS={
    overview:'<path d="M4 13.5 12 6l8 7.5"/><path d="M6.5 12.5V20h11v-7.5"/><path d="M9.5 20v-5h5v5"/>',
    finance:'<circle cx="12" cy="12" r="8.25"/><path d="M15.1 8.7c-.7-.6-1.7-1-3-1-1.8 0-3 .8-3 2 0 1.4 1.3 1.8 3.1 2.2 1.8.4 3 .9 3 2.3 0 1.3-1.2 2.1-3.1 2.1-1.2 0-2.4-.4-3.3-1.1M12 6v12"/>',
    charges:'<path d="M7 3.8h10a1.5 1.5 0 0 1 1.5 1.5v15l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.1-1.5-2.2 1.5v-15A1.5 1.5 0 0 1 7 3.8Z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.3"/>',
    ads:'<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.1"/><path d="m16.8 7.2 3-3M17.8 4.2h2v2"/>',
    products:'<path d="m12 3.5 7 3.7v9.6l-7 3.7-7-3.7V7.2l7-3.7Z"/><path d="m5.4 7.4 6.6 3.5 6.6-3.5M12 10.9v9.3"/>',
    inventory:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5V3.8h8V5M4 10h16M9 14h6"/>',
    returns:'<path d="M8.2 7.3H4.5v-3.7"/><path d="M4.8 7.1A8 8 0 1 1 5 17.2"/><path d="m8 14-3 3 3 3"/>',
    history:'<circle cx="12" cy="12" r="8.3"/><path d="M12 7.3v5.1l3.3 2M3.7 8.3l1.9.4.5-1.9"/>',
    data:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    search:'<circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.1 4.1"/>',
    calendar:'<rect x="3.8" y="5.5" width="16.4" height="15" rx="2.2"/><path d="M7.5 3.5v4M16.5 3.5v4M4 9.5h16"/>',
    refresh:'<path d="M19.5 8.2V4.5h-3.7M4.5 15.8v3.7h3.7"/><path d="M18.2 6.2a8 8 0 0 0-13 2.3M5.8 17.8a8 8 0 0 0 13-2.3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    bolt:'<path d="m13.2 2.8-7 10h5l-.4 8.4 7-10h-5l.4-8.4Z"/>',
    pulse:'<path d="M3 12h4l2.1-5.2 4.1 10.4 2.2-5.2H21"/>',
    target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4V2M20 12h2"/>',
    arrowUp:'<path d="M5 16 12 9l7 7"/><path d="M12 9v11"/>',
    box:'<path d="m12 3.5 7 3.5-7 3.5L5 7l7-3.5Z"/><path d="M5 7v9.5l7 4 7-4V7M12 10.5v10"/>',
    check:'<path d="m5.2 12.4 4.1 4.1L19 6.8"/>',
    warning:'<path d="M12 3.8 21 20H3L12 3.8Z"/><path d="M12 9v5M12 17.3h.01"/>',
    info:'<circle cx="12" cy="12" r="8.3"/><path d="M12 10.8v5M12 7.5h.01"/>',
    download:'<path d="M12 3.5v11M8 11l4 4 4-4M5 20h14"/>',
    expand:'<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
    rows:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    chevron:'<path d="m9 7 5 5-5 5"/>',
    spark:'<path d="M12 3.5 13.7 9l5.8 1.7-5.8 1.7-1.7 5.8-1.7-5.8-5.8-1.7L10.3 9 12 3.5Z"/>',
    trend:'<path d="m4 16 5-5 3.2 3.2L20 6.5"/><path d="M15.5 6.5H20V11"/>',
    receipt:'<path d="M7 3.5h10a2 2 0 0 1 2 2v15l-3-2-2 2-2-2-2 2-2-2-3 2v-15a2 2 0 0 1 2-2Z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    layers:'<path d="m12 3.8 8 4.2-8 4.2L4 8l8-4.2Z"/><path d="m4 12 8 4.2 8-4.2M4 16l8 4.2 8-4.2"/>',
    eye:'<path d="M2.8 12s3.2-5.3 9.2-5.3 9.2 5.3 9.2 5.3-3.2 5.3-9.2 5.3S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.3"/>',
    shield:'<path d="M12 3.4 19 6v5.4c0 4.4-2.8 7.5-7 9.2-4.2-1.7-7-4.8-7-9.2V6l7-2.6Z"/><path d="m8.7 12 2.1 2.1 4.5-4.6"/>',
    file:'<path d="M7 3.5h7l4 4V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"/><path d="M14 3.5v4h4M8.5 12h7M8.5 15.5h5"/>',
    filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
    copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    close:'<path d="m7 7 10 10M17 7 7 17"/>'
  };
  const icon=(name,cls='')=>`<svg class="yt-symbol ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;

  const navIcon={overview:'overview',finance:'finance',charges:'charges',ads:'ads',products:'products',inventory:'inventory',returns:'returns',history:'history',data:'data'};
  const pageIcon=navIcon;
  const metricMap=[
    [/销售|收入/,'trend'],[/利润|毛利/,'finance'],[/ACOS|TACOS|ROAS|广告/,'target'],[/库存|可售/,'inventory'],[/退货|退款/,'returns'],[/Sessions|流量|曝光|点击/,'eye'],[/销量|订单/,'box'],[/CVR|转化/,'pulse'],[/仓储|费用|扣费|佣金/,'receipt']
  ];
  const panelMap=[
    [/广告|ACOS|TACOS|ROAS|漏斗/,'target'],[/利润|结算|财务|成本/,'finance'],[/库存|补货|周转/,'inventory'],[/退货|退款/,'returns'],[/历史|趋势|月度/,'history'],[/数据|校验|管线|映射|治理/,'data'],[/扣费|费用|佣金|仓储/,'receipt'],[/商品|产品|SKU|ASIN/,'products'],[/结构|组合|分布|占比/,'layers'],[/行动|异常|风险/,'warning']
  ];
  const chargeMap=[[/广告/,'ads'],[/FBA配送|配送费/,'box'],[/销售佣金|佣金/,'finance'],[/仓储/,'inventory'],[/促销|折扣/,'spark'],[/退货处理/,'returns'],[/移除|弃置/,'box'],[/订阅/,'calendar'],[/清算/,'receipt']];
  const pick=(text,map,fallback='info')=>{for(const [re,n] of map)if(re.test(text||''))return n;return fallback};

  function decorateNav(){
    $$('.nav-item').forEach(btn=>{
      if(btn.dataset.v47Icon)return;btn.dataset.v47Icon='1';
      const p=btn.dataset.page;const label=btn.textContent.trim();
      btn.innerHTML=`<span class="nav-symbol">${icon(navIcon[p]||'info')}</span><span class="nav-label">${label}</span>`;
    });
    const wm=$('.wordmark');if(wm&&!wm.querySelector('.wordmark-symbol'))wm.insertAdjacentHTML('afterbegin',`<span class="wordmark-symbol">${icon('pulse')}</span>`);
  }
  function decorateGlobalControls(){
    const search=$('#commandButton');if(search){const svg=search.querySelector('svg');if(svg)svg.outerHTML=icon('search')}
    const period=$('#periodButton');if(period){const svgs=period.querySelectorAll('svg');if(svgs[0])svgs[0].outerHTML=icon('calendar');if(svgs[1])svgs[1].outerHTML=icon('chevron','chevron')}
    const refresh=$('#refreshBtn');if(refresh){const svg=refresh.querySelector('svg');if(svg)svg.outerHTML=icon('refresh')}
    const imp=$('#topImportBtn');if(imp&&!imp.querySelector('.yt-symbol'))imp.innerHTML=`${icon('plus')}<span>导入</span>`;
    const action=$('#studioActionBtn');if(action&&!action.querySelector('.yt-symbol')){const badge=action.querySelector('.badge')?.outerHTML||'';action.innerHTML=`${icon('bolt')}<span>行动中心</span>${badge}`}
  }
  function decorateSectionHeader(){
    const title=$('#pageTitle');if(!title)return;const p=$('.nav-item.active')?.dataset.page||'overview';
    const parent=title.parentElement;
    let wrap=parent?.classList.contains('page-title-row')?parent:parent?.querySelector(':scope > .page-title-row');
    if(!wrap){wrap=document.createElement('div');wrap.className='page-title-row';parent.insertBefore(wrap,title);wrap.appendChild(title)}
    let sym=wrap.querySelector(':scope > .page-title-symbol');
    if(!sym){wrap.insertAdjacentHTML('afterbegin',`<span class="page-title-symbol">${icon(pageIcon[p]||'overview')}</span>`);sym=wrap.querySelector(':scope > .page-title-symbol')}
    if(sym)sym.innerHTML=icon(pageIcon[p]||'overview');
  }
  function decorateSignals(){
    const names=['pulse','finance','trend','target','inventory'];
    $$('.signal-card .signal-icon').forEach((el,i)=>{if(el.dataset.v47)return;el.dataset.v47='1';el.innerHTML=icon(names[i%names.length])});
    $$('.studio-live').forEach(el=>{if(el.querySelector('.live-symbol'))return;el.insertAdjacentHTML('afterbegin',`<span class="live-symbol">${icon('check')}</span>`)});
  }
  function decorateMetrics(){
    $$('.metric-card,.executive-card').forEach(card=>{
      if(card.dataset.v47Metric)return;card.dataset.v47Metric='1';
      const label=(card.querySelector('.metric-label,.executive-label')?.textContent||'').trim();
      const name=pick(label,metricMap,'spark');
      let ico=card.querySelector('.metric-icon');
      if(ico)ico.innerHTML=icon(name);
      else {
        const head=card.querySelector('.metric-head');
        if(head)head.insertAdjacentHTML('beforeend',`<span class="metric-icon">${icon(name)}</span>`);
        else card.insertAdjacentHTML('afterbegin',`<span class="executive-symbol">${icon(name)}</span>`);
      }
      card.setAttribute('title',`${label||'指标'} · 点击查看详情`);
    });
  }
  function decoratePanels(){
    $$('.panel-head').forEach(head=>{
      if(head.dataset.v47)return;head.dataset.v47='1';
      const title=head.querySelector('.panel-title strong')?.textContent||'';const n=pick(title,panelMap,'spark');
      const pt=head.querySelector('.panel-title');if(pt)pt.insertAdjacentHTML('afterbegin',`<span class="panel-title-symbol">${icon(n)}</span>`);
      const action=head.querySelector('.panel-action');if(action&&!action.querySelector('.yt-symbol'))action.insertAdjacentHTML('beforeend',icon('chevron'));
    });
    $$('.intel-head').forEach(head=>{
      if(head.dataset.v47)return;head.dataset.v47='1';
      const title=head.querySelector('.intel-title b')?.textContent||'';head.insertAdjacentHTML('afterbegin',`<span class="intel-head-symbol">${icon(pick(title,panelMap,'spark'))}</span>`);
    });
  }
  function decorateTabs(){
    $$('.v43-tab').forEach(btn=>{
      if(btn.dataset.v47)return;btn.dataset.v47='1';const text=btn.querySelector('span')?.textContent||btn.textContent;const n=pick(text,panelMap,'layers');btn.insertAdjacentHTML('afterbegin',`<span class="tab-symbol">${icon(n)}</span>`);
    });
    $$('[data-charge-project]').forEach(btn=>{
      if(btn.dataset.v47)return;btn.dataset.v47='1';const text=btn.dataset.chargeProject||btn.textContent;btn.insertAdjacentHTML('afterbegin',`<span class="charge-tab-symbol">${icon(text==='全部扣费'?'charges':pick(text,chargeMap,'receipt'))}</span>`);
    });
  }
  function decorateTables(){
    $$('.table-card').forEach(card=>{
      if(card.dataset.v47)return;card.dataset.v47='1';
      const search=card.querySelector('.table-search');if(search&&!search.parentElement.querySelector('.table-search-shell')){
        const shell=document.createElement('div');shell.className='table-search-shell';search.parentElement.insertBefore(shell,search);shell.append(iconNode('search'));shell.append(search);
      }
      card.querySelectorAll('.table-tool-btn').forEach(btn=>{
        const act=btn.dataset.act;if(btn.dataset.v47)return;btn.dataset.v47='1';
        const names={density:'rows',export:'download',focus:'expand'};const old=btn.querySelector('svg');if(old)old.outerHTML=icon(names[act]||'info');
      });
      card.querySelectorAll('thead th').forEach(th=>{if(th.dataset.v47)return;th.dataset.v47='1';th.insertAdjacentHTML('beforeend',`<span class="sort-glyph">${icon('chevron')}</span>`)});
    });
  }
  function iconNode(name){const t=document.createElement('template');t.innerHTML=icon(name);return t.content.firstElementChild}
  function decorateStates(){
    $$('.quality-item').forEach(x=>{if(x.dataset.v47)return;x.dataset.v47='1';const dot=x.querySelector('.quality-dot');if(dot)dot.outerHTML=`<span class="quality-symbol">${icon(x.classList.contains('warn')?'warning':x.classList.contains('bad')?'warning':'check')}</span>`});
    $$('.insight-ico').forEach(x=>{if(x.dataset.v47)return;x.dataset.v47='1';const txt=x.textContent.trim();x.innerHTML=icon(txt==='D1'?'data':txt==='R2'?'file':txt==='↻'?'refresh':'spark')});
    $$('.empty-state,.apple-empty').forEach(x=>{if(x.dataset.v47)return;x.dataset.v47='1';x.insertAdjacentHTML('afterbegin',`<span class="empty-symbol">${icon('layers')}</span>`)});
    const loader=$('.loading-card');if(loader&&!loader.querySelector('.loading-symbol'))loader.insertAdjacentHTML('afterbegin',`<span class="loading-symbol">${icon('pulse')}</span>`);
  }
  function decorateChargeRows(){
    $$('[data-charge-jump]').forEach(btn=>{if(btn.dataset.v47Row)return;btn.dataset.v47Row='1';const label=btn.dataset.chargeJump||'';const target=btn.querySelector('.charge-bar-label');if(target)target.insertAdjacentHTML('afterbegin',`<span class="charge-row-symbol">${icon(pick(label,chargeMap,'receipt'))}</span>`)});
    const intro=$('.charge-page-intro');if(intro&&!intro.querySelector('.charge-intro-symbol'))intro.querySelector('div')?.insertAdjacentHTML('afterbegin',`<span class="charge-intro-symbol">${icon('charges')}</span>`);
  }
  function decorateDrawer(){
    $$('.drawer-close,.studio-close').forEach(b=>{if(b.dataset.v47)return;b.dataset.v47='1';b.innerHTML=icon('close')});
    $$('.drawer-action').forEach(a=>{if(a.dataset.v47)return;a.dataset.v47='1';const sev=a.querySelector('.severity')?.className||'';a.insertAdjacentHTML('afterbegin',`<span class="drawer-action-symbol">${icon(sev.includes('high')?'warning':sev.includes('medium')?'info':'spark')}</span>`)});
    $$('.file-row .file-ico').forEach(x=>{if(x.dataset.v47)return;x.dataset.v47='1';x.innerHTML=icon('file')});
  }
  function decorateCommands(){
    const palette=$('#commandPalette');if(!palette)return;
    const searchIcon=palette.querySelector('.command-search-row>svg');if(searchIcon)searchIcon.outerHTML=icon('search');
    $$('.command-results .command-icon',palette).forEach(x=>{if(x.dataset.v47)return;x.dataset.v47='1';const t=x.textContent.trim();let n='spark';if(t==='⌂')n='overview';else if(t==='$')n='finance';else if(t==='−')n='charges';else if(t==='◎')n='ads';else if(t==='#')n='products';else if(t==='▦')n='inventory';else if(t==='↩')n='returns';else if(t==='◷')n='history';else if(t==='D')n='data';else if(t==='＋')n='plus';else if(t==='⇄')n='refresh';else if(t==='30'||t==='90'||t==='M')n='calendar';x.innerHTML=icon(n)});
  }
  function addPageUtilityBar(){
    const content=$('#content');if(!content||content.querySelector(':scope > .v47-utility'))return;
    const p=$('.nav-item.active')?.dataset.page||'overview';
    const labels={overview:['经营脉搏','实时查看关键变化'],finance:['利润视角','收入、成本与贡献利润'],charges:['费用地图','每一项扣费独立追踪'],ads:['投放效率','从曝光到利润的广告链路'],products:['商品视角','产品线、父体与 SKU'],inventory:['库存视角','周转、资金与补货'],returns:['退货视角','原因、金额与商品质量'],history:['历史视角','跨月趋势与季节性'],data:['数据治理','导入、校验与可追溯']};
    const [a,b]=labels[p]||labels.overview;
    const bar=document.createElement('div');bar.className='v47-utility';bar.innerHTML=`<div class="v47-utility-main"><span>${icon(pageIcon[p]||'overview')}</span><div><b>${a}</b><small>${b}</small></div></div><div class="v47-utility-actions"><button data-v47-action="search">${icon('search')}<span>搜索</span><kbd>⌘K</kbd></button><button data-v47-action="compare">${icon('layers')}<span>对比</span></button><button data-v47-action="refresh">${icon('refresh')}<span>刷新</span></button></div>`;
    content.prepend(bar);
    bar.querySelector('[data-v47-action="search"]')?.addEventListener('click',()=>$('#commandButton')?.click());
    bar.querySelector('[data-v47-action="compare"]')?.addEventListener('click',()=>$('#compareToggle')?.click());
    bar.querySelector('[data-v47-action="refresh"]')?.addEventListener('click',()=>$('#refreshBtn')?.click());
  }

  function decorate(){
    decorateNav();decorateGlobalControls();decorateSectionHeader();decorateSignals();decorateMetrics();decoratePanels();decorateTabs();decorateTables();decorateStates();decorateChargeRows();decorateDrawer();decorateCommands();addPageUtilityBar();
  }
  const content=$('#content');if(content)new MutationObserver(()=>requestAnimationFrame(decorate)).observe(content,{childList:true,subtree:true});
  const bodyObs=new MutationObserver(()=>requestAnimationFrame(decorate));bodyObs.observe(document.body,{childList:true,subtree:true});
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setTimeout(decorate,20)));
  requestAnimationFrame(decorate);setTimeout(decorate,300);setTimeout(decorate,900);
})();
