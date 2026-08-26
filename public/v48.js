(() => {
  'use strict';
  document.body.classList.add('studio-v48');

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  // Keep large KPI typography elegant without ever allowing it to cross card boundaries.
  const FIT_RULES=[
    ['.executive-card.primary .executive-value',34],
    ['.executive-value',31],
    ['.metric-value',26],
    ['.charge-hero-main>strong',36],
    ['.charge-detail-number strong',32],
    ['.charge-total-pill b',24]
  ];

  function fitText(el,minPx){
    if(!el || !el.isConnected) return;
    el.style.removeProperty('font-size');
    const cs=getComputedStyle(el);
    const base=parseFloat(cs.fontSize)||40;
    const available=el.clientWidth;
    if(!available) return;
    const needed=el.scrollWidth;
    if(needed<=available+1) return;
    const ratio=Math.max(.55,(available/needed)*.965);
    const next=Math.max(minPx,Math.floor(base*ratio*10)/10);
    el.style.setProperty('font-size',`${next}px`,'important');
  }

  function fitAll(){
    FIT_RULES.forEach(([sel,min])=> $$(sel).forEach(el=>fitText(el,min)));
  }

  let frame=0;
  function scheduleFit(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>requestAnimationFrame(fitAll));
  }

  const content=$('#content');
  if(content){
    new MutationObserver(scheduleFit).observe(content,{childList:true,subtree:true,characterData:true});
    if('ResizeObserver' in window){
      const ro=new ResizeObserver(scheduleFit);
      ro.observe(content);
      ro.observe(document.documentElement);
    }
  }
  window.addEventListener('resize',scheduleFit,{passive:true});
  document.fonts?.ready?.then(scheduleFit).catch(()=>{});
  scheduleFit();
  setTimeout(scheduleFit,180);
  setTimeout(scheduleFit,700);

  // Make the current visual mode explicit in the view settings without adding clutter.
  const pop=$('#viewPopover');
  if(pop && !pop.querySelector('.v48-visual-note')){
    const note=document.createElement('div');
    note.className='v48-visual-note';
    note.innerHTML='<span>显示优化</span><small>自动适配大数字 · 高可读表格</small>';
    pop.appendChild(note);
  }
})();
