import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a3-operator-context');
fs.mkdirSync(artifactDir, { recursive: true });

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
    ia.includes("const OPERATOR_CONTEXT_KEY = 'ytdbnsMobileOperatorContextV1'") &&
      ia.includes('function persistOperatorContext(event)') &&
      ia.includes('function restoreOperatorContext(module)') &&
      ia.includes('history.replaceState(nextState, document.title)') &&
      ia.includes('history.state?.[OPERATOR_CONTEXT_KEY]'),
    'A3 static contract: filter/sort operator context is stored only in existing history.state'
  );
  expect(
    !ia.includes('localStorage.') && !ia.includes('sessionStorage.'),
    'A3 static contract: operator context introduces no browser storage dependency'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
}

async function waitReadyAfterReload(page) {
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
}

async function openModule(page, module) {
  await page.evaluate(id => {
    const button = document.querySelector(`.vnext-module-rail [data-vnext-module="${id}"]`);
    if (!button) throw new Error(`Missing module button: ${id}`);
    button.click();
  }, module);
  await page.waitForSelector(`.vnext-density-module-page[data-density-module="${module}"]`, { state: 'visible', timeout: 4_000 });
}

async function selectControl(page, module, kind, value) {
  const attr = kind === 'filter' ? 'data-density-filter' : 'data-density-sort';
  await page.evaluate(({ moduleId, attrName, valueId }) => {
    const button = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"] [${attrName}="${valueId}"]`);
    if (!button) throw new Error(`Missing ${attrName} ${moduleId}/${valueId}`);
    button.click();
  }, { moduleId: module, attrName: attr, valueId: value });
  await page.waitForFunction(({ moduleId, kindName, valueId }) => {
    const state = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    return kindName === 'filter'
      ? state?.filters?.[moduleId] === valueId
      : state?.sorts?.[moduleId] === valueId;
  }, { moduleId: module, kindName: kind, valueId: value }, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function waitContext(page, module, filter, sort) {
  await page.waitForFunction(({ moduleId, filterId, sortId }) => {
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const activeFilter = pageRoot?.querySelector(`[data-density-filter="${filterId}"]`);
    const activeSort = pageRoot?.querySelector(`[data-density-sort="${sortId}"]`);
    return density?.module === moduleId &&
      density?.filters?.[moduleId] === filterId &&
      density?.sorts?.[moduleId] === sortId &&
      ia?.filter === filterId &&
      ia?.sort === sortId &&
      activeFilter?.getAttribute('aria-pressed') === 'true' &&
      activeSort?.getAttribute('aria-pressed') === 'true';
  }, { moduleId: module, filterId: filter, sortId: sort }, { timeout: 6_000 });
}

async function snapshot(page, module) {
  return page.evaluate(moduleId => {
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    const context = history.state?.ytdbnsMobileOperatorContextV1 || null;
    const buttons = [...(pageRoot?.querySelectorAll('button') || [])].filter(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      module: density?.module || null,
      filter: density?.filters?.[moduleId] || null,
      sort: density?.sorts?.[moduleId] || null,
      iaFilter: ia?.filter || null,
      iaSort: ia?.sort || null,
      historyContext: context,
      pressedFilter: pageRoot?.querySelector('[data-density-filter][aria-pressed="true"]')?.dataset.densityFilter || null,
      pressedSort: pageRoot?.querySelector('[data-density-sort][aria-pressed="true"]')?.dataset.densitySort || null,
      recordIds: [...(pageRoot?.querySelectorAll('.vnext-dense-record[data-density-detail-id]') || [])].map(row => String(row.dataset.densityDetailId)),
      minButtonHeight: buttons.length ? Math.min(...buttons.map(button => button.getBoundingClientRect().height)) : null,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      scrollY
    };
  }, module);
}

function expectContext(state, module, filter, sort, label) {
  expect(state?.module === module, `${label}: business module identity is restored`, JSON.stringify(state));
  expect(
    state?.filter === filter && state?.iaFilter === filter && state?.pressedFilter === filter,
    `${label}: filter state, IA state, and aria-pressed restore identically`,
    JSON.stringify(state)
  );
  expect(
    state?.sort === sort && state?.iaSort === sort && state?.pressedSort === sort,
    `${label}: sort state, IA state, and aria-pressed restore identically`,
    JSON.stringify(state)
  );
  expect(
    state?.historyContext?.filters?.[module] === filter && state?.historyContext?.sorts?.[module] === sort,
    `${label}: history entry owns the selected operator context`,
    JSON.stringify(state?.historyContext)
  );
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: context restoration creates no document horizontal overflow`, JSON.stringify(state));
  expect(state?.scrollY <= 2, `${label}: context restoration leaves the route at the top`, JSON.stringify(state));
  expect(state?.minButtonHeight == null || state.minButtonHeight >= 43.5, `${label}: visible controls retain the 44px touch floor`, String(state?.minButtonHeight));
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

  const evidence = { viewport };
  try {
    await ready(page);

    await openModule(page, 'products');
    await selectControl(page, 'products', 'filter', 'buyBox');
    await selectControl(page, 'products', 'sort', 'buyBoxAsc');
    await waitContext(page, 'products', 'buyBox', 'buyBoxAsc');
    evidence.productsBeforeReload = await snapshot(page, 'products');
    expectContext(evidence.productsBeforeReload, 'products', 'buyBox', 'buyBoxAsc', `${label}/products/before-reload`);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await waitReadyAfterReload(page);
    await waitContext(page, 'products', 'buyBox', 'buyBoxAsc');
    evidence.productsAfterReload = await snapshot(page, 'products');
    expectContext(evidence.productsAfterReload, 'products', 'buyBox', 'buyBoxAsc', `${label}/products/after-reload`);
    expect(
      JSON.stringify(evidence.productsAfterReload.recordIds) === JSON.stringify(evidence.productsBeforeReload.recordIds),
      `${label}/products/after-reload: rendered record priority survives reload exactly`,
      JSON.stringify({ before: evidence.productsBeforeReload.recordIds, after: evidence.productsAfterReload.recordIds })
    );

    await openModule(page, 'inventory');
    await selectControl(page, 'inventory', 'filter', 'lowStock');
    await selectControl(page, 'inventory', 'sort', 'fulfillableAsc');
    await waitContext(page, 'inventory', 'lowStock', 'fulfillableAsc');
    evidence.inventoryForward = await snapshot(page, 'inventory');
    expectContext(evidence.inventoryForward, 'inventory', 'lowStock', 'fulfillableAsc', `${label}/inventory/forward-entry`);

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await waitContext(page, 'products', 'buyBox', 'buyBoxAsc');
    evidence.productsAfterBack = await snapshot(page, 'products');
    expectContext(evidence.productsAfterBack, 'products', 'buyBox', 'buyBoxAsc', `${label}/products/browser-back`);

    await page.goForward({ waitUntil: 'load' }).catch(() => null);
    await waitContext(page, 'inventory', 'lowStock', 'fulfillableAsc');
    evidence.inventoryAfterForward = await snapshot(page, 'inventory');
    expectContext(evidence.inventoryAfterForward, 'inventory', 'lowStock', 'fulfillableAsc', `${label}/inventory/browser-forward`);

    await page.screenshot({ path: path.join(artifactDir, `operator-context-${label}.png`), fullPage: true });
  } catch (error) {
    fail(`${label}: A3 operator-context acceptance completed`, error.stack || error.message || String(error));
  } finally {
    expect(requests.every(request => request.method === 'GET'), `${label}: Mobile API activity remains GET-only`, JSON.stringify(requests.filter(request => request.method !== 'GET')));
    expect(pageErrors.length === 0, `${label}: zero page errors`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: zero console errors`, JSON.stringify(consoleErrors));
    evidence.requests = requests;
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    report.push(evidence);
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
  await runViewport(viewport);
}

fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} A3 operator-context acceptance failure(s)`);
  process.exit(1);
}
console.log('\nMobile A3 operator-context acceptance PASS');
