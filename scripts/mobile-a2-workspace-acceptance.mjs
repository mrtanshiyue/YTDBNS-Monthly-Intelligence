import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a2-workspace');
fs.mkdirSync(artifactDir, { recursive: true });

const PRIMARY = ['today', 'alerts', 'trends', 'search'];
const RAIL_DOMAINS = ['ads', 'products', 'inventory', 'finance'];
const WORKSPACE_CHILDREN = ['charges', 'returns', 'history', 'data'];
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
  const density = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-density.js'), 'utf8');
  const ia = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-vnext-ia.css'), 'utf8');

  expect(
    density.includes("['finance', '工作台']") &&
      density.includes("const WORKSPACE_CHILD_MODULES = new Set(['charges', 'returns', 'history', 'data'])") &&
      density.includes("const RAIL_MODULES = new Set(['today', 'alerts', 'ads', 'products', 'inventory', 'finance'])"),
    'A2 Workspace static contract: four visible business domains sit over eight intact internal routes'
  );
  expect(
    density.includes('function workspaceMarkup(m)') &&
      density.includes('data-workspace-module=') &&
      density.includes('data-workspace-back') &&
      density.includes('function restoreWorkspaceFocus(module = state.workspaceFocus)'),
    'A2 Workspace static contract: Workspace owns child entry, return, and focus lifecycle'
  );
  expect(
    ia.includes("const DOMAIN_IDS = Object.freeze([\n    'ads',\n    'products',\n    'inventory',\n    'finance'\n  ])") &&
      ia.includes("if (WORKSPACE_CHILD_SET.has(module)) return 'finance'") &&
      ia.includes('railModule: activeRailModule()'),
    'A2 Workspace static contract: IA exposes grouped rail context separately from child route identity'
  );
  expect(
    css.includes('.vnext-workspace-grid') &&
      css.includes('.vnext-workspace-card') &&
      css.includes('.vnext-workspace-back') &&
      css.includes('min-height:44px'),
    'A2 Workspace static contract: Workspace controls are touch-safe Mobile surfaces'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForSelector('.vnext-module-rail[data-vnext-ia="domain"]', { state: 'visible', timeout: 12_000 });
  await page.waitForTimeout(80);
}

async function openWorkspace(page) {
  await page.evaluate(() => {
    const button = document.querySelector('.vnext-module-rail [data-vnext-module="finance"]');
    if (!button) throw new Error('Missing Workspace rail control');
    button.click();
  });
  await page.waitForSelector('.vnext-density-module-page[data-density-module="finance"] .vnext-workspace-grid', { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(() => {
    const density = window.YT_MOBILE_VNEXT_DENSITY?.getState?.();
    const ia = window.YT_MOBILE_VNEXT_IA?.getState?.();
    const rail = document.querySelector('.vnext-module-rail [data-vnext-module="finance"]');
    return density?.module === 'finance' && density?.railModule === 'finance' &&
      ia?.module === 'finance' && ia?.railModule === 'finance' &&
      rail?.classList.contains('active') && rail?.getAttribute('aria-current') === 'page';
  }, null, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function workspaceState(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.vnext-module-rail[data-vnext-ia="domain"]');
    const visibleRailButtons = [...(rail?.querySelectorAll('[data-vnext-module]') || [])].filter(button => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return !button.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const workspace = document.querySelector('.vnext-density-module-page[data-density-module="finance"]');
    const cards = [...(workspace?.querySelectorAll('[data-workspace-module]') || [])].map(button => {
      const rect = button.getBoundingClientRect();
      return {
        module: button.dataset.workspaceModule,
        text: button.textContent.trim(),
        height: rect.height,
        width: rect.width,
        scrollWidth: button.scrollWidth,
        clientWidth: button.clientWidth
      };
    });
    const primary = [...document.querySelectorAll('.vnext-tabbar [data-vnext-tab]')].map(button => button.dataset.vnextTab);
    const financeButton = rail?.querySelector('[data-vnext-module="finance"]');
    return {
      primary,
      railIds: visibleRailButtons.map(button => button.dataset.vnextModule),
      railTexts: visibleRailButtons.map(button => button.textContent.trim()),
      childRailIds: ['charges', 'returns', 'history', 'data'].filter(id => Boolean(rail?.querySelector(`[data-vnext-module="${id}"]`))),
      financeSelected: Boolean(financeButton?.classList.contains('active') && financeButton?.getAttribute('aria-current') === 'page'),
      hero: workspace?.querySelector('.vnext-module-hero')?.textContent.trim() || '',
      sectionTitles: [...(workspace?.querySelectorAll('.vnext-module-section h2') || [])].map(node => node.textContent.trim()),
      cards,
      density: window.YT_MOBILE_VNEXT_DENSITY?.getState?.() || null,
      ia: window.YT_MOBILE_VNEXT_IA?.getState?.() || null,
      scrollY,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  });
}

async function childState(page, child) {
  return page.evaluate(childId => {
    const pageRoot = document.querySelector(`.vnext-density-module-page[data-density-module="${childId}"]`);
    const financeButton = document.querySelector('.vnext-module-rail [data-vnext-module="finance"]');
    const back = pageRoot?.querySelector('[data-workspace-back]');
    const backRect = back?.getBoundingClientRect();
    return {
      child: childId,
      exists: Boolean(pageRoot),
      density: window.YT_MOBILE_VNEXT_DENSITY?.getState?.() || null,
      ia: window.YT_MOBILE_VNEXT_IA?.getState?.() || null,
      financeSelected: Boolean(financeButton?.classList.contains('active') && financeButton?.getAttribute('aria-current') === 'page'),
      financeLabel: financeButton?.textContent.trim() || '',
      backExists: Boolean(back),
      backHeight: backRect?.height || 0,
      backText: back?.textContent.trim() || '',
      childRailButtonExists: Boolean(document.querySelector(`.vnext-module-rail [data-vnext-module="${childId}"]`)),
      scrollY,
      viewport: innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    };
  }, child);
}

async function keyboardOpenChild(page, child, label) {
  const selector = `.vnext-density-module-page[data-density-module="finance"] [data-workspace-module="${child}"]`;
  await page.focus(selector);
  const before = await page.evaluate(childId => ({
    module: document.activeElement?.dataset?.workspaceModule || null,
    connected: Boolean(document.activeElement?.isConnected),
    scrollY
  }), child);
  expect(before.module === child && before.connected, `${label}/${child}: Workspace card owns focus before keyboard activation`, JSON.stringify(before));
  await page.keyboard.press('Enter');
  await page.waitForSelector(`.vnext-density-module-page[data-density-module="${child}"]`, { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(childId => window.YT_MOBILE_VNEXT_DENSITY?.getState?.().module === childId, child, { timeout: 4_000 });
  await page.waitForTimeout(80);
}

async function expectFocusReturned(page, child, label) {
  await page.waitForSelector('.vnext-density-module-page[data-density-module="finance"] .vnext-workspace-grid', { state: 'visible', timeout: 4_000 });
  await page.waitForFunction(childId => {
    const active = document.activeElement;
    return window.YT_MOBILE_VNEXT_DENSITY?.getState?.().module === 'finance' &&
      active?.dataset?.workspaceModule === childId && active?.isConnected;
  }, child, { timeout: 4_000 });
  const returned = await page.evaluate(childId => ({
    module: document.activeElement?.dataset?.workspaceModule || null,
    connected: Boolean(document.activeElement?.isConnected),
    density: window.YT_MOBILE_VNEXT_DENSITY?.getState?.() || null,
    ia: window.YT_MOBILE_VNEXT_IA?.getState?.() || null,
    scrollY
  }), child);
  expect(
    returned.module === child && returned.connected && returned.density?.module === 'finance' && returned.ia?.railModule === 'finance',
    `${label}/${child}: returning to Workspace restores the originating card focus and grouped rail context`,
    JSON.stringify(returned)
  );
  expect(returned.scrollY <= 2, `${label}/${child}: Workspace focus restoration does not move the document`, JSON.stringify(returned));
  return returned;
}

async function visibleSmallButtons(page) {
  return page.evaluate(() => [...document.querySelectorAll('#mobileAppRoot button')].filter(button => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.height < 43.5;
  }).slice(0, 12).map(button => ({ text: button.textContent.trim().slice(0, 60), height: button.getBoundingClientRect().height, className: button.className })));
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

  const evidence = { viewport, children: {} };
  try {
    await ready(page);
    await openWorkspace(page);
    const workspace = await workspaceState(page);
    evidence.workspace = workspace;

    expect(JSON.stringify(workspace.primary) === JSON.stringify(PRIMARY), `${label}: primary task navigation remains frozen`, JSON.stringify(workspace.primary));
    expect(JSON.stringify(workspace.railIds) === JSON.stringify(RAIL_DOMAINS), `${label}: secondary rail exposes exactly Ads / Products / Inventory / Workspace`, JSON.stringify(workspace.railIds));
    expect(workspace.railTexts[3]?.includes('工作台'), `${label}: fourth grouped business domain is visibly named 工作台`, JSON.stringify(workspace.railTexts));
    expect(workspace.childRailIds.length === 0, `${label}: Workspace child modules no longer consume secondary rail slots`, JSON.stringify(workspace.childRailIds));
    expect(workspace.financeSelected && workspace.density?.module === 'finance' && workspace.density?.railModule === 'finance' && workspace.ia?.railModule === 'finance', `${label}: Workspace stable route owns selected rail semantics`, JSON.stringify(workspace));
    expect(workspace.hero.includes('经营工作台') && workspace.sectionTitles.includes('经营支持') && workspace.sectionTitles.includes('利润与成本结构'), `${label}: Workspace integrates support domains and Finance cost structure`, JSON.stringify({ hero: workspace.hero, sectionTitles: workspace.sectionTitles }));
    expect(JSON.stringify(workspace.cards.map(card => card.module)) === JSON.stringify(WORKSPACE_CHILDREN), `${label}: Workspace exposes exactly four child destinations`, JSON.stringify(workspace.cards));
    expect(workspace.cards.every(card => card.height >= 43.5), `${label}: every Workspace child card exceeds the 44px touch floor`, JSON.stringify(workspace.cards));
    expect(workspace.cards.every(card => card.scrollWidth <= card.clientWidth + 1), `${label}: Workspace cards do not horizontally clip their business content`, JSON.stringify(workspace.cards));
    expect(workspace.documentWidth <= workspace.viewport + 1 && workspace.scrollY <= 2, `${label}: Workspace opens at top without document horizontal overflow`, JSON.stringify(workspace));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-workspace.png`), fullPage: false });

    for (const child of WORKSPACE_CHILDREN) {
      await keyboardOpenChild(page, child, label);
      const childSnapshot = await childState(page, child);
      evidence.children[child] = { route: childSnapshot };
      expect(
        childSnapshot.exists &&
          childSnapshot.density?.module === child &&
          childSnapshot.density?.railModule === 'finance' &&
          childSnapshot.ia?.module === child &&
          childSnapshot.ia?.railModule === 'finance',
        `${label}/${child}: child keeps its internal route identity under Workspace rail context`,
        JSON.stringify(childSnapshot)
      );
      expect(childSnapshot.financeSelected && childSnapshot.financeLabel.includes('工作台'), `${label}/${child}: Workspace remains the selected visible business domain`, JSON.stringify(childSnapshot));
      expect(!childSnapshot.childRailButtonExists, `${label}/${child}: child route is not duplicated in the secondary rail`, JSON.stringify(childSnapshot));
      expect(childSnapshot.backExists && childSnapshot.backHeight >= 43.5 && childSnapshot.backText.includes('返回工作台'), `${label}/${child}: child exposes a touch-safe explicit Workspace return`, JSON.stringify(childSnapshot));
      expect(childSnapshot.documentWidth <= childSnapshot.viewport + 1 && childSnapshot.scrollY <= 2, `${label}/${child}: child opens at top without document horizontal overflow`, JSON.stringify(childSnapshot));

      if (child === 'history') {
        await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-workspace-history.png`), fullPage: false });
        await page.goBack();
        evidence.children[child].return = await expectFocusReturned(page, child, `${label}/browser-back`);
      } else {
        await page.click(`.vnext-density-module-page[data-density-module="${child}"] [data-workspace-back]`);
        evidence.children[child].return = await expectFocusReturned(page, child, `${label}/explicit-back`);
      }
    }

    const small = await visibleSmallButtons(page);
    expect(small.length === 0, `${label}: visible Mobile touch targets remain >=44px after Workspace traversal`, JSON.stringify(small));
    const methods = [...new Set(requests.map(request => request.method))];
    expect(methods.every(method => method === 'GET'), `${label}: Workspace acceptance remains GET-only`, JSON.stringify(methods));
    expect(pageErrors.length === 0, `${label}: page errors remain zero`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: console errors remain zero`, JSON.stringify(consoleErrors));

    report.push({ ...evidence, pageErrors, consoleErrors, requests });
  } catch (error) {
    fail(`${label}: Workspace acceptance completed without harness exception`, error.stack || error.message || String(error));
    await page.screenshot({ path: path.join(artifactDir, `mobile-${label}-failure.png`), fullPage: true }).catch(() => null);
  } finally {
    await browser.close();
  }
}

staticContract();
for (const viewport of [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 }
]) await runViewport(viewport);

fs.writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`\nMobile A2 Workspace acceptance failed: ${failures.length} issue(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('\nMobile A2 Workspace acceptance passed.');
