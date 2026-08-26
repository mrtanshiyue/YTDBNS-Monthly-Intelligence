import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.ACCEPTANCE_URL||'http://127.0.0.1:4173/';
const artifacts=process.env.ACCEPTANCE_ARTIFACTS||'artifacts/mobile-responsive';
const browserCandidates=[
  process.env.CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);
const executablePath=browserCandidates.find(existsSync);
if(!executablePath){
  throw new Error(`No system Chromium/Chrome found. Set CHROMIUM_PATH. Checked: ${browserCandidates.join(', ')}`);
}

const cases=[
  ['mobile-320x568',320,568],
  ['mobile-360x800',360,800],
  ['mobile-375x667',375,667],
  ['mobile-390x844',390,844],
  ['mobile-393x852',393,852],
  ['mobile-430x932',430,932],
  ['tablet-768x1024',768,1024],
  ['tablet-820x1180',820,1180],
  ['landscape-844x390',844,390],
  ['landscape-932x430',932,430],
  ['desktop-1440x900',1440,900],
  ['desktop-1920x1080',1920,1080],
];

await fs.mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const failures=[];
const results=[];

function assert(ok,label,ctx){if(!ok) failures.push(`${ctx}: ${label}`)}

async function rect(page,selector){
  return page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:s.display,visibility:s.visibility,position:s.position,overflowX:s.overflowX,overflowY:s.overflowY,transform:s.transform};
  });
}

async function inViewport(page,selector,tolerance=2){
  return page.locator(selector).evaluate((el,tol)=>{
    const r=el.getBoundingClientRect();
    return r.left>=-tol&&r.top>=-tol&&r.right<=innerWidth+tol&&r.bottom<=innerHeight+tol;
  },tolerance);
}

async function ensurePeriodOpen(page){
  if(!(await page.locator('#periodPopover').isVisible())){
    await page.locator('#periodButton').click();
    await page.waitForTimeout(160);
  }
  assert(await page.locator('#periodPopover').isVisible(),'period popover did not open','period-helper');
}

for(const [name,width,height] of cases){
  const mobile=width<=860;
  const compactLandscape=width>860&&width<=960&&height<=520;
  const deviceLike=mobile||compactLandscape;
  const overlayAcceptance=deviceLike;
  const context=await browser.newContext({viewport:{width,height},isMobile:deviceLike,hasTouch:deviceLike,deviceScaleFactor:1});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
  page.on('pageerror',err=>consoleErrors.push(err.message));
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.waitForSelector('body.studio-v54',{timeout:15000});
  await page.waitForSelector('#content .metric-card, #content .executive-card, #content .panel',{timeout:15000});

  const doc=await page.evaluate(()=>({innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth}));
  assert(Math.abs(doc.innerWidth-width)<=1,`actual viewport width ${doc.innerWidth} does not match requested ${width}`,name);
  assert(Math.abs(doc.innerHeight-height)<=1,`actual viewport height ${doc.innerHeight} does not match requested ${height}`,name);
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

    for(const selector of ['#commandButton','#periodButton','#refreshBtn','#topImportBtn']){
      assert(await page.locator(selector).isVisible(),`${selector} unavailable on mobile`,name);
      const actionRect=await rect(page,selector);
      assert(actionRect.width>=44&&actionRect.height>=44,`${selector} touch target under 44px: ${JSON.stringify(actionRect)}`,name);
      assert(await inViewport(page,selector,2),`${selector} exceeds viewport`,name);
    }

    const globalRect=await rect(page,'.global-nav');
    const sectionRect=await rect(page,'.section-nav');
    assert(sectionRect.y>=globalRect.bottom-1,`section header overlaps global header: ${JSON.stringify({globalRect,sectionRect})}`,name);
  }else{
    assert(nav.position!=='fixed','desktop nav unexpectedly uses mobile fixed rail',name);
    if(compactLandscape){
      const globalOuter=await rect(page,'.global-nav');
      const globalInner=await rect(page,'.global-nav-inner');
      const sectionOuter=await rect(page,'.section-nav');
      const sectionInner=await rect(page,'.section-nav-inner');
      assert(globalInner.height<=globalOuter.height+1,`932 landscape inherited mobile inner header height: ${JSON.stringify({globalOuter,globalInner})}`,name);
      assert(Math.abs(sectionInner.height-sectionOuter.height)<=2,`932 landscape has partial mobile section height: ${JSON.stringify({sectionOuter,sectionInner})}`,name);
    }
  }

  for(const pageName of ['overview','finance','charges','ads','products','inventory','returns','history','data']){
    await page.locator(`#mainNav .nav-item[data-page="${pageName}"]`).click();
    await page.waitForTimeout(mobile?220:40);
    const active=await page.locator(`#mainNav .nav-item[data-page="${pageName}"]`).evaluate(el=>el.classList.contains('active'));
    assert(active,`navigation did not activate ${pageName}`,name);
    const currentOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    assert(currentOverflow,`document overflow after navigating to ${pageName}`,name);
    if(mobile){
      const activeVisible=await page.locator(`#mainNav .nav-item[data-page="${pageName}"]`).evaluate(el=>{
        const r=el.getBoundingClientRect();
        const n=document.getElementById('mainNav').getBoundingClientRect();
        return r.right>n.left&&r.left<n.right;
      });
      assert(activeVisible,`active nav item not visible after switching to ${pageName}`,name);
    }
  }

  await page.locator('#mainNav .nav-item[data-page="ads"]').click();
  await page.waitForSelector('.chart-xlabels',{timeout:5000});
  const chart=await page.locator('.chart-xlabels').first().evaluate(layer=>{
    const labels=[...layer.querySelectorAll('.chart-xlabel')];
    const visible=labels.filter(el=>getComputedStyle(el).display!=='none');
    return {total:labels.length,visible:visible.length,first:labels.length?getComputedStyle(labels[0]).display!=='none':false,last:labels.length?getComputedStyle(labels.at(-1)).display!=='none':false,htmlLayer:layer instanceof HTMLElement};
  });
  assert(chart.htmlLayer,'chart X labels are not in the HTML overlay layer',name);
  assert(chart.first&&chart.last,'chart sampling must keep first and last HTML labels',name);
  assert(await page.locator('svg text.chart-xlabel').count()===0,'chart X labels regressed into SVG text',name);
  if(width<=340) assert(chart.visible<=4,`expected <=4 chart labels, got ${chart.visible}`,name);
  else if(width<=430) assert(chart.visible<=5,`expected <=5 chart labels, got ${chart.visible}`,name);
  else if(width<=620) assert(chart.visible<=6,`expected <=6 chart labels, got ${chart.visible}`,name);

  for(const tablePage of ['ads','products','charges','inventory','returns']){
    await page.locator(`#mainNav .nav-item[data-page="${tablePage}"]`).click();
    await page.waitForTimeout(120);
    const tableCount=await page.locator('.table-wrap>.data-table').count();
    if(tableCount){
      const table=await page.locator('.table-wrap').first().evaluate(w=>({client:w.clientWidth,scroll:w.scrollWidth,doc:document.documentElement.scrollWidth,inner:innerWidth,overflow:getComputedStyle(w).overflowX}));
      if(mobile){
        assert(table.scroll>=table.client,`${tablePage} table viewport invalid ${JSON.stringify(table)}`,name);
        assert(['auto','scroll'].includes(table.overflow),`${tablePage} table does not own horizontal scrolling: ${JSON.stringify(table)}`,name);
      }
      assert(table.doc<=table.inner+1,`${tablePage} table caused document overflow ${JSON.stringify(table)}`,name);
    }
  }

  if(overlayAcceptance){
    const compareBefore=await page.locator('#compareToggle').getAttribute('aria-pressed');
    await page.locator('#compareToggle').click();
    const compareAfter=await page.locator('#compareToggle').getAttribute('aria-pressed');
    assert(compareBefore!==compareAfter,'Compare aria-pressed did not toggle',name);
    await page.locator('#compareToggle').click();

    await ensurePeriodOpen(page);
    assert(await page.locator('.period-pane[data-pane="quick"]').isVisible(),'Quick period pane unavailable',name);
    const quickCurrent=page.locator('.period-pane[data-pane="quick"] [data-quick="current"]').first();
    if(await quickCurrent.count()){
      await quickCurrent.click();
      await page.waitForTimeout(240);
      assert(!(await page.locator('#periodPopover').isVisible()),'Quick period action did not close the sheet',name);
    }

    await ensurePeriodOpen(page);
    const monthTab=page.locator('.period-tab[data-mode="month"]');
    if(await monthTab.count()){
      await monthTab.click();
      assert(await page.locator('.period-pane[data-pane="month"]').isVisible(),'Month period pane unavailable',name);
      await page.locator('#applyMonth').click();
      await page.waitForTimeout(240);
      assert(!(await page.locator('#periodPopover').isVisible()),'Month apply did not close the sheet',name);
    }

    await ensurePeriodOpen(page);
    const customTab=page.locator('.period-tab[data-mode="custom"]');
    if(await customTab.count()){
      await customTab.click();
      assert(await page.locator('.period-pane[data-pane="custom"]').isVisible(),'Custom period pane unavailable',name);
      await page.locator('#dateFrom').fill('2026-06-01');
      await page.locator('#dateTo').fill('2026-06-30');
      assert(await inViewport(page,'#periodPopover',3),'Custom period sheet exceeds viewport',name);
      if(mobile){
        const periodVsNav=await page.evaluate(()=>{
          const p=document.getElementById('periodPopover').getBoundingClientRect();
          const n=document.getElementById('mainNav').getBoundingClientRect();
          return {periodBottom:p.bottom,navTop:n.top,clear:p.bottom<=n.top+3};
        });
        assert(periodVsNav.clear,`period popover overlaps bottom navigation: ${JSON.stringify(periodVsNav)}`,name);
      }
      await page.locator('#applyCustom').click();
      await page.waitForTimeout(260);
      assert(!(await page.locator('#periodPopover').isVisible()),'Custom apply did not close the sheet',name);
    }

    await page.locator('#topImportBtn').click();
    await page.waitForTimeout(360);
    assert(await page.locator('#importDrawer').isVisible(),'import drawer did not open',name);
    const importRect=await rect(page,'#importDrawer');
    assert(importRect.width<=width+2,`import drawer wider than viewport: ${importRect.width}`,name);
    assert(importRect.height<=height+2,`import drawer taller than viewport: ${importRect.height}`,name);
    assert(await inViewport(page,'#importDrawer',3),'import drawer exceeds viewport after transition',name);
    const closeRect=await rect(page,'#drawerClose');
    if(mobile) assert(closeRect.width>=44&&closeRect.height>=44,`import close target under 44px: ${JSON.stringify(closeRect)}`,name);
    const importInternals=await page.evaluate(()=>{
      const drawer=document.getElementById('importDrawer').getBoundingClientRect();
      const body=document.querySelector('#importDrawer .drawer-body');
      const foot=document.querySelector('#importDrawer .drawer-foot');
      const drop=document.getElementById('dropzone');
      const br=body.getBoundingClientRect(),fr=foot.getBoundingClientRect(),dr=drop.getBoundingClientRect();
      return {bodyOverflowY:getComputedStyle(body).overflowY,bodyInside:br.left>=drawer.left-2&&br.right<=drawer.right+2&&br.top>=drawer.top-2&&br.bottom<=drawer.bottom+2,footInside:fr.left>=drawer.left-2&&fr.right<=drawer.right+2&&fr.top>=drawer.top-2&&fr.bottom<=drawer.bottom+2,dropInside:dr.left>=drawer.left-2&&dr.right<=drawer.right+2&&dr.top>=drawer.top-2&&dr.bottom<=drawer.bottom+2};
    });
    assert(['auto','scroll'].includes(importInternals.bodyOverflowY),`import drawer body does not own vertical scrolling: ${JSON.stringify(importInternals)}`,name);
    assert(importInternals.bodyInside,'import drawer body exceeds drawer geometry',name);
    assert(importInternals.footInside,'import drawer footer is not fully reachable inside drawer',name);
    assert(importInternals.dropInside,'import dropzone exceeds drawer geometry',name);
    await page.locator('#drawerClose').click();

    await page.locator('#commandButton').click();
    await page.waitForTimeout(300);
    if(await page.locator('#commandPalette').isVisible()){
      assert(await inViewport(page,'#commandPalette',3),'command palette exceeds viewport',name);
      const commandRect=await rect(page,'#commandPalette');
      if(mobile) assert(Math.abs(commandRect.x-(width-commandRect.right))<=4,`command palette is not horizontally viewport-bound: ${JSON.stringify(commandRect)}`,name);
      assert(commandRect.transform==='none',`command palette still has transform after open transition: ${commandRect.transform}`,name);
      const commandResults=await rect(page,'#commandResults');
      assert(['auto','scroll'].includes(commandResults.overflowY),`command results do not own vertical scrolling: ${JSON.stringify(commandResults)}`,name);
      await page.locator('#commandInput').fill('广告');
      await page.keyboard.press('Escape').catch(()=>{});
    }else{
      failures.push(`${name}: command palette did not open`);
    }

    await page.locator('#viewMenuBtn').click();
    await page.waitForTimeout(220);
    if(await page.locator('#viewPopover').isVisible()){
      assert(await inViewport(page,'#viewPopover',3),'view popover exceeds viewport',name);
      await page.evaluate(()=>document.getElementById('viewPopover')?.classList.remove('show','open','active'));
    }else{
      failures.push(`${name}: view popover did not open`);
    }

    await page.locator('#mainNav .nav-item[data-page="overview"]').click();
    await page.waitForTimeout(160);
    const detailTrigger=page.locator('.rich-clickable').first();
    if(await detailTrigger.count()&&await detailTrigger.isVisible()){
      await detailTrigger.click();
      await page.waitForTimeout(320);
      assert(await page.locator('#detailDrawer').isVisible(),'detail drawer did not open',name);
      assert(await inViewport(page,'#detailDrawer',3),'detail drawer exceeds viewport',name);
      const detailBody=await rect(page,'#detailBody');
      assert(['auto','scroll'].includes(detailBody.overflowY),`detail drawer body does not own vertical scrolling: ${JSON.stringify(detailBody)}`,name);
      if(mobile){
        const detailClose=await rect(page,'#detailClose');
        assert(detailClose.width>=44&&detailClose.height>=44,`detail close target under 44px: ${JSON.stringify(detailClose)}`,name);
      }
      await page.locator('#detailClose').click();
      await page.waitForTimeout(180);
    }else{
      failures.push(`${name}: no visible detail drawer trigger`);
    }

    const focusButton=page.locator('.panel-rich-btn[data-act="focus"]').first();
    if(await focusButton.count()&&await focusButton.isVisible()){
      await focusButton.click();
      await page.waitForTimeout(260);
      assert(await page.locator('#panelModal').isVisible(),'panel modal did not open',name);
      assert(await inViewport(page,'#panelModal',3),'panel modal exceeds viewport',name);
      const panelBody=await rect(page,'#panelModalBody');
      assert(['auto','scroll'].includes(panelBody.overflowY),`panel modal body does not own vertical scrolling: ${JSON.stringify(panelBody)}`,name);
      if(mobile){
        const panelClose=await rect(page,'#panelModalClose');
        assert(panelClose.width>=44&&panelClose.height>=44,`panel close target under 44px: ${JSON.stringify(panelClose)}`,name);
      }
      await page.locator('#panelModalClose').click();
    }else{
      failures.push(`${name}: no visible panel focus trigger`);
    }
  }

  assert(consoleErrors.length===0,`console/page errors: ${consoleErrors.join(' | ')}`,name);
  await page.screenshot({path:path.join(artifacts,`${name}.png`),fullPage:true});
  results.push({name,width,height,mobile,compactLandscape,deviceLike,chart,consoleErrors});
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({baseURL,executablePath,results,failures},null,2));

if(failures.length){
  console.error('\nMOBILE RESPONSIVE ACCEPTANCE FAILED');
  failures.forEach(x=>console.error(`- ${x}`));
  process.exit(1);
}
console.log(`MOBILE RESPONSIVE ACCEPTANCE PASS (${cases.length} viewports, ${executablePath})`);
