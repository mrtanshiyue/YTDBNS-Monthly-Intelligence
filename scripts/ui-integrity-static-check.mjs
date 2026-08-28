import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const failures = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = message => { failures.push(message); console.error(`FAIL  ${message}`); };
const expect = (condition, message) => condition ? pass(message) : fail(message);

const index = read('public/index.html');
const currentCss = read('public/current-ui.css');
const currentJs = read('public/current-ui.js');
const packageJson = JSON.parse(read('package.json'));
const shell = read('public/mobile/mobile-shell.js');
const bridge = read('public/mobile/mobile-app-bridge.js');
const vnext = read('public/mobile/mobile-vnext.js');
const vnextCss = read('public/mobile/mobile-vnext.css');
const runtime = read('public/shared/runtime.js');
const selectors = read('public/shared/selectors.js');
const secondary = read('public/shared/secondary-selectors.js');

expect(/<title>YTDBNS Monthly Intelligence<\/title>/.test(index), 'document title reflects current product');
expect(index.includes('./current-ui.css') && index.includes('./current-ui.js'), 'canonical Desktop UI layer is loaded');
expect(!index.includes('./v54.css') && !index.includes('./v54-acceptance.css') && !index.includes('./v54.js'), 'retired V4.15 responsive layer is not loaded');
for (const legacy of ['v48.js','v49.js','v50.js','v51.js','v52.js','v53.js']) {
  expect(!index.includes(`./${legacy}`), `${legacy} duplicate runtime is not loaded`);
  expect(!exists(`public/${legacy}`), `${legacy} duplicate runtime file is removed`);
}
expect(/<body class="[^"]*studio-v43[^"]*studio-v53[^"]*">/.test(index), 'historical CSS compatibility classes remain without duplicate runtime helpers');

const desktopRoutes = [...index.matchAll(/class="nav-item(?: active)?" data-page="([^"]+)"/g)].map(match => match[1]);
expect(desktopRoutes.length === 9, `Desktop navigation keeps nine destinations (${desktopRoutes.join(', ')})`);
expect(desktopRoutes.join('|') === 'overview|finance|charges|ads|products|inventory|returns|history|data', 'Desktop navigation order is frozen');
expect(currentCss.includes('content:"V5.0"'), 'Desktop wordmark version badge remains current');
expect(currentCss.includes('@media (min-width:861px)') && currentCss.includes('.global-links{gap:0!important}'), 'Desktop nine-item navigation fit rule remains frozen');
expect(currentJs.includes("dataset.uiVersion = '5.0'"), 'Desktop runtime exposes current UI version');
expect(currentJs.includes('FIT_RULES') && currentJs.includes('fitDesktopNumerals'), 'Desktop number fitting remains consolidated');
expect(currentJs.includes('syncTopNavigation') && currentJs.includes('syncGroups'), 'Desktop keyboard/ARIA navigation remains consolidated');
expect(currentJs.includes('syncDesktopModalLock') && currentJs.includes('closeTopmostDesktopSurface'), 'Desktop modal lifecycle remains reconciled');
expect(currentJs.includes('event.stopImmediatePropagation()'), 'Desktop topmost Escape prevents legacy multi-close cascades');

for (const [trigger, surface] of [
  ['commandButton','commandPalette'], ['periodButton','periodPopover'], ['viewMenuBtn','viewPopover'], ['topImportBtn','importDrawer']
]) expect(index.includes(`id="${trigger}"`) && index.includes(`aria-controls="${surface}"`), `${trigger} retains Desktop controlled-surface semantics`);
expect(index.includes('id="importDrawer" role="dialog"'), 'Desktop import drawer keeps dialog semantics');
expect(index.includes('id="detailDrawer" role="dialog"'), 'Desktop detail drawer keeps dialog semantics');
expect(index.includes('id="panelModal" role="dialog"'), 'Desktop focus modal keeps dialog semantics');
expect(index.includes('id="toastStack" aria-live="polite"'), 'Desktop toast region remains live');

expect(index.includes('id="mobileAppRoot"'), 'canonical document retains independent mobile root');
expect(shell.includes('./mobile/mobile-vnext.css') && shell.includes('./mobile/mobile-vnext.js'), 'mobile bootstrap loads only the vNext presentation/runtime pair');
expect(shell.includes("dataset.mobileVnextReady = 'false'") && shell.includes("dataset.mobileVnextReady = 'true'"), 'Mobile vNext first paint is readiness-gated');
expect(shell.includes("classList.toggle('mobile-vnext-active'"), 'Mobile vNext owns a dedicated responsive surface class');
expect(!shell.includes('mobile-redesign') && !shell.includes('v51-mobile.css'), 'bootstrap does not inherit prior mobile redesign layers');
expect(bridge.includes('vnext:navigate') && bridge.includes('vnext:search'), 'compatibility bridge points exclusively at vNext events');
expect(!bridge.includes('v5:navigate') && !bridge.includes('v52Ready'), 'compatibility bridge has no previous-architecture event/state hooks');

const tabBlock = vnext.match(/const TABS = \[([\s\S]*?)\];/)?.[1] || '';
expect(tabBlock.includes("['today', '今日'") && tabBlock.includes("['alerts', '异常'") && tabBlock.includes("['trends', '趋势'") && tabBlock.includes("['search', '搜索'"), 'Mobile vNext top-level IA is 今日 / 异常 / 趋势 / 搜索');
expect(!tabBlock.includes("['ads'") && !tabBlock.includes("['products'") && !tabBlock.includes("['inventory'"), 'domain modules are detail/search objects rather than top-level tabs');
const issueGroupConsumers = [...vnext.matchAll(/const signals = buildIssueGroups\(\);/g)].length;
expect(vnext.includes('function buildSignals()') && vnext.includes('function buildIssueGroups()') && vnext.includes('function verdict(signals, summary)') && issueGroupConsumers >= 2, 'Today and Alerts share raw-signal → decision-cluster model');
expect(vnext.includes('先看问题类型，再看受影响对象') && vnext.includes('同类异常先聚合成一个决策入口') && vnext.includes("type: 'issue-group'"), 'Alerts aggregates record-level anomalies before action');
expect(vnext.includes('issueMembersMarkup(group)') && vnext.includes('影响最大') && vnext.includes('前 ${members.length} 个对象'), 'issue clusters preserve drilldown to highest-impact objects');
expect(vnext.includes('本期正在往哪走') && vnext.includes('runtime.comparePrevious()'), 'Trends is direction/period-comparison oriented');
expect(vnext.includes('一个入口，查全部') && vnext.includes('function searchItems()'), 'Search is a first-class cross-domain destination');
expect(vnext.includes('Campaign') && vnext.includes('SKU') && vnext.includes('ASIN') && vnext.includes('扣费'), 'Search covers core operating objects');
expect(vnext.includes('detailRegistry') && vnext.includes("window.addEventListener('popstate'"), 'detail/tab navigation participates in browser history');
expect(vnext.includes("event.key === 'Escape'") && vnext.includes("event.key !== 'Tab'"), 'vNext transient surfaces support Escape and focus containment');

expect(vnextCss.includes('.vnext-tabbar') && vnextCss.includes('grid-template-columns:repeat(4,1fr)'), 'Mobile vNext owns a four-destination floating tab bar');
expect(vnextCss.includes('.vnext-search-field input') && vnextCss.includes('font-size:16px'), 'Mobile Search preserves iOS no-zoom text sizing');
expect(vnextCss.includes('env(safe-area-inset-top)') && vnextCss.includes('env(safe-area-inset-bottom)'), 'Mobile vNext honors iPhone safe areas');
expect(vnextCss.includes('@media(max-width:390px)'), 'Mobile vNext has compact iPhone tuning');
expect(vnextCss.includes('prefers-reduced-motion:reduce'), 'Mobile vNext honors reduced motion');
expect(/min-height:\s*44px/.test(vnextCss) || /height:\s*44px/.test(vnextCss), 'Mobile vNext preserves comfortable 44px touch targets');
expect(!/font-size\s*:\s*(?:8)px\b/i.test(vnextCss), 'Mobile vNext does not use 8px text');

expect(runtime.includes('let rangeLoadSerial = 0') && runtime.includes('let refreshSerial = 0'), 'shared runtime still serializes range/refresh requests');
expect(runtime.includes('requestId !== rangeLoadSerial'), 'stale range responses cannot overwrite active period');
expect(runtime.includes("state.mode = 'offline'"), 'production API outage still becomes explicit offline state');
expect(runtime.includes('async function comparePrevious()'), 'shared runtime still owns previous-period retrieval');
expect(runtime.includes('const candidate = inventoryReferenceMonth(to);'), 'inventory uses bounded authoritative reference month');
expect(!runtime.includes('for (const candidate of inventoryReferenceMonths(to))'), 'inventory cannot regress to serial historical scan');
expect(selectors.includes('function inventorySource(runtimeState)') && selectors.includes('runtimeState?.inventoryDetail'), 'inventory selectors consume resolved snapshot detail');
expect(selectors.includes('const cvrFallback'), 'summary CVR keeps units/sessions fallback');
expect(secondary.includes('normalized.length ? reasonTotal : summary.returns'), 'returns summary remains truthful without reason detail');
expect(secondary.includes("(b.createdAt || '').localeCompare(a.createdAt || '')"), 'latest import ordering remains deterministic');

const activeMobileJs = `${shell}\n${bridge}\n${vnext}`;
expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(activeMobileJs), 'Mobile vNext presentation contains no write HTTP methods');
expect(!/\/api\/imports\/(?:start|file|commit)/.test(activeMobileJs), 'Mobile vNext cannot invoke import mutations');
expect(!/\bfetch\s*\(/.test(vnext), 'Mobile vNext cannot bypass shared runtime with direct network reads');
expect(!/<table\b/i.test(vnext), 'Mobile vNext has no desktop table UI');

expect(currentCss.includes('font-variant-numeric:tabular-nums'), 'Desktop dense numeric surfaces retain tabular numerals');
expect(currentCss.includes(':focus-visible'), 'Desktop current layer keeps visible keyboard focus');
expect(currentCss.includes('prefers-reduced-motion:reduce'), 'Desktop current layer honors reduced motion');
expect(packageJson.version === '5.0.0', `package version remains V5.0 baseline (${packageJson.version})`);
expect(packageJson.scripts?.['check:v5:mobile:static'] === 'node scripts/v5-native-mobile-static-check.mjs', 'package exposes authoritative mobile gate');
expect(packageJson.scripts?.['check:ui:static'] === 'node scripts/ui-integrity-static-check.mjs', 'package exposes UI integrity gate');
expect(packageJson.scripts?.['check:release:static']?.includes('check:v5:mobile:static') && packageJson.scripts?.['check:release:static']?.includes('check:ui:static'), 'release gate composes mobile architecture and UI integrity');

if (failures.length) {
  console.error(`\nUI integrity static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nUI integrity static gate passed for frozen Desktop + zero-based Mobile vNext.');
