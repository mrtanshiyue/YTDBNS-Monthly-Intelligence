import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-narrow');
fs.mkdirSync(artifactDir, { recursive: true });

const failures = [];
const report = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
};
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);

function staticContract() {
  const iaCss = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.css'), 'utf8');
  const legacyCss = fs.readFileSync(path.join(root, 'public', 'mobile', 'v51-mobile.css'), 'utf8');

  expect(
    iaCss.includes('@media (max-width:390px)') &&
      iaCss.includes('#mobileAppRoot .vnext-density-module-page .vnext-module-hero') &&
      iaCss.includes('grid-template-columns:minmax(0,1fr)') &&
      iaCss.includes('#mobileAppRoot .vnext-density-module-page .vnext-module-facts') &&
      iaCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),
    'A1 static contract: current vNext narrow module hero is one column with two-column facts'
  );

  expect(
    legacyCss.includes('body.v5-native-mobile .v5-record-metrics') &&
      legacyCss.includes('body.v5-native-mobile .v5-history-metrics') &&
      legacyCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),
    'A1 static contract: legacy record/history narrow two-column safeguards remain present'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
  await sleep(100);
}

async function scrollDown(page) {
  return page.evaluate(() => {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    window.scrollTo(0, Math.min(620, max));
    return { max, y: scrollY };
  });
}

async function moduleLayout(page, module) {
  return page.evaluate(moduleId => {
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const hero = pageRoot?.querySelector('.vnext-module-hero');
    const facts = pageRoot?.querySelector('.vnext-module-facts');
    const heroStyle = hero ? getComputedStyle(hero) : null;
    const factStyle = facts ? getComputedStyle(facts) : null;
    const factRects = facts ? [...facts.children].map(item => {
      const rect = item.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height, text: item.textContent.trim() };
    }) : [];
    const railButton = document.querySelector(`.vnext-module-rail [data-vnext-module="${moduleId}"]`);
    return {
      exists: Boolean(pageRoot && hero && facts),
      heroColumns: heroStyle?.gridTemplateColumns || '',
      factColumns: factStyle?.gridTemplateColumns || '',
      factCount: factRects.length,
      factRects,
      selected: Boolean(railButton?.classList.contains('active') && railButton?.getAttribute('aria-current') === 'page'),
      scrollY,
      viewport: innerWidth,
      overflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
        document.getElementById('mobileAppRoot')?.scrollWidth || 0
      )
    };
  }, module);
}

function columnCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function twoRowFacts(state) {
  if (state.factRects.length < 3) return false;
  const [a, b, c, d] = state.factRects;
  const same = (x, y) => Math.abs(x - y) <= 1.5;
  const firstRow = same(a.top, b.top);
  const nextRow = c.top > a.top + 4;
  const secondRow = !d || same(c.top, d.top);
  const sameColumns = same(a.left, c.left);
  return firstRow && nextRow && secondRow && sameColumns;
}

async function visibleSmallButtons(page) {
  return page.evaluate(() => [...document.querySelectorAll('#mobileAppRoot button')].filter(button => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.height < 43.5;
  }).slice(0, 12).map(button => ({
    text: button.textContent.trim().slice(0, 50),
    height: button.getBoundingClientRect().height,
    className: button.className
  })));
}

async function runViewport(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const label = `${viewport.width}x${viewport.height}`;
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  page.on('pageerror', error => pageErrors.push(error.message || String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', request => {
    if (request.url().includes('/api/')) requests.push({ method: request.method(), url: request.url() });
  });

  const evidence = { viewport, modules: {} };
  try {
    await ready(page);

    const modules = [
      ['ads', 4],
      ['products', 4],
      ['inventory', 4],
      ['history', 3]
    ];

    for (const [module, expectedFacts] of modules) {
      const before = await scrollDown(page);
      expect(before.max > 40 && before.y > 20, `${label}/${module}: source route can scroll before navigation`, JSON.stringify(before));

      await page.click(`.vnext-module-rail [data-vnext-module="${module}"]`);
      await page.waitForSelector(`.vnext-density-module-page[data-density-module="${module}"]`, { state: 'visible' });
      await sleep(100);

      const state = await moduleLayout(page, module);
      evidence.modules[module] = state;
      expect(state.exists && state.selected, `${label}/${module}: module renders and selected-domain semantics are intact`, JSON.stringify(state));
      expect(state.scrollY <= 2, `${label}/${module}: business-route navigation resets scroll to the top`, `scrollY=${state.scrollY}`);
      expect(columnCount(state.heroColumns) === 1, `${label}/${module}: <=390px module hero is one column`, state.heroColumns);
      expect(columnCount(state.factColumns) === 2, `${label}/${module}: <=390px module facts render exactly two columns`, state.factColumns);
      expect(state.factCount === expectedFacts, `${label}/${module}: module preserves all fact cells`, `expected=${expectedFacts} actual=${state.factCount}`);
      expect(twoRowFacts(state), `${label}/${module}: fact cells wrap into readable two-column rows`, JSON.stringify(state.factRects));
      expect(state.overflow <= state.viewport + 1, `${label}/${module}: document horizontal overflow remains zero`, `overflow=${state.overflow} viewport=${state.viewport}`);

      const short = await visibleSmallButtons(page);
      expect(short.length === 0, `${label}/${module}: visible touch targets remain >=44px high`, JSON.stringify(short));

      await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}.png`), fullPage: false });
    }

    const beforePrimary = await scrollDown(page);
    expect(beforePrimary.max > 40 && beforePrimary.y > 20, `${label}/alerts: history route can scroll before primary navigation`, JSON.stringify(beforePrimary));
    await page.click('[data-vnext-tab="alerts"]');
    await page.waitForSelector('[data-vnext-page="alerts"]', { state: 'visible' });
    await sleep(80);
    const primaryScroll = await page.evaluate(() => scrollY);
    expect(primaryScroll <= 2, `${label}/alerts: primary-route navigation resets scroll to the top`, `scrollY=${primaryScroll}`);

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: Mobile API traffic remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));

    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: narrow-screen acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 narrow-screen acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 narrow-screen acceptance passed.');
