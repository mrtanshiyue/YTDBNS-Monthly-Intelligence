import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const entry = pathToFileURL(path.join(rootDir, 'public', 'index.html')).href;
const artifactDir = path.join(rootDir, 'artifacts', 'mobile-toolbar');
fs.mkdirSync(artifactDir, { recursive: true });

const failures = [];
const report = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => { const full = detail ? `${message} — ${detail}` : message; failures.push(full); console.error(`FAIL  ${full}`); };
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-toolbar', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
  await sleep(100);
}

async function mobile(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const label = `${viewport.width}x${viewport.height}`;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message || String(error)));
  try {
    await ready(page);
    const state = await page.evaluate(() => {
      const rect = el => {
        const r = el?.getBoundingClientRect();
        return r ? { top:r.top, right:r.right, bottom:r.bottom, left:r.left, width:r.width, height:r.height } : null;
      };
      const toolbar = document.querySelector('.vnext-toolbar');
      const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
      const direct = toolbar ? [...toolbar.children].map(el => ({
        tag: el.tagName,
        className: el.className || '',
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
        rect: rect(el),
        display: getComputedStyle(el).display
      })) : [];
      const buttons = toolbar ? [...toolbar.querySelectorAll('button')].map(el => ({ className:el.className, text:el.textContent.trim().replace(/\s+/g,' ').slice(0,40), rect:rect(el) })) : [];
      return {
        viewport:{width:innerWidth,height:innerHeight},
        toolbar:rect(toolbar),
        rail:rect(rail),
        direct,
        buttons,
        wordmark:rect(document.querySelector('.vnext-wordmark')),
        live:rect(document.querySelector('.vnext-live')),
        period:rect(document.querySelector('.vnext-period')),
        cjk:document.fonts.check('12px "Noto Sans CJK SC"'),
        scroll:{html:document.documentElement.scrollWidth,body:document.body.scrollWidth,root:document.getElementById('mobileAppRoot')?.scrollWidth||0}
      };
    });
    report.push({ label, ...state, errors });

    expect(state.toolbar && state.toolbar.height <= 54.5, `${label}: toolbar persistent height <=54px`, JSON.stringify(state.toolbar));
    expect(state.rail && state.rail.height <= 51.5, `${label}: business rail height <=51px`, JSON.stringify(state.rail));
    expect(state.toolbar && state.rail && Math.abs(state.rail.top - state.toolbar.bottom) <= 1.5, `${label}: rail starts immediately after compact toolbar`, `toolbarBottom=${state.toolbar?.bottom}, railTop=${state.rail?.top}`);
    expect(state.rail && state.rail.bottom <= 106, `${label}: total persistent top chrome <=106px`, `bottom=${state.rail?.bottom}`);
    expect(state.buttons.every(item => item.rect?.height >= 43.5), `${label}: every toolbar button remains >=44px`, JSON.stringify(state.buttons));
    expect(state.wordmark?.width > 40 && state.wordmark?.height > 10, `${label}: wordmark remains visible`, JSON.stringify(state.wordmark));
    expect(state.live?.width > 8 && state.live?.height > 8, `${label}: runtime status remains visible`, JSON.stringify(state.live));
    expect(state.period?.height >= 43.5, `${label}: period control remains comfortable`, JSON.stringify(state.period));
    expect(state.cjk === true, `${label}: CI browser has Noto CJK font support for trustworthy Chinese screenshots`);
    expect(Math.max(state.scroll.html,state.scroll.body,state.scroll.root) <= viewport.width + 1, `${label}: compact toolbar introduces no horizontal overflow`, JSON.stringify(state.scroll));
    expect(errors.length === 0, `${label}: page errors=0`, JSON.stringify(errors));

    await page.screenshot({ path:path.join(artifactDir,`toolbar-${label}.png`), fullPage:false });
  } catch (error) {
    fail(`${label}: toolbar acceptance crashed`, error.stack || String(error));
    await page.screenshot({ path:path.join(artifactDir,`failure-${label}.png`), fullPage:true }).catch(()=>null);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function desktop() {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await context.newPage();
  try {
    await page.goto(entry,{waitUntil:'load',timeout:30_000});
    await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout:12_000 });
    const state = await page.evaluate(() => ({ mobileHidden:document.getElementById('mobileAppRoot')?.hidden, mobileActive:document.body.classList.contains('mobile-vnext-active'), desktopDisplay:getComputedStyle(document.querySelector('.main-shell')).display }));
    expect(state.mobileHidden === true && state.mobileActive === false, 'desktop 1440: compact Mobile toolbar layer remains inactive', JSON.stringify(state));
    expect(state.desktopDisplay !== 'none', 'desktop 1440: Desktop product remains visible');
  } catch (error) {
    fail('desktop 1440: toolbar no-op smoke crashed', error.stack || String(error));
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const viewport of [{width:393,height:852},{width:430,height:932}]) await mobile(viewport);
await desktop();
fs.writeFileSync(path.join(artifactDir,'report.json'),JSON.stringify(report,null,2));

if (failures.length) {
  console.error(`\nMobile toolbar browser acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure,index)=>console.error(`${index+1}. ${failure}`));
  process.exit(1);
}
console.log('\nMobile toolbar browser acceptance passed.');
