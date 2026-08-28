import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-alert-severity');
fs.mkdirSync(artifactDir, { recursive: true });

const SEVERITIES = ['all', 'critical', 'warning'];
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
    ia.includes("const ALERT_SEVERITY_SET = new Set(['all', 'critical', 'warning'])") &&
      ia.includes('function syncSeveritySemantics()') &&
      ia.includes("button.setAttribute('aria-pressed'") &&
      ia.includes("return { kind: 'severity', severity }") &&
      ia.includes("target.kind === 'severity'") &&
      ia.includes('focus({ preventScroll: true })'),
    'A1 static contract: Alerts severity exposes selected semantics and synthesized-focus continuity'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.click('.vnext-tabbar [data-vnext-tab="alerts"]');
  await page.waitForSelector('[data-vnext-page="alerts"] .vnext-segmented[aria-label="异常级别"]', { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('[data-vnext-page="alerts"] [data-vnext-severity]')];
    return buttons.length === 3 && buttons.every(button => ['true', 'false'].includes(button.getAttribute('aria-pressed')));
  }, null, { timeout: 4_000 });
}

async function severityState(page) {
  return page.evaluate(() => {
    const group = document.querySelector('[data-vnext-page="alerts"] .vnext-segmented[aria-label="异常级别"]');
    const buttons = [...(group?.querySelectorAll('[data-vnext-severity]') || [])];
    const active = buttons.filter(button => button.classList.contains('active'));
    const pressed = buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
    const focused = document.activeElement?.dataset?.vnextSeverity || null;
    return {
      buttonCount: buttons.length,
      activeCount: active.length,
      activeSeverity: active[0]?.dataset.vnextSeverity || null,
      pressedCount: pressed.length,
      pressedSeverity: pressed[0]?.dataset.vnextSeverity || null,
      focusedSeverity: focused,
      allExplicit: buttons.every(button => ['true', 'false'].includes(button.getAttribute('aria-pressed'))),
      coreSeverity: window.YT_MOBILE_VNEXT?.getState?.().severity || null,
      iaSeverity: window.YT_MOBILE_VNEXT_IA?.getState?.().severity || null,
      scrollY,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  });
}

function expectState(state, severity, label, focusRequired = false) {
  expect(
    state?.buttonCount === 3 && state?.activeCount === 1 && state?.pressedCount === 1 && state?.allExplicit,
    `${label}: severity group exposes one visual and one machine-readable selection`,
    JSON.stringify(state)
  );
  expect(
    state?.activeSeverity === severity && state?.pressedSeverity === severity && state?.coreSeverity === severity && state?.iaSeverity === severity,
    `${label}: visual, aria-pressed, core state and IA state identify the same severity`,
    JSON.stringify(state)
  );
  if (focusRequired) {
    expect(state?.focusedSeverity === severity, `${label}: focus moves to the connected replacement severity control`, JSON.stringify(state));
  }
  expect(state?.scrollY <= 2, `${label}: severity interaction does not move the document`, `scrollY=${state?.scrollY}`);
  expect(state?.documentWidth <= state?.viewport + 1, `${label}: severity interaction creates no horizontal overflow`, JSON.stringify(state));
}

async function activateSeverity(page, severity) {
  const selector = `[data-vnext-page="alerts"] [data-vnext-severity="${severity}"]`;
  await page.locator(selector).focus();
  const focusedBefore = await page.evaluate(value => document.activeElement?.dataset?.vnextSeverity === value, severity);
  expect(focusedBefore, `${severity}: severity control owns focus before Enter`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(value => {
    const buttons = [...document.querySelectorAll('[data-vnext-page="alerts"] [data-vnext-severity]')];
    const active = buttons.find(button => button.classList.contains('active'));
    const pressed = buttons.filter(button => button.getAttribute('aria-pressed') === 'true');
    return window.YT_MOBILE_VNEXT?.getState?.().severity === value &&
      active?.dataset.vnextSeverity === value &&
      pressed.length === 1 && pressed[0]?.dataset.vnextSeverity === value;
  }, severity, { timeout: 4_000 });
  await page.waitForTimeout(80);
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

  const evidence = { viewport, states: {} };
  try {
    await ready(page);
    const initial = await severityState(page);
    evidence.states.initial = initial;
    expectState(initial, 'all', `${label}/initial`);

    for (const severity of ['critical', 'warning', 'all']) {
      await activateSeverity(page, severity);
      const state = await severityState(page);
      evidence.states[severity] = state;
      expectState(state, severity, `${label}/${severity}`, true);
    }

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: Alerts severity acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-alerts.png`), fullPage: false });
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: Alerts severity acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 Alerts severity acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 Alerts severity acceptance passed.');
