(() => {
  function loadImportReportCompat(){
    if(document.getElementById('importReportCompatRuntime')) return;
    const script=document.createElement('script');
    script.id='importReportCompatRuntime';
    script.src='./import-report-compat.js';
    script.async=false;
    document.head.appendChild(script);
  }
  function loadCoreFiveReportModel(){
    if(document.getElementById('coreFiveReportModelRuntime')) return;
    const script=document.createElement('script');
    script.id='coreFiveReportModelRuntime';
    script.src='./core-five-report-model.js';
    script.async=false;
    document.head.appendChild(script);
  }
  function loadMultiFileImport(){
    if(document.getElementById('multiFileImportRuntime')) return;
    const script=document.createElement('script');
    script.id='multiFileImportRuntime';
    script.src='./multi-file-import.js';
    script.async=false;
    document.head.appendChild(script);
  }
  function loadMasterDataImportPeriod(){
    if(document.getElementById('masterDataImportPeriodRuntime')) return;
    const script=document.createElement('script');
    script.id='masterDataImportPeriodRuntime';
    script.src='./master-data-import-period.js';
    script.async=false;
    document.head.appendChild(script);
  }
  function loadOperationLog(){
    if(!document.getElementById('operationLogStyles')){
      const link=document.createElement('link');
      link.id='operationLogStyles';
      link.rel='stylesheet';
      link.href='./operation-log.css';
      document.head.appendChild(link);
    }
    if(!document.getElementById('operationLogRuntime')){
      const script=document.createElement('script');
      script.id='operationLogRuntime';
      script.src='./operation-log.js';
      script.defer=true;
      document.head.appendChild(script);
    }
  }
  loadImportReportCompat();
  loadCoreFiveReportModel();
  loadMultiFileImport();
  loadMasterDataImportPeriod();
  loadOperationLog();

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
