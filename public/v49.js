(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  document.body.classList.add('studio-v49');
  document.documentElement.dataset.uiVersion='4.9';

  function syncTopNav(){
    const items=$$('.nav-item');
    items.forEach(btn=>{
      const active=btn.classList.contains('active');
      btn.setAttribute('aria-current',active?'page':'false');
      btn.tabIndex=active?0:-1;
    });
    const active=items.find(x=>x.classList.contains('active'));
    active?.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  function bindTopNavKeyboard(){
    const nav=$('#mainNav');
    if(!nav || nav.dataset.v49Keys)return;
    nav.dataset.v49Keys='1';
    nav.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const items=$$('.nav-item',nav);
      if(!items.length)return;
      let i=Math.max(0,items.indexOf(document.activeElement));
      if(e.key==='ArrowRight')i=(i+1)%items.length;
      if(e.key==='ArrowLeft')i=(i-1+items.length)%items.length;
      if(e.key==='Home')i=0;
      if(e.key==='End')i=items.length-1;
      items[i].tabIndex=0;
      items[i].focus({preventScroll:true});
      items[i].scrollIntoView({behavior:document.body.classList.contains('motion-off')?'auto':'smooth',block:'nearest',inline:'center'});
      e.preventDefault();
    });
  }

  function enhancePageTabs(){
    $$('.v43-tabs').forEach(nav=>{
      nav.setAttribute('role','tablist');
      if(!nav.dataset.v49Keys){
        nav.dataset.v49Keys='1';
        nav.addEventListener('keydown',e=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
          const tabs=$$('.v43-tab',nav);
          if(!tabs.length)return;
          let i=Math.max(0,tabs.indexOf(document.activeElement));
          if(e.key==='ArrowRight')i=(i+1)%tabs.length;
          if(e.key==='ArrowLeft')i=(i-1+tabs.length)%tabs.length;
          if(e.key==='Home')i=0;
          if(e.key==='End')i=tabs.length-1;
          tabs[i].focus();
          tabs[i].click();
          e.preventDefault();
        });
      }
      $$('.v43-tab',nav).forEach(btn=>{
        const active=btn.classList.contains('active');
        btn.setAttribute('role','tab');
        btn.setAttribute('aria-selected',active?'true':'false');
        btn.tabIndex=active?0:-1;
      });
    });
  }

  function enhanceChargeTabs(){
    $$('.charge-project-tabs').forEach(nav=>{
      nav.setAttribute('role','tablist');
      $$('[data-charge-project]',nav).forEach(btn=>{
        const active=btn.classList.contains('active');
        btn.setAttribute('role','tab');
        btn.setAttribute('aria-selected',active?'true':'false');
        btn.tabIndex=active?0:-1;
      });
    });
  }

  function refineViewNote(){
    const note=$('.v48-visual-note');
    if(!note)return;
    const title=note.querySelector('span');
    const small=note.querySelector('small');
    if(title)title.textContent='阅读优化';
    if(small)small.textContent='数字自适应 · 高可读表格 · 温和语义色';
  }

  const FIT_RULES=[
    ['.executive-card.primary .executive-value',32],
    ['.executive-value',30],
    ['.metric-value',25],
    ['.charge-hero-main>strong',34],
    ['.charge-detail-number strong',30],
    ['.charge-total-pill b',23]
  ];
  function fitText(el,minPx){
    if(!el?.isConnected)return;
    el.style.removeProperty('font-size');
    const base=parseFloat(getComputedStyle(el).fontSize)||36;
    const width=el.clientWidth;
    if(!width || el.scrollWidth<=width+1)return;
    const ratio=Math.max(.56,(width/el.scrollWidth)*.96);
    el.style.setProperty('font-size',`${Math.max(minPx,Math.floor(base*ratio*10)/10)}px`,'important');
  }
  function fitAll(){FIT_RULES.forEach(([sel,min])=>$$(sel).forEach(el=>fitText(el,min)))}

  let raf=0;
  function refine(){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      syncTopNav();
      bindTopNavKeyboard();
      enhancePageTabs();
      enhanceChargeTabs();
      refineViewNote();
      requestAnimationFrame(fitAll);
    });
  }

  const content=$('#content');
  if(content){
    new MutationObserver(refine).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    if('ResizeObserver' in window)new ResizeObserver(refine).observe(content);
  }
  new MutationObserver(refine).observe($('#mainNav')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',refine,{passive:true});
  document.fonts?.ready?.then(refine).catch(()=>{});
  refine();
  setTimeout(refine,250);
  setTimeout(refine,900);
})();
