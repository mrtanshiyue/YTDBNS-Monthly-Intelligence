(() => {
  'use strict';

  const body=document.body;
  body.classList.add('studio-v54');
  document.documentElement.dataset.responsiveLayer='v54';

  const mobile=window.matchMedia('(max-width: 860px)');
  const nav=document.getElementById('mainNav');
  const importBtn=document.getElementById('topImportBtn');
  const content=document.getElementById('content');

  if(importBtn && !importBtn.getAttribute('aria-label')) importBtn.setAttribute('aria-label','导入月度报表');

  function centerActiveNav(smooth=false){
    if(!mobile.matches || !nav) return;
    const active=nav.querySelector('.nav-item.active');
    if(!active) return;
    const target=Math.max(0,active.offsetLeft-(nav.clientWidth-active.offsetWidth)/2);
    nav.scrollTo({left:target,behavior:smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto'});
  }

  if(nav){
    new MutationObserver(records=>{
      if(records.some(r=>r.type==='attributes' && r.attributeName==='class')) centerActiveNav(true);
    }).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  }

  const overlaySelectors=['#importDrawer','#detailDrawer','#studioDrawer','#panelModal','#commandPalette','#periodPopover','#viewPopover'];
  const overlays=overlaySelectors.map(s=>document.querySelector(s)).filter(Boolean);
  function overlayIsOpen(el){
    const cs=getComputedStyle(el);
    if(cs.display==='none' || cs.visibility==='hidden') return false;
    return el.classList.contains('show') || el.classList.contains('open') || el.classList.contains('active');
  }
  function syncOverlayLock(){
    if(!mobile.matches){
      body.classList.remove('v54-overlay-open');
      return;
    }
    body.classList.toggle('v54-overlay-open',overlays.some(overlayIsOpen));
  }
  overlays.forEach(el=>new MutationObserver(syncOverlayLock).observe(el,{attributes:true,attributeFilter:['class','style','aria-hidden']}));

  function maxChartLabels(width){
    if(width<=340) return 4;
    if(width<=430) return 5;
    if(width<=620) return 6;
    return Infinity;
  }

  function adaptChartLabels(){
    document.querySelectorAll('.chart-xlabels').forEach(layer=>{
      const labels=[...layer.querySelectorAll('.chart-xlabel')];
      labels.forEach(label=>label.style.removeProperty('display'));
      if(!mobile.matches || labels.length<2) return;
      const limit=maxChartLabels(layer.getBoundingClientRect().width || window.innerWidth);
      if(!Number.isFinite(limit) || labels.length<=limit) return;
      const keep=new Set();
      for(let i=0;i<limit;i++) keep.add(Math.round(i*(labels.length-1)/(limit-1)));
      labels.forEach((label,index)=>{
        if(!keep.has(index)) label.style.display='none';
      });
    });
  }

  let chartFrame=0;
  function scheduleChartAdapt(){
    cancelAnimationFrame(chartFrame);
    chartFrame=requestAnimationFrame(adaptChartLabels);
  }

  if(content){
    new MutationObserver(scheduleChartAdapt).observe(content,{subtree:true,childList:true});
  }
  if('ResizeObserver' in window){
    const chartResize=new ResizeObserver(scheduleChartAdapt);
    document.querySelectorAll('.chart-wrap').forEach(el=>chartResize.observe(el));
    if(content) new MutationObserver(()=>document.querySelectorAll('.chart-wrap').forEach(el=>chartResize.observe(el))).observe(content,{subtree:true,childList:true});
  }

  function syncViewport(){
    body.classList.toggle('v54-mobile-ui',mobile.matches);
    if(mobile.matches) centerActiveNav(false);
    syncOverlayLock();
    scheduleChartAdapt();
  }

  mobile.addEventListener?.('change',syncViewport);
  window.addEventListener('orientationchange',()=>setTimeout(syncViewport,60),{passive:true});
  window.addEventListener('resize',()=>{
    if(mobile.matches) centerActiveNav(false);
    scheduleChartAdapt();
  },{passive:true});

  syncViewport();
  requestAnimationFrame(()=>{
    centerActiveNav(false);
    adaptChartLabels();
  });
})();
