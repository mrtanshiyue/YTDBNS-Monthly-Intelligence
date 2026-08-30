import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const localEntry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const entry = process.env.V5_ACCEPTANCE_URL || localEntry;
const artifactDir = path.join(root, 'artifacts', 'v5-browser-acceptance');
fs.mkdirSync(artifactDir, { recursive: true });

const executablePath = chromium.executablePath();
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(`Playwright Chromium executable not found at ${executablePath || 'unknown path'}. Run: npx playwright-core install chromium`);
}

const MOBILE = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 }
];
const DESKTOP = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];
const MOBILE_VIEWS = ['overview', 'ads', 'products', 'inventory', 'workspace', 'finance', 'charges', 'returns', 'history', 'data'];
const PRIMARY_SCREENSHOTS = ['overview', 'ads', 'products', 'inventory', 'workspace'];
const SECONDARY_VIEWS = new Set(['finance', 'charges', 'returns', 'history', 'data']);
const failures = [];
const report = { version: 'V5.1', exactEntry: entry, localEntry, driver: 'playwright-core', executablePath, mobile: [], desktop: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function pass(message) { console.log(`PASS  ${message}`); }
function fail(message, detail = '') {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
}
function expect(condition, message, detail = '') { condition ? pass(message) : fail(message, detail); }

async function capturePageSignals(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const apiRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error?.stack || error?.message || String(error)));
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/')) apiRequests.push({ method: request.method(), url });
  });
  return { consoleErrors, pageErrors, apiRequests };
}

async function load(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await sleep(350);
}

async function visible(page, selector) {
  return page.$eval(selector, element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
  }).catch(() => false);
}

async function activeMatches(page, selector) {
  return page.evaluate(target => document.activeElement instanceof HTMLElement && document.activeElement.matches(target), selector).catch(() => false);
}

async function mobileRoute(page, route) {
  await page.evaluate(target => window.YT_MOBILE_APP?.navigate?.(target), route);
  await page.waitForSelector(`[data-mobile-view="${route}"]`, { state: 'visible', timeout: 5_000 });
  await sleep(80);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('mobileAppRoot');
    return {
      viewport: window.innerWidth,
      html: html.scrollWidth,
      body: body.scrollWidth,
      mobileRoot: root?.scrollWidth || 0
    };
  });
  const maxWidth = Math.max(overflow.html, overflow.body, overflow.mobileRoot || 0);
  expect(maxWidth <= overflow.viewport + 1, `${label}: no horizontal overflow`, JSON.stringify(overflow));
  return overflow;
}

async function inspectMobileTypography(page, label) {
  const result = await page.evaluate(() => {
    const scope = document.getElementById('mobileAppRoot');
    if (!scope) return { tooSmall: [], tooShort: [] };
    const textSelectors = 'span,small,p,b,strong,h1,h2,button,label';
    const tooSmall = [...scope.querySelectorAll(textSelectors)].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const text = (element.textContent || '').trim();
      return text && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.fontSize) < 11;
    }).slice(0, 16).map(element => ({ tag: element.tagName, text: (element.textContent || '').trim().slice(0, 60), size: getComputedStyle(element).fontSize, className: element.className }));

    const interactive = [...scope.querySelectorAll('button')].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const tooShort = interactive.filter(element => element.getBoundingClientRect().height < 43.5).slice(0, 16).map(element => ({ text: (element.textContent || '').trim().slice(0, 60), height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width, className: element.className }));
    return { tooSmall, tooShort };
  });
  expect(result.tooSmall.length === 0, `${label}: visible business text stays at or above 11px`, JSON.stringify(result.tooSmall));
  expect(result.tooShort.length === 0, `${label}: visible mobile buttons keep a 44px touch-height floor`, JSON.stringify(result.tooShort));
  return result;
}

async function inspectCriticalTruncation(page, label) {
  const result = await page.evaluate(() => {
    const selectors = [
      '.v5-record-metric span', '.v5-record-metric strong', '.v5-record-card-title>strong',
      '.v5-record-primary strong', '.v5-history-metrics b', '.v5-history-metrics small',
      '.v51-workspace-card b', '.v51-workspace-card small'
    ].join(',');
    return [...document.querySelectorAll(selectors)].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
      const clippedX = element.scrollWidth > element.clientWidth + 1;
      const clippedY = element.scrollHeight > element.clientHeight + 1;
      return clippedX || clippedY;
    }).slice(0, 16).map(element => ({
      text: (element.textContent || '').trim().slice(0, 70),
      className: element.className,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
  });
  expect(result.length === 0, `${label}: critical business labels and values are not clipped`, JSON.stringify(result));
  return result;
}

async function inspectContrast(page, label) {
  const result = await page.evaluate(() => {
    const parse = input => {
      const match = String(input).match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+([\d.]+))?\)/);
      return match ? { r: +match[1], g: +match[2], b: +match[3], a: match[4] == null ? 1 : +match[4] } : null;
    };
    const luminance = rgb => {
      const channel = value => {
        const c = value / 255;
        return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
      };
      return .2126 * channel(rgb.r) + .7152 * channel(rgb.g) + .0722 * channel(rgb.b);
    };
    const ratio = (a, b) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
    };
    const backgroundFor = element => {
      let current = element;
      while (current) {
        const color = parse(getComputedStyle(current).backgroundColor);
        if (color && color.a >= .98) return color;
        current = current.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const selectors = [
      '.v5-mobile-content p', '.v5-mobile-content small', '.v5-mobile-eyebrow',
      '.v5-record-metric span', '.v5-intel-op span', '.v5-intel-op small',
      '.v5-core-section-head span', '.v5-core-section-head small',
      '.v5-overview-section-head span', '.v5-overview-section-head small', '.v51-result-note'
    ].join(',');
    return [...document.querySelectorAll(selectors)].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return false;
      const fg = parse(style.color);
      if (!fg) return false;
      return ratio(fg, backgroundFor(element)) < 4.5;
    }).slice(0, 16).map(element => {
      const fg = parse(getComputedStyle(element).color);
      const bg = backgroundFor(element);
      return { text: (element.textContent || '').trim().slice(0, 60), className: element.className, color: getComputedStyle(element).color, ratio: ratio(fg, bg).toFixed(2) };
    });
  });
  expect(result.length === 0, `${label}: supporting business text keeps >=4.5:1 contrast`, JSON.stringify(result));
  return result;
}

async function inspectOverviewHierarchy(page, label) {
  const result = await page.evaluate(() => ({
    summary: document.querySelectorAll('.v51-overview-results .v5-overview-summary').length,
    kpis: document.querySelectorAll('.v51-overview-results .v5-overview-kpis button').length,
    priority: document.querySelectorAll('.v51-overview-priority').length,
    trend: document.querySelectorAll('#v5OverviewTrend').length,
    shortcuts: document.querySelectorAll('.v5-overview-shortcuts').length,
    legacyStatus: document.querySelectorAll('.v5-intel-status').length,
    legacyOps: document.querySelectorAll('.v51-overview .v5-intel-ops').length
  }));
  expect(result.summary === 1, `${label}: Overview has one primary result surface`, JSON.stringify(result));
  expect(result.kpis === 2, `${label}: Overview keeps only ACOS/TACOS supporting KPIs`, JSON.stringify(result));
  expect(result.priority === 1, `${label}: Overview exposes a dedicated action-priority surface`, JSON.stringify(result));
  expect(result.trend === 1, `${label}: Overview keeps one trend surface`, JSON.stringify(result));
  expect(result.shortcuts === 0 && result.legacyStatus === 0 && result.legacyOps === 0, `${label}: Overview removes redundant workspace/status density`, JSON.stringify(result));
  return result;
}

async function inspectRecordGrid(page, route, viewport, label) {
  await mobileRoute(page, route);
  const result = await page.evaluate(() => {
    const grid = document.querySelector('.v5-record-metrics');
    if (!grid) return { present: false, columns: 0, template: '' };
    const template = getComputedStyle(grid).gridTemplateColumns;
    return { present: true, columns: template.split(' ').filter(Boolean).length, template };
  });
  if (result.present && viewport.width <= 390) expect(result.columns === 2, `${label} / ${route}: <=390px record metrics use 2 columns`, JSON.stringify(result));
  if (result.present && viewport.width > 390) expect(result.columns === 4, `${label} / ${route}: >390px record metrics may use 4 columns`, JSON.stringify(result));
  return result;
}

async function inspectHistoryGrid(page, viewport, label) {
  await mobileRoute(page, 'history');
  const result = await page.evaluate(() => {
    const grid = document.querySelector('.v5-history-metrics');
    if (!grid) return { present: false, columns: 0, template: '' };
    const template = getComputedStyle(grid).gridTemplateColumns;
    return { present: true, columns: template.split(' ').filter(Boolean).length, template };
  });
  if (result.present && viewport.width <= 390) expect(result.columns === 2, `${label} / history: <=390px history metrics use 2 columns`, JSON.stringify(result));
  return result;
}

async function testRouteScrollReset(page, label) {
  await mobileRoute(page, 'ads');
  const before = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  await page.click('[data-mobile-route="products"]');
  await page.waitForSelector('[data-mobile-view="products"]', { state: 'visible', timeout: 4_000 });
  await sleep(100);
  const afterSwitch = await page.evaluate(() => window.scrollY);
  expect(afterSwitch <= 1, `${label}: primary route switch resets document scroll`, `before=${before} after=${afterSwitch}`);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const beforeRepeat = await page.evaluate(() => window.scrollY);
  await page.click('[data-mobile-route="products"]');
  await sleep(100);
  const afterRepeat = await page.evaluate(() => window.scrollY);
  expect(afterRepeat <= 1, `${label}: re-tapping active primary tab scrolls to top`, `before=${beforeRepeat} after=${afterRepeat}`);
  return { before, afterSwitch, beforeRepeat, afterRepeat };
}

async function testOperationalControls(page, label) {
  const result = {};
  const tests = [
    ['ads', '[data-v51-ads-filter="over45"]', '[data-v51-ads-sort]', 'acos'],
    ['products', '[data-v51-products-filter="trafficLowCvr"]', '[data-v51-products-sort]', 'cvr'],
    ['inventory', '[data-v51-inventory-filter="unsellable"]', '[data-v51-inventory-sort]', 'unsellable']
  ];
  for (const [route, filter, select, value] of tests) {
    await mobileRoute(page, route);
    expect(await visible(page, filter), `${label} / ${route}: operational filter is visible`);
    expect(await visible(page, select), `${label} / ${route}: sort control is visible`);
    await page.click(filter);
    await sleep(80);
    const pressed = await page.$eval(filter, element => element.getAttribute('aria-pressed') === 'true');
    expect(pressed, `${label} / ${route}: filter state persists after rerender`);
    await page.selectOption(select, value);
    await sleep(80);
    const selected = await page.$eval(select, element => element.value);
    expect(selected === value, `${label} / ${route}: sort state persists after rerender`, `selected=${selected}`);
    result[route] = { filter: true, sort: selected };
  }
  return result;
}

async function screenshotPrimaryViews(page, viewport) {
  for (const route of PRIMARY_SCREENSHOTS) {
    await mobileRoute(page, route);
    await page.screenshot({ path: path.join(artifactDir, `mobile-${viewport.width}x${viewport.height}-${route}.png`), fullPage: true });
  }
}

async function testMobileInteractions(page, viewport, label) {
  await mobileRoute(page, 'overview');

  const searchButton = '[data-mobile-action="search"]';
  expect(await visible(page, searchButton), `${label}: Search trigger visible`);
  await page.click(searchButton);
  await page.waitForSelector('.v5-search-field input', { state: 'visible', timeout: 4_000 });
  expect(await visible(page, '.v5-fullscreen'), `${label}: Search opens native full-screen surface`);
  if (viewport.width === 390) await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-search.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await sleep(100);
  expect(!(await visible(page, '.v5-search-field input')), `${label}: Search closes with Escape`);
  expect(await activeMatches(page, searchButton), `${label}: Search restores trigger focus`);

  const periodButton = '[data-mobile-action="period"]';
  expect(await visible(page, periodButton), `${label}: Period trigger visible`);
  await page.click(periodButton);
  await page.waitForSelector('.v5-interaction-sheet', { state: 'visible', timeout: 4_000 });
  expect(await visible(page, '.v5-interaction-sheet'), `${label}: Period opens native bottom sheet`);
  if (viewport.width === 390) await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-period.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await sleep(100);
  expect(!(await visible(page, '.v5-interaction-sheet')), `${label}: Period closes with Escape`);
  expect(await activeMatches(page, periodButton), `${label}: Period restores trigger focus`);

  const compareButton = '[data-v5-open-compare]';
  expect(await visible(page, compareButton), `${label}: Compare trigger visible`);
  await page.click(compareButton);
  await page.waitForSelector('#v5MobileCompareRoot .v5-fullscreen', { state: 'visible', timeout: 4_000 });
  expect(await visible(page, '#v5MobileCompareRoot .v5-fullscreen'), `${label}: Compare opens native full-screen surface`);
  if (viewport.width === 390) await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-compare.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await sleep(100);
  expect(!(await visible(page, '#v5MobileCompareRoot .v5-fullscreen')), `${label}: Compare closes with Escape`);
  expect(await activeMatches(page, compareButton), `${label}: Compare restores trigger focus`);

  const workspaceButton = '[data-mobile-route="workspace"]';
  expect(await visible(page, workspaceButton), `${label}: Workspace trigger visible`);
  await page.click(workspaceButton);
  await page.waitForSelector('[data-mobile-view="workspace"]', { state: 'visible', timeout: 4_000 });
  expect(await visible(page, '.v51-workspace-grid'), `${label}: Workspace opens as a persistent route`);

  await mobileRoute(page, 'finance');
  const workspaceCurrent = await page.$eval(workspaceButton, element => element.getAttribute('aria-current') === 'page');
  expect(workspaceCurrent, `${label}: secondary route keeps Workspace active in Bottom Nav`);

  await mobileRoute(page, 'ads');
  const cardCount = await page.$$eval('.v5-record-card', cards => cards.length);
  if (cardCount > 0) {
    const detailTrigger = '.v5-record-card';
    await page.click(detailTrigger);
    await page.waitForSelector('#v5MobileOverlayRoot .v5-fullscreen', { state: 'visible', timeout: 4_000 });
    expect(await visible(page, '#v5MobileOverlayRoot .v5-fullscreen'), `${label}: record Detail opens native full-screen surface`);
    if (viewport.width === 390) await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-detail.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await sleep(100);
    expect(!(await visible(page, '#v5MobileOverlayRoot .v5-fullscreen')), `${label}: Detail closes with Escape`);
    expect(await activeMatches(page, detailTrigger), `${label}: Detail restores record focus`);
  } else {
    pass(`${label}: Detail runtime evidence skipped because current local dataset has no record cards`);
  }
}

async function runMobile(browser, viewport) {
  const label = `Mobile ${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const signals = await capturePageSignals(page);
  const row = { viewport, views: {}, signals };
  report.mobile.push(row);
  try {
    await load(page);
    await page.waitForSelector('#mobileAppRoot:not([hidden])', { state: 'visible', timeout: 8_000 });
    expect(await page.evaluate(() => document.body.classList.contains('v5-native-mobile')), `${label}: Native Mobile runtime selected`);
    expect(await visible(page, '.v5-mobile-bottom-nav'), `${label}: fixed five-item bottom navigation visible`);
    const navCount = await page.$$eval('.v5-mobile-bottom-nav .v5-mobile-nav-item', items => items.length);
    expect(navCount === 5, `${label}: bottom navigation has exactly 5 destinations`, `count=${navCount}`);

    for (const route of MOBILE_VIEWS) {
      await mobileRoute(page, route);
      const overflow = await assertNoHorizontalOverflow(page, `${label} / ${route}`);
      row.views[route] = { overflow };
      if (SECONDARY_VIEWS.has(route)) {
        const workspaceCurrent = await page.$eval('[data-mobile-route="workspace"]', element => element.getAttribute('aria-current') === 'page');
        expect(workspaceCurrent, `${label} / ${route}: Workspace exposes active-group aria-current`);
      }
    }

    await mobileRoute(page, 'overview');
    row.typography = await inspectMobileTypography(page, label);
    row.contrast = await inspectContrast(page, label);
    row.overviewHierarchy = await inspectOverviewHierarchy(page, label);
    row.truncation = {};
    for (const route of ['ads', 'products', 'inventory', 'history', 'workspace']) {
      await mobileRoute(page, route);
      row.truncation[route] = await inspectCriticalTruncation(page, `${label} / ${route}`);
    }
    row.grids = {
      ads: await inspectRecordGrid(page, 'ads', viewport, label),
      products: await inspectRecordGrid(page, 'products', viewport, label),
      inventory: await inspectRecordGrid(page, 'inventory', viewport, label),
      history: await inspectHistoryGrid(page, viewport, label)
    };
    row.scroll = await testRouteScrollReset(page, label);
    row.controls = await testOperationalControls(page, label);
    await testMobileInteractions(page, viewport, label);

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('.v5-mobile-bottom-nav')?.getBoundingClientRect();
      const app = document.querySelector('.v5-mobile-app');
      return {
        navTop: nav?.top,
        navBottom: nav?.bottom,
        navHeight: nav?.height,
        viewportHeight: innerHeight,
        appPaddingBottom: Number.parseFloat(getComputedStyle(app).paddingBottom || '0')
      };
    });
    expect(Math.abs((geometry.navBottom ?? 0) - geometry.viewportHeight) <= 2, `${label}: bottom nav aligns to viewport bottom`, JSON.stringify(geometry));
    expect((geometry.appPaddingBottom || 0) >= (geometry.navHeight || 0), `${label}: content reserves space for bottom nav`, JSON.stringify(geometry));

    const nonGet = signals.apiRequests.filter(request => request.method !== 'GET');
    expect(nonGet.length === 0, `${label}: /api requests are GET-only`, JSON.stringify(nonGet));
    expect(signals.consoleErrors.length === 0, `${label}: console error = 0`, JSON.stringify(signals.consoleErrors));
    expect(signals.pageErrors.length === 0, `${label}: page error = 0`, JSON.stringify(signals.pageErrors));

    await screenshotPrimaryViews(page, viewport);
  } catch (error) {
    fail(`${label}: Chromium acceptance execution`, error?.stack || error?.message || String(error));
  } finally {
    await context.close();
  }
}

async function runDesktop(browser, viewport) {
  const label = `Desktop ${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const page = await context.newPage();
  const signals = await capturePageSignals(page);
  const row = { viewport, signals };
  report.desktop.push(row);
  try {
    await load(page);
    await page.waitForSelector('.global-nav', { state: 'visible', timeout: 8_000 });
    expect(!(await page.evaluate(() => document.body.classList.contains('v5-native-mobile'))), `${label}: Desktop runtime remains Desktop`);
    expect(await visible(page, '.global-nav'), `${label}: Desktop global navigation visible`);
    expect(!(await visible(page, '#mobileAppRoot')), `${label}: Native Mobile root hidden`);
    const navCount = await page.$$eval('#mainNav .nav-item', items => items.filter(item => getComputedStyle(item).display !== 'none').length);
    expect(navCount === 9, `${label}: all 9 Desktop navigation items visible`, `count=${navCount}`);
    await assertNoHorizontalOverflow(page, label);

    const desktopRoutes = ['overview','finance','charges','ads','products','inventory','returns','history','data'];
    for (const route of desktopRoutes) {
      await page.click(`#mainNav .nav-item[data-page="${route}"]`);
      await sleep(70);
      const active = await page.$eval(`#mainNav .nav-item[data-page="${route}"]`, element => element.classList.contains('active'));
      expect(active, `${label}: Desktop route ${route} activates`);
      await assertNoHorizontalOverflow(page, `${label} / ${route}`);
    }

    await page.click('#commandButton');
    await sleep(60);
    expect(await page.$eval('#commandPalette', element => element.getAttribute('aria-hidden') === 'false'), `${label}: command palette opens`);
    await page.keyboard.press('Escape');
    await sleep(100);
    expect(await page.$eval('#commandPalette', element => element.getAttribute('aria-hidden') === 'true'), `${label}: command palette closes with Escape`);
    expect(await activeMatches(page, '#commandButton'), `${label}: command palette restores trigger focus`);

    await page.click('#periodButton');
    await sleep(60);
    expect(await page.$eval('#periodPopover', element => element.getAttribute('aria-hidden') === 'false'), `${label}: period dialog opens`);
    await page.keyboard.press('Escape');
    await sleep(100);
    expect(await page.$eval('#periodPopover', element => element.getAttribute('aria-hidden') === 'true'), `${label}: period dialog closes with Escape`);
    expect(await activeMatches(page, '#periodButton'), `${label}: period dialog restores trigger focus`);

    const nonGet = signals.apiRequests.filter(request => request.method !== 'GET');
    expect(nonGet.length === 0, `${label}: browser emits no write /api methods`, JSON.stringify(nonGet));
    expect(signals.consoleErrors.length === 0, `${label}: console error = 0`, JSON.stringify(signals.consoleErrors));
    expect(signals.pageErrors.length === 0, `${label}: page error = 0`, JSON.stringify(signals.pageErrors));

    await page.click('#mainNav .nav-item[data-page="overview"]');
    await sleep(80);
    await page.screenshot({ path: path.join(artifactDir, `desktop-${viewport.width}x${viewport.height}-overview.png`), fullPage: true });
  } catch (error) {
    fail(`${label}: Chromium acceptance execution`, error?.stack || error?.message || String(error));
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files', '--disable-gpu']
});

try {
  for (const viewport of MOBILE) await runMobile(browser, viewport);
  for (const viewport of DESKTOP) await runDesktop(browser, viewport);
} finally {
  await browser.close();
}

report.failures = failures;
report.passed = failures.length === 0;
fs.writeFileSync(path.join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`\nV5.1 Chromium acceptance failed: ${failures.length} issue(s).`);
  for (const item of failures) console.error(` - ${item}`);
  process.exit(1);
}
console.log(`\nV5.1 Chromium acceptance passed: ${MOBILE.length} mobile + ${DESKTOP.length} desktop viewports.`);
