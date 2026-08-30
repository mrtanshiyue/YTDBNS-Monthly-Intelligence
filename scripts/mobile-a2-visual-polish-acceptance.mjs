import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a2-visual-polish');
fs.mkdirSync(artifactDir, { recursive: true });

const executablePath = [
  process.env.CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome'
].filter(Boolean).find(candidate => fs.existsSync(candidate));

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 }
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

function staticContract() {
  const css = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-fonts.css'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext.js'), 'utf8');
  const density = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-density.js'), 'utf8');

  expect(
    css.includes('--vx-bg:#F5F4F0') &&
      css.includes('--vx-surface:#FFFEFC') &&
      css.includes('--vx-ink:#1A1C19') &&
      css.includes('--vx-accent:#246B59') &&
      css.includes('--vx-radius:18px'),
    'Phase 5 static contract: Mobile visual tokens define one warm neutral system'
  );
  expect(
    css.includes('.vnext-module-rail[data-vnext-ia="domain"] button.active') &&
      css.includes('background:var(--vx-accent-soft)!important') &&
      css.includes('color:var(--vx-accent)!important'),
    'Phase 5 static contract: grouped business rail uses soft selected context instead of a competing black primary state'
  );
  expect(
    css.includes('.vnext-runtime.error') &&
      css.includes('.vnext-empty') &&
      css.includes('.vnext-density-empty') &&
      css.includes('.vnext-inline-loader') &&
      css.includes('.vnext-inline-error') &&
      css.includes('.vnext-skeleton'),
    'Phase 5 static contract: loading, error and empty surfaces share the final Mobile presentation layer'
  );
  expect(
    mobile.includes('function emptyMarkup(title, text)') &&
      mobile.includes('class="vnext-runtime error"') &&
      mobile.includes('class="vnext-inline-loader"') &&
      mobile.includes('class="vnext-inline-error"') &&
      mobile.includes('class="vnext-skeleton"') &&
      density.includes('class="vnext-density-empty"'),
    'Phase 5 static contract: every polished state selector remains wired to real product rendering paths'
  );
  expect(
    css.includes('text-transform:none') &&
      css.includes('.vnext-dense-record-copy small') &&
      css.includes('.vnext-module-section>header>span'),
    'Phase 5 static contract: English business metadata preserves native casing and remains secondary'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-tabbar', { state: 'visible', timeout: 12_000 });
  await page.waitForTimeout(100);
}

async function visualState(page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-9999px;color:var(--vx-accent);background:var(--vx-accent-soft)';
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    const accent = probeStyle.color;
    const accentSoft = probeStyle.backgroundColor;
    probe.remove();

    const root = document.querySelector('#mobileAppRoot');
    const toolbar = document.querySelector('.vnext-toolbar, .vnext-search-toolbar');
    const tabbar = document.querySelector('.vnext-tabbar');
    const activeTab = tabbar?.querySelector('button.active');
    const list = document.querySelector('.vnext-list');
    const rootStyle = root ? getComputedStyle(root) : null;
    const tabbarStyle = tabbar ? getComputedStyle(tabbar) : null;
    const activeTabStyle = activeTab ? getComputedStyle(activeTab) : null;
    const listStyle = list ? getComputedStyle(list) : null;
    const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
    return {
      accent,
      accentSoft,
      rootBackground: rootStyle?.backgroundColor || '',
      toolbarBackground: toolbarStyle?.backgroundColor || '',
      tabbarRadius: tabbarStyle?.borderRadius || '',
      tabbarHeight: tabbar?.getBoundingClientRect().height || 0,
      activeTabBackground: activeTabStyle?.backgroundColor || '',
      activeTabColor: activeTabStyle?.color || '',
      listRadius: listStyle?.borderRadius || '',
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  });
}

async function openAds(page) {
  await page.evaluate(() => window.YT_MOBILE_VNEXT_DENSITY?.openModule?.('ads'));
  await page.waitForSelector('.vnext-density-module-page[data-density-module="ads"]', { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(() => window.YT_MOBILE_VNEXT_DENSITY?.getState?.().module === 'ads', null, { timeout: 4_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"] [data-vnext-module="ads"]');
    if (!button?.classList.contains('active') || button.getAttribute('aria-current') !== 'page') return false;
    const badge = button.querySelector('b');
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-9999px;color:var(--vx-accent);background:var(--vx-accent-soft)';
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe);
    const accent = expected.color;
    const accentSoft = expected.backgroundColor;
    probe.remove();
    const current = getComputedStyle(button);
    const badgeStyle = badge ? getComputedStyle(badge) : null;
    return current.color === accent && current.backgroundColor === accentSoft && (!badgeStyle || badgeStyle.color === accent);
  }, null, { timeout: 2_000 });
}

async function railState(page) {
  return page.evaluate(() => {
    const button = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"] [data-vnext-module="ads"]');
    const badge = button?.querySelector('b');
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-9999px;color:var(--vx-accent);background:var(--vx-accent-soft)';
    document.body.appendChild(probe);
    const probeStyle = getComputedStyle(probe);
    const accent = probeStyle.color;
    const accentSoft = probeStyle.backgroundColor;
    probe.remove();
    const style = button ? getComputedStyle(button) : null;
    const badgeStyle = badge ? getComputedStyle(badge) : null;
    return {
      exists: Boolean(button),
      selected: Boolean(button?.classList.contains('active') && button?.getAttribute('aria-current') === 'page'),
      color: style?.color || '',
      background: style?.backgroundColor || '',
      badgeColor: badgeStyle?.color || '',
      accent,
      accentSoft,
      height: button?.getBoundingClientRect().height || 0,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  });
}

async function openSearchEmpty(page) {
  await page.evaluate(() => {
    const button = document.querySelector('.vnext-tabbar [data-vnext-tab="search"]');
    if (!button) throw new Error('Missing Search primary tab');
    button.click();
  });
  await page.waitForSelector('.vnext-search-page', { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(() => !window.YT_MOBILE_VNEXT_DENSITY?.getState?.().module, null, { timeout: 4_000 });
  await page.waitForSelector('[data-vnext-search-input]', { state: 'visible', timeout: 4_000 });
  await page.fill('[data-vnext-search-input]', '__PHASE5_NO_MATCH__');
  await page.waitForSelector('.vnext-search-results .vnext-empty', { state: 'visible', timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function emptyState(page) {
  return page.evaluate(() => {
    const empty = document.querySelector('.vnext-search-results .vnext-empty');
    const icon = empty?.querySelector(':scope>span');
    const title = empty?.querySelector('strong');
    const text = empty?.querySelector('p');
    const style = empty ? getComputedStyle(empty) : null;
    const titleStyle = title ? getComputedStyle(title) : null;
    const textStyle = text ? getComputedStyle(text) : null;
    return {
      exists: Boolean(empty),
      title: title?.textContent.trim() || '',
      text: text?.textContent.trim() || '',
      height: empty?.getBoundingClientRect().height || 0,
      iconHeight: icon?.getBoundingClientRect().height || 0,
      titleSize: parseFloat(titleStyle?.fontSize || '0'),
      textSize: parseFloat(textStyle?.fontSize || '0'),
      align: style?.textAlign || '',
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  });
}

async function stateFixture(page) {
  return page.evaluate(() => {
    document.getElementById('phase5-state-fixture')?.remove();
    const fixture = document.createElement('section');
    fixture.id = 'phase5-state-fixture';
    fixture.style.cssText = 'position:relative;margin:12px 18px 100px;display:grid;gap:10px';
    fixture.innerHTML = `
      <div class="vnext-runtime error"><span>!</span><div><strong>数据读取异常</strong><small>用于验证最终状态层，不替代真实业务错误路径。</small></div></div>
      <span class="vnext-inline-loader">读取中</span>
      <div class="vnext-inline-error">当前期间暂时无法生成上期对比。</div>
      <div class="vnext-skeleton"><i></i><i></i></div>
      <div class="vnext-dense-list"><div class="vnext-density-empty">当前筛选没有记录</div></div>`;
    document.querySelector('.vnext-app')?.appendChild(fixture);

    const runtime = fixture.querySelector('.vnext-runtime.error');
    const loader = fixture.querySelector('.vnext-inline-loader');
    const error = fixture.querySelector('.vnext-inline-error');
    const skeleton = fixture.querySelector('.vnext-skeleton');
    const density = fixture.querySelector('.vnext-density-empty');
    const errorStyle = getComputedStyle(error);
    const loaderBefore = getComputedStyle(loader, '::before');
    const errorBefore = getComputedStyle(error, '::before');
    const skeletonStyle = getComputedStyle(skeleton);
    const densityStyle = getComputedStyle(density);
    const runtimeStyle = getComputedStyle(runtime);
    return {
      runtimeHeight: runtime.getBoundingClientRect().height,
      runtimeBackground: runtimeStyle.backgroundColor,
      loaderBeforeWidth: parseFloat(loaderBefore.width || '0'),
      loaderBeforeBorderRadius: loaderBefore.borderRadius,
      errorHeight: error.getBoundingClientRect().height,
      errorRadius: errorStyle.borderRadius,
      errorBeforeContent: errorBefore.content,
      skeletonRadius: skeletonStyle.borderRadius,
      densityHeight: density.getBoundingClientRect().height,
      densitySize: parseFloat(densityStyle.fontSize || '0'),
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  });
}

async function smallButtons(page) {
  return page.evaluate(() => [...document.querySelectorAll('#mobileAppRoot button')].filter(button => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.height < 43.5;
  }).slice(0, 12).map(button => ({ text: button.textContent.trim().slice(0, 50), height: button.getBoundingClientRect().height, className: button.className })));
}

async function runViewport(viewport) {
  const browser = await chromium.launch({ headless: true, executablePath });
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
    const base = await visualState(page);
    evidence.base = base;
    expect(base.tabbarHeight >= 64 && base.tabbarHeight <= 68, `${label}: bottom navigation stays visually compact without shrinking touch structure`, JSON.stringify(base));
    expect(base.tabbarRadius === '22px', `${label}: bottom navigation uses the Phase 5 radius`, JSON.stringify(base));
    expect(base.documentWidth <= base.viewport + 1, `${label}: visual polish does not create document horizontal overflow`, JSON.stringify(base));

    await openAds(page);
    const rail = await railState(page);
    evidence.rail = rail;
    expect(rail.exists && rail.selected, `${label}: Ads remains the selected grouped business context`, JSON.stringify(rail));
    expect(rail.color === rail.accent && rail.background === rail.accentSoft, `${label}: grouped rail selected state resolves to soft accent tokens`, JSON.stringify(rail));
    expect(rail.badgeColor === rail.accent, `${label}: grouped rail count inherits the same selected accent`, JSON.stringify(rail));
    expect(rail.height >= 43.5, `${label}: softened business rail keeps the 44px touch floor`, JSON.stringify(rail));
    expect(rail.documentWidth <= rail.viewport + 1, `${label}: business rail polish preserves document width`, JSON.stringify(rail));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-ads-polish.png`), fullPage: true });

    await openSearchEmpty(page);
    const empty = await emptyState(page);
    evidence.empty = empty;
    expect(empty.exists && empty.title === '没有找到', `${label}: real Search Empty path renders the intended empty state`, JSON.stringify(empty));
    expect(empty.height >= 150 && empty.iconHeight >= 37, `${label}: Search Empty has deliberate state spacing instead of a loose text row`, JSON.stringify(empty));
    expect(empty.titleSize >= 13 && empty.textSize >= 10.5, `${label}: Search Empty typography stays readable`, JSON.stringify(empty));
    expect(empty.documentWidth <= empty.viewport + 1, `${label}: Search Empty state does not overflow`, JSON.stringify(empty));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-search-empty.png`), fullPage: true });

    const fixture = await stateFixture(page);
    evidence.fixture = fixture;
    expect(fixture.runtimeHeight >= 60, `${label}: runtime error state uses the shared state surface height`, JSON.stringify(fixture));
    expect(fixture.loaderBeforeWidth >= 10 && fixture.loaderBeforeBorderRadius !== '0px', `${label}: inline loading state exposes a compact spinner affordance`, JSON.stringify(fixture));
    expect(fixture.errorHeight >= 50 && fixture.errorRadius === '14px' && fixture.errorBeforeContent.includes('!'), `${label}: inline error state has shared geometry and explicit status affordance`, JSON.stringify(fixture));
    expect(fixture.skeletonRadius === '18px', `${label}: loading skeleton inherits the shared card radius`, JSON.stringify(fixture));
    expect(fixture.densityHeight >= 100 && fixture.densitySize >= 11, `${label}: business empty state is readable and deliberate`, JSON.stringify(fixture));
    expect(fixture.documentWidth <= fixture.viewport + 1, `${label}: state surfaces preserve document width`, JSON.stringify(fixture));

    const tooSmall = await smallButtons(page);
    evidence.smallButtons = tooSmall;
    expect(tooSmall.length === 0, `${label}: Phase 5 keeps all visible buttons at the 44px touch floor`, JSON.stringify(tooSmall));
    expect(requests.every(request => request.method === 'GET'), `${label}: visual acceptance remains GET-only`, JSON.stringify(requests.filter(request => request.method !== 'GET')));
    expect(pageErrors.length === 0, `${label}: visual acceptance has no page errors`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: visual acceptance has no console errors`, JSON.stringify(consoleErrors));
  } catch (error) {
    fail(`${label}: visual polish acceptance completed`, error?.stack || error?.message || String(error));
  } finally {
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    evidence.requests = requests;
    report.push(evidence);
    await context.close();
    await browser.close();
  }
}

staticContract();
for (const viewport of VIEWPORTS) await runViewport(viewport);
fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify({ failures, report }, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} Phase 5 visual polish acceptance failure(s).`);
  process.exit(1);
}
console.log('\nPhase 5 visual polish Chromium acceptance passed.');
