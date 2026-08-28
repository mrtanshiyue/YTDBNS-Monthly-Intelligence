import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-period-selection-focus');
fs.mkdirSync(artifactDir, { recursive: true });

const CASES = [
  { tab: 'today', kind: 'quick', value: 'previous' },
  { tab: 'search', kind: 'month' }
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

function triggerSelector(tab) {
  return tab === 'search'
    ? '.vnext-search-toolbar [data-vnext-period]'
    : '.vnext-toolbar [data-vnext-period]';
}

async function ready(page, tab) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  if (tab === 'search') {
    await page.click('.vnext-tabbar [data-vnext-tab="search"]');
    await page.waitForSelector('[data-vnext-page="search"]', { state: 'visible', timeout: 4_000 });
  }
  await page.waitForFunction(() => {
    const s = window.YT_SHARED_RUNTIME?.getState?.();
    return Boolean(s && !s.loading && s.from && s.to);
  }, null, { timeout: 8_000 });
}

async function openSheetWithKeyboard(page, tab) {
  const selector = triggerSelector(tab);
  await page.locator(selector).focus();
  const before = await page.evaluate(sel => {
    const trigger = document.querySelector(sel);
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    return {
      from: runtime?.from || null,
      to: runtime?.to || null,
      triggerFocused: document.activeElement === trigger,
      triggerConnected: Boolean(trigger?.isConnected)
    };
  }, selector);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'visible', timeout: 4_000 });
  return before;
}

async function chooseQuick(page, value) {
  const selector = `.vnext-sheet [data-vnext-quick="${value}"]`;
  await page.locator(selector).focus();
  const focused = await page.evaluate(sel => document.activeElement === document.querySelector(sel), selector);
  expect(focused, `quick/${value}: quick-period control owns focus before Enter`);
  await page.keyboard.press('Enter');
  return { selected: value };
}

async function chooseAlternateMonth(page, currentFrom) {
  const month = await page.evaluate(current => {
    const currentMonth = current?.slice?.(0, 7) || '';
    const buttons = [...document.querySelectorAll('.vnext-sheet [data-vnext-period-month]')];
    return buttons.map(button => button.dataset.vnextPeriodMonth).find(value => value && value !== currentMonth) || null;
  }, currentFrom);
  expect(Boolean(month), 'month: sheet exposes an alternate explicit month');
  if (!month) return { selected: null };
  const selector = `.vnext-sheet [data-vnext-period-month="${month}"]`;
  await page.locator(selector).focus();
  const focused = await page.evaluate(sel => document.activeElement === document.querySelector(sel), selector);
  expect(focused, `month/${month}: month control owns focus before Enter`);
  await page.keyboard.press('Enter');
  return { selected: month };
}

async function waitForFinalSelection(page, tab, before, choice) {
  await page.waitForSelector('.vnext-sheet', { state: 'detached', timeout: 4_000 });
  await page.waitForFunction(({ kind, selected, oldFrom }) => {
    const state = window.YT_SHARED_RUNTIME?.getState?.();
    if (!state || state.loading || !state.from || !state.to) return false;
    if (kind === 'month') return Boolean(selected) && state.from.slice(0, 7) === selected;
    return state.from !== oldFrom;
  }, { kind: choice.kind, selected: choice.selected, oldFrom: before.from }, { timeout: 8_000 });
  /* Validate after the runtime subscriber has had time to perform its final root rerender. */
  await page.waitForTimeout(220);

  const selector = triggerSelector(tab);
  return page.evaluate(({ sel, tabId, oldFrom, kind, selected }) => {
    const trigger = document.querySelector(sel);
    const active = document.activeElement;
    const state = window.YT_SHARED_RUNTIME?.getState?.();
    return {
      tab: tabId,
      kind,
      selected,
      oldFrom,
      finalFrom: state?.from || null,
      finalTo: state?.to || null,
      loading: Boolean(state?.loading),
      rootTab: document.querySelector('.vnext-app')?.dataset.tab || null,
      triggerExists: Boolean(trigger),
      triggerConnected: Boolean(trigger?.isConnected),
      triggerFocused: active === trigger,
      focusIsBody: active === document.body,
      activeTag: active?.tagName || null,
      sheetExists: Boolean(document.querySelector('.vnext-sheet')),
      scrollY,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  }, { sel: selector, tabId: tab, oldFrom: before.from, kind: choice.kind, selected: choice.selected });
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
    for (const testCase of CASES) {
      await ready(page, testCase.tab);
      const before = await openSheetWithKeyboard(page, testCase.tab);
      expect(before.triggerFocused && before.triggerConnected, `${label}/${testCase.tab}/${testCase.kind}: period trigger owns focus before opening`, JSON.stringify(before));
      const picked = testCase.kind === 'quick'
        ? await chooseQuick(page, testCase.value)
        : await chooseAlternateMonth(page, before.from);
      const choice = { kind: testCase.kind, selected: picked.selected };
      const after = await waitForFinalSelection(page, testCase.tab, before, choice);
      evidence.cases[`${testCase.tab}:${testCase.kind}`] = { before, choice, after };

      expect(after.rootTab === testCase.tab && !after.sheetExists && !after.loading, `${label}/${testCase.tab}/${testCase.kind}: period selection closes the sheet and settles runtime state`, JSON.stringify(after));
      expect(after.finalFrom && after.finalFrom !== before.from, `${label}/${testCase.tab}/${testCase.kind}: period selection changes the canonical runtime period`, JSON.stringify(after));
      if (testCase.kind === 'month') {
        expect(after.finalFrom?.slice(0, 7) === choice.selected, `${label}/${testCase.tab}/month: explicit month selection becomes the canonical runtime month`, JSON.stringify(after));
      }
      expect(after.triggerExists && after.triggerConnected, `${label}/${testCase.tab}/${testCase.kind}: replacement period trigger exists after the final runtime rerender`, JSON.stringify(after));
      expect(after.triggerFocused && !after.focusIsBody, `${label}/${testCase.tab}/${testCase.kind}: final focus remains on the connected period trigger after runtime period rerender`, JSON.stringify(after));
      expect(after.scrollY <= 2, `${label}/${testCase.tab}/${testCase.kind}: period selection focus continuity does not move the document`, `scrollY=${after.scrollY}`);
      expect(after.documentWidth <= after.viewport + 1, `${label}/${testCase.tab}/${testCase.kind}: period selection creates no horizontal overflow`, JSON.stringify(after));
    }

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: period-selection focus acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: period-selection focus acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 period-selection focus acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 period-selection focus acceptance passed.');
