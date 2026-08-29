import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-three-fact');
fs.mkdirSync(artifactDir, { recursive: true });

const THREE_FACT_MODULES = ['charges', 'returns', 'history', 'data'];
const FOUR_FACT_CONTROLS = ['ads', 'finance'];
const WORKSPACE_CHILDREN = new Set(THREE_FACT_MODULES);
const failures = [];
const report = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
};
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);

function staticContract() {
  const css = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.css'), 'utf8');
  expect(
    css.includes('.vnext-module-facts:has(>span:nth-child(3):last-child)>span:last-child') &&
      css.includes('grid-column:1/-1'),
    'A1 static contract: exactly three module facts promote the final fact across the full row'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
}

async function openModule(page, module) {
  if (WORKSPACE_CHILDREN.has(module)) {
    await page.click('.vnext-module-rail [data-vnext-module="finance"]');
    await page.waitForSelector('.vnext-density-module-page[data-density-module="finance"] .vnext-workspace-grid', { state: 'visible', timeout: 4_000 });
    await page.click(`.vnext-density-module-page[data-density-module="finance"] [data-workspace-module="${module}"]`);
  } else {
    await page.click(`.vnext-module-rail [data-vnext-module="${module}"]`);
  }
  await page.waitForSelector(`.vnext-density-module-page[data-density-module="${module}"]`, { state: 'visible', timeout: 4_000 });
}

async function factState(page, module) {
  return page.evaluate(id => {
    const host = document.querySelector(`.vnext-density-module-page[data-density-module="${id}"] .vnext-module-facts`);
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const hostRect = host ? rect(host) : null;
    const children = host ? [...host.children].map(child => ({ ...rect(child), text: child.textContent.trim(), gridColumn: getComputedStyle(child).gridColumn })) : [];
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    return {
      module: id,
      host: hostRect,
      children,
      childCount: children.length,
      columns: host ? getComputedStyle(host).gridTemplateColumns : '',
      routeIdentity: density?.module || null,
      railIdentity: ia?.railModule || density?.railModule || null,
      documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      viewport: innerWidth
    };
  }, module);
}

function threeFactBalanced(state) {
  if (!state.host || state.children.length !== 3) return false;
  const [a, b, c] = state.children;
  const same = (x, y, tolerance = 2) => Math.abs(x - y) <= tolerance;
  return same(a.top, b.top) &&
    c.top > a.top + 4 &&
    same(c.left, state.host.left) &&
    same(c.right, state.host.right) &&
    c.width >= state.host.width - 2;
}

function fourFactPreserved(state) {
  if (!state.host || state.children.length !== 4) return false;
  const [a, b, c, d] = state.children;
  const same = (x, y, tolerance = 2) => Math.abs(x - y) <= tolerance;
  return same(a.top, b.top) && c.top > a.top + 4 && same(c.top, d.top) &&
    a.width < state.host.width * .6 && c.width < state.host.width * .6;
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
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', request => { if (request.url().includes('/api/')) requests.push({ method: request.method(), url: request.url() }); });

  const evidence = { viewport, threeFact: {}, fourFact: {} };
  try {
    await ready(page);

    for (const module of THREE_FACT_MODULES) {
      await openModule(page, module);
      const state = await factState(page, module);
      evidence.threeFact[module] = state;
      expect(state.routeIdentity === module && state.railIdentity === 'finance', `${label}/${module}: Workspace child keeps route identity under the grouped Workspace rail`, JSON.stringify(state));
      expect(state.childCount === 3, `${label}/${module}: module keeps exactly three source facts`, JSON.stringify(state));
      expect(threeFactBalanced(state), `${label}/${module}: third fact fills the second row with no fake fourth quadrant`, JSON.stringify(state));
      expect(state.documentOverflow <= 1, `${label}/${module}: balanced fact grid creates no document overflow`, `overflow=${state.documentOverflow}`);
      if (module === 'history' || module === 'data') {
        await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}.png`), fullPage: false });
      }
    }

    for (const module of FOUR_FACT_CONTROLS) {
      await openModule(page, module);
      const state = await factState(page, module);
      evidence.fourFact[module] = state;
      expect(state.routeIdentity === module && state.railIdentity === module, `${label}/${module}: first-class domain keeps matching route and rail identity`, JSON.stringify(state));
      expect(state.childCount === 4, `${label}/${module}: four-fact control preserves all facts`, JSON.stringify(state));
      expect(fourFactPreserved(state), `${label}/${module}: four-fact control remains a true 2x2 grid`, JSON.stringify(state));
      expect(state.documentOverflow <= 1, `${label}/${module}: four-fact control creates no document overflow`, `overflow=${state.documentOverflow}`);
    }

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: three-fact acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: three-fact acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 three-fact acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 three-fact acceptance passed.');
