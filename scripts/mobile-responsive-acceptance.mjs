import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.ACCEPTANCE_URL||'http://127.0.0.1:4173/';
const artifacts=process.env.ACCEPTANCE_ARTIFACTS||'artifacts/mobile-responsive';
const cases=[
  ['mobile-320x568',320,568,false],
  ['mobile-360x800',360,800,false],
  ['mobile-375x667',375,667,false],
  ['mobile-390x844',390,844,false],
  ['mobile-393x852',393,852,false],
  ['mobile-430x932',430,932,false],
  ['tablet-768x1024',768,1024,false],
  ['tablet-820x1180',820,1180,false],
  ['landscape-844x390',844,390,true],
  ['landscape-932x430',932,430,true],
  ['desktop-1440x900',1440,900,true],
  ['desktop-1920x1080',1920,1080,true],
];

await fs.mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[];
const results=[];

function assert(ok,label,ctx){if(!ok) failures.push(`${ctx}: ${label}`)}

async function rect(page,selector){
  return page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:s.display,visibility:s.visibility,position:s.position,overflowX:s.overflowX};
  });
}

async function inViewport(page,selector,tolerance=2){
  return page.locator(selector).evaluate((el,tol)=>{
    const r=el.getBoundingClientRect();
    return r.left>=-tol&&r.top>=-tol&&r.right<=innerWidth+tol&&r.bottom<=innerHeight+tol;
  },tolerance);
}

for(const [name,width,height,touch] of cases){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<=430,hasTouch:touch||width<=430,deviceScaleFactor:1});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
  page.on('pageerror',err=>consoleErrors.push(err.message));
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.waitForSelector('body.studio-v54',{timeout:15000});
  await page.waitForSelector('#content .metric-card, #content .executive-card, #content .panel',{timeout:15000});

  const mobile=width<=860;
  const doc=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth}));
  assert(doc.scrollWidth<=doc.innerWidth+1,`document horizontal overflow ${doc.scrollWidth}>${doc.innerWidth}`,name);
  assert(doc.bodyScrollWidth<=doc.innerWidth+1,`body horizontal overflow ${doc.bodyScrollWidth}>${doc.innerWidth}`,name);

  const nav=await rect(page,'#mainNav');
  assert(nav.display!=='none'&&nav.visibility!=='hidden','primary navigation hidden',name);
  const navCount=await page.locator('#mainNav .nav-item').count();
  assert(navCount===9,`expected 9 nav items, got ${navCount}`,name);
  if(mobile){
    assert(nav.position==='fixed','mobile primary nav is not fixed rail',name);
    const targetSizes=await page.locator('#mainNav .nav-item').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return [r.width,r.height]}));
    assert(targetSizes.every(([,h])=>h>=44),`nav touch target under 44px: ${JSON.stringify(targetSizes)}`,name);
    assert(await page.locator('#compareToggle').isVisible(),'compare control unavailable on mobile',name);
    assert(await page.locator('#viewMenuBtn').isVisible(),'view settings unavailable on mobile',name);
  }else{
    assert(nav.position!=='fixed','desktop nav unexpectedly uses mobile fixed rail',name);
  }

  for(const pageName of ['overview','finance','charges','ads','products','inventory','returns','history','data']){
    await page.locator(`#mainNav .nav-item[data-page="${pageName}"]`).click();
    await page.waitForTimeout(40);
    const active=await page.locator(`#mainNav .nav-item[data-page="${pageName}"]`).evaluate(el=>el.classList.contains('active'));
    assert(active,`navigation did not activate ${pageName}`,name);
    const currentOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    assert(currentOverflow,`document overflow after navigating to ${pageName}`,name);
  }

  await page.locator('#mainNav .nav-item[data-page="ads"]').click();
  await page.waitForSelector('.chart-xlabels',{timeout:5000});
  const chart=await page.locator('.chart-xlabels').first().evaluate(layer=>{
    const labels=[...layer.querySelectorAll('.chart-xlabel')];
    const visible=labels.filter(el=>getComputedStyle(el).display!=='none');
    return {total:labels.length,visible:visible.length,first:labels.length?getComputedStyle(labels[0]).display!=='none':false,last:labels.length?getComputedStyle(labels.at(-1)).display!=='none':false};
  });
  assert(chart.first&&chart.last,'chart sampling must keep first and last HTML labels',name);
  if(width<=340) assert(chart.visible<=4,`expected <=4 chart labels, got ${chart.visible}`,name);
  else if(width<=430) assert(chart.visible<=5,`expected <=5 chart labels, got ${chart.visible}`,name);
  else if(width<=620) assert(chart.visible<=6,`expected <=6 chart labels, got ${chart.visible}`,name);

  await page.locator('#mainNav .nav-item[data-page="products"]').click();
  const tableCount=await page.locator('.table-wrap>.data-table').count();
  if(tableCount){
    const table=await page.locator('.table-wrap').first().evaluate(w=>({client:w.clientWidth,scroll:w.scrollWidth,doc:document.documentElement.scrollWidth,inner:innerWidth}));
    if(mobile) assert(table.scroll>=table.client,`table viewport invalid ${JSON.stringify(table)}`,name);
    assert(table.doc<=table.inner+1,`table caused document overflow ${JSON.stringify(table)}`,name);
  }

  if(mobile){
    await page.locator('#periodButton').click();
    assert(await page.locator('#periodPopover').isVisible(),'period popover did not open',name);
    assert(await inViewport(page,'#periodPopover',3),'period popover exceeds viewport',name);
    await page.keyboard.press('Escape').catch(()=>{});
    await page.evaluate(()=>document.getElementById('periodPopover')?.classList.remove('show'));

    await page.locator('#topImportBtn').click();
    assert(await page.locator('#importDrawer').isVisible(),'import drawer did not open',name);
    const importRect=await rect(page,'#importDrawer');
    assert(importRect.width<=width+2,`import drawer wider than viewport: ${importRect.width}`,name);
    assert(importRect.height<=height+2,`import drawer taller than viewport: ${importRect.height}`,name);
    await page.locator('#drawerClose').click();

    await page.locator('#commandButton').click();
    await page.waitForTimeout(60);
    if(await page.locator('#commandPalette').isVisible()){
      assert(await inViewport(page,'#commandPalette',3),'command palette exceeds viewport',name);
      await page.keyboard.press('Escape').catch(()=>{});
    }else{
      failures.push(`${name}: command palette did not open`);
    }

    await page.locator('#viewMenuBtn').click();
    await page.waitForTimeout(40);
    if(await page.locator('#viewPopover').isVisible()){
      assert(await inViewport(page,'#viewPopover',3),'view popover exceeds viewport',name);
      await page.evaluate(()=>document.getElementById('viewPopover')?.classList.remove('show','open','active'));
    }else{
      failures.push(`${name}: view popover did not open`);
    }
  }

  assert(consoleErrors.length===0,`console/page errors: ${consoleErrors.join(' | ')}`,name);
  await page.screenshot({path:path.join(artifacts,`${name}.png`),fullPage:true});
  results.push({name,width,height,mobile,chart,consoleErrors});
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({baseURL,results,failures},null,2));

if(failures.length){
  console.error('\nMOBILE RESPONSIVE ACCEPTANCE FAILED');
  failures.forEach(x=>console.error(`- ${x}`));
  process.exit(1);
}
console.log(`MOBILE RESPONSIVE ACCEPTANCE PASS (${cases.length} viewports)`);
