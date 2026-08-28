import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-period-sheet-focus');
fs.mkdirSync(artifactDir, { recursive: true });

const CASES = [
  ['today', 'close'],
  ['today', 'escape'],
  ['today', 'back'],
  ['search', 'close'],
  ['search', 'escape'],
  ['search', 'back']
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

async function ready(page, tab) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  if (tab === 'search') {
    await page.click('.vnext-tabbar [data-vnext-tab="search"]');
    await page.waitForSelector('[data-vnext-page="search"]', { state: 'visible', timeout: 4_000 });
  }
}

function triggerSelector(tab) {
  return tab === 'search'
    ? '.vnext-search-toolbar [data-vnext-period]'
    : '.vnext-toolbar [data-vnext-period]';
}

async function openSheetWithKeyboard(page, tab) {
  const selector = triggerSelector(tab);
  await page.locator(selector).focus();
  const before = await page.evaluate(sel => {
    const trigger = document.querySelector(sel);
    return {
      triggerFocused: document.activeElement === trigger,
      triggerConnected: Boolean(trigger?.isConnected),
      activeTag: document.activeElement?.tagName || null
    };
  }, selector);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(() => document.activeElement?.matches?.('.vnext-sheet [data-vnext-close-sheet]'), null, { timeout: 4_000 });
  return before;
}

async function closeSheetBy(page, method) {
  if (method === 'close') {
    await page.keyboard.press('Enter');
  } else if (method === 'escape') {
    await page.keyboard.press('Escape');
  } else if (method === 'back') {
    await page.goBack({ waitUntil: 'load' }).catch(() => null);
  }
  await page.waitForSelector('.vnext-sheet', { state: 'detached', timeout: 4_000 });
  await page.waitForTimeout(140);
}

async function focusState(page, tab) {
  const selector = triggerSelector(tab);
  return page.evaluate(({ sel, tabId }) => {
    const trigger = document.querySelector(sel);
    const active = document.activeElement;
    return {
      tab: tabId,
      triggerExists: Boolean(trigger),
      triggerConnected: Boolean(trigger?.isConnected),
      triggerFocused: active === trigger,
      focusIsBody: active === document.body,
      activeTag: active?.tagName || null,
      activeClass: active?.className || null,
      rootTab: document.querySelector('.vnext-app')?.dataset.tab || null,
      sheetExists: Boolean(document.querySelector('.vnext-sheet')),
      scrollY,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  }, { sel: selector, tabId: tab });
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
    for (const [tab, method] of CASES) {
      await ready(page, tab);
      const before = await openSheetWithKeyboard(page, tab);
      expect(before.triggerFocused && before.triggerConnected, `${label}/${tab}/${method}: period trigger owns focus before opening`, JSON.stringify(before));
      await closeSheetBy(page, method);
      const after = await focusState(page, tab);
      evidence.cases[`${tab}:${method}`] = { before, after };
      expect(after.rootTab === tab && after.triggerExists && after.triggerConnected && !after.sheetExists, `${label}/${tab}/${method}: closing period sheet restores the originating route and replacement trigger`, JSON.stringify(after));
      expect(after.triggerFocused && !after.focusIsBody, `${label}/${tab}/${method}: focus returns to the connected replacement period trigger`, JSON.stringify(after));
      expect(after.scrollY <= 2, `${label}/${tab}/${method}: focus return does not move the document`, `scrollY=${after.scrollY}`);
      expect(after.documentWidth <= after.viewport + 1, `${label}/${tab}/${method}: period focus return creates no horizontal overflow`, JSON.stringify(after));
    }

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: period-sheet focus acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: period-sheet focus acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 period-sheet focus acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 period-sheet focus acceptance passed.');
