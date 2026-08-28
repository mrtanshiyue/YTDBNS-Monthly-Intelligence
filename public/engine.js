(() => {
  'use strict';
  const STORES = Object.freeze([
    Object.freeze({ id: 'ytdbns', name: 'YTDBNS' }),
    Object.freeze({ id: 'yy', name: 'YY' }),
    Object.freeze({ id: 'jj', name: 'JJ' })
  ]);
  const STORAGE_KEY = 'ytdbns.activeStore.v1';
  const valid = id => STORES.some(store => store.id === id);
  let activeStoreId = 'ytdbns';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (valid(saved)) activeStoreId = saved;
  } catch {}

  const activeStore = () => STORES.find(store => store.id === activeStoreId) || STORES[0];
  const originalFetch = window.fetch.bind(window);
  window.fetch = function storeScopedFetch(input, init) {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, location.href);
    let nextInit = init ? { ...init } : undefined;

    if (url.origin === location.origin && url.pathname.startsWith('/api/') && !['/api/health', '/api/stores'].includes(url.pathname)) {
      url.searchParams.set('store', activeStoreId);
      if (nextInit?.body instanceof FormData) {
        nextInit.body.set('storeId', activeStoreId);
      } else if (typeof nextInit?.body === 'string' && url.pathname.startsWith('/api/imports/')) {
        try {
          const body = JSON.parse(nextInit.body);
          if (body && typeof body === 'object') {
            body.storeId = activeStoreId;
            if (body.payload && typeof body.payload === 'object') body.payload.storeId = activeStoreId;
            nextInit.body = JSON.stringify(body);
          }
        } catch {}
      }
      return originalFetch(url.href, nextInit);
    }
    return originalFetch(input, init);
  };

  function setStore(id) {
    if (!valid(id) || id === activeStoreId) return;
    activeStoreId = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
    window.dispatchEvent(new CustomEvent('ytdbns:storechange', { detail: { store: activeStore() } }));
    location.reload();
  }

  function ensureStyles() {
    if (document.getElementById('ytStoreSwitcherStyles')) return;
    const style = document.createElement('style');
    style.id = 'ytStoreSwitcherStyles';
    style.textContent = `
      .yt-store-switcher{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 10px;border:1px solid rgba(21,31,38,.12);border-radius:13px;background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.03);color:#5f686d;white-space:nowrap}
      .yt-store-switcher>span{font-size:11px;font-weight:700;letter-spacing:.04em;color:#7a8286}
      .yt-store-switcher select{height:42px;min-width:86px;border:0;background:transparent;color:#172126;font:700 13px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif;outline:none;cursor:pointer}
      .yt-store-import-note{margin:0 0 16px;padding:12px 14px;border:1px solid rgba(30,111,92,.14);border-radius:14px;background:rgba(30,111,92,.06);color:#53615e;font-size:12px;line-height:1.5}
      .yt-store-import-note b{color:#1e6f5c;font-size:13px}
      @media(max-width:860px){.yt-store-switcher{margin-left:auto;min-height:44px;height:44px;padding:0 8px;border-radius:14px;background:rgba(255,255,255,.86);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.yt-store-switcher>span{display:none}.yt-store-switcher select{height:42px;min-width:76px;font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  function ensureSwitcher() {
    ensureStyles();
    let host = document.getElementById('ytStoreSwitcher');
    if (!host) {
      host = document.createElement('label');
      host.id = 'ytStoreSwitcher';
      host.className = 'yt-store-switcher';
      host.setAttribute('aria-label', '当前店铺');
      host.innerHTML = `<span>店铺</span><select aria-label="选择店铺">${STORES.map(store => `<option value="${store.id}">${store.name}</option>`).join('')}</select>`;
      host.querySelector('select').addEventListener('change', event => setStore(event.target.value));
    }
    const select = host.querySelector('select');
    if (select && select.value !== activeStoreId) select.value = activeStoreId;
    const mobile = matchMedia('(max-width:860px)').matches;
    const target = mobile
      ? document.querySelector('#mobileAppRoot .vnext-toolbar')
      : document.querySelector('.global-actions');
    if (target && host.parentElement !== target) {
      if (mobile) target.appendChild(host);
      else target.insertBefore(host, target.firstChild);
    }
  }

  function ensureImportNote() {
    const drawerBody = document.querySelector('#importDrawer .drawer-body');
    if (!drawerBody) return;
    let note = document.getElementById('ytStoreImportNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'ytStoreImportNote';
      note.className = 'yt-store-import-note';
      drawerBody.insertBefore(note, drawerBody.firstChild);
    }
    note.innerHTML = `当前店铺：<b>${activeStore().name}</b><br>本次上传、校验、原始文件归档和数据库写入只属于该店铺。`;
  }

  function reconcileStoreUI() {
    ensureSwitcher();
    ensureImportNote();
  }

  window.YT_STORE_CONTEXT = Object.freeze({
    stores: STORES,
    getStore: () => activeStore(),
    getStoreId: () => activeStoreId,
    setStore
  });

  reconcileStoreUI();
  const observer = new MutationObserver(() => reconcileStoreUI());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  matchMedia('(max-width:860px)').addEventListener?.('change', reconcileStoreUI);
})();

(function(){
const ROLE_HINTS={cost:/采购成本|cost/i,parent:/父体|parent/i,ads:/广告|advert/i,transactions:/联合|transaction/i,product:/商品信息|product/i,returns:/退货|return/i,inventory:/库存|inventory/i,storage:/仓储|storage/i,child:/子体|child/i};
function csvParse(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const ch=text[i];if(q){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')q=false;else cell+=ch}else{if(ch==='"')q=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}}if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}return rows}
function u16(d,o){return d.getUint16(o,true)}function u32(d,o){return d.getUint32(o,true)}
async function unzip(buf){const d=new DataView(buf);let eocd=-1;for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65557);i--){if(u32(d,i)===0x06054b50){eocd=i;break}}if(eocd<0)throw Error('不是有效 XLSX/ZIP');const count=u16(d,eocd+10),cd=u32(d,eocd+16);let p=cd;const out={};for(let n=0;n<count;n++){if(u32(d,p)!==0x02014b50)break;const method=u16(d,p+10),cs=u32(d,p+20),nl=u16(d,p+28),el=u16(d,p+30),cl=u16(d,p+32),lo=u32(d,p+42);const name=new TextDecoder().decode(new Uint8Array(buf,p+46,nl));const lnl=u16(d,lo+26),lel=u16(d,lo+28),start=lo+30+lnl+lel;let bytes=new Uint8Array(buf,start,cs);if(method===8){const ds=new DecompressionStream('deflate-raw');const ab=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();bytes=new Uint8Array(ab)}else if(method!==0)throw Error('不支持的 XLSX 压缩方式');out[name]=bytes;p+=46+nl+el+cl}return out}
function xmlText(bytes){return new TextDecoder().decode(bytes)}
function colIdx(ref){let n=0;const m=(ref||'').match(/[A-Z]+/);if(!m)return 0;for(const ch of m[0])n=n*26+ch.charCodeAt(0)-64;return n-1}
async function xlsxParse(buf){const z=await unzip(buf),parser=new DOMParser();const sst=[];if(z['xl/sharedStrings.xml']){const x=parser.parseFromString(xmlText(z['xl/sharedStrings.xml']),'application/xml');for(const si of x.getElementsByTagName('si'))sst.push([...si.getElementsByTagName('t')].map(t=>t.textContent||'').join(''))}const wb=parser.parseFromString(xmlText(z['xl/workbook.xml']),'application/xml'),rels=parser.parseFromString(xmlText(z['xl/_rels/workbook.xml.rels']),'application/xml'),rm={};for(const r of rels.getElementsByTagName('Relationship'))rm[r.getAttribute('Id')]=r.getAttribute('Target');const out={};for(const sh of wb.getElementsByTagName('sheet')){const name=sh.getAttribute('name'),rid=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');let target=rm[rid];if(!target)continue;if(!target.startsWith('xl/'))target='xl/'+target.replace(/^\//,'');const sx=parser.parseFromString(xmlText(z[target]),'application/xml'),rows=[];for(const r of sx.getElementsByTagName('row')){const cells=[...r.getElementsByTagName('c')];let mx=-1,vals={};for(const c of cells){const idx=colIdx(c.getAttribute('r'));mx=Math.max(mx,idx);const typ=c.getAttribute('t');let v='';if(typ==='inlineStr'){v=[...c.getElementsByTagName('t')].map(t=>t.textContent||'').join('')}else{const ve=c.getElementsByTagName('v')[0];const raw=ve?ve.textContent:'';if(typ==='s')v=sst[Number(raw)]??raw;else if(raw!==''&&!isNaN(Number(raw)))v=Number(raw);else v=raw}vals[idx]=v}if(mx>=0){const a=Array(mx+1).fill('');for(const k in vals)a[Number(k)]=vals[k];rows.push(a)}}out[name]=rows}return out}
async function parseFile(file){if(/\.csv$/i.test(file.name)){const ab=await file.arrayBuffer();let text='';for(const enc of ['utf-8','gb18030','gbk']){try{text=new TextDecoder(enc,{fatal:enc==='utf-8'}).decode(ab);break}catch{}}if(!text)text=new TextDecoder().decode(ab);return {kind:'csv',sheets:{CSV:csvParse(text.replace(/^\uFEFF/,''))}}}if(/\.xlsx$/i.test(file.name)){return {kind:'xlsx',sheets:await xlsxParse(await file.arrayBuffer())}}throw Error('仅支持 CSV / XLSX')}
function detectRole(name,parsed){for(const [k,re] of Object.entries(ROLE_HINTS))if(re.test(name))return k;const sheets=Object.values(parsed.sheets),h=(sheets[0]||[]).slice(0,14).flat().join('|');if(/采购成本/.test(h))return'cost';if(/广告活动名称|7天总销售额/.test(h))return'ads';if(/款号.*FNSKU.*ASIN/.test(h))return'product';if(/return-date|detailed-disposition/.test(h))return'returns';if(/afn-fulfillable-quantity/.test(h))return'inventory';if(/estimated_monthly_storage_fee/.test(h))return'storage';if(/（父）ASIN.*（子）ASIN/.test(h))return'child';if(/（父）ASIN.*会话数/.test(h))return'parent';if(/settlement id.*product sales/i.test(h))return'transactions';return''}
window.YT_ENGINE={csvParse,xlsxParse,parseFile,detectRole};
})();
