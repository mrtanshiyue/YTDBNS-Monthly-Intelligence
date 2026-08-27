import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.ACCEPTANCE_URL || 'http://127.0.0.1:8787/';
const artifacts = process.env.ACCEPTANCE_ARTIFACTS || 'artifacts/v5-native-mobile-final';
const candidates = [
  process.env.CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
].filter(Boolean);
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error(`No Chromium found. Checked: ${candidates.join(', ')}`);

const cases = [
  ['iphone-375x812', 375, 812, true],
  ['iphone-390x844', 390, 844, true],
  ['iphone-393x852', 393, 852, true],
  ['iphone-430x932', 430, 932, true],
  ['desktop-1440x900', 1440, 900, false],
  ['desktop-1920x1080', 1920, 1080, false]
];

await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const failures = [];
const results = [];
const assert = (ok, label, context) => { if (!ok) failures.push(`${context}: ${label}`); };
const pause = (page, ms = 100) => page.waitForTimeout(ms);

async function styleBox(locator) {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      width: r.width, height: r.height, top: r.top, bottom: r.bottom,
      display: s.display, visibility: s.visibility, position: s.position,
      overflowX: s.overflowX, overflowY: s.overflowY, fontSize: s.fontSize,
      touchAction: s.touchAction
    };
  });
}

async function overflowState(page) {
  return page.evaluate(() => ({ innerWidth, innerHeight, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
}

async function assertNoOverflow(page, context) {
  const o = await overflowState(page);
  assert(o.doc <= o.innerWidth + 1, `document horizontal overflow ${o.doc}>${o.innerWidth}`, context);
  assert(o.body <= o.innerWidth + 1, `body horizontal overflow ${o.body}>${o.innerWidth}`, context);
  return o;
}

async function visibleButtonSizes(page, selector) {
  return page.locator(selector).evaluateAll(nodes => nodes.filter(el => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).map(el => {
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim().slice(0, 48), width: r.width, height: r.height };
  }));
}

async function closeOverlay(page) {
  for (const selector of ['[data-v5-compare-close]', '[data-v5-close-overlay]']) {
    const button = page.locator(selector).first();
    if (await button.count() && await button.isVisible()) {
      await button.click(); await pause(page, 100);
    }
  }
}

async function openSearch(page, query) {
  await page.locator('[data-mobile-action="search"]').click();
  await page.waitForSelector('[data-v5-search-input]');
  const input = page.locator('[data-v5-search-input]');
  await input.fill(query); await pause(page, 120);
  return input;
}

async function openMoreRoute(page, route) {
  await page.locator('.v5-mobile-bottom-nav [data-mobile-route="more"]').click();
  await page.waitForSelector('[data-mobile-sheet="more"]');
  await page.locator(`[data-mobile-sheet="more"] [data-mobile-route="${route}"]`).click();
  await page.waitForSelector(`[data-mobile-view="${route}"]`);
  await pause(page, 100);
}

async function waitRuntimeReady(page) {
  await page.waitForFunction(() => {
    const s = window.YT_SHARED_RUNTIME?.getState?.();
    return Boolean(s?.started && s.mode && s.mode !== 'unknown' && !s.loading && s.from && s.to && s.dashboard && Array.isArray(s.periods) && s.periods.length > 0);
  }, null, { timeout: 30000 });
}

for (const [name, width, height, mobile] of cases) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const apiRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('request', r => { if (r.url().includes('/api/')) apiRequests.push({ method: r.method(), url: r.url() }); });

  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pause(page, 250);
  const viewport = await overflowState(page);
  assert(Math.abs(viewport.innerWidth - width) <= 1, `actual viewport width ${viewport.innerWidth}`, name);
  assert(Math.abs(viewport.innerHeight - height) <= 1, `actual viewport height ${viewport.innerHeight}`, name);
  await assertNoOverflow(page, name);

  if (mobile) {
    await page.waitForSelector('body.v5-native-mobile #mobileAppRoot:not([hidden])', { timeout: 15000 });
    await waitRuntimeReady(page);

    const runtimeEvidence = await page.evaluate(() => {
      const s = window.YT_SHARED_RUNTIME.getState();
      return { mode: s.mode, from: s.from, to: s.to, periods: s.periods.length, loading: s.loading };
    });
    assert(runtimeEvidence.periods > 0, `runtime has no periods: ${JSON.stringify(runtimeEvidence)}`, name);

    const bodyOverflowX = await page.locator('body').evaluate(el => getComputedStyle(el).overflowX);
    assert(bodyOverflowX === 'clip', `body overflow-x is ${bodyOverflowX}, expected clip`, name);
    assert(!(await page.locator('.global-nav').isVisible()), 'Desktop global navigation visible in Mobile mode', name);

    const nav = page.locator('.v5-mobile-bottom-nav');
    const navBox = await styleBox(nav);
    assert(await nav.isVisible(), 'native bottom navigation missing', name);
    assert(navBox.position === 'fixed', `bottom nav position is ${navBox.position}`, name);
    assert(Math.abs(navBox.bottom - height) <= 2, `bottom nav drifted from viewport bottom ${navBox.bottom}/${height}`, name);
    const navItems = page.locator('.v5-mobile-bottom-nav .v5-mobile-nav-item');
    assert(await navItems.count() === 5, `expected five primary nav items, got ${await navItems.count()}`, name);
    const navSizes = await visibleButtonSizes(page, '.v5-mobile-bottom-nav .v5-mobile-nav-item');
    assert(navSizes.every(x => x.width >= 44 && x.height >= 44), `bottom nav touch target <44px: ${JSON.stringify(navSizes)}`, name);

    for (const route of ['overview', 'ads', 'products', 'inventory']) {
      await page.locator(`.v5-mobile-bottom-nav [data-mobile-route="${route}"]`).click();
      await page.waitForSelector(`[data-mobile-view="${route}"]`);
      await pause(page, 80);
      await assertNoOverflow(page, `${name}/${route}`);
    }

    const moreTrigger = page.locator('.v5-mobile-bottom-nav [data-mobile-route="more"]');
    await moreTrigger.click();
    await page.waitForSelector('[data-mobile-sheet="more"]');
    let moreClose = page.locator('[data-mobile-sheet="more"] .v5-mobile-sheet-head button');
    assert(await moreClose.evaluate(el => document.activeElement === el), 'More did not move focus into dialog', name);
    await page.evaluate(async () => {
      const s = window.YT_SHARED_RUNTIME.getState();
      await window.YT_SHARED_RUNTIME.setRange(s.from, s.to);
    });
    await waitRuntimeReady(page);
    await page.waitForSelector('[data-mobile-sheet="more"]');
    moreClose = page.locator('[data-mobile-sheet="more"] .v5-mobile-sheet-head button');
    assert(await moreClose.evaluate(el => document.activeElement === el), 'More focus was lost after runtime rerender', name);
    await moreClose.click(); await pause(page, 100);
    assert(await moreTrigger.evaluate(el => document.activeElement === el), 'More did not restore focus to trigger', name);

    for (const route of ['finance', 'charges', 'returns', 'history', 'data']) {
      await openMoreRoute(page, route);
      assert(await page.locator(`[data-mobile-view="${route}"]`).count() > 0, `secondary route ${route} missing`, name);
      await assertNoOverflow(page, `${name}/${route}`);
    }

    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="overview"]').click();
    await page.waitForSelector('[data-mobile-view="overview"]');
    assert(await page.locator('.v5-overview-chart svg').count() <= 1, 'Overview renders >1 primary chart', name);
    assert(await page.locator('[data-v5-open-compare]').count() === 1, 'one-tap Compare missing', name);

    await page.locator('[data-mobile-action="period"]').first().click();
    await page.waitForSelector('.v5-interaction-sheet');
    assert(await page.locator('[data-v5-quick]').count() === 5, 'Period quick actions !=5', name);
    const dateBox = await styleBox(page.locator('[data-v5-date-from]'));
    const periodBox = await styleBox(page.locator('.v5-interaction-sheet'));
    assert(parseFloat(dateBox.fontSize) >= 16, `Period input font ${dateBox.fontSize}`, name);
    assert(['auto', 'scroll'].includes(periodBox.overflowY), `Period overflowY ${periodBox.overflowY}`, name);
    assert(periodBox.touchAction === 'pan-y', `Period touch-action ${periodBox.touchAction}`, name);
    await page.locator('[data-v5-quick="30"]').click();
    await page.waitForSelector('.v5-interaction-sheet', { state: 'detached', timeout: 15000 });
    await waitRuntimeReady(page);

    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="inventory"]').click();
    await pause(page, 120);
    const inventory = await page.evaluate(async () => {
      const s = window.YT_SHARED_RUNTIME.getState();
      const rows = s.inventoryDetail?.inventory?.length || 0;
      const snapshotDate = s.inventoryDetail?.inventorySnapshotDate || null;
      const months = (s.periods || []).map(x => typeof x === 'string' ? x : x.month).filter(Boolean).filter(m => !s.to || m <= s.to.slice(0, 7));
      let sourceSnapshot = null;
      for (const month of months) {
        try {
          const r = await fetch(`/api/month?store=yt-us&month=${encodeURIComponent(month)}`, { method: 'GET' });
          const d = await r.json();
          const sourceRows = Array.isArray(d?.inventory) ? d.inventory.length : 0;
          const sourceDate = d?.inventorySnapshotDate || null;
          if (sourceRows > 0 || sourceDate) { sourceSnapshot = { month, rows: sourceRows, snapshotDate: sourceDate }; break; }
        } catch {}
      }
      return { rows, snapshotDate, sourceSnapshot };
    });
    const inventoryCards = await page.locator('[data-mobile-view="inventory"] .v5-record-card').count();
    const inventoryEmpty = await page.locator('[data-mobile-view="inventory"] .v5-core-empty').count();
    if (inventory.sourceSnapshot) {
      assert(inventory.rows > 0 || Boolean(inventory.snapshotDate), 'source snapshot exists but runtime snapshot missing', name);
      if (inventory.rows > 0) assert(inventoryCards > 0, 'inventory rows exist but cards missing', name);
    } else {
      assert(inventory.rows === 0 && !inventory.snapshotDate, 'runtime fabricated inventory snapshot', name);
      assert(inventoryCards === 0 && inventoryEmpty > 0, 'inventory empty-state contract failed', name);
    }

    await page.locator('[data-mobile-action="period"]').first().click();
    await page.waitForSelector('.v5-interaction-sheet');
    await page.locator('[data-v5-quick="current"]').click();
    await page.waitForSelector('.v5-interaction-sheet', { state: 'detached', timeout: 15000 });
    await waitRuntimeReady(page);
    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="overview"]').click();

    const searchInput = await openSearch(page, '商品');
    assert(parseFloat((await styleBox(searchInput)).fontSize) >= 16, 'Search input font under 16px', name);
    const fullscreen = await styleBox(page.locator('#v5MobileOverlayRoot .v5-fullscreen-body'));
    assert(fullscreen.touchAction === 'pan-y', `Search fullscreen touch-action ${fullscreen.touchAction}`, name);
    assert(await page.locator('[data-v5-search-index]').count() > 0, 'Search 商品 returned no result', name);
    await page.locator('[data-v5-search-index]').first().click(); await pause(page, 100);
    assert(await page.locator('[data-mobile-view="products"]').count() > 0, 'Search 商品 did not navigate to products', name);

    await openSearch(page, 'ACOS');
    const metric = page.locator('.v5-search-result')
      .filter({ has: page.locator('b').filter({ hasText: /^ACOS$/ }) })
      .filter({ has: page.locator('em').filter({ hasText: /^METRIC$/ }) }).first();
    assert(await metric.count() > 0, 'Search returned no exact ACOS/METRIC result', name);
    if (await metric.count()) {
      await metric.click(); await page.waitForSelector('.v5-detail-hero');
      assert((await page.locator('.v5-detail-hero').innerText()).includes('ACOS'), 'ACOS did not open Full-screen Detail', name);
      await closeOverlay(page);
    }

    await openSearch(page, '选择期间');
    const periodAction = page.locator('.v5-search-result').filter({ has: page.locator('b').filter({ hasText: /^选择期间$/ }) }).first();
    assert(await periodAction.count() > 0, 'Search returned no Period action', name);
    if (await periodAction.count()) { await periodAction.click(); await page.waitForSelector('.v5-interaction-sheet'); await closeOverlay(page); }

    await openSearch(page, '对比上期');
    const compareAction = page.locator('.v5-search-result').filter({ has: page.locator('b').filter({ hasText: /^对比上期$/ }) }).first();
    assert(await compareAction.count() > 0, 'Search returned no Compare action', name);
    if (await compareAction.count()) {
      await compareAction.click();
      await page.waitForSelector('#v5MobileCompareRoot .v5-fullscreen');
      await page.waitForSelector('#v5MobileCompareRoot .v5-compare-list, #v5MobileCompareRoot .v5-compare-unavailable', { timeout: 15000 });
      await closeOverlay(page);
    }

    await openMoreRoute(page, 'history');
    const historyState = await page.evaluate(() => ({
      periods: window.YT_SHARED_RUNTIME.getState().periods.length,
      cards: document.querySelectorAll('[data-mobile-view="history"] .v5-history-month').length,
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.getElementById('mobileAppRoot')?.scrollHeight || 0),
      innerHeight
    }));
    assert(historyState.cards > 0, `History has no month cards despite ${historyState.periods} periods`, name);
    assert(historyState.height > historyState.innerHeight, `History is not vertically scrollable ${historyState.height}/${historyState.innerHeight}`, name);
    await page.evaluate(() => window.scrollTo(0, Math.min(240, document.documentElement.scrollHeight - innerHeight)));
    await pause(page, 120);
    const scroll = await page.evaluate(() => {
      const top = document.querySelector('.v5-mobile-topbar')?.getBoundingClientRect();
      const nav = document.querySelector('.v5-mobile-bottom-nav')?.getBoundingClientRect();
      return { scrollY, top: top?.top ?? null, navBottom: nav?.bottom ?? null, innerHeight };
    });
    assert(scroll.scrollY > 0, 'History did not scroll', name);
    assert(Math.abs(scroll.top ?? 999) <= 1.5, `sticky topbar moved (${scroll.top})`, name);
    assert(Math.abs((scroll.navBottom ?? 0) - scroll.innerHeight) <= 2, `fixed bottom nav drifted (${scroll.navBottom}/${scroll.innerHeight})`, name);
    await page.evaluate(() => window.scrollTo(0, 0));

    const rootTargets = await visibleButtonSizes(page, '#mobileAppRoot button');
    assert(rootTargets.every(x => x.width >= 44 && x.height >= 44), `visible button <44x44: ${JSON.stringify(rootTargets.filter(x => x.width < 44 || x.height < 44))}`, name);
    await assertNoOverflow(page, `${name}/final`);
  } else {
    await page.waitForSelector('body.studio-v54', { timeout: 15000 });
    assert(!(await page.evaluate(() => document.body.classList.contains('v5-native-mobile'))), 'Desktop activated Mobile mode', name);
    assert(!(await page.locator('#mobileAppRoot').isVisible()), 'Mobile root visible on Desktop', name);
    assert(await page.locator('.global-nav').isVisible(), 'Desktop global nav missing', name);
    assert(await page.locator('#mainNav .nav-item').count() === 9, 'Desktop nav !=9', name);
    await page.waitForSelector('#content .panel, #content .metric-card, #content .executive-card', { timeout: 15000 });
    await assertNoOverflow(page, `${name}/desktop`);
  }

  const writes = apiRequests.filter(r => r.method !== 'GET');
  const mutations = apiRequests.filter(r => /\/api\/imports\/(start|file|commit)/.test(r.url));
  assert(writes.length === 0, `non-GET API requests: ${JSON.stringify(writes)}`, name);
  assert(mutations.length === 0, `import mutations: ${JSON.stringify(mutations)}`, name);
  assert(consoleErrors.length === 0, `console/page errors: ${JSON.stringify(consoleErrors)}`, name);

  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
  results.push({ name, width, height, mobile, apiRequests, consoleErrors, overflow: await overflowState(page) });
  await context.close();
  console.log(`PASS viewport ${name}`);
}

await browser.close();
await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ baseURL, executablePath, results, failures }, null, 2));
if (failures.length) {
  console.error(`V5 FINAL exact-head acceptance failed with ${failures.length} issue(s):`);
  failures.forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`V5 FINAL exact-head acceptance passed: ${cases.map(([n]) => n).join(', ')}`);
