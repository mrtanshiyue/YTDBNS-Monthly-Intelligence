(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  document.body.classList.add('studio-v45');

  function bindChargeFilters(){
    const section=$('.charge-name-section');if(!section||section.dataset.v45Bound)return;section.dataset.v45Bound='1';
    const buttons=$$('[data-charge-filter]',section),rows=$$('[data-charge-row]',section),bars=$$('[data-charge-name]',section);
    buttons.forEach(btn=>btn.addEventListener('click',()=>{
      const name=btn.dataset.chargeFilter;
      buttons.forEach(x=>x.classList.toggle('active',x===btn));
      rows.forEach(r=>r.classList.toggle('charge-hidden',name!=='全部'&&r.dataset.chargeRow!==name));
      bars.forEach(r=>r.classList.toggle('charge-hidden',name!=='全部'&&r.dataset.chargeName!==name));
      const meta=$('.charge-table-card .table-meta',section);if(meta)meta.textContent=(name==='全部'?rows.length:rows.filter(r=>!r.classList.contains('charge-hidden')).length)+' 条';
    }));
  }

  function patchLabels(){
    const wordmark=$('.wordmark-sub');if(wordmark)wordmark.textContent='Intelligence';
    const finance=$('.nav-item[data-page="finance"]');if(finance)finance.title='利润、结算与扣费名称';
  }

  let queued=false;
  function run(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;bindChargeFilters();patchLabels();});}
  const content=$('#content');if(content)new MutationObserver(run).observe(content,{childList:true,subtree:true});
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setTimeout(run,30)));
  run();setTimeout(run,300);setTimeout(run,1000);
})();
