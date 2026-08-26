(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  document.body.classList.add('studio-v46');

  function nav(page){document.querySelector(`.nav-item[data-page="${page}"]`)?.click()}

  function activateChargeProject(name,scroll=false){
    const content=$('#content'); if(!content)return;
    const tabs=$$('[data-charge-project]',content), panels=$$('[data-charge-panel]',content), rows=$$('[data-charge-row]',content);
    if(!tabs.length)return;
    tabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.chargeProject===name));
    panels.forEach(p=>p.classList.toggle('active',p.dataset.chargePanel===name));
    rows.forEach(r=>{r.style.display=(name==='全部扣费'||r.dataset.chargeRow===name)?'':'none'});
    const meta=$('.charge-table-card .table-meta',content); if(meta)meta.textContent=`${name==='全部扣费'?rows.length:rows.filter(r=>r.dataset.chargeRow===name).length} 条`;
    const scope=$('#chargeTableScope',content); if(scope)scope.textContent=name;
    const active=tabs.find(x=>x.dataset.chargeProject===name); active?.scrollIntoView({behavior:document.body.classList.contains('motion-off')?'auto':'smooth',block:'nearest',inline:'center'});
    if(scroll){const stage=$('.charge-project-panels',content);stage?.scrollIntoView({behavior:document.body.classList.contains('motion-off')?'auto':'smooth',block:'start'})}
  }

  function bindChargePage(){
    const content=$('#content'); if(!content||content.dataset.v46ChargeBound)return;
    const tabs=$$('[data-charge-project]',content); if(!tabs.length)return;
    content.dataset.v46ChargeBound='1';
    tabs.forEach(btn=>btn.addEventListener('click',()=>activateChargeProject(btn.dataset.chargeProject)));
    $$('[data-charge-jump]',content).forEach(btn=>btn.addEventListener('click',()=>activateChargeProject(btn.dataset.chargeJump,true)));
    $('.apple-link-card[data-nav-target="charges"]',content)?.addEventListener('click',()=>nav('charges'));
    // Keep keyboard navigation useful for a long fee-tab list.
    $('.charge-project-tabs',content)?.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
      const current=tabs.findIndex(x=>x.classList.contains('active'));
      const next=e.key==='ArrowRight'?Math.min(tabs.length-1,current+1):Math.max(0,current-1);
      tabs[next]?.focus();tabs[next]?.click();e.preventDefault();
    });
  }

  function bindLinkCards(){
    $$('[data-nav-target]').forEach(el=>{if(el.dataset.v46LinkBound)return;el.dataset.v46LinkBound='1';el.addEventListener('click',()=>nav(el.dataset.navTarget))});
  }

  function refinePage(){bindChargePage();bindLinkCards()}
  const content=$('#content');
  if(content)new MutationObserver(()=>requestAnimationFrame(refinePage)).observe(content,{childList:true,subtree:true});
  requestAnimationFrame(refinePage);setTimeout(refinePage,350);setTimeout(refinePage,1100);
})();
