(()=>{
  const body=document.body;
  body.classList.add('studio-v53');
  document.documentElement.dataset.uiVersion='4.13';

  // Consistent keyboard navigation for segmented controls/tabs without changing click logic.
  const selectors=['.v43-tabs','.quick-range','.studio-mode-switch','.period-tabs','.charge-project-tabs'];
  const syncGroup=(group)=>{
    const buttons=[...group.querySelectorAll(':scope > button')];
    if(!buttons.length)return;
    const isTabs=group.matches('.v43-tabs,.period-tabs,.charge-project-tabs');
    if(isTabs)group.setAttribute('role','tablist');
    buttons.forEach(btn=>{
      if(isTabs){
        btn.setAttribute('role','tab');
        btn.setAttribute('aria-selected',btn.classList.contains('active')?'true':'false');
      }
    });
  };
  selectors.forEach(sel=>document.querySelectorAll(sel).forEach(group=>{
    syncGroup(group);
    group.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const buttons=[...group.querySelectorAll(':scope > button:not(:disabled)')];
      if(!buttons.length)return;
      const current=Math.max(0,buttons.indexOf(document.activeElement));
      let next=current;
      if(e.key==='ArrowLeft')next=(current-1+buttons.length)%buttons.length;
      if(e.key==='ArrowRight')next=(current+1)%buttons.length;
      if(e.key==='Home')next=0;
      if(e.key==='End')next=buttons.length-1;
      e.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    });
    new MutationObserver(()=>syncGroup(group)).observe(group,{subtree:true,attributes:true,attributeFilter:['class']});
  }));
})();
