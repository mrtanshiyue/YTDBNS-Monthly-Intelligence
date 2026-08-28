import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const entry = pathToFileURL(path.join(rootDir, 'public', 'index.html')).href;
const artifactDir = path.join(rootDir, 'artifacts', 'mobile-first-screen');
fs.mkdirSync(artifactDir, { recursive: true });

const failures = [];
const report = [];
const expectedFirstSix = ['销售额', '贡献利润', 'ACOS', '广告花费', '退款销售', '库存资金'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
};
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app[data-tab="today"]', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-density-board .vnext-density-metric', { state: 'visible', timeout: 12_000 });
  await sleep(120);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const rectJson = element => {
      const r = element?.getBoundingClientRect();
      return r ? { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height } : null;
    };
    const px = value => Number.parseFloat(value || '0') || 0;
    const board = document.querySelector('.vnext-density-board');
    const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
    const tabbar = document.querySelector('.vnext-tabbar');
    const metrics = [...document.querySelectorAll('.vnext-density-board .vnext-density-metric')].map(button => {
      const r = button.getBoundingClientRect();
      const label = button.querySelector(':scope > span')?.textContent?.trim() || '';
      const labelStyle = getComputedStyle(button.querySelector(':scope > span'));
      const small = button.querySelector('small');
      return {
        label,
        detail: button.dataset.densityMetric || '',
        top: r.top,
        left: r.left,
        bottom: r.bottom,
        height: r.height,
        labelFont: px(labelStyle.fontSize),
        smallFont: small ? px(getComputedStyle(small).fontSize) : null
      };
    }).sort((a, b) => Math.abs(a.top - b.top) > 1 ? a.top - b.top : a.left - b.left);
    const railStyle = rail ? getComputedStyle(rail) : null;
    const railButtons = rail ? [...rail.querySelectorAll('button:not([hidden])')].map(button => ({
      text: button.textContent.trim(),
      height: button.getBoundingClientRect().height,
      font: px(getComputedStyle(button).fontSize)
    })) : [];
    const micro = [...document.querySelectorAll('.vnext-home-brief-head p,.vnext-home-brief-facts small,.vnext-home-cost-grid span,.vnext-home-cost-grid small,.vnext-dense-record-copy small,.vnext-dense-record-copy em,.vnext-dense-record-value small')]
      .filter(node => getComputedStyle(node).display !== 'none')
      .map(node => ({ text: node.textContent.trim().slice(0, 32), font: px(getComputedStyle(node).fontSize), selector: node.className || node.tagName }));
    const visibleButtons = [...document.querySelectorAll('#mobileAppRoot button')].filter(button => {
      const r = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return r.width > 0 && r.height > 0 && r.top < (tabbar?.getBoundingClientRect().top ?? innerHeight) && r.bottom > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).map(button => ({ text: button.textContent.trim().slice(0, 40), height: button.getBoundingClientRect().height }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      toolbar: rectJson(document.querySelector('.vnext-toolbar')),
      rail: {
        rect: rectJson(rail),
        clientWidth: rail?.clientWidth || 0,
        scrollWidth: rail?.scrollWidth || 0,
        mask: railStyle?.maskImage || railStyle?.webkitMaskImage || 'none',
        buttons: railButtons
      },
      brief: rectJson(document.querySelector('.vnext-main[data-vnext-page="today"] .vnext-brief')),
      board: rectJson(board),
      tabbar: rectJson(tabbar),
      metrics,
      micro,
      visibleButtons,
      scroll: {
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        root: document.getElementById('mobileAppRoot')?.scrollWidth || 0
      },
      homeBriefCount: document.querySelectorAll('.vnext-home-brief').length,
      stylesheetLoaded: Boolean(document.getElementById('mobileVNextFirstScreenStyles'))
    };
  });
}

async function runMobile(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const label = `${viewport.width}x${viewport.height}`;
  const errors = [];
  const apiRequests = [];
  page.on('pageerror', error => errors.push(error.message || String(error)));
  page.on('request', request => {
    if (request.url().includes('/api/')) apiRequests.push({ method: request.method(), url: request.url() });
  });

  try {
    await ready(page);
    const s = await snapshot(page);
    report.push({ label, ...s, errors, apiRequests });

    expect(s.stylesheetLoaded, `${label}: first-screen stylesheet is loaded before acceptance`);
    expect(s.metrics.length === 12, `${label}: all 12 operating KPIs remain visible`, `count=${s.metrics.length}`);
    expect(JSON.stringify(s.metrics.slice(0, 6).map(item => item.label)) === JSON.stringify(expectedFirstSix), `${label}: visual KPI priority is Sales → Profit → ACOS → Ad Spend → Refunds → Inventory`, JSON.stringify(s.metrics.slice(0, 6).map(item => item.label)));
    expect(s.board?.height <= 250, `${label}: 12-KPI board stays within 250px vertical budget`, `height=${s.board?.height}`);
    const firstSixBottom = Math.max(...s.metrics.slice(0, 6).map(item => item.bottom));
    expect(firstSixBottom < (s.tabbar?.top ?? viewport.height) - 12, `${label}: six decision KPIs are visible before the fixed tab bar`, `firstSixBottom=${firstSixBottom}, tabbarTop=${s.tabbar?.top}`);
    expect(s.metrics.every(item => item.height >= 57.5), `${label}: KPI touch targets stay >=58px`, JSON.stringify(s.metrics.map(item => [item.label, item.height])));
    expect(s.metrics.every(item => item.labelFont >= 9.9 && (item.smallFont == null || item.smallFont >= 9.4)), `${label}: KPI labels/supporting text meet the readability floor`, JSON.stringify(s.metrics.map(item => [item.label, item.labelFont, item.smallFont])));

    expect(s.rail.scrollWidth > s.rail.clientWidth + 20, `${label}: business rail remains horizontally scrollable`, `${s.rail.scrollWidth}/${s.rail.clientWidth}`);
    expect(s.rail.mask && s.rail.mask !== 'none', `${label}: business rail exposes a visual overflow affordance`, s.rail.mask);
    expect(s.rail.buttons.length === 8, `${label}: business rail still contains eight domains`, `count=${s.rail.buttons.length}`);
    expect(s.rail.buttons.every(item => item.height >= 43.5 && item.font >= 11.4), `${label}: rail touch targets and text remain comfortable`, JSON.stringify(s.rail.buttons));

    const minMicro = s.micro.length ? Math.min(...s.micro.map(item => item.font)) : 9;
    expect(minMicro >= 8.9, `${label}: home/module microcopy no longer falls below 9px`, `min=${minMicro}`);
    expect(s.homeBriefCount === 9, `${label}: all nine full-business briefs remain on Today`, `count=${s.homeBriefCount}`);
    expect(Math.max(s.scroll.html, s.scroll.body, s.scroll.root) <= viewport.width + 1, `${label}: document horizontal overflow remains zero`, JSON.stringify(s.scroll));
    expect(s.visibleButtons.every(item => item.height >= 43.5), `${label}: visible first-screen buttons remain >=44px high`, JSON.stringify(s.visibleButtons.filter(item => item.height < 43.5)));
    expect(errors.length === 0, `${label}: page errors=0`, JSON.stringify(errors));
    expect(apiRequests.every(request => request.method === 'GET'), `${label}: browser API activity remains GET-only`, JSON.stringify(apiRequests));

    await page.screenshot({ path: path.join(artifactDir, `today-${label}.png`), fullPage: false });
  } catch (error) {
    fail(`${label}: first-screen acceptance crashed`, error.stack || String(error));
    await page.screenshot({ path: path.join(artifactDir, `failure-${label}.png`), fullPage: true }).catch(() => null);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runDesktop() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
    const state = await page.evaluate(() => ({
      rootHidden: document.getElementById('mobileAppRoot')?.hidden,
      mobileActive: document.body.classList.contains('mobile-vnext-active'),
      mainDisplay: getComputedStyle(document.querySelector('.main-shell')).display,
      firstScreenLink: Boolean(document.getElementById('mobileVNextFirstScreenStyles'))
    }));
    expect(state.firstScreenLink, 'desktop 1440: stylesheet may load but remains breakpoint-scoped');
    expect(state.rootHidden === true && state.mobileActive === false, 'desktop 1440: Mobile surface remains inactive', JSON.stringify(state));
    expect(state.mainDisplay !== 'none', 'desktop 1440: Desktop product remains visible', state.mainDisplay);
  } catch (error) {
    fail('desktop 1440: first-screen no-op smoke crashed', error.stack || String(error));
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) await runMobile(viewport);
await runDesktop();
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile first-screen browser acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log('\nMobile first-screen browser acceptance passed.');
