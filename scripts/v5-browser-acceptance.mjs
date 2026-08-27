import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'v5-browser-acceptance');
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_BIN,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const executablePath = chromeCandidates.find(candidate => fs.existsSync(candidate));
if (!executablePath) throw new Error(`Chromium executable not found. Checked: ${chromeCandidates.join(', ')}`);

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
const MOBILE_VIEWS = ['overview', 'ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data'];
const failures = [];
const report = { exactEntry: entry, executablePath, mobile: [], desktop: [] };
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
  await sleep(300);
}

async function visible(page, selector) {
  return page.$eval(selector, element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
  }).catch(() => false);
}

async function mobileRoute(page, route) {
  await page.evaluate(target => window.YT_MOBILE_APP?.navigate?.(target), route);
  await page.waitForSelector(`[data-mobile-view="${route}"]`, { visible: true, timeout: 5_000 });
  await sleep(60);
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
    const textSelectors = 'span,small,p,b,strong,h1,h2,button';
    const tooSmall = [...scope.querySelectorAll(textSelectors)].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const text = (element.textContent || '').trim();
      return text && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.fontSize) < 10;
    }).slice(0, 12).map(element => ({ tag: element.tagName, text: (element.textContent || '').trim().slice(0, 50), size: getComputedStyle(element).fontSize, className: element.className }));

    const interactive = [...scope.querySelectorAll('button')].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const tooShort = interactive.filter(element => element.getBoundingClientRect().height < 43.5).slice(0, 12).map(element => ({ text: (element.textContent || '').trim().slice(0, 50), height: element.getBoundingClientRect().height, className: element.className }));
    return { tooSmall, tooShort };
  });
  expect(result.tooSmall.length === 0, `${label}: visible mobile text stays at or above 10px`, JSON.stringify(result.tooSmall));
  expect(result.tooShort.length === 0, `${label}: visible mobile buttons keep a 44px touch-height floor`, JSON.stringify(result.tooShort));
  return result;
}

async function inspectOverviewDensity(page, label) {
  const result = await page.evaluate(() => {
    const status = document.querySelector('.v5-intel-status');
    const primary = document.querySelector('.v5-intel-primary');
    const efficiency = document.querySelector('.v5-intel-efficiency');
    const ops = document.querySelector('.v5-intel-ops');
    const nav = document.querySelector('.v5-mobile-bottom-nav');
    return {
      statusCells: status?.children.length || 0,
      primaryChildren: primary?.children.length || 0,
      efficiencyMetrics: efficiency?.children.length || 0,
      opsMetrics: ops?.children.length || 0,
      opsBottom: ops?.getBoundingClientRect().bottom ?? Infinity,
      navTop: nav?.getBoundingClientRect().top ?? window.innerHeight,
      viewportHeight: window.innerHeight
    };
  });
  expect(result.statusCells === 4, `${label}: Overview status strip exposes 4 operating states`, JSON.stringify(result));
  expect(result.primaryChildren === 3, `${label}: Overview primary cluster exposes Sales / Profit / Margin`, JSON.stringify(result));
  expect(result.efficiencyMetrics === 4, `${label}: Overview efficiency cluster exposes 4 core metrics`, JSON.stringify(result));
  expect(result.opsMetrics === 4, `${label}: Overview operations strip exposes 4 operating metrics`, JSON.stringify(result));
  expect(result.opsBottom <= result.navTop + 2, `${label}: primary operating metrics fit before fixed bottom navigation`, JSON.stringify(result));
  return result;
}

async function testMobileInteractions(page, label) {
  await mobileRoute(page, 'overview');

  const searchButton = '[data-mobile-action="search"]';
  expect(await visible(page, searchButton), `${label}: Search trigger visible`);
  await page.click(searchButton);
  await page.waitForSelector('.v5-search-field input', { visible: true, timeout: 4_000 });
  expect(await visible(page, '.v5-fullscreen'), `${label}: Search opens native full-screen surface`);
  await page.keyboard.press('Escape');
  await sleep(80);
  expect(!(await visible(page, '.v5-search-field input')), `${label}: Search closes with Escape`);

  const periodButton = '[data-mobile-action="period"]';
  expect(await visible(page, periodButton), `${label}: Period trigger visible`);
  await page.click(periodButton);
  await page.waitForSelector('.v5-interaction-sheet', { visible: true, timeout: 4_000 });
  expect(await visible(page, '.v5-interaction-sheet'), `${label}: Period opens native bottom sheet`);
  await page.keyboard.press('Escape');
  await sleep(80);
  expect(!(await visible(page, '.v5-interaction-sheet')), `${label}: Period closes with Escape`);

  const compareButton = '[data-v5-open-compare]';
  expect(await visible(page, compareButton), `${label}: Compare trigger visible`);
  await page.click(compareButton);
  await page.waitForSelector('#v5MobileCompareRoot .v5-fullscreen', { visible: true, timeout: 4_000 });
  expect(await visible(page, '#v5MobileCompareRoot .v5-fullscreen'), `${label}: Compare opens native full-screen surface`);
  await page.keyboard.press('Escape');
  await sleep(80);
  expect(!(await visible(page, '#v5MobileCompareRoot .v5-fullscreen')), `${label}: Compare closes with Escape`);

  const moreButton = '[data-mobile-route="more"]';
  expect(await visible(page, moreButton), `${label}: More trigger visible`);
  await page.click(moreButton);
  await page.waitForSelector('.v5-mobile-sheet', { visible: true, timeout: 4_000 });
  expect(await visible(page, '.v5-mobile-sheet'), `${label}: More opens native module sheet`);
  await page.keyboard.press('Escape');
  await sleep(80);
  expect(!(await visible(page, '.v5-mobile-sheet')), `${label}: More closes with Escape`);

  await mobileRoute(page, 'ads');
  const cardCount = await page.$$eval('.v5-record-card', cards => cards.length);
  expect(cardCount > 0, `${label}: Ads exposes record cards for Detail acceptance`, `count=${cardCount}`);
  if (cardCount > 0) {
    await page.click('.v5-record-card');
    await page.waitForSelector('#v5MobileOverlayRoot .v5-fullscreen', { visible: true, timeout: 4_000 });
    expect(await visible(page, '#v5MobileOverlayRoot .v5-fullscreen'), `${label}: record Detail opens native full-screen surface`);
    await page.keyboard.press('Escape');
    await sleep(80);
    expect(!(await visible(page, '#v5MobileOverlayRoot .v5-fullscreen')), `${label}: Detail closes with Escape`);
  }
}

async function runMobile(browser, viewport) {
  const label = `Mobile ${viewport.width}x${viewport.height}`;
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const signals = await capturePageSignals(page);
  const row = { viewport, views: {}, signals };
  report.mobile.push(row);
  try {
    await load(page);
    await page.waitForSelector('#mobileAppRoot:not([hidden])', { visible: true, timeout: 8_000 });
    expect(await page.evaluate(() => document.body.classList.contains('v5-native-mobile')), `${label}: Native Mobile runtime selected`);
    expect(await visible(page, '.v5-mobile-bottom-nav'), `${label}: fixed five-item bottom navigation visible`);
    const navCount = await page.$$eval('.v5-mobile-bottom-nav .v5-mobile-nav-item', items => items.length);
    expect(navCount === 5, `${label}: bottom navigation has exactly 5 destinations`, `count=${navCount}`);

    for (const route of MOBILE_VIEWS) {
      await mobileRoute(page, route);
      const overflow = await assertNoHorizontalOverflow(page, `${label} / ${route}`);
      row.views[route] = { overflow };
    }

    await mobileRoute(page, 'overview');
    row.typography = await inspectMobileTypography(page, label);
    row.density = await inspectOverviewDensity(page, label);
    await testMobileInteractions(page, label);

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

    await mobileRoute(page, 'overview');
    await page.screenshot({ path: path.join(artifactDir, `mobile-${viewport.width}x${viewport.height}-overview.png`), fullPage: true });
  } catch (error) {
    fail(`${label}: Chromium acceptance execution`, error?.stack || error?.message || String(error));
  } finally {
    await page.close();
  }
}

async function runDesktop(browser, viewport) {
  const label = `Desktop ${viewport.width}x${viewport.height}`;
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const signals = await capturePageSignals(page);
  const row = { viewport, signals };
  report.desktop.push(row);
  try {
    await load(page);
    await page.waitForSelector('.global-nav', { visible: true, timeout: 8_000 });
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
    await sleep(60);
    expect(await page.$eval('#commandPalette', element => element.getAttribute('aria-hidden') === 'true'), `${label}: command palette closes with Escape`);

    await page.click('#periodButton');
    await sleep(60);
    expect(await page.$eval('#periodPopover', element => element.getAttribute('aria-hidden') === 'false'), `${label}: period dialog opens`);
    await page.keyboard.press('Escape');
    await sleep(60);
    expect(await page.$eval('#periodPopover', element => element.getAttribute('aria-hidden') === 'true'), `${label}: period dialog closes with Escape`);

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
    await page.close();
  }
}

const browser = await puppeteer.launch({
  executablePath,
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
  console.error(`\nV5 Chromium acceptance failed: ${failures.length} issue(s).`);
  for (const item of failures) console.error(` - ${item}`);
  process.exit(1);
}
console.log(`\nV5 Chromium acceptance passed: ${MOBILE.length} mobile + ${DESKTOP.length} desktop viewports.`);
