import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a3-period-history');
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
  const bridge = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-app-bridge.js'), 'utf8');
  expect(
    bridge.includes("const VNEXT_HISTORY_KEY = 'ytdbnsMobileVnext'") &&
      bridge.includes('function enrichVnextHistoryState(candidate)') &&
      bridge.includes('history.pushState = function mobilePeriodPushState') &&
      bridge.includes('history.replaceState = function mobilePeriodReplaceState') &&
      bridge.includes('function persistRuntimeRange(next') &&
      bridge.includes('rangeFromState(event.state)'),
    'A3 period-history static contract: every Mobile vNext history entry carries its period range'
  );
  expect(
    bridge.includes('pendingPeriodSelection') &&
      bridge.includes("payload.sheet === 'period'") &&
      bridge.includes('runtime.setRange(target.from, target.to)') &&
      bridge.includes('getPeriodContext()'),
    'A3 period-history static contract: period-sheet selection and history restoration are coordinated without changing the shared runtime API'
  );
  expect(
    !bridge.includes('localStorage.') && !bridge.includes('sessionStorage.'),
    'A3 period-history static contract: no browser storage dependency is introduced'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
  await page.waitForFunction(() => {
    const state = window.YT_SHARED_RUNTIME?.getState?.();
    const context = window.YT_MOBILE_APP?.getPeriodContext?.();
    return ['live', 'demo'].includes(state?.mode) && state?.from && state?.to && context?.history?.from === state.from && context?.history?.to === state.to;
  }, null, { timeout: 12_000 });
}

async function waitReadyAfterReload(page) {
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
  await page.waitForFunction(id => window.YT_MOBILE_VNEXT_DENSITY?.getState?.()?.module === id, module, { timeout: 4_000 });
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

async function currentMonth(page) {
  return page.evaluate(() => window.YT_SHARED_RUNTIME?.getState?.()?.from?.slice(0, 7) || null);
}

async function availableAlternateMonths(page, excluded = []) {
  await page.evaluate(() => {
    const trigger = document.querySelector('.vnext-toolbar [data-vnext-period], .vnext-search-toolbar [data-vnext-period]');
    if (!trigger) throw new Error('Missing period trigger');
    trigger.click();
  });
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'visible', timeout: 4_000 });
  const result = await page.evaluate(excludedMonths => {
    const current = window.YT_SHARED_RUNTIME?.getState?.()?.from?.slice(0, 7);
    return [...document.querySelectorAll('.vnext-sheet [data-vnext-period-month]')]
      .map(button => button.dataset.vnextPeriodMonth)
      .filter(month => month && month !== current && !excludedMonths.includes(month));
  }, excluded);
  return result;
}

async function closePeriodSheet(page) {
  const open = await page.locator('.vnext-sheet[role="dialog"]').count();
  if (!open) return;
  await page.evaluate(() => document.querySelector('.vnext-sheet [data-vnext-close-sheet]')?.click());
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'detached', timeout: 4_000 });
}

async function selectMonth(page, month) {
  const sheetOpen = await page.locator('.vnext-sheet[role="dialog"]').count();
  if (!sheetOpen) {
    await page.evaluate(() => {
      const trigger = document.querySelector('.vnext-toolbar [data-vnext-period], .vnext-search-toolbar [data-vnext-period]');
      if (!trigger) throw new Error('Missing period trigger');
      trigger.click();
    });
    await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'visible', timeout: 4_000 });
  }

  await page.evaluate(targetMonth => {
    const button = document.querySelector(`.vnext-sheet [data-vnext-period-month="${targetMonth}"]`);
    if (!button) throw new Error(`Missing period month: ${targetMonth}`);
    button.click();
  }, month);

  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'detached', timeout: 4_000 });
  await page.waitForFunction(targetMonth => {
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    const context = window.YT_MOBILE_APP?.getPeriodContext?.();
    const expectedFrom = window.YT_SHARED_RUNTIME?.helpers?.monthStart?.(targetMonth);
    const expectedTo = window.YT_SHARED_RUNTIME?.helpers?.monthEnd?.(targetMonth);
    return runtime?.from === expectedFrom && runtime?.to === expectedTo &&
      context?.history?.from === expectedFrom && context?.history?.to === expectedTo &&
      context?.runtime?.from === expectedFrom && context?.runtime?.to === expectedTo &&
      context?.pendingSelection === false;
  }, month, { timeout: 10_000 });
  await page.waitForTimeout(100);
}

async function snapshot(page, module) {
  return page.evaluate(moduleId => {
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    const periodContext = window.YT_MOBILE_APP?.getPeriodContext?.();
    const historyPayload = history.state?.ytdbnsMobileVnext || null;
    const operator = history.state?.ytdbnsMobileOperatorContextV1 || null;
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
    const filterRail = pageRoot?.querySelector('.vnext-filter-tags');
    const sortRail = pageRoot?.querySelector('.vnext-sort-tags');
    const touchTargets = [
      ...document.querySelectorAll('.vnext-module-rail[data-vnext-ia="domain"] [data-vnext-module]:not([hidden])'),
      ...(filterRail?.querySelectorAll('[data-density-filter]') || []),
      ...(sortRail?.querySelectorAll('[data-density-sort]') || [])
    ].filter(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      module: density?.module || null,
      filter: density?.filters?.[moduleId] || null,
      sort: density?.sorts?.[moduleId] || null,
      iaFilter: ia?.filter || null,
      iaSort: ia?.sort || null,
      runtimeFrom: runtime?.from || null,
      runtimeTo: runtime?.to || null,
      historyFrom: historyPayload?.from || null,
      historyTo: historyPayload?.to || null,
      historyTab: historyPayload?.tab || null,
      historySheet: historyPayload?.sheet || null,
      periodContext,
      operator,
      pressedFilter: pageRoot?.querySelector('[data-density-filter][aria-pressed="true"]')?.dataset.densityFilter || null,
      pressedSort: pageRoot?.querySelector('[data-density-sort][aria-pressed="true"]')?.dataset.densitySort || null,
      activeRail: rail?.querySelector('[data-vnext-module].active')?.dataset.vnextModule || null,
      touchHeights: touchTargets.map(button => button.getBoundingClientRect().height),
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      scrollY
    };
  }, module);
}

function expectCombined(state, { module, month, filter, sort }, label) {
  const expectedFrom = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const expectedTo = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  expect(state?.module === module && state?.activeRail === module, `${label}: business module and active rail restore together`, JSON.stringify(state));
  expect(
    state?.filter === filter && state?.iaFilter === filter && state?.pressedFilter === filter,
    `${label}: filter state, IA state, and aria-pressed remain identical`,
    JSON.stringify(state)
  );
  expect(
    state?.sort === sort && state?.iaSort === sort && state?.pressedSort === sort,
    `${label}: sort state, IA state, and aria-pressed remain identical`,
    JSON.stringify(state)
  );
  expect(
    state?.runtimeFrom === expectedFrom && state?.runtimeTo === expectedTo &&
      state?.historyFrom === expectedFrom && state?.historyTo === expectedTo &&
      state?.periodContext?.history?.from === expectedFrom && state?.periodContext?.history?.to === expectedTo &&
      state?.periodContext?.runtime?.from === expectedFrom && state?.periodContext?.runtime?.to === expectedTo,
    `${label}: runtime and Browser History expose the same exact period`,
    JSON.stringify(state)
  );
  expect(
    state?.operator?.filters?.[module] === filter && state?.operator?.sorts?.[module] === sort,
    `${label}: operator context remains owned by the same history entry`,
    JSON.stringify(state?.operator)
  );
  expect(state?.historySheet == null, `${label}: restored working state is not a transient period-sheet entry`, JSON.stringify(state));
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: combined history restoration creates no document horizontal overflow`, JSON.stringify(state));
  expect(state?.scrollY <= 2, `${label}: restored route settles at the top`, JSON.stringify(state));
  expect(state?.touchHeights?.length > 0 && state.touchHeights.every(height => height >= 43.5), `${label}: operational controls retain the 44px touch floor`, JSON.stringify(state?.touchHeights));
}

async function waitCombined(page, expected) {
  await page.waitForFunction(({ module, month, filter, sort }) => {
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    const context = window.YT_MOBILE_APP?.getPeriodContext?.();
    const historyPayload = history.state?.ytdbnsMobileVnext;
    const expectedFrom = window.YT_SHARED_RUNTIME?.helpers?.monthStart?.(month);
    const expectedTo = window.YT_SHARED_RUNTIME?.helpers?.monthEnd?.(month);
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${module}"]`);
    return density?.module === module &&
      density?.filters?.[module] === filter &&
      density?.sorts?.[module] === sort &&
      ia?.filter === filter && ia?.sort === sort &&
      runtime?.from === expectedFrom && runtime?.to === expectedTo &&
      historyPayload?.from === expectedFrom && historyPayload?.to === expectedTo &&
      context?.history?.from === expectedFrom && context?.history?.to === expectedTo &&
      context?.runtime?.from === expectedFrom && context?.runtime?.to === expectedTo &&
      pageRoot?.querySelector(`[data-density-filter="${filter}"]`)?.getAttribute('aria-pressed') === 'true' &&
      pageRoot?.querySelector(`[data-density-sort="${sort}"]`)?.getAttribute('aria-pressed') === 'true' &&
      !document.querySelector('.vnext-sheet[role="dialog"]');
  }, expected, { timeout: 12_000 });
  await page.waitForTimeout(120);
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
    const initialMonth = await currentMonth(page);

    await openModule(page, 'products');
    await selectControl(page, 'products', 'filter', 'buyBox');
    await selectControl(page, 'products', 'sort', 'buyBoxAsc');
    const productAlternates = await availableAlternateMonths(page);
    expect(productAlternates.length >= 2, `${label}: demo history exposes at least two alternate months for combined-history testing`, JSON.stringify(productAlternates));
    if (productAlternates.length < 2) throw new Error(`Need two alternate months, got ${JSON.stringify(productAlternates)}`);
    const productMonth = productAlternates[0];
    await selectMonth(page, productMonth);
    const productsExpected = { module: 'products', month: productMonth, filter: 'buyBox', sort: 'buyBoxAsc' };
    await waitCombined(page, productsExpected);
    evidence.products = await snapshot(page, 'products');
    evidence.initialMonth = initialMonth;
    expectCombined(evidence.products, productsExpected, `${label}/products-period-A`);

    await openModule(page, 'inventory');
    await selectControl(page, 'inventory', 'filter', 'lowStock');
    await selectControl(page, 'inventory', 'sort', 'fulfillableAsc');
    const inventoryAlternates = await availableAlternateMonths(page, [productMonth]);
    const inventoryMonth = inventoryAlternates[0];
    expect(Boolean(inventoryMonth), `${label}: Inventory has a second distinct period for Browser History isolation`, JSON.stringify(inventoryAlternates));
    if (!inventoryMonth) throw new Error('Missing distinct inventory month');
    await selectMonth(page, inventoryMonth);
    const inventoryExpected = { module: 'inventory', month: inventoryMonth, filter: 'lowStock', sort: 'fulfillableAsc' };
    await waitCombined(page, inventoryExpected);
    evidence.inventory = await snapshot(page, 'inventory');
    expectCombined(evidence.inventory, inventoryExpected, `${label}/inventory-period-B`);
    expect(productMonth !== inventoryMonth, `${label}: adjacent history entries intentionally own different periods`, JSON.stringify({ productMonth, inventoryMonth }));

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await waitCombined(page, productsExpected);
    evidence.afterBack = await snapshot(page, 'products');
    expectCombined(evidence.afterBack, productsExpected, `${label}/browser-back-products-A`);
    await page.screenshot({ path: path.join(artifactDir, `back-products-${label}.png`), fullPage: true });

    await page.goForward({ waitUntil: 'load' }).catch(() => null);
    await waitCombined(page, inventoryExpected);
    evidence.afterForward = await snapshot(page, 'inventory');
    expectCombined(evidence.afterForward, inventoryExpected, `${label}/browser-forward-inventory-B`);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await waitReadyAfterReload(page);
    await waitCombined(page, inventoryExpected);
    evidence.afterReload = await snapshot(page, 'inventory');
    expectCombined(evidence.afterReload, inventoryExpected, `${label}/reload-inventory-B`);
    await page.screenshot({ path: path.join(artifactDir, `reload-inventory-${label}.png`), fullPage: true });

    await closePeriodSheet(page);
  } catch (error) {
    fail(`${label}: A3 period-history acceptance completed`, error.stack || error.message || String(error));
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
  console.error(`\n${failures.length} A3 period-history acceptance failure(s)`);
  process.exit(1);
}
console.log('\nMobile A3 period-history acceptance PASS');
