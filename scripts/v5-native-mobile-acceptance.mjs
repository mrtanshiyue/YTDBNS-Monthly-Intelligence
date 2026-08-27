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
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, display: s.display, visibility: s.visibility, overflowX: s.overflowX, overflowY: s.overflowY, position: s.position, fontSize: s.fontSize };
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

    await page.locator('.v5-mobile-bottom-nav [data-mobile-route="more"]').click();
    await page.waitForSelector('[data-mobile-sheet="more"]');
    const secondaryButtons = page.locator('[data-mobile-sheet="more"] [data-mobile-route]');
    assert(await secondaryButtons.count() >= 5, `expected secondary modules in More sheet, got ${await secondaryButtons.count()}`, name);
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
    await page.locator('[data-v5-close-overlay]').first().click();
    await page.waitForTimeout(80);

    await page.locator('[data-mobile-action="search"]').click();
    await page.waitForSelector('[data-v5-search-input]');
    const searchInput = page.locator('[data-v5-search-input]');
    const searchBox = await box(searchInput);
    assert(parseFloat(searchBox.fontSize) >= 16, `search input font under 16px (${searchBox.fontSize})`, name);
    await searchInput.fill('商品');
    await page.waitForTimeout(80);
    assert(await page.locator('[data-v5-search-index]').count() > 0, 'Search returned no module result for 商品', name);
    await page.locator('[data-v5-search-index]').first().click();
    await page.waitForTimeout(100);
    assert(await page.locator('[data-mobile-view="products"]').count() > 0, 'Search result did not navigate through Mobile route bridge', name);

    let recordRoute = null;
    for (const route of ['products', 'ads', 'inventory']) {
      await page.locator(`.v5-mobile-bottom-nav [data-mobile-route="${route}"]`).click();
      await page.waitForTimeout(100);
      if (await page.locator('.v5-record-card').count()) { recordRoute = route; break; }
    }
    assert(Boolean(recordRoute), 'no Mobile record card available for full-screen Detail acceptance', name);
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
