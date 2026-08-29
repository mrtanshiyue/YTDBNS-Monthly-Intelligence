import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a3-navigation-context');
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
    bridge.includes("const NAVIGATION_SEVERITIES = new Set(['all', 'critical', 'warning'])") &&
      bridge.includes('function navigationContextFromState(') &&
      bridge.includes('function persistNavigationContext()') &&
      bridge.includes('function restoreNavigationContext()') &&
      bridge.includes('getNavigationContext()'),
    'A3 navigation-context static contract: Alerts severity and Search query share the Mobile Browser History coordination layer'
  );
  expect(
    bridge.includes("input.dispatchEvent(new Event('input', { bubbles: true }))") &&
      bridge.includes('button.click()'),
    'A3 navigation-context static contract: restoration replays the real Mobile UI controls rather than duplicating filtering/search logic'
  );
  expect(
    !bridge.includes('localStorage.') && !bridge.includes('sessionStorage.'),
    'A3 navigation-context static contract: no browser storage dependency is introduced'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForFunction(() => {
    const state = window.YT_SHARED_RUNTIME?.getState?.();
    const period = window.YT_MOBILE_APP?.getPeriodContext?.();
    const navigation = window.YT_MOBILE_APP?.getNavigationContext?.();
    return ['live', 'demo'].includes(state?.mode) &&
      Boolean(period?.history?.from && period?.history?.to) &&
      period.history.from === period.runtime?.from &&
      period.history.to === period.runtime?.to &&
      navigation?.history?.severity === 'all' &&
      navigation?.history?.query === '';
  }, null, { timeout: 12_000 });
}

async function openTab(page, tab) {
  await page.evaluate(id => {
    const button = document.querySelector(`.vnext-tabbar [data-vnext-tab="${id}"]`);
    if (!button) throw new Error(`Missing tab ${id}`);
    button.click();
  }, tab);
  await page.waitForSelector(`[data-vnext-page="${tab}"]`, { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(id => window.YT_MOBILE_VNEXT?.getState?.()?.tab === id, tab, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function selectSeverity(page, severity) {
  await page.evaluate(value => {
    const button = document.querySelector(`[data-vnext-page="alerts"] [data-vnext-severity="${value}"]`);
    if (!button) throw new Error(`Missing severity ${value}`);
    button.click();
  }, severity);
  await page.waitForFunction(value => {
    const context = window.YT_MOBILE_APP?.getNavigationContext?.();
    const pressed = document.querySelector(`[data-vnext-page="alerts"] [data-vnext-severity="${value}"]`)?.getAttribute('aria-pressed');
    return context?.history?.severity === value &&
      context?.memory?.severity === value &&
      context?.core?.severity === value &&
      context?.view?.severity === value &&
      pressed === 'true';
  }, severity, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function typeSearch(page, query) {
  const input = page.locator('[data-vnext-search-input]');
  await input.fill(query);
  await page.waitForFunction(value => {
    const context = window.YT_MOBILE_APP?.getNavigationContext?.();
    const liveInput = document.querySelector('[data-vnext-search-input]');
    return context?.history?.query === value &&
      context?.memory?.query === value &&
      context?.core?.query === value &&
      context?.view?.query === value &&
      liveInput?.value === value;
  }, query, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const navigation = window.YT_MOBILE_APP?.getNavigationContext?.();
    const period = window.YT_MOBILE_APP?.getPeriodContext?.();
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    const payload = history.state?.ytdbnsMobileVnext || null;
    const activeTab = document.querySelector('.vnext-tabbar [data-vnext-tab].active')?.dataset.vnextTab || null;
    const severityButtons = [...document.querySelectorAll('[data-vnext-page="alerts"] [data-vnext-severity]')];
    const searchInput = document.querySelector('[data-vnext-search-input]');
    const touchTargets = [
      ...document.querySelectorAll('.vnext-tabbar [data-vnext-tab]:not([hidden])'),
      ...severityButtons
    ].filter(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      tab: core?.tab || null,
      activeTab,
      coreSeverity: core?.severity || null,
      iaSeverity: ia?.severity || null,
      coreQuery: core?.query ?? null,
      pressedSeverity: severityButtons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.vnextSeverity || null,
      searchValue: searchInput?.value ?? null,
      history: payload,
      navigation,
      period,
      touchHeights: touchTargets.map(button => button.getBoundingClientRect().height),
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      scrollY
    };
  });
}

function expectCommon(state, label) {
  expect(
    state?.period?.history?.from === state?.period?.runtime?.from &&
      state?.period?.history?.to === state?.period?.runtime?.to,
    `${label}: navigation-context history leaves period ownership aligned with runtime`,
    JSON.stringify(state?.period)
  );
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: no horizontal overflow`, JSON.stringify(state));
  expect(state?.scrollY <= 2, `${label}: route remains at the top`, `scrollY=${state?.scrollY}`);
  expect(
    state?.touchHeights?.length > 0 && state.touchHeights.every(height => height >= 43.5),
    `${label}: visible navigation controls retain the 44px touch floor`,
    JSON.stringify(state?.touchHeights)
  );
  expect(state?.navigation?.restoring === false, `${label}: no navigation restore remains stranded`, JSON.stringify(state?.navigation));
}

function expectAlerts(state, { severity, query }, label) {
  expectCommon(state, label);
  expect(state?.tab === 'alerts' && state?.activeTab === 'alerts', `${label}: Alerts tab and active tab agree`, JSON.stringify(state));
  expect(
    state?.history?.severity === severity &&
      state?.navigation?.history?.severity === severity &&
      state?.navigation?.memory?.severity === severity &&
      state?.coreSeverity === severity &&
      state?.iaSeverity === severity &&
      state?.pressedSeverity === severity,
    `${label}: Alerts severity restores across history, memory, core, IA, visual state and aria-pressed`,
    JSON.stringify(state)
  );
  expect(
    state?.history?.query === query &&
      state?.navigation?.history?.query === query &&
      state?.navigation?.memory?.query === query,
    `${label}: latent Search query remains owned by the same Browser History entry`,
    JSON.stringify(state)
  );
}

function expectSearch(state, { severity, query }, label) {
  expectCommon(state, label);
  expect(state?.tab === 'search' && state?.activeTab === 'search', `${label}: Search tab and active tab agree`, JSON.stringify(state));
  expect(
    state?.history?.query === query &&
      state?.navigation?.history?.query === query &&
      state?.navigation?.memory?.query === query &&
      state?.coreQuery === query &&
      state?.searchValue === query,
    `${label}: Search query restores across history, memory, core and the visible input`,
    JSON.stringify(state)
  );
  expect(
    state?.history?.severity === severity &&
      state?.navigation?.history?.severity === severity &&
      state?.navigation?.memory?.severity === severity,
    `${label}: latent Alerts severity survives while Search is active`,
    JSON.stringify(state)
  );
}

async function waitAlerts(page, severity, query) {
  await page.waitForFunction(({ severityValue, queryValue }) => {
    const context = window.YT_MOBILE_APP?.getNavigationContext?.();
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const pressed = document.querySelector(`[data-vnext-page="alerts"] [data-vnext-severity="${severityValue}"]`)?.getAttribute('aria-pressed');
    return core?.tab === 'alerts' &&
      core?.severity === severityValue &&
      context?.history?.severity === severityValue &&
      context?.history?.query === queryValue &&
      context?.memory?.severity === severityValue &&
      context?.memory?.query === queryValue &&
      pressed === 'true' &&
      context?.restoring === false;
  }, { severityValue: severity, queryValue: query }, { timeout: 8_000 });
  await page.waitForTimeout(120);
}

async function waitSearch(page, severity, query) {
  await page.waitForFunction(({ severityValue, queryValue }) => {
    const context = window.YT_MOBILE_APP?.getNavigationContext?.();
    const core = window.YT_MOBILE_VNEXT?.getState?.();
    const input = document.querySelector('[data-vnext-search-input]');
    return core?.tab === 'search' &&
      core?.query === queryValue &&
      input?.value === queryValue &&
      context?.history?.severity === severityValue &&
      context?.history?.query === queryValue &&
      context?.memory?.severity === severityValue &&
      context?.memory?.query === queryValue &&
      context?.restoring === false;
  }, { severityValue: severity, queryValue: query }, { timeout: 8_000 });
  await page.waitForTimeout(120);
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

    await openTab(page, 'alerts');
    await selectSeverity(page, 'critical');
    evidence.alertsCritical = await snapshot(page);
    expectAlerts(evidence.alertsCritical, { severity: 'critical', query: '' }, `${label}/alerts-critical`);

    await openTab(page, 'search');
    evidence.searchBeforeQuery = await snapshot(page);
    expectSearch(evidence.searchBeforeQuery, { severity: 'critical', query: '' }, `${label}/search-before-query`);

    await typeSearch(page, 'SKU');
    evidence.searchSku = await snapshot(page);
    expectSearch(evidence.searchSku, { severity: 'critical', query: 'SKU' }, `${label}/search-SKU`);

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await waitAlerts(page, 'critical', '');
    evidence.afterBack = await snapshot(page);
    expectAlerts(evidence.afterBack, { severity: 'critical', query: '' }, `${label}/browser-back-alerts`);

    await page.goForward({ waitUntil: 'load' }).catch(() => null);
    await waitSearch(page, 'critical', 'SKU');
    evidence.afterForward = await snapshot(page);
    expectSearch(evidence.afterForward, { severity: 'critical', query: 'SKU' }, `${label}/browser-forward-search`);

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
    await waitSearch(page, 'critical', 'SKU');
    evidence.afterReload = await snapshot(page);
    expectSearch(evidence.afterReload, { severity: 'critical', query: 'SKU' }, `${label}/reload-search`);

    await openTab(page, 'alerts');
    await waitAlerts(page, 'critical', 'SKU');
    evidence.alertsAfterReload = await snapshot(page);
    expectAlerts(evidence.alertsAfterReload, { severity: 'critical', query: 'SKU' }, `${label}/alerts-after-search-reload`);

    await page.goBack({ waitUntil: 'load' }).catch(() => null);
    await waitSearch(page, 'critical', 'SKU');
    evidence.backToReloadedSearch = await snapshot(page);
    expectSearch(evidence.backToReloadedSearch, { severity: 'critical', query: 'SKU' }, `${label}/back-to-reloaded-search`);
  } catch (error) {
    fail(`${label}: A3 navigation-context acceptance completed`, error.stack || error.message || String(error));
  } finally {
    expect(requests.every(request => request.method === 'GET'), `${label}: Mobile API activity remains GET-only`, JSON.stringify(requests.filter(request => request.method !== 'GET')));
    expect(pageErrors.length === 0, `${label}: zero page errors`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: zero console errors`, JSON.stringify(consoleErrors));
    evidence.requests = requests;
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    report.push(evidence);
    await page.screenshot({ path: path.join(artifactDir, `navigation-context-${label}.png`), fullPage: true }).catch(() => null);
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
  await runViewport(viewport);
}

fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} A3 navigation-context acceptance failure(s)`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log('\nMobile A3 navigation-context acceptance PASS');
