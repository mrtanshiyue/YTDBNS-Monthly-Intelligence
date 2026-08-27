import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.ACCEPTANCE_URL || 'http://127.0.0.1:8787/';
const artifacts = process.env.ACCEPTANCE_ARTIFACTS || 'artifacts/v5-native-mobile';
const browserCandidates = [
  process.env.CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
].filter(Boolean);
const executablePath = browserCandidates.find(existsSync);
if (!executablePath) throw new Error(`No system Chromium/Chrome found. Set CHROMIUM_PATH. Checked: ${browserCandidates.join(', ')}`);

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

function assert(ok, label, context) {
  if (!ok) failures.push(`${context}: ${label}`);
}

async function box(locator) {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, display: s.display, visibility: s.visibility, overflowX: s.overflowX, overflowY: s.overflowY, position: s.position, fontSize: s.fontSize, touchAction: s.touchAction };
  });
}

async function overflowState(page) {
  return page.evaluate(() => ({
    innerWidth,
    innerHeight,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
}

async function assertNoHorizontalOverflow(page, context) {
  const o = await overflowState(page);
  assert(o.doc <= o.innerWidth + 1, `document horizontal overflow ${o.doc}>${o.innerWidth}`, context);
  assert(o.body <= o.innerWidth + 1, `body horizontal overflow ${o.body}>${o.innerWidth}`, context);
  return o;
}

async function closeAnyMobileOverlay(page) {
  for (const selector of ['[data-v5-compare-close]', '[data-v5-close-overlay]']) {
    const button = page.locator(selector).first();
    if (await button.count() && await button.isVisible()) {
      await button.click();
      await page.waitForTimeout(80);
    }
  }
}

async function visibleButtonSizes(page, selector) {
  return page.locator(selector).evaluateAll(buttons => buttons.filter(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).map(el => {
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim().slice(0, 48), width: r.width, height: r.height };
  }));
}

async function openSearch(page, query) {
  await page.locator('[data-mobile-action="search"]').click();
  await page.waitForSelector('[data-v5-search-input]');
  const input = page.locator('[data-v5-search-input]');
  await input.fill(query);
  await page.waitForTimeout(80);
  return input;
}

for (const [name, width, height, mobile] of cases) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const apiRequests = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/')) apiRequests.push({ method: request.method(), url: request.url() });
  });

  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(450);
  const viewport = await overflowState(page);
  assert(Math.abs(viewport.innerWidth - width) <= 1, `actual viewport width ${viewport.innerWidth}`, name);
  assert(Math.abs(viewport.innerHeight - height) <= 1, `actual viewport height ${viewport.innerHeight}`, name);
  await assertNoHorizontalOverflow(page, name);

  if (mobile) {
    await page.waitForSelector('body.v5-native-mobile #mobileAppRoot:not([hidden])', { timeout: 15000 });
    const legacyVisible = await page.locator('.global-nav').evaluate(el => getComputedStyle(el).display !== 'none');
    assert(!legacyVisible, 'Desktop global navigation is visible inside native Mobile mode', name);

    const nav = page.locator('.v5-mobile-bottom-nav');
    assert(await nav.isVisible(), 'native bottom navigation missing', name);
    const navItems = page.locator('.v5-mobile-bottom-nav .v5-mobile-nav-item');
    assert(await navItems.count() === 5, `expected five primary mobile destinations, got ${await navItems.count()}`, name);
    const navSizes = await visibleButtonSizes(page, '.v5-mobile-bottom-nav .v5-mobile-nav-item');
    assert(navSizes.every(item => item.width >= 44 && item.height >= 44), `bottom navigation touch target under 44px: ${JSON.stringify(navSizes)}`, name);

    for (const route of ['overview', 'ads', 'products', 'inventory']) {
      await page.locator(`.v5-mobile-bottom-nav [data-mobile-route="${route}"]`).click();
      await page.waitForTimeout(100);
      assert(await page.locator(`[data-mobile-view="${route}"]`).count() > 0, `route ${route} did not render independent Mobile view`, name);
      await assertNoHorizontalOverflow(page, `${name}/${route}`);
    }

    const moreTrigger = page.locator('.v5-mobile-bottom-nav [data-mobile-route="more"]');
    await moreTrigger.click();
    await page.waitForSelector('[data-mobile-sheet="more"]');
    const moreClose = page.locator('[data-mobile-sheet="more"] .v5-mobile-sheet-head button');
    assert(await moreClose.evaluate(el => document.activeElement === el), 'More sheet did not move focus into the dialog', name);
    const secondaryButtons = page.locator('[data-mobile-sheet="more"] [data-mobile-route]');
    assert(await secondaryButtons.count() >= 5, `expected secondary modules in More sheet, got ${await secondaryButtons.count()}`, name);
    await moreClose.click();
    await page.waitForTimeout(80);
    assert(await moreTrigger.evaluate(el => document.activeElement === el), 'More sheet did not restore focus to its trigger', name);

    await moreTrigger.click();
    await page.waitForSelector('[data-mobile-sheet="more"]');
    await page.locator('[data-mobile-sheet="more"] [data-mobile-route="finance"]').click();
    await page.waitForTimeout(100);
    assert(await page.locator('[data-mobile-view="finance"]').count() > 0, 'Finance did not route from More sheet', name);

    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="overview"]').click();
    await page.waitForSelector('[data-mobile-view="overview"]');
    assert(await page.locator('.v5-overview-chart svg').count() <= 1, 'Overview renders more than one primary chart', name);
    assert(await page.locator('[data-v5-open-compare]').count() === 1, 'one-tap Mobile Compare trigger missing', name);

    await page.locator('[data-mobile-action="period"]').first().click();
    await page.waitForSelector('.v5-interaction-sheet');
    const quickCount = await page.locator('[data-v5-quick]').count();
    assert(quickCount === 5, `expected five quick period actions, got ${quickCount}`, name);
    const dateInput = page.locator('[data-v5-date-from]');
    const dateBox = await box(dateInput);
    assert(parseFloat(dateBox.fontSize) >= 16, `period date input font under 16px (${dateBox.fontSize})`, name);
    const periodSheet = await box(page.locator('.v5-interaction-sheet'));
    assert(['auto', 'scroll'].includes(periodSheet.overflowY), `Period sheet does not own vertical scrolling (${periodSheet.overflowY})`, name);
    assert(periodSheet.touchAction === 'pan-y', `Period sheet touch-action is ${periodSheet.touchAction}, expected pan-y`, name);

    await page.locator('[data-v5-quick="30"]').click();
    await page.waitForSelector('.v5-interaction-sheet', { state: 'detached', timeout: 15000 });
    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="inventory"]').click();
    await page.waitForTimeout(150);
    const inventoryEvidence = await page.evaluate(async () => {
      const state = window.YT_SHARED_RUNTIME?.getState?.() || {};
      const rows = state.inventoryDetail?.inventory?.length || 0;
      const snapshotDate = state.inventoryDetail?.inventorySnapshotDate || null;
      const ceiling = state.to?.slice(0, 7) || null;
      const months = (state.periods || [])
        .map(item => typeof item === 'string' ? item : item.month)
        .filter(month => month && (!ceiling || month <= ceiling));
      let sourceSnapshot = null;
      for (const month of months) {
        try {
          const response = await fetch(`/api/month?store=yt-us&month=${encodeURIComponent(month)}`, { method: 'GET' });
          const detail = await response.json();
          const sourceRows = Array.isArray(detail?.inventory) ? detail.inventory.length : 0;
          const sourceDate = detail?.inventorySnapshotDate || null;
          if (sourceRows > 0 || sourceDate) {
            sourceSnapshot = { month, rows: sourceRows, snapshotDate: sourceDate };
            break;
          }
        } catch {
          // Source availability is best-effort evidence; runtime assertions remain authoritative.
        }
      }
      return { rows, snapshotDate, sourceSnapshot };
    });
    const inventoryCards = await page.locator('[data-mobile-view="inventory"] .v5-record-card').count();
    const inventoryEmpty = await page.locator('[data-mobile-view="inventory"] .v5-core-empty').count();
    if (inventoryEvidence.sourceSnapshot) {
      assert(inventoryEvidence.rows > 0 || Boolean(inventoryEvidence.snapshotDate), '30-day range lost the latest valid inventory snapshot', name);
      if (inventoryEvidence.rows > 0) assert(inventoryCards > 0, 'Inventory snapshot rows exist but Mobile record cards are missing', name);
    } else {
      assert(inventoryEvidence.rows === 0 && !inventoryEvidence.snapshotDate, 'Mobile runtime fabricated an inventory snapshot with no source snapshot', name);
      assert(inventoryEmpty > 0, 'Inventory has no source snapshot but the Mobile empty state is missing', name);
    }

    await page.locator('[data-mobile-action="period"]').first().click();
    await page.waitForSelector('.v5-interaction-sheet');
    await page.locator('[data-v5-quick="current"]').click();
    await page.waitForSelector('.v5-interaction-sheet', { state: 'detached', timeout: 15000 });
    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="overview"]').click();
    await page.waitForTimeout(100);

    const searchInput = await openSearch(page, '商品');
    const searchBox = await box(searchInput);
    assert(parseFloat(searchBox.fontSize) >= 16, `search input font under 16px (${searchBox.fontSize})`, name);
    const fullscreenBody = await box(page.locator('#v5MobileOverlayRoot .v5-fullscreen-body'));
    assert(fullscreenBody.touchAction === 'pan-y', `Full-screen body touch-action is ${fullscreenBody.touchAction}, expected pan-y`, name);
    assert(await page.locator('[data-v5-search-index]').count() > 0, 'Search returned no module result for 商品', name);
    await page.locator('[data-v5-search-index]').first().click();
    await page.waitForTimeout(100);
    assert(await page.locator('[data-mobile-view="products"]').count() > 0, 'Search result did not navigate through Mobile route bridge', name);

    await openSearch(page, 'ACOS');
    const metricResult = page.locator('.v5-search-result').filter({ hasText: /^ACOS\b/ }).first();
    assert(await metricResult.count() > 0, 'Search returned no exact ACOS metric result', name);
    if (await metricResult.count()) {
      await metricResult.click();
      await page.waitForSelector('.v5-detail-hero');
      assert((await page.locator('.v5-detail-hero').innerText()).includes('ACOS'), 'metric search did not open ACOS Full-screen Detail', name);
      await page.locator('[data-v5-close-overlay]').first().click();
      await page.waitForTimeout(80);
    } else {
      await closeAnyMobileOverlay(page);
    }

    await openSearch(page, '选择期间');
    const periodAction = page.locator('.v5-search-result').filter({ hasText: '选择期间' }).first();
    assert(await periodAction.count() > 0, 'Search returned no Period function entry', name);
    if (await periodAction.count()) {
      await periodAction.click();
      await page.waitForSelector('.v5-interaction-sheet');
      assert(await page.locator('[data-v5-quick]').count() === 5, 'Period function search did not open native Period sheet', name);
      await page.locator('[data-v5-close-overlay]').first().click();
      await page.waitForTimeout(80);
    } else {
      await closeAnyMobileOverlay(page);
    }

    await openSearch(page, '对比上期');
    const compareAction = page.locator('.v5-search-result').filter({ hasText: '对比上期' }).first();
    assert(await compareAction.count() > 0, 'Search returned no Compare function entry', name);
    if (await compareAction.count()) {
      await compareAction.click();
      await page.waitForSelector('#v5MobileCompareRoot .v5-fullscreen');
      assert(await page.locator('#v5MobileCompareRoot .v5-fullscreen').isVisible(), 'Compare function search did not open native Compare', name);
      await closeAnyMobileOverlay(page);
    } else {
      await closeAnyMobileOverlay(page);
    }

    let recordRoute = null;
    for (const route of ['products', 'ads', 'inventory']) {
      await page.locator(`.v5-mobile-bottom-nav [data-mobile-route="${route}"]`).click();
      await page.waitForTimeout(100);
      if (await page.locator('.v5-record-card').count()) { recordRoute = route; break; }
    }
    const sourceRecords = await page.evaluate(() => {
      const state = window.YT_SHARED_RUNTIME?.getState?.() || {};
      return (state.monthDetail?.products?.length || 0)
        + (state.monthDetail?.campaigns?.length || 0)
        + (state.inventoryDetail?.inventory?.length || 0);
    });
    if (sourceRecords > 0) {
      assert(Boolean(recordRoute), 'source record data exists but no Mobile record card is available for Detail acceptance', name);
    } else {
      assert(await page.locator('.v5-core-empty').count() > 0, 'no source record data exists and no Mobile empty state is rendered', name);
    }
    if (recordRoute) {
      await page.locator('.v5-record-card').first().click();
      await page.waitForSelector('.v5-detail-hero');
      assert(await page.locator('#v5MobileOverlayRoot .v5-fullscreen').isVisible(), 'record detail is not a full-screen Mobile surface', name);
      await page.locator('[data-v5-close-overlay]').first().click();
      await page.waitForTimeout(80);
    }

    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="overview"]').click();
    await page.waitForSelector('[data-v5-open-compare]');
    await page.locator('[data-v5-open-compare]').click();
    await page.waitForSelector('#v5MobileCompareRoot .v5-fullscreen');
    const mode = await page.evaluate(() => window.YT_SHARED_RUNTIME?.getState?.().mode || 'unknown');
    if (mode === 'live') {
      await page.waitForSelector('#v5MobileCompareRoot .v5-compare-list, #v5MobileCompareRoot .v5-compare-unavailable', { timeout: 15000 });
    } else {
      assert(await page.locator('#v5MobileCompareRoot .v5-compare-unavailable').count() > 0, 'Preview Compare must explicitly refuse simulated prior-period data', name);
    }
    await closeAnyMobileOverlay(page);

    await page.evaluate(() => window.YT_MOBILE_APP?.navigate?.('history'));
    await page.waitForTimeout(100);
    const scrollEvidence = await page.evaluate(() => {
      window.scrollTo(0, 0);
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.getElementById('mobileAppRoot')?.scrollHeight || 0);
      window.scrollTo(0, Math.min(160, Math.max(0, height - innerHeight)));
      const top = document.querySelector('.v5-mobile-topbar')?.getBoundingClientRect();
      const navBox = document.querySelector('.v5-mobile-bottom-nav')?.getBoundingClientRect();
      return { scrollY, top: top?.top ?? null, navBottom: navBox?.bottom ?? null, innerHeight };
    });
    assert(scrollEvidence.scrollY > 0, 'History view does not provide vertical scrolling for sticky/fixed acceptance', name);
    assert(Math.abs(scrollEvidence.top || 0) <= 1.5, `sticky topbar moved offscreen (${scrollEvidence.top})`, name);
    assert(Math.abs((scrollEvidence.navBottom || 0) - scrollEvidence.innerHeight) <= 2, `fixed bottom nav drifted from viewport bottom (${scrollEvidence.navBottom}/${scrollEvidence.innerHeight})`, name);
    await page.evaluate(() => window.scrollTo(0, 0));

    const rootTargets = await visibleButtonSizes(page, '#mobileAppRoot button');
    assert(rootTargets.every(item => item.width >= 44 && item.height >= 44), `visible Mobile button under 44×44: ${JSON.stringify(rootTargets.filter(item => item.width < 44 || item.height < 44))}`, name);
    await assertNoHorizontalOverflow(page, `${name}/final`);
  } else {
    await page.waitForSelector('body.studio-v54', { timeout: 15000 });
    const nativeActive = await page.evaluate(() => document.body.classList.contains('v5-native-mobile'));
    assert(!nativeActive, 'Desktop unexpectedly activated V5 native Mobile mode', name);
    assert(!(await page.locator('#mobileAppRoot').isVisible()), 'Mobile root is visible on Desktop', name);
    assert(await page.locator('.global-nav').isVisible(), 'Desktop global navigation missing', name);
    assert(await page.locator('#mainNav .nav-item').count() === 9, 'Desktop navigation contract changed', name);
    await page.waitForSelector('#content .panel, #content .metric-card, #content .executive-card', { timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${name}/desktop-regression`);
  }

  const writeRequests = apiRequests.filter(request => request.method !== 'GET');
  const mutationEndpoints = apiRequests.filter(request => /\/api\/imports\/(start|file|commit)/.test(request.url));
  assert(writeRequests.length === 0, `non-GET API requests observed: ${JSON.stringify(writeRequests)}`, name);
  assert(mutationEndpoints.length === 0, `Import mutation endpoints observed: ${JSON.stringify(mutationEndpoints)}`, name);
  assert(consoleErrors.length === 0, `console/page errors: ${JSON.stringify(consoleErrors)}`, name);

  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
  results.push({ name, width, height, mobile, consoleErrors, apiRequests, overflow: await overflowState(page) });
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ baseURL, executablePath, results, failures }, null, 2));

if (failures.length) {
  console.error(`V5 native mobile Chromium acceptance failed with ${failures.length} issue(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`V5 native mobile Chromium acceptance passed: ${cases.map(([name]) => name).join(', ')}`);