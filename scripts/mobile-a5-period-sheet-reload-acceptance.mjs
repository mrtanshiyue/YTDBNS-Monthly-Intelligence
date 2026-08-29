import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a5-period-sheet-reload');
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
  const source = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext.js'), 'utf8');
  expect(
    source.includes("state.sheet = payload.sheet === 'period' ? 'period' : null") &&
      source.includes("if (state.sheet === 'period')") &&
      source.includes("root.querySelector('.vnext-sheet [data-vnext-close-sheet]')?.focus()"),
    'A5 static contract: startup hydrates the period sheet from Browser History and restores dialog focus'
  );
  expect(
    source.includes('periodSheetCloseFocused') &&
      source.includes("root.querySelector('.vnext-sheet [data-vnext-close-sheet]')?.focus({ preventScroll: true })"),
    'A5 static contract: rerenders preserve focus only when the reconstructed period-sheet close control owned focus'
  );
  expect(
    !source.includes('localStorage.') && !source.includes('sessionStorage.'),
    'A5 static contract: Reload continuity adds no browser-storage dependency'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await waitReady(page);
}

async function waitReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForFunction(() => {
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    const period = window.YT_MOBILE_APP?.getPeriodContext?.();
    return ['live', 'demo'].includes(runtime?.mode) &&
      Boolean(period?.history?.from && period?.history?.to) &&
      period.history.from === period.runtime?.from &&
      period.history.to === period.runtime?.to;
  }, null, { timeout: 12_000 });
}

async function openPeriodSheet(page) {
  await page.evaluate(() => {
    const trigger = document.querySelector('.vnext-toolbar [data-vnext-period]');
    if (!trigger) throw new Error('Missing period trigger');
    trigger.click();
  });
  await waitSheet(page);
}

async function waitSheet(page) {
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'visible', timeout: 6_000 });
  await page.waitForFunction(() => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const payload = history.state?.ytdbnsMobileVnext;
    return core?.sheet === 'period' && payload?.sheet === 'period';
  }, null, { timeout: 6_000 });
  await page.waitForTimeout(120);
}

async function waitNoSheet(page) {
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'detached', timeout: 6_000 });
  await page.waitForFunction(() => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const payload = history.state?.ytdbnsMobileVnext;
    return core?.sheet == null && payload?.sheet == null;
  }, null, { timeout: 6_000 });
  await page.waitForTimeout(120);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const period = window.YT_MOBILE_APP?.getPeriodContext?.();
    const payload = history.state?.ytdbnsMobileVnext || null;
    const sheet = document.querySelector('.vnext-sheet[role="dialog"]');
    const close = sheet?.querySelector('[data-vnext-close-sheet]');
    const sheetRect = sheet?.getBoundingClientRect?.();
    const closeRect = close?.getBoundingClientRect?.();
    return {
      tab: core?.tab || null,
      coreSheet: core?.sheet || null,
      history: payload,
      period,
      historyLength: history.length,
      sheetExists: Boolean(sheet),
      sheetVisible: Boolean(sheetRect && sheetRect.width > 0 && sheetRect.height > 0),
      closeFocused: document.activeElement === close,
      closeHeight: closeRect?.height || 0,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      scrollY
    };
  });
}

function expectPeriodAligned(state, label, expected) {
  expect(
    state?.period?.history?.from === expected?.from &&
      state?.period?.history?.to === expected?.to &&
      state?.period?.runtime?.from === expected?.from &&
      state?.period?.runtime?.to === expected?.to,
    `${label}: reporting-period History/runtime ownership remains unchanged`,
    JSON.stringify(state?.period)
  );
}

function expectSheet(state, label, expected) {
  expect(state?.coreSheet === 'period' && state?.history?.sheet === 'period', `${label}: Mobile state and Browser History both own the period sheet`, JSON.stringify(state));
  expect(state?.sheetExists && state?.sheetVisible, `${label}: period sheet is visible`, JSON.stringify(state));
  expect(state?.historyLength === expected.historyLength, `${label}: no phantom History entry is created`, `expected=${expected.historyLength} actual=${state?.historyLength}`);
  expectPeriodAligned(state, label, expected.period);
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: no horizontal overflow`, JSON.stringify(state));
  expect(state?.scrollY <= 2, `${label}: restored sheet remains at the top`, `scrollY=${state?.scrollY}`);
  expect(state?.closeHeight >= 43.5, `${label}: period-sheet close control retains the 44px touch floor`, `height=${state?.closeHeight}`);
}

function expectRoute(state, label, expected) {
  expect(state?.coreSheet == null && state?.history?.sheet == null && !state?.sheetExists, `${label}: Browser Back restores the originating route without a stale sheet`, JSON.stringify(state));
  expect(state?.tab === expected.tab, `${label}: originating top-level route remains stable`, JSON.stringify(state));
  expect(state?.historyLength === expected.historyLength, `${label}: Browser traversal does not mutate History length`, `expected=${expected.historyLength} actual=${state?.historyLength}`);
  expectPeriodAligned(state, label, expected.period);
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: no horizontal overflow`, JSON.stringify(state));
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
    await openPeriodSheet(page);
    evidence.initial = await snapshot(page);
    const expected = {
      tab: evidence.initial.tab,
      historyLength: evidence.initial.historyLength,
      period: evidence.initial.period?.history
    };
    expectSheet(evidence.initial, `${label}/initial`, expected);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await waitReady(page);
    await waitSheet(page);
    evidence.afterReload = await snapshot(page);
    expectSheet(evidence.afterReload, `${label}/reload`, expected);
    expect(evidence.afterReload.closeFocused, `${label}/reload: reconstructed dialog owns initial focus`, JSON.stringify(evidence.afterReload));

    await page.evaluate(() => window.YT_SHARED_RUNTIME?.refresh?.());
    await waitReady(page);
    await waitSheet(page);
    evidence.afterRuntimeRefresh = await snapshot(page);
    expectSheet(evidence.afterRuntimeRefresh, `${label}/runtime-refresh`, expected);
    expect(evidence.afterRuntimeRefresh.closeFocused, `${label}/runtime-refresh: live-style runtime rerender preserves reconstructed dialog focus`, JSON.stringify(evidence.afterRuntimeRefresh));

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await waitNoSheet(page);
    evidence.afterBack = await snapshot(page);
    expectRoute(evidence.afterBack, `${label}/back`, expected);

    await page.goForward({ waitUntil: 'load' }).catch(() => null);
    await waitSheet(page);
    evidence.afterForward = await snapshot(page);
    expectSheet(evidence.afterForward, `${label}/forward`, expected);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await waitReady(page);
    await waitSheet(page);
    evidence.afterSecondReload = await snapshot(page);
    expectSheet(evidence.afterSecondReload, `${label}/second-reload`, expected);
    expect(evidence.afterSecondReload.closeFocused, `${label}/second-reload: reconstructed dialog owns initial focus`, JSON.stringify(evidence.afterSecondReload));
  } catch (error) {
    fail(`${label}: A5 period-sheet Reload acceptance completed`, error.stack || error.message || String(error));
  } finally {
    expect(requests.every(request => request.method === 'GET'), `${label}: Mobile API activity remains GET-only`, JSON.stringify(requests.filter(request => request.method !== 'GET')));
    expect(pageErrors.length === 0, `${label}: zero page errors`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: zero console errors`, JSON.stringify(consoleErrors));
    evidence.requests = requests;
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    report.push(evidence);
    await page.screenshot({ path: path.join(artifactDir, `period-sheet-reload-${label}.png`), fullPage: true }).catch(() => null);
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
  await runViewport(viewport);
}

fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} Mobile A5 period-sheet Reload acceptance failure(s)`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A5 period-sheet Reload acceptance PASS');
