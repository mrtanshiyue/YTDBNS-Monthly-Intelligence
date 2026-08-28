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
const moduleTargets = ['ads', 'products', 'inventory'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
};
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);

function rgb(value) {
  const parts = String(value || '').match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
  return parts.length === 3 ? parts : null;
}

function luminance(value) {
  const channels = rgb(value);
  if (!channels) return null;
  const linear = channels.map(channel => {
    const normalized = channel / 255;
    return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  if (a == null || b == null) return 0;
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

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
        current: button.getAttribute('aria-current'),
        color: buttonStyle.color,
        background: buttonStyle.backgroundColor
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

async function moduleState(page, module) {
  return page.evaluate(moduleId => {
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const railButton = document.querySelector(`.vnext-module-rail [data-vnext-module="${moduleId}"]`);
    const filter = pageRoot?.querySelector('.vnext-filter-tags');
    const activeFilter = filter?.querySelector('button.active');
    const sectionHeader = pageRoot?.querySelector('.vnext-module-section>header');
    const kicker = sectionHeader?.querySelector(':scope>span');
    const title = sectionHeader?.querySelector(':scope>h2');
    const railStyle = railButton ? getComputedStyle(railButton) : null;
    const filterStyle = filter ? getComputedStyle(filter) : null;
    const activeFilterStyle = activeFilter ? getComputedStyle(activeFilter) : null;
    const headerStyle = sectionHeader ? getComputedStyle(sectionHeader) : null;
    const kickerRect = kicker?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    return {
      module: moduleId,
      rail: railButton ? {
        text: railButton.textContent.trim(),
        active: railButton.classList.contains('active'),
        current: railButton.getAttribute('aria-current'),
        color: railStyle?.color || '',
        background: railStyle?.backgroundColor || ''
      } : null,
      filter: filter ? {
        buttonCount: filter.querySelectorAll('button').length,
        clientWidth: filter.clientWidth,
        scrollWidth: filter.scrollWidth,
        scrollSnapType: filterStyle?.scrollSnapType || '',
        maskImage: filterStyle?.maskImage || filterStyle?.webkitMaskImage || '',
        activeText: activeFilter?.textContent.trim() || '',
        activeColor: activeFilterStyle?.color || '',
        activeBackground: activeFilterStyle?.backgroundColor || ''
      } : null,
      header: sectionHeader ? {
        direction: headerStyle?.flexDirection || '',
        align: headerStyle?.alignItems || '',
        kicker: kicker?.textContent.trim() || '',
        title: title?.textContent.trim() || '',
        kickerTop: kickerRect?.top ?? null,
        titleTop: titleRect?.top ?? null
      } : null
    };
  }, module);
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

  const evidence = { viewport, modules: {} };
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

    for (const module of moduleTargets) {
      await page.click(`.vnext-module-rail [data-vnext-module="${module}"]`);
      await page.waitForSelector(`.vnext-density-module-page[data-density-module="${module}"]`, { state: 'visible' });
      await sleep(100);

      rail = await railState(page);
      const active = rail.buttons.filter(row => row.visible && row.active).map(row => row.id);
      expect(rail.visible && rail.ia?.module === module, `${label}/${module}: business rail persists inside the domain module`, JSON.stringify(rail));
      expect(JSON.stringify(active) === JSON.stringify([module]), `${label}/${module}: exactly one domain is selected`, JSON.stringify(active));

      const state = await moduleState(page, module);
      evidence.modules[module] = state;
      expect(Boolean(state.rail?.active && state.rail?.current === 'page'), `${label}/${module}: active domain exposes selected semantics`, JSON.stringify(state.rail));
      expect(contrast(state.rail?.color, state.rail?.background) >= 4.5, `${label}/${module}: active rail label meets 4.5:1 contrast`, `${state.rail?.color} on ${state.rail?.background} = ${contrast(state.rail?.color, state.rail?.background).toFixed(2)}`);
      expect(Boolean(state.filter && state.filter.buttonCount >= 5), `${label}/${module}: shared horizontal filter strip is present`, JSON.stringify(state.filter));
      expect(state.filter?.scrollWidth > state.filter?.clientWidth + 4, `${label}/${module}: filter strip has genuine horizontal overflow to discover`, JSON.stringify(state.filter));
      expect(String(state.filter?.scrollSnapType).includes('x'), `${label}/${module}: filter strip uses horizontal scroll snap`, state.filter?.scrollSnapType || '');
      expect(state.filter?.maskImage && state.filter.maskImage !== 'none', `${label}/${module}: filter strip exposes a right-edge overflow affordance`, state.filter?.maskImage || '');
      expect(contrast(state.filter?.activeColor, state.filter?.activeBackground) >= 4.5, `${label}/${module}: active filter meets 4.5:1 contrast`, `${state.filter?.activeColor} on ${state.filter?.activeBackground} = ${contrast(state.filter?.activeColor, state.filter?.activeBackground).toFixed(2)}`);
      expect(state.header?.direction === 'column' && state.header?.align === 'flex-start', `${label}/${module}: section label and title use one stacked hierarchy`, JSON.stringify(state.header));
      expect(state.header?.kickerTop != null && state.header?.titleTop != null && state.header.kickerTop <= state.header.titleTop, `${label}/${module}: section kicker renders above title/count`, JSON.stringify(state.header));

      const overflow = await noOverflow(page);
      expect(Math.max(overflow.html, overflow.body, overflow.root) <= overflow.viewport + 1, `${label}/${module}: document horizontal overflow remains zero`, JSON.stringify(overflow));
      const short = await smallButtons(page);
      expect(short.length === 0, `${label}/${module}: visible touch targets remain >=44px high`, JSON.stringify(short));
      await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}.png`), fullPage: false });
    }

    await page.goBack();
    await page.waitForSelector('.vnext-density-module-page[data-density-module="products"]', { state: 'visible' });
    await page.goBack();
    await page.waitForSelector('.vnext-density-module-page[data-density-module="ads"]', { state: 'visible' });
    await page.goBack();
    await page.waitForSelector('[data-vnext-page="today"]', { state: 'visible' });
    await sleep(100);
    rail = await railState(page);
    expect(rail.visible && !rail.ia?.module && rail.ia?.primaryTab === 'today', `${label}: Browser Back traverses module history and restores Today`, JSON.stringify(rail));
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
