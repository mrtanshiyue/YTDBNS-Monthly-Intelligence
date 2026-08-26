(() => {
  document.body.classList.add('studio-v44');
  const pop=document.getElementById('viewPopover');
  if(!pop || pop.querySelector('.v44-font-scale')) return;
  const divider=document.createElement('div'); divider.className='view-divider';
  const label=document.createElement('div'); label.className='v44-font-label'; label.textContent='字体大小';
  const group=document.createElement('div'); group.className='v44-font-scale';
  group.innerHTML='<button data-font="comfortable">舒适</button><button data-font="large">大</button><button data-font="xl">特大</button>';
  pop.append(divider,label,group);
  let saved='large';
  try{saved=window.localStorage.getItem('ytdbns-font-size')||'large'}catch(e){}
  function apply(v){
    document.body.classList.toggle('font-scale-comfortable',v==='comfortable');
    document.body.classList.toggle('font-scale-xl',v==='xl');
    group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.font===v));
    try{window.localStorage.setItem('ytdbns-font-size',v)}catch(e){}
  }
  group.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>apply(b.dataset.font)));
  apply(saved);
})();
