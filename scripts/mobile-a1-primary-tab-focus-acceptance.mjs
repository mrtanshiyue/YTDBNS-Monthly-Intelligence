import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-primary-tab-focus');
fs.mkdirSync(artifactDir, { recursive: true });

const TABS = ['alerts', 'trends', 'today', 'search'];
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
    ia.includes("const PRIMARY_FOCUS_TAB_SET = new Set(['today', 'alerts', 'trends', 'search'])") &&
      ia.includes("return { kind: 'tab', tab }") &&
      ia.includes('target.kind === \'tab\'') &&
      ia.includes('.vnext-tabbar [data-vnext-tab=') &&
      ia.includes('focus({ preventScroll: true })'),
    'A1 static contract: IA preserves synthesized primary-tab focus without document scrolling'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-tabbar [data-vnext-tab="today"]', { state: 'visible', timeout: 12_000 });
}

async function activateTabWithKeyboard(page, tab) {
  const selector = `.vnext-tabbar [data-vnext-tab="${tab}"]`;
  await page.locator(selector).focus();
  const before = await page.evaluate(tabId => ({
    focused: document.activeElement?.dataset?.vnextTab === tabId,
    connected: Boolean(document.activeElement?.isConnected),
    current: document.querySelector(`.vnext-tabbar [data-vnext-tab="${tabId}"]`)?.getAttribute('aria-current') || null
  }), tab);

  await page.keyboard.press('Enter');
  await page.waitForSelector(`[data-vnext-page="${tab}"]`, { state: 'visible', timeout: 4_000 });
  await page.waitForTimeout(100);

  const after = await page.evaluate(tabId => {
    const active = document.activeElement;
    const replacement = document.querySelector(`.vnext-tabbar [data-vnext-tab="${tabId}"]`);
    const searchInputFocused = active?.matches?.('[data-vnext-search-input]') || false;
    return {
      tab: tabId,
      rootTab: document.querySelector('.vnext-app')?.dataset.tab || null,
      replacementConnected: Boolean(replacement?.isConnected),
      replacementCurrent: replacement?.getAttribute('aria-current') || null,
      replacementActive: Boolean(replacement?.classList.contains('active')),
      focusedTab: active?.dataset?.vnextTab || null,
      searchInputFocused,
      focusIsBody: active === document.body,
      scrollY,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  }, tab);

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

  const evidence = { viewport, tabs: {} };
  try {
    await ready(page);

    for (const tab of TABS) {
      const state = await activateTabWithKeyboard(page, tab);
      evidence.tabs[tab] = state;
      expect(state.before.focused && state.before.connected, `${label}/${tab}: primary tab owns focus before Enter`, JSON.stringify(state.before));
      expect(
        state.after.rootTab === tab && state.after.replacementConnected && state.after.replacementCurrent === 'page' && state.after.replacementActive,
        `${label}/${tab}: replacement primary tab keeps selected semantics after rerender`,
        JSON.stringify(state.after)
      );
      const focusContinuous = tab === 'search'
        ? state.after.focusedTab === 'search' || state.after.searchInputFocused
        : state.after.focusedTab === tab;
      expect(focusContinuous && !state.after.focusIsBody, `${label}/${tab}: keyboard focus stays in the logical destination after rerender`, JSON.stringify(state.after));
      expect(state.after.scrollY <= 2, `${label}/${tab}: primary-tab focus restoration does not move the document`, `scrollY=${state.after.scrollY}`);
      expect(state.after.documentWidth <= state.after.viewport + 1, `${label}/${tab}: primary-tab focus continuity creates no horizontal overflow`, JSON.stringify(state.after));
    }

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: primary-tab focus acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-search.png`), fullPage: false });
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: primary-tab focus acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 primary-tab focus acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 primary-tab focus acceptance passed.');
