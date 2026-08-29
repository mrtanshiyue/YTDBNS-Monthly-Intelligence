import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a2-operational-sort');
fs.mkdirSync(artifactDir, { recursive: true });

const CASES = [
  { module: 'ads', defaultSort: 'spendDesc', alternateSort: 'acosDesc', filter: 'acos45' },
  { module: 'products', defaultSort: 'salesDesc', alternateSort: 'buyBoxAsc', filter: 'buyBox' },
  { module: 'inventory', defaultSort: 'capitalDesc', alternateSort: 'fulfillableAsc', filter: 'lowStock' }
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
  const density = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-density.js'), 'utf8');
  const ia = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.css'), 'utf8');

  expect(
    density.includes('const SORTS = {') &&
      density.includes('function sortRows(module, rows') &&
      density.includes('function operationalControlsMarkup(module, rows, m)') &&
      density.includes('data-density-sort=') &&
      density.includes('sorts: { ads:') &&
      density.includes('sorts: { ...state.sorts }'),
    'A2 static contract: Ads, Products, and Inventory expose persistent operational sort state'
  );
  expect(
    density.includes('aria-pressed=') &&
      density.includes("state.sorts[module] = sort") &&
      density.includes("sortRows('ads'") &&
      density.includes("sortRows('products'") &&
      density.includes("sortRows('inventory'"),
    'A2 static contract: sort controls drive rendered record priority and expose selected state'
  );
  expect(
    ia.includes('function syncSortSemantics(module)') &&
      ia.includes('function revealActiveSort(module)') &&
      ia.includes("kind: 'sort'") &&
      ia.includes('sortRailFor(target.module)') &&
      ia.includes('focusWithoutScroll(replacement);'),
    'A2 static contract: IA preserves sort semantics, visibility, and keyboard focus across rerenders'
  );
  expect(
    css.includes('.vnext-operational-controls') &&
      css.includes('.vnext-sort-tags') &&
      css.includes('min-height:44px') &&
      css.includes('scroll-snap-type:x proximity'),
    'A2 static contract: operational sort controls remain touch-safe and horizontally browseable'
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
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${id}"]`);
    const sorts = [...(pageRoot?.querySelectorAll('[data-density-sort]') || [])];
    const pressed = sorts.filter(button => button.getAttribute('aria-pressed') === 'true');
    return density?.module === id && sorts.length >= 4 && pressed.length === 1;
  }, module, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function expectedIds(page, module, sort, filter = 'all') {
  return page.evaluate(({ moduleId, sortId, filterId }) => {
    const runtime = window.YT_SHARED_RUNTIME;
    const selectors = window.YT_SHARED_SELECTORS;
    const state = runtime.getState();
    const model = moduleId === 'ads'
      ? selectors.adsModel(state)
      : moduleId === 'products'
        ? selectors.productsModel(state)
        : selectors.inventoryModel(state);
    let rows = moduleId === 'ads' ? model.campaigns : moduleId === 'products' ? model.products : model.inventory;
    rows = [...rows];

    if (filterId !== 'all') {
      if (moduleId === 'ads' && filterId === 'acos45') {
        rows = rows.filter(row => row.acos != null && Number(row.acos) > .45);
      } else if (moduleId === 'products' && filterId === 'buyBox') {
        rows = rows.filter(row => row.buyBox != null && Number(row.buyBox) < .90);
      } else if (moduleId === 'inventory' && filterId === 'lowStock') {
        rows = rows.filter(row => row.fulfillable != null && Number(row.fulfillable) <= 20);
      }
    }

    const configs = {
      ads: {
        spendDesc: ['spend', 'desc'],
        acosDesc: ['acos', 'desc'],
        salesDesc: ['sales', 'desc'],
        ordersAsc: ['orders', 'asc']
      },
      products: {
        salesDesc: ['sales', 'desc'],
        sessionsDesc: ['sessions', 'desc'],
        cvrAsc: ['cvr', 'asc'],
        buyBoxAsc: ['buyBox', 'asc']
      },
      inventory: {
        capitalDesc: ['inventoryValue', 'desc'],
        fulfillableAsc: ['fulfillable', 'asc'],
        unsellableDesc: ['unsellable', 'desc'],
        inboundDesc: ['inbound', 'desc']
      }
    };
    const [key, direction] = configs[moduleId][sortId];
    const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
    rows.sort((a, b) => {
      const av = numeric(a?.[key]);
      const bv = numeric(b?.[key]);
      let compared = 0;
      if (av == null && bv == null) compared = 0;
      else if (av == null) compared = 1;
      else if (bv == null) compared = -1;
      else compared = direction === 'asc' ? av - bv : bv - av;
      return compared || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    });
    return rows.slice(0, 40).map(row => String(row.id));
  }, { moduleId: module, sortId: sort, filterId: filter });
}

async function moduleState(page, module) {
  return page.evaluate(moduleId => {
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const sortRail = pageRoot?.querySelector('.vnext-sort-tags');
    const filterRail = pageRoot?.querySelector('.vnext-filter-tags');
    const sortButtons = [...(sortRail?.querySelectorAll('[data-density-sort]') || [])];
    const filterButtons = [...(filterRail?.querySelectorAll('[data-density-filter]') || [])];
    const activeSort = sortButtons.find(button => button.classList.contains('active')) || null;
    const pressedSorts = sortButtons.filter(button => button.getAttribute('aria-pressed') === 'true');
    const activeFilter = filterButtons.find(button => button.classList.contains('active')) || null;
    const pressedFilters = filterButtons.filter(button => button.getAttribute('aria-pressed') === 'true');
    const sortRect = sortRail?.getBoundingClientRect();
    const activeSortRect = activeSort?.getBoundingClientRect();
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    return {
      module: moduleId,
      sort: density?.sorts?.[moduleId] || null,
      iaSort: ia?.sort || null,
      filter: density?.filters?.[moduleId] || null,
      iaFilter: ia?.filter || null,
      sortCount: sortButtons.length,
      visualActiveSortCount: sortButtons.filter(button => button.classList.contains('active')).length,
      pressedSortCount: pressedSorts.length,
      pressedSort: pressedSorts[0]?.dataset.densitySort || null,
      allSortButtonsHavePressedState: sortButtons.every(button => ['true', 'false'].includes(button.getAttribute('aria-pressed'))),
      visualActiveFilterCount: filterButtons.filter(button => button.classList.contains('active')).length,
      pressedFilterCount: pressedFilters.length,
      pressedFilter: pressedFilters[0]?.dataset.densityFilter || null,
      sortFullyVisible: Boolean(sortRect && activeSortRect && activeSortRect.left >= sortRect.left - 1 && activeSortRect.right <= sortRect.right + 1),
      sortScrollLeft: sortRail?.scrollLeft || 0,
      sortMaxScroll: sortRail ? Math.max(0, sortRail.scrollWidth - sortRail.clientWidth) : 0,
      sortTouchHeights: sortButtons.map(button => button.getBoundingClientRect().height),
      recordIds: [...(pageRoot?.querySelectorAll('.vnext-dense-record[data-density-detail-id]') || [])].map(row => String(row.dataset.densityDetailId)),
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      scrollY
    };
  }, module);
}

function expectSortSemantics(state, expectedSort, label) {
  expect(
    state?.sort === expectedSort &&
      state?.iaSort === expectedSort &&
      state?.visualActiveSortCount === 1 &&
      state?.pressedSortCount === 1 &&
      state?.pressedSort === expectedSort &&
      state?.allSortButtonsHavePressedState,
    `${label}: visual, density, IA, and aria-pressed expose one identical selected sort`,
    JSON.stringify(state)
  );
  expect(
    state?.sortTouchHeights?.length >= 4 && state.sortTouchHeights.every(height => height >= 43.5),
    `${label}: every sort control keeps the 44px touch floor`,
    JSON.stringify(state?.sortTouchHeights)
  );
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: operational controls create no document horizontal overflow`, JSON.stringify(state));
}

async function expectExactOrder(page, module, sort, filter, label) {
  const state = await moduleState(page, module);
  const expected = await expectedIds(page, module, sort, filter);
  expect(
    JSON.stringify(state?.recordIds || []) === JSON.stringify(expected),
    `${label}: rendered records follow the selected operational sort exactly`,
    JSON.stringify({ actual: state?.recordIds, expected })
  );
  return state;
}

async function keyboardSelectSort(page, module, sort, label) {
  const selector = `.vnext-density-module-page[data-density-module="${module}"] [data-density-sort="${sort}"]`;
  await page.focus(selector);
  const before = await page.evaluate(() => ({
    sort: document.activeElement?.dataset?.densitySort || null,
    module: document.activeElement?.dataset?.densitySortModule || null,
    connected: Boolean(document.activeElement?.isConnected),
    scrollY
  }));
  expect(before.sort === sort && before.module === module && before.connected, `${label}: target sort owns focus before keyboard activation`, JSON.stringify(before));

  await page.keyboard.press('Enter');
  await page.waitForFunction(({ moduleId, sortId }) => {
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const active = document.activeElement;
    return density?.module === moduleId &&
      density?.sorts?.[moduleId] === sortId &&
      active?.dataset?.densitySortModule === moduleId &&
      active?.dataset?.densitySort === sortId &&
      active?.isConnected &&
      active?.classList.contains('active') &&
      active?.getAttribute('aria-pressed') === 'true';
  }, { moduleId: module, sortId: sort }, { timeout: 4_000 });
  await page.waitForTimeout(100);

  const after = await page.evaluate(() => ({
    sort: document.activeElement?.dataset?.densitySort || null,
    module: document.activeElement?.dataset?.densitySortModule || null,
    connected: Boolean(document.activeElement?.isConnected),
    selected: Boolean(document.activeElement?.classList?.contains('active') && document.activeElement?.getAttribute?.('aria-pressed') === 'true'),
    scrollY
  }));
  expect(after.sort === sort && after.module === module && after.connected && after.selected, `${label}: focus follows the replacement selected sort after rerender`, JSON.stringify(after));
  expect(after.scrollY <= 2, `${label}: keyboard sort activation does not move the document`, JSON.stringify(after));
  return { before, after };
}

async function selectFilter(page, module, filter) {
  await page.evaluate(({ moduleId, filterId }) => {
    const button = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"] [data-density-filter="${filterId}"]`);
    if (!button) throw new Error(`Missing filter ${moduleId}/${filterId}`);
    button.click();
  }, { moduleId: module, filterId: filter });
  await page.waitForFunction(({ moduleId, filterId }) => {
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${moduleId}"]`);
    const pressed = [...(pageRoot?.querySelectorAll('[data-density-filter]') || [])].filter(button => button.getAttribute('aria-pressed') === 'true');
    return density?.filters?.[moduleId] === filterId && pressed.length === 1 && pressed[0]?.dataset.densityFilter === filterId;
  }, { moduleId: module, filterId: filter }, { timeout: 4_000 });
  await page.waitForTimeout(80);
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

    for (const item of CASES) {
      const { module, defaultSort, alternateSort, filter } = item;
      await openModule(page, module);

      const initial = await moduleState(page, module);
      evidence.cases[`${module}:default`] = initial;
      expectSortSemantics(initial, defaultSort, `${label}/${module}/default`);
      expect(initial?.sortFullyVisible, `${label}/${module}/default: selected sort is visible`, JSON.stringify(initial));
      await expectExactOrder(page, module, defaultSort, 'all', `${label}/${module}/default`);

      evidence.cases[`${module}:keyboard`] = await keyboardSelectSort(page, module, alternateSort, `${label}/${module}/${alternateSort}`);
      const alternate = await moduleState(page, module);
      evidence.cases[`${module}:${alternateSort}`] = alternate;
      expectSortSemantics(alternate, alternateSort, `${label}/${module}/${alternateSort}`);
      expect(alternate?.sortFullyVisible, `${label}/${module}/${alternateSort}: active sort remains visible after force rerender`, JSON.stringify(alternate));
      await expectExactOrder(page, module, alternateSort, 'all', `${label}/${module}/${alternateSort}`);

      await selectFilter(page, module, filter);
      const composed = await moduleState(page, module);
      evidence.cases[`${module}:${filter}+${alternateSort}`] = composed;
      expectSortSemantics(composed, alternateSort, `${label}/${module}/${filter}+${alternateSort}`);
      expect(
        composed?.filter === filter && composed?.iaFilter === filter && composed?.pressedFilter === filter && composed?.visualActiveFilterCount === 1 && composed?.pressedFilterCount === 1,
        `${label}/${module}: filter and sort remain independently selected`,
        JSON.stringify(composed)
      );
      await expectExactOrder(page, module, alternateSort, filter, `${label}/${module}/${filter}+${alternateSort}`);

      if (module !== 'ads') {
        await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}-operational-controls.png`), fullPage: false });
      }
    }

    /* Products filter + sort must survive a full module teardown/recreate, not only the immediate rerender. */
    await openModule(page, 'inventory');
    await openModule(page, 'products');
    const restored = await moduleState(page, 'products');
    evidence.restoredProducts = restored;
    expectSortSemantics(restored, 'buyBoxAsc', `${label}/products/restored`);
    expect(restored?.filter === 'buyBox' && restored?.sortFullyVisible, `${label}/products/restored: filter and sort context survive module return`, JSON.stringify(restored));
    await expectExactOrder(page, 'products', 'buyBoxAsc', 'buyBox', `${label}/products/restored`);

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: A2 operational-sort acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: A2 operational-sort acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A2 operational-sort acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A2 operational-sort acceptance passed.');
