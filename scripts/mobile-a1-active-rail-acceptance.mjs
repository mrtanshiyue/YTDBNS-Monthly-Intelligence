import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-active-rail');
fs.mkdirSync(artifactDir, { recursive: true });

const MODULES = ['ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data'];
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
  const source = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.js'), 'utf8');
  expect(
    source.includes('function revealControl(scroller, control, edge = 4)') &&
      source.includes('function revealActiveDomain(rail, module)') &&
      source.includes('lastRevealedRail') &&
      source.includes('revealControl(rail, button)') &&
      source.includes('scroller.scrollLeft = Math.max(0, Math.min(maxScroll'),
    'A1 static contract: IA owns deterministic active-domain rail reveal through bounded shared scroller geometry'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
}

async function openModule(page, module) {
  await page.evaluate(id => {
    const button = document.querySelector(`.vnext-module-rail [data-vnext-module="${id}"]`);
    if (!button) throw new Error(`Missing module button: ${id}`);
    button.click();
  }, module);
  await page.waitForSelector(`.vnext-density-module-page[data-density-module="${module}"]`, { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(id => {
    const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
    const button = rail?.querySelector(`[data-vnext-module="${id}"]`);
    if (!rail || !button || !button.classList.contains('active') || button.getAttribute('aria-current') !== 'page') return false;
    const railRect = rail.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return buttonRect.left >= railRect.left + 3 && buttonRect.right <= railRect.right - 3;
  }, module, { timeout: 4_000 });
}

async function railState(page, module) {
  return page.evaluate(id => {
    const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
    const button = rail?.querySelector(`[data-vnext-module="${id}"]`);
    const railRect = rail?.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    return {
      module: id,
      exists: Boolean(rail && button && railRect && buttonRect),
      selected: Boolean(button?.classList.contains('active') && button?.getAttribute('aria-current') === 'page'),
      visible: Boolean(railRect && buttonRect && buttonRect.left >= railRect.left + 3 && buttonRect.right <= railRect.right - 3),
      railLeft: railRect?.left ?? null,
      railRight: railRect?.right ?? null,
      buttonLeft: buttonRect?.left ?? null,
      buttonRight: buttonRect?.right ?? null,
      scrollLeft: rail?.scrollLeft ?? null,
      scrollWidth: rail?.scrollWidth ?? null,
      clientWidth: rail?.clientWidth ?? null,
      documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      scrollY
    };
  }, module);
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

    for (const module of MODULES) {
      await openModule(page, module);
      const state = await railState(page, module);
      evidence.modules[module] = state;
      expect(state.exists && state.selected, `${label}/${module}: active business-module semantics remain correct`, JSON.stringify(state));
      expect(state.visible, `${label}/${module}: active business-module control is visible after rail rerender`, JSON.stringify(state));
      expect(state.scrollWidth > state.clientWidth, `${label}/${module}: business rail remains horizontally browseable`, JSON.stringify(state));
      expect(state.documentOverflow <= 1, `${label}/${module}: active-rail reveal does not create document overflow`, JSON.stringify(state));
      expect(state.scrollY <= 2, `${label}/${module}: module navigation remains settled at page top`, `scrollY=${state.scrollY}`);
      if (module === 'history' || module === 'data') {
        await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}.png`), fullPage: false });
      }
    }

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await page.waitForSelector('.vnext-density-module-page[data-density-module="history"]', { state: 'visible', timeout: 4_000 });
    await page.waitForFunction(() => {
      const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
      const button = rail?.querySelector('[data-vnext-module="history"]');
      if (!rail || !button) return false;
      const rr = rail.getBoundingClientRect();
      const br = button.getBoundingClientRect();
      return button.classList.contains('active') && br.left >= rr.left + 3 && br.right <= rr.right - 3;
    }, null, { timeout: 4_000 });
    const backState = await railState(page, 'history');
    evidence.popstateHistory = backState;
    expect(backState.selected && backState.visible, `${label}/history: browser Back restores visible active-domain context`, JSON.stringify(backState));

    await openModule(page, 'ads');
    const returnLeft = await railState(page, 'ads');
    evidence.returnLeft = returnLeft;
    expect(returnLeft.visible && returnLeft.scrollLeft <= 4, `${label}/ads: returning to first domain restores the rail to its left edge`, JSON.stringify(returnLeft));

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: active-rail acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));

    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: active-rail acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 active-rail acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 active-rail acceptance passed.');
