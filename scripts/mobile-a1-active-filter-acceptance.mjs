import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-active-filter');
fs.mkdirSync(artifactDir, { recursive: true });

const CASES = [
  ['ads', 'highSpend'],
  ['products', 'top'],
  ['inventory', 'highCapital']
];
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
  const ia = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.js'), 'utf8');
  expect(
    ia.includes('function revealActiveFilter(module)') &&
      ia.includes('[data-density-filter=') &&
      ia.includes('FILTER_MODULE_SET') &&
      ia.includes('revealControl(filterRail, button'),
    'A1 static contract: IA layer reveals the active filter in its own horizontal scroller'
  );
  expect(
    ia.includes('function syncFilterSemantics(module)') &&
      ia.includes("button.setAttribute('aria-pressed'") &&
      ia.includes('syncFilterSemantics(module);'),
    'A1 static contract: IA layer exposes filter selection through aria-pressed semantics'
  );
  expect(
    ia.includes('function rerenderFocusTarget(event)') &&
      ia.includes('function restoreRerenderedFocus(target)') &&
      ia.includes("kind: 'filter'") &&
      ia.includes('replacement.focus({ preventScroll: true })'),
    'A1 static contract: synthesized filter activation restores focus to the replacement filter without document scrolling'
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
    const state = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const buttons = [...document.querySelectorAll(`.vnext-density-module-page[data-density-module="${id}"] .vnext-filter-tags [data-density-filter]`)];
    return state?.module === id && buttons.length > 0 && buttons.filter(button => button.getAttribute('aria-pressed') === 'true').length === 1;
  }, module, { timeout: 4_000 });
}

async function selectFilter(page, module, filter) {
  await page.evaluate(({ moduleId, filterId }) => {
    const rail = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"] .vnext-filter-tags`);
    const button = rail?.querySelector(`[data-density-filter="${filterId}"]`);
    if (!rail || !button) throw new Error(`Missing filter ${moduleId}/${filterId}`);
    rail.scrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    button.click();
  }, { moduleId: module, filterId: filter });
  await page.waitForFunction(({ moduleId, filterId }) => {
    const state = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const buttons = [...(pageRoot?.querySelectorAll('.vnext-filter-tags [data-density-filter]') || [])];
    const active = pageRoot?.querySelector('.vnext-filter-tags [data-density-filter].active');
    const pressed = buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
    return state?.module === moduleId &&
      state?.filters?.[moduleId] === filterId &&
      active?.dataset.densityFilter === filterId &&
      pressed.length === 1 &&
      pressed[0]?.dataset.densityFilter === filterId;
  }, { moduleId: module, filterId: filter }, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function filterState(page, module) {
  return page.evaluate(moduleId => {
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const rail = pageRoot?.querySelector('.vnext-filter-tags');
    const buttons = [...(rail?.querySelectorAll('[data-density-filter]') || [])];
    const active = rail?.querySelector('[data-density-filter].active');
    if (!rail || !active) return null;
    const railRect = rail.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const pressed = buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
    return {
      module: moduleId,
      filter: active.dataset.densityFilter,
      scrollLeft: rail.scrollLeft,
      maxScroll: Math.max(0, rail.scrollWidth - rail.clientWidth),
      railLeft: railRect.left,
      railRight: railRect.right,
      activeLeft: activeRect.left,
      activeRight: activeRect.right,
      fullyVisible: activeRect.left >= railRect.left - 1 && activeRect.right <= railRect.right + 1,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      iaFilter: window.YT_MOBILE_VNEXT_IA?.getState?.().filter || null,
      visualActiveCount: buttons.filter(button => button.classList.contains('active')).length,
      pressedCount: pressed.length,
      pressedFilter: pressed[0]?.dataset.densityFilter || null,
      activePressed: active.getAttribute('aria-pressed'),
      allButtonsHavePressedState: buttons.every(button => ['true', 'false'].includes(button.getAttribute('aria-pressed')))
    };
  }, module);
}

async function selectAll(page, module) {
  await page.evaluate(moduleId => {
    const button = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"] [data-density-filter="all"]`);
    if (!button) throw new Error(`Missing all filter: ${moduleId}`);
    button.click();
  }, module);
  await page.waitForFunction(moduleId => {
    const state = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const buttons = [...(pageRoot?.querySelectorAll('.vnext-filter-tags [data-density-filter]') || [])];
    const active = pageRoot?.querySelector('.vnext-filter-tags [data-density-filter].active');
    const pressed = buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
    return state?.filters?.[moduleId] === 'all' &&
      active?.dataset.densityFilter === 'all' &&
      pressed.length === 1 &&
      pressed[0]?.dataset.densityFilter === 'all';
  }, module, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

function expectSelectionSemantics(state, expectedFilter, label) {
  expect(
    state?.visualActiveCount === 1 &&
      state?.pressedCount === 1 &&
      state?.filter === expectedFilter &&
      state?.pressedFilter === expectedFilter &&
      state?.activePressed === 'true' &&
      state?.allButtonsHavePressedState,
    `${label}: visual active and aria-pressed expose one identical selected filter`,
    JSON.stringify(state)
  );
}

async function keyboardFilterFocusScenario(page, label) {
  await openModule(page, 'products');
  await selectAll(page, 'products');
  await page.focus('.vnext-density-module-page[data-density-module="products"] [data-density-filter="top"]');
  const before = await page.evaluate(() => ({
    filter: document.activeElement?.dataset?.densityFilter || null,
    module: document.activeElement?.dataset?.densityFilterModule || null,
    connected: Boolean(document.activeElement?.isConnected),
    scrollY
  }));
  expect(before.filter === 'top' && before.module === 'products' && before.connected, `${label}/keyboard-filter: Top 20% owns focus before activation`, JSON.stringify(before));

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const state = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const active = document.activeElement;
    return state?.module === 'products' &&
      state?.filters?.products === 'top' &&
      active?.dataset?.densityFilterModule === 'products' &&
      active?.dataset?.densityFilter === 'top' &&
      active?.isConnected &&
      active?.classList.contains('active') &&
      active?.getAttribute('aria-pressed') === 'true';
  }, null, { timeout: 4_000 });

  const after = await page.evaluate(() => ({
    filter: document.activeElement?.dataset?.densityFilter || null,
    module: document.activeElement?.dataset?.densityFilterModule || null,
    connected: Boolean(document.activeElement?.isConnected),
    selected: Boolean(document.activeElement?.classList?.contains('active') && document.activeElement?.getAttribute?.('aria-pressed') === 'true'),
    scrollY
  }));
  expect(after.filter === 'top' && after.module === 'products' && after.connected && after.selected, `${label}/keyboard-filter: focus moves to the replacement Top 20% filter after force rerender`, JSON.stringify(after));
  expect(after.scrollY <= 2, `${label}/keyboard-filter: filter focus restoration does not move the document`, JSON.stringify(after));
  return { before, after };
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

  const evidence = { viewport, cases: {} };
  try {
    await ready(page);

    for (const [module, farFilter] of CASES) {
      await openModule(page, module);
      const initial = await filterState(page, module);
      evidence.cases[`${module}:initial`] = initial;
      expectSelectionSemantics(initial, initial?.filter, `${label}/${module}/initial`);

      await selectFilter(page, module, farFilter);
      const far = await filterState(page, module);
      evidence.cases[`${module}:${farFilter}`] = far;
      expect(Boolean(far), `${label}/${module}: active filter state is measurable`, JSON.stringify(far));
      expect(far?.filter === farFilter && far?.iaFilter === farFilter, `${label}/${module}: density and IA state agree on the selected far filter`, JSON.stringify(far));
      expectSelectionSemantics(far, farFilter, `${label}/${module}/${farFilter}`);
      expect(far?.fullyVisible, `${label}/${module}: selected far-right filter remains fully visible after force rerender`, JSON.stringify(far));
      expect(far?.maxScroll > 0 && far?.scrollLeft > 0, `${label}/${module}: far-right selection restores horizontal filter context instead of resetting to zero`, JSON.stringify(far));
      expect(far?.documentWidth <= far?.viewport + 1, `${label}/${module}: filter reveal does not create document horizontal overflow`, JSON.stringify(far));

      if (module === 'products' || module === 'inventory') {
        await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}-${farFilter}.png`), fullPage: false });
      }

      await selectAll(page, module);
      const all = await filterState(page, module);
      evidence.cases[`${module}:all`] = all;
      expect(all?.filter === 'all' && all?.iaFilter === 'all', `${label}/${module}: returning to All restores left filter state`, JSON.stringify(all));
      expectSelectionSemantics(all, 'all', `${label}/${module}/all`);
      expect(all?.fullyVisible && all?.scrollLeft <= 1, `${label}/${module}: All is visible at the left edge after rerender`, JSON.stringify(all));
    }

    evidence.keyboardFilterFocus = await keyboardFilterFocusScenario(page, label);

    /* Persisted filter context must also survive leaving the module and coming back to a newly rendered filter rail. */
    await openModule(page, 'inventory');
    await openModule(page, 'products');
    const restored = await filterState(page, 'products');
    evidence.restoredProducts = restored;
    expect(restored?.filter === 'top' && restored?.fullyVisible && restored?.scrollLeft > 0, `${label}/products: module return restores the persisted active filter into view`, JSON.stringify(restored));
    expectSelectionSemantics(restored, 'top', `${label}/products/restored`);

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: active-filter acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: active-filter acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 active-filter acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 active-filter acceptance passed.');
