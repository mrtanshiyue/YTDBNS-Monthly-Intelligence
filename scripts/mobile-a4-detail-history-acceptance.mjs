import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a4-detail-history');
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
  const bridge = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-app-bridge.js'), 'utf8');
  expect(
    bridge.includes("const DETAIL_REF_TYPES = new Set(['signal', 'result'])") &&
      bridge.includes('function normalizeDetailRef(') &&
      bridge.includes('function detailRefFromState(') &&
      bridge.includes('function restoreDetailContext()') &&
      bridge.includes('getDetailHistoryContext()'),
    'A4 detail-history static contract: detail entries own a stable serializable reference in the Mobile coordination layer'
  );
  expect(
    bridge.includes("const selector = normalized.type === 'signal' ? '[data-vnext-signal]' : '[data-vnext-result]'") &&
      bridge.includes('target.click()'),
    'A4 detail-history static contract: Reload reconstruction replays the real Mobile detail trigger'
  );
  expect(
    bridge.includes('restoringDetailContext && payload?.detailKey') &&
      bridge.includes('nativeReplaceState(enriched, title, url)'),
    'A4 detail-history static contract: reconstruction replaces the current entry instead of pushing a phantom History layer'
  );
  expect(
    !bridge.includes('localStorage.') && !bridge.includes('sessionStorage.'),
    'A4 detail-history static contract: no browser storage dependency is introduced'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
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

async function openSearch(page, query) {
  await page.evaluate(() => {
    const button = document.querySelector('.vnext-tabbar [data-vnext-tab="search"]');
    if (!button) throw new Error('Missing Search tab');
    button.click();
  });
  await page.waitForSelector('[data-vnext-page="search"]', { state: 'visible', timeout: 4_000 });
  const input = page.locator('[data-vnext-search-input]');
  await input.fill(query);
  await page.waitForFunction(value => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const navigation = window.YT_MOBILE_APP?.getNavigationContext?.();
    const liveInput = document.querySelector('[data-vnext-search-input]');
    return core?.tab === 'search' &&
      core?.query === value &&
      navigation?.history?.query === value &&
      navigation?.memory?.query === value &&
      liveInput?.value === value;
  }, query, { timeout: 5_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-vnext-result]')].some(node => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }), null, { timeout: 8_000 });
  await page.waitForTimeout(100);
}

async function openFirstSearchDetail(page) {
  const ref = await page.evaluate(() => {
    const target = [...document.querySelectorAll('[data-vnext-result]')].find(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && node.dataset.vnextResult;
    });
    if (!target) throw new Error('No visible Search result detail trigger');
    const id = target.dataset.vnextResult;
    target.click();
    return { type: 'result', id };
  });
  await page.waitForSelector('.vnext-detail-screen', { state: 'visible', timeout: 5_000 });
  await page.waitForFunction(expected => {
    const detail = window.YT_MOBILE_APP?.getDetailHistoryContext?.();
    const payload = history.state?.ytdbnsMobileVnext;
    return detail?.detailOpen === true &&
      detail?.restoring === false &&
      detail?.history?.type === expected.type &&
      detail?.history?.id === expected.id &&
      payload?.detailRef?.type === expected.type &&
      payload?.detailRef?.id === expected.id &&
      Boolean(payload?.detailKey);
  }, ref, { timeout: 5_000 });
  await page.waitForTimeout(100);
  return ref;
}

async function waitDetail(page, ref, title) {
  await page.waitForFunction(({ expected, expectedTitle }) => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const detail = window.YT_MOBILE_APP?.getDetailHistoryContext?.();
    const navigation = window.YT_MOBILE_APP?.getNavigationContext?.();
    const payload = history.state?.ytdbnsMobileVnext;
    const titleNode = document.querySelector('#vnextDetailTitle');
    return document.documentElement.dataset.mobileVnextReady === 'true' &&
      core?.tab === 'search' &&
      core?.query === 'SKU' &&
      core?.detailOpen === true &&
      detail?.detailOpen === true &&
      detail?.restoring === false &&
      detail?.pending === null &&
      detail?.history?.type === expected.type &&
      detail?.history?.id === expected.id &&
      payload?.detailRef?.type === expected.type &&
      payload?.detailRef?.id === expected.id &&
      Boolean(payload?.detailKey) &&
      navigation?.history?.query === 'SKU' &&
      navigation?.memory?.query === 'SKU' &&
      titleNode?.textContent?.trim() === expectedTitle;
  }, { expected: ref, expectedTitle: title }, { timeout: 10_000 });
  await page.waitForTimeout(120);
}

async function waitSearchWithoutDetail(page) {
  await page.waitForFunction(() => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const detail = window.YT_MOBILE_APP?.getDetailHistoryContext?.();
    const navigation = window.YT_MOBILE_APP?.getNavigationContext?.();
    const payload = history.state?.ytdbnsMobileVnext;
    const input = document.querySelector('[data-vnext-search-input]');
    return core?.tab === 'search' &&
      core?.query === 'SKU' &&
      core?.detailOpen === false &&
      detail?.detailOpen === false &&
      detail?.restoring === false &&
      !payload?.detailKey &&
      !payload?.detailRef &&
      navigation?.history?.query === 'SKU' &&
      navigation?.memory?.query === 'SKU' &&
      input?.value === 'SKU';
  }, null, { timeout: 8_000 });
  await page.waitForTimeout(120);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const detail = window.YT_MOBILE_APP?.getDetailHistoryContext?.();
    const navigation = window.YT_MOBILE_APP?.getNavigationContext?.();
    const period = window.YT_MOBILE_APP?.getPeriodContext?.();
    const payload = history.state?.ytdbnsMobileVnext || null;
    const close = document.querySelector('[data-vnext-close-detail]');
    const closeRect = close?.getBoundingClientRect?.();
    return {
      tab: core?.tab || null,
      query: core?.query ?? null,
      detailOpen: Boolean(core?.detailOpen),
      detail,
      navigation,
      period,
      history: payload,
      historyLength: history.length,
      title: document.querySelector('#vnextDetailTitle')?.textContent?.trim() || null,
      detailVisible: Boolean(document.querySelector('.vnext-detail-screen')),
      closeHeight: closeRect?.height || 0,
      closeFocused: document.activeElement === close,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      scrollY
    };
  });
}

function expectDetail(state, ref, title, label, expectedHistoryLength = null) {
  expect(
    state?.period?.history?.from === state?.period?.runtime?.from &&
      state?.period?.history?.to === state?.period?.runtime?.to,
    `${label}: detail History keeps reporting-period ownership aligned`,
    JSON.stringify(state?.period)
  );
  expect(state?.tab === 'search' && state?.query === 'SKU', `${label}: originating Search context remains active`, JSON.stringify(state));
  expect(state?.detailOpen && state?.detailVisible, `${label}: detail surface is restored`, JSON.stringify(state));
  expect(
    state?.detail?.history?.type === ref.type &&
      state?.detail?.history?.id === ref.id &&
      state?.history?.detailRef?.type === ref.type &&
      state?.history?.detailRef?.id === ref.id &&
      Boolean(state?.history?.detailKey),
    `${label}: stable detail reference remains owned by the same History entry`,
    JSON.stringify(state)
  );
  expect(state?.title === title, `${label}: the same detail title is reconstructed`, JSON.stringify(state));
  expect(state?.detail?.restoring === false && state?.detail?.pending === null, `${label}: no detail reconstruction remains stranded`, JSON.stringify(state?.detail));
  if (expectedHistoryLength != null) {
    expect(state?.historyLength === expectedHistoryLength, `${label}: Reload reconstruction does not push a phantom History entry`, `expected=${expectedHistoryLength} actual=${state?.historyLength}`);
  }
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: no horizontal overflow`, JSON.stringify(state));
  expect(state?.scrollY <= 2, `${label}: restored detail remains at the top`, `scrollY=${state?.scrollY}`);
  expect(state?.closeHeight >= 43.5, `${label}: detail Back control retains the 44px touch floor`, `height=${state?.closeHeight}`);
}

function expectSearch(state, label) {
  expect(state?.tab === 'search' && state?.query === 'SKU', `${label}: Browser Back returns to the originating Search query`, JSON.stringify(state));
  expect(!state?.detailOpen && !state?.detailVisible, `${label}: detail is closed after Browser Back`, JSON.stringify(state));
  expect(!state?.history?.detailKey && !state?.history?.detailRef, `${label}: non-detail Search entry owns no stale detail reference`, JSON.stringify(state?.history));
  expect(state?.navigation?.history?.query === 'SKU' && state?.navigation?.memory?.query === 'SKU', `${label}: Search navigation context remains intact`, JSON.stringify(state?.navigation));
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
    await openSearch(page, 'SKU');
    const ref = await openFirstSearchDetail(page);
    evidence.initialDetail = await snapshot(page);
    const title = evidence.initialDetail.title;
    const detailHistoryLength = evidence.initialDetail.historyLength;
    expect(Boolean(title), `${label}/initial-detail: detail exposes a stable visible title`, JSON.stringify(evidence.initialDetail));
    expectDetail(evidence.initialDetail, ref, title, `${label}/initial-detail`);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await waitDetail(page, ref, title);
    evidence.afterReload = await snapshot(page);
    expectDetail(evidence.afterReload, ref, title, `${label}/reload-detail`, detailHistoryLength);

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await waitSearchWithoutDetail(page);
    evidence.afterBack = await snapshot(page);
    expectSearch(evidence.afterBack, `${label}/browser-back-search`);

    await page.goForward({ waitUntil: 'load' }).catch(() => null);
    await waitDetail(page, ref, title);
    evidence.afterForward = await snapshot(page);
    expectDetail(evidence.afterForward, ref, title, `${label}/browser-forward-detail`, detailHistoryLength);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await waitDetail(page, ref, title);
    evidence.afterSecondReload = await snapshot(page);
    expectDetail(evidence.afterSecondReload, ref, title, `${label}/second-reload-detail`, detailHistoryLength);
  } catch (error) {
    fail(`${label}: A4 detail-history acceptance completed`, error.stack || error.message || String(error));
  } finally {
    expect(requests.every(request => request.method === 'GET'), `${label}: Mobile API activity remains GET-only`, JSON.stringify(requests.filter(request => request.method !== 'GET')));
    expect(pageErrors.length === 0, `${label}: zero page errors`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: zero console errors`, JSON.stringify(consoleErrors));
    evidence.requests = requests;
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    report.push(evidence);
    await page.screenshot({ path: path.join(artifactDir, `detail-history-${label}.png`), fullPage: true }).catch(() => null);
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
  await runViewport(viewport);
}

fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} A4 detail-history acceptance failure(s)`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log('\nMobile A4 detail-history acceptance PASS');
