import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-vnext-ia');
fs.mkdirSync(artifactDir, { recursive: true });

const failures = [];
const report = [];
const expectedDomains = ['ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data'];
const expectedPrimary = ['today', 'alerts', 'trends', 'search'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
};
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'attached', timeout: 12_000 });
  await sleep(80);
}

async function railState(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.vnext-module-rail');
    const style = rail ? getComputedStyle(rail) : null;
    const rect = rail?.getBoundingClientRect();
    const buttons = rail ? [...rail.querySelectorAll('[data-vnext-module]')].map(button => {
      const buttonStyle = getComputedStyle(button);
      const buttonRect = button.getBoundingClientRect();
      return {
        id: button.dataset.vnextModule,
        visible: !button.hidden && buttonStyle.display !== 'none' && buttonStyle.visibility !== 'hidden' && buttonRect.width > 0 && buttonRect.height > 0,
        active: button.classList.contains('active'),
        current: button.getAttribute('aria-current')
      };
    }) : [];
    return {
      exists: Boolean(rail),
      visible: Boolean(rail && !rail.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && rect?.width > 0 && rect?.height > 0),
      label: rail?.getAttribute('aria-label') || '',
      buttons,
      ia: window.YT_MOBILE_VNEXT_IA?.getState?.() || null
    };
  });
}

async function noOverflow(page) {
  return page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    root: document.getElementById('mobileAppRoot')?.scrollWidth || 0
  }));
}

async function smallButtons(page) {
  return page.evaluate(() => [...document.querySelectorAll('#mobileAppRoot button')].filter(button => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.height < 43.5;
  }).slice(0, 12).map(button => ({ text: button.textContent.trim().slice(0, 40), height: button.getBoundingClientRect().height, className: button.className })));
}

async function runMobile(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const label = `${viewport.width}x${viewport.height}`;
  const pageErrors = [];
  const requests = [];
  page.on('pageerror', error => pageErrors.push(error.message || String(error)));
  page.on('request', request => {
    if (request.url().includes('/api/')) requests.push({ method: request.method(), url: request.url() });
  });

  const evidence = { viewport };
  try {
    await ready(page);

    const primary = await page.evaluate(() => [...document.querySelectorAll('.vnext-tabbar [data-vnext-tab]')].map(button => button.dataset.vnextTab));
    expect(JSON.stringify(primary) === JSON.stringify(expectedPrimary), `${label}: four primary task destinations remain unchanged`, JSON.stringify(primary));

    let rail = await railState(page);
    const todayVisible = rail.buttons.filter(row => row.visible).map(row => row.id);
    expect(rail.visible && rail.label === '业务模块', `${label}: Today exposes one secondary business-domain rail`, JSON.stringify(rail));
    expect(JSON.stringify(todayVisible) === JSON.stringify(expectedDomains), `${label}: Today rail contains exactly eight business domains`, JSON.stringify(todayVisible));
    expect(!rail.buttons.find(row => row.id === 'today')?.visible && !rail.buttons.find(row => row.id === 'alerts')?.visible, `${label}: duplicate Today/Alerts controls are removed from secondary navigation`, JSON.stringify(rail.buttons));

    for (const tab of ['alerts', 'trends', 'search']) {
      await page.click(`[data-vnext-tab="${tab}"]`);
      await page.waitForSelector(`[data-vnext-page="${tab}"]`, { state: 'visible' });
      await sleep(80);
      rail = await railState(page);
      expect(!rail.visible && rail.ia?.railVisible === false, `${label}/${tab}: business rail stays out of unrelated primary task spaces`, JSON.stringify(rail));
    }

    await page.click('[data-vnext-tab="today"]');
    await page.waitForSelector('[data-vnext-page="today"]', { state: 'visible' });
    await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible' });
    await page.click('.vnext-module-rail [data-vnext-module="ads"]');
    await page.waitForSelector('.vnext-density-module-page[data-density-module="ads"]', { state: 'visible' });
    await sleep(100);
    rail = await railState(page);
    const active = rail.buttons.filter(row => row.visible && row.active).map(row => row.id);
    expect(rail.visible && rail.ia?.module === 'ads', `${label}/ads: business rail persists inside a domain module`, JSON.stringify(rail));
    expect(JSON.stringify(active) === JSON.stringify(['ads']), `${label}/ads: exactly one domain is selected`, JSON.stringify(active));

    const overflow = await noOverflow(page);
    expect(Math.max(overflow.html, overflow.body, overflow.root) <= overflow.viewport + 1, `${label}/ads: document horizontal overflow remains zero`, JSON.stringify(overflow));
    const short = await smallButtons(page);
    expect(short.length === 0, `${label}/ads: visible touch targets remain >=44px high`, JSON.stringify(short));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-ads.png`), fullPage: false });

    await page.goBack();
    await page.waitForSelector('[data-vnext-page="today"]', { state: 'visible' });
    await sleep(100);
    rail = await railState(page);
    expect(rail.visible && !rail.ia?.module && rail.ia?.primaryTab === 'today', `${label}: Browser Back restores Today and its domain rail`, JSON.stringify(rail));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-today.png`), fullPage: false });

    expect(pageErrors.length === 0, `${label}: page errors=0`, JSON.stringify(pageErrors));
    expect(requests.every(request => request.method === 'GET'), `${label}: Mobile browser API activity remains GET-only`, JSON.stringify(requests));
    evidence.finalRail = rail;
    evidence.pageErrors = pageErrors;
    evidence.apiRequests = requests;
  } catch (error) {
    fail(`${label}: browser acceptance crashed`, error.stack || String(error));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-failure.png`), fullPage: true }).catch(() => null);
  } finally {
    report.push(evidence);
    await context.close();
    await browser.close();
  }
}

async function runDesktop() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
    const desktop = await page.evaluate(() => ({
      mobileHidden: document.getElementById('mobileAppRoot')?.hidden,
      mobileActive: document.body.classList.contains('mobile-vnext-active'),
      mainDisplay: getComputedStyle(document.querySelector('.main-shell')).display,
      primaryNav: [...document.querySelectorAll('#mainNav [data-page]')].map(node => node.dataset.page)
    }));
    expect(desktop.mobileHidden === true && desktop.mobileActive === false, 'desktop 1440: Mobile IA remains inactive', JSON.stringify(desktop));
    expect(desktop.mainDisplay !== 'none', 'desktop 1440: Desktop application remains visible', desktop.mainDisplay);
    expect(desktop.primaryNav.length === 9, 'desktop 1440: accepted nine-destination Desktop IA remains intact', JSON.stringify(desktop.primaryNav));
    await page.screenshot({ path: path.join(artifactDir, 'desktop-1440-smoke.png'), fullPage: false });
  } catch (error) {
    fail('desktop 1440: browser smoke crashed', error.stack || String(error));
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) await runMobile(viewport);
await runDesktop();
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile vNext IA browser acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log('\nMobile vNext IA browser acceptance passed.');
