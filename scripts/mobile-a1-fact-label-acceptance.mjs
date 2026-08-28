import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a1-fact-label');
fs.mkdirSync(artifactDir, { recursive: true });

const MODULES = ['products', 'inventory', 'charges', 'returns', 'history', 'data'];
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
  const css = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.css'), 'utf8');
  expect(
    css.includes('.vnext-module-facts small') &&
      css.includes('-webkit-line-clamp:2') &&
      css.includes('white-space:normal') &&
      css.includes('overflow-wrap:anywhere'),
    'A1 static contract: hero fact labels may wrap to two lines instead of one-line ellipsis'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
}

async function openModule(page, module) {
  await page.evaluate(id => {
    const button = document.querySelector(`.vnext-module-rail [data-vnext-module="${id}"]`);
    if (!button) throw new Error(`Missing module button: ${id}`);
    button.click();
  }, module);
  await page.waitForSelector(`.vnext-density-module-page[data-density-module="${module}"]`, { state: 'visible', timeout: 4_000 });
}

async function labelState(page, module) {
  return page.evaluate(id => {
    const labels = [...document.querySelectorAll(`.vnext-density-module-page[data-density-module="${id}"] .vnext-module-facts small`)];
    return labels.map(label => {
      const box = label.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const rects = [...range.getClientRects()].filter(rect => rect.width > .1 && rect.height > .1);
      const uniqueRows = [...new Set(rects.map(rect => Math.round(rect.top * 2) / 2))];
      const contentBottom = rects.length ? Math.max(...rects.map(rect => rect.bottom)) : box.bottom;
      const style = getComputedStyle(label);
      return {
        text: label.textContent.trim(),
        width: box.width,
        height: box.height,
        clientWidth: label.clientWidth,
        scrollWidth: label.scrollWidth,
        clientHeight: label.clientHeight,
        scrollHeight: label.scrollHeight,
        rows: uniqueRows.length,
        contentBottom,
        boxBottom: box.bottom,
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        lineClamp: style.webkitLineClamp
      };
    });
  }, module);
}

function fullyVisible(label) {
  return label.text.length > 0 &&
    label.whiteSpace !== 'nowrap' &&
    label.rows <= 2 &&
    label.contentBottom <= label.boxBottom + 1.5 &&
    label.scrollWidth <= label.clientWidth + 1;
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

  const evidence = { viewport, modules: {} };
  try {
    await ready(page);
    for (const module of MODULES) {
      await openModule(page, module);
      const labels = await labelState(page, module);
      evidence.modules[module] = labels;
      expect(labels.length >= 3, `${label}/${module}: hero fact labels are present`, JSON.stringify(labels));
      const clipped = labels.filter(item => !fullyVisible(item));
      expect(clipped.length === 0, `${label}/${module}: every hero fact label is fully readable within two lines`, JSON.stringify(clipped));
      if (module === 'products' || module === 'inventory') {
        await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-${module}.png`), fullPage: false });
      }
    }

    const buyBox = evidence.modules.products?.find(item => item.text === 'Buy Box风险');
    expect(Boolean(buyBox) && fullyVisible(buyBox), `${label}/products: Buy Box风险 is not ellipsized`, JSON.stringify(buyBox));
    const lowStock = evidence.modules.inventory?.find(item => item.text === '低库存SKU');
    expect(Boolean(lowStock) && fullyVisible(lowStock), `${label}/inventory: 低库存SKU is not ellipsized`, JSON.stringify(lowStock));

    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: fact-label acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));
    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: fact-label acceptance completed without harness exception`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A1 fact-label acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A1 fact-label acceptance passed.');
