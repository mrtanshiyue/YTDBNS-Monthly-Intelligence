(() => {
  'use strict';

  const body=document.body;
  body.classList.add('studio-v54');
  document.documentElement.dataset.responsiveLayer='v54';

  const mobile=window.matchMedia('(max-width: 860px)');
  const nav=document.getElementById('mainNav');
  const importBtn=document.getElementById('topImportBtn');

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

  const overlaySelectors=['#importDrawer','#detailDrawer','#studioDrawer','#panelModal','#commandPalette'];
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

  function syncViewport(){
    body.classList.toggle('v54-mobile-ui',mobile.matches);
    if(mobile.matches) centerActiveNav(false);
    syncOverlayLock();
  }

  mobile.addEventListener?.('change',syncViewport);
  window.addEventListener('orientationchange',()=>setTimeout(syncViewport,60),{passive:true});
  window.addEventListener('resize',()=>{
    if(mobile.matches) centerActiveNav(false);
  },{passive:true});

  syncViewport();
  requestAnimationFrame(()=>centerActiveNav(false));
})();
