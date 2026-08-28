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
const shellCss = read('public/mobile/mobile-shell.css');
const bridge = read('public/mobile/mobile-app-bridge.js');
const redesign = read('public/mobile/mobile-redesign.js');
const redesignCss = read('public/mobile/mobile-redesign.css');
const interactions = read('public/mobile/mobile-interactions.js');
const compare = read('public/mobile/mobile-compare.js');
const runtime = read('public/shared/runtime.js');
const selectors = read('public/shared/selectors.js');
const secondarySelectors = read('public/shared/secondary-selectors.js');
const overview = read('public/mobile/views/overview.js');
const returnsView = read('public/mobile/views/returns.js');
const recordViews = ['ads','products','inventory','charges'].map(name => read(`public/mobile/views/${name}.js`));
const mobileCss = [
  shellCss,
  read('public/mobile/mobile-interactions.css'),
  read('public/mobile/mobile-compare.css'),
  read('public/mobile/views/overview.css'),
  read('public/mobile/views/core.css'),
  read('public/mobile/views/secondary.css'),
  read('public/mobile/v51-mobile.css'),
  redesignCss
].join('\n');

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
expect(desktopRoutes.join('|') === 'overview|finance|charges|ads|products|inventory|returns|history|data', 'Desktop navigation order is stable');
expect(currentCss.includes('content:"V5.0"'), 'Desktop wordmark version badge remains current');
expect(currentCss.includes('@media (min-width:861px)') && currentCss.includes('.global-links{gap:0!important}'), 'Desktop nine-item navigation fit rule is preserved');
expect(currentJs.includes("dataset.uiVersion = '5.0'"), 'runtime exposes current Desktop UI version');
expect(currentJs.includes('FIT_RULES') && currentJs.includes('fitDesktopNumerals'), 'Desktop large-number fit behavior remains consolidated');
expect(currentJs.includes('syncTopNavigation') && currentJs.includes('syncGroups'), 'Desktop keyboard and ARIA behavior remains consolidated');
expect(currentJs.includes('syncDesktopModalLock') && currentJs.includes('closeTopmostDesktopSurface'), 'Desktop modal lock and Escape behavior remain reconciled');
expect(currentJs.includes('event.stopImmediatePropagation()'), 'Desktop topmost Escape prevents legacy multi-close cascades');

for (const [trigger, surface] of [
  ['commandButton','commandPalette'],
  ['periodButton','periodPopover'],
  ['viewMenuBtn','viewPopover'],
  ['topImportBtn','importDrawer']
]) {
  expect(index.includes(`id="${trigger}"`) && index.includes(`aria-controls="${surface}"`), `${trigger} declares its controlled Desktop surface`);
}
expect(index.includes('id="importDrawer" role="dialog"') && index.includes('aria-labelledby="importDrawerTitle"'), 'Desktop import drawer has dialog semantics');
expect(index.includes('id="detailDrawer" role="dialog"') && index.includes('aria-labelledby="detailTitle"'), 'Desktop detail drawer has dialog semantics');
expect(index.includes('id="panelModal" role="dialog"') && index.includes('aria-labelledby="panelModalTitle"'), 'Desktop focus modal has dialog semantics');
expect(index.includes('id="toastStack" aria-live="polite"'), 'Desktop toast region announces non-blocking updates');

expect(!exists('public/mobile/interactions.css'), 'dormant alternate mobile interaction stylesheet is removed');
expect(!exists('public/mobile/mobile-top-tabs.css'), 'obsolete nine-top-tab stylesheet is removed');
expect(shell.includes('const ICONS = {') && shell.includes("['overview', '首页', 'home']") && shell.includes("['tasks', '待办', 'tasks']"), 'Native Mobile shell uses deterministic icons and accepted primary IA');
expect(!/[⌂◎◇▦]/.test(shell), 'Native Mobile primary navigation does not depend on font-specific symbol glyphs');
expect(shell.includes("['inventory', '库存', 'inventory']") && !shell.includes("['workspace',") && !shell.includes('v5MoreSheet'), 'accepted fifth primary is 库存; Workspace/More are absent');
expect(shell.includes('runtimeNoticeMarkup') && shell.includes("state.mode === 'offline'"), 'mobile shell exposes explicit loading/error/offline status');
expect(shell.includes('state?.loading') && shell.includes('正在更新经营数据'), 'mobile runtime notice owns loading state');
expect(shell.includes('aria-busy=') && shell.includes('data-mobile-action="period"') && shell.includes('data-mobile-action="search"'), 'mobile shell exposes busy state plus Period/Search context actions');
expect(shell.includes("const HISTORY_KEY = 'ytdbnsMobileRoute'") && shell.includes("window.addEventListener('popstate'"), 'mobile shell owns browser history for Safari Back');
expect(shell.includes('closeTransientSurfaceForBack'), 'mobile Back closes transient surfaces before route changes');
expect(shellCss.includes('.v5-mobile-runtime-notice') && shellCss.includes('.v5-mobile-runtime-spinner'), 'mobile runtime state has dedicated visual treatment');
expect(!shell.includes('分阶段重写队列'), 'mobile fallback exposes no development-phase copy');

expect(bridge.includes("./mobile/mobile-redesign.css") && bridge.includes("./mobile/mobile-redesign.js"), 'mobile bridge loads accepted redesign assets');
expect(bridge.includes("dataset.v52Ready = 'false'") && bridge.includes("dataset.v52Ready = 'true'"), 'accepted mobile first paint is readiness-gated');
expect(!bridge.includes('MutationObserver'), 'legacy top-tab DOM rewrite is removed');
expect(redesignCss.includes('.v5-mobile-bottom-nav') && redesignCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'), 'accepted redesign owns fixed five-column bottom navigation');
expect(redesignCss.includes('.v52-home') && redesignCss.includes('.v52-tasks'), 'accepted redesign owns Executive Brief and Action Queue presentation');
expect(redesignCss.includes('.v52-ops-sheet') && redesignCss.includes('.v52-ops-option'), 'accepted redesign owns shared Filter / Sort sheet');

for (const [name, source] of [['ads',recordViews[0]],['products',recordViews[1]],['inventory',recordViews[2]],['charges',recordViews[3]]]) {
  expect(/<button type="button" class="[^"]*\bv5-record-card\b[^"]*"/.test(source), `${name} record cards use native button semantics`);
  expect(!source.includes('<article class="v5-record-card"'), `${name} has no click-only article records`);
}
expect(overview.includes('v52-home-hero') && overview.includes('v52-home-actions') && overview.includes('v52-pulse-grid'), 'Overview renders Executive Brief result → exceptions → pulse tiers');
expect(overview.includes('YT_MOBILE_REDESIGN?.collectTasks') && overview.includes('data-v5-open-compare'), 'Overview shares Action Queue truth source and exposes Compare');
expect(redesign.includes('function collectTasks(runtimeState)') && redesign.includes('registry.tasks ='), 'cross-business Action Queue is first-class runtime behavior');
expect(redesign.includes('低转化') && redesign.includes('低动销') && redesign.includes('高资金占用'), 'Action Queue includes accepted Ads/Product/Inventory risk semantics');
expect(recordViews[0].includes('data-v52-ops-open="ads"') && recordViews[0].includes("v52:ops-apply"), 'Ads uses shared Filter / Sort contract');
expect(recordViews[1].includes('data-v52-ops-open="products"') && recordViews[1].includes("v52:ops-apply"), 'Products uses shared Filter / Sort contract');
expect(recordViews[2].includes('data-v52-ops-open="inventory"') && recordViews[2].includes("v52:ops-apply"), 'Inventory uses shared Filter / Sort contract');
expect(redesign.includes("[data-v52-close]:not([data-v52-close=\"backdrop\"])") && redesign.includes('event.target.matches(\'[data-v52-close="backdrop"]\')'), 'Filter sheet close delegation preserves internal option clicks');
expect(redesign.includes('root.inert = true') && redesign.includes('root.inert = false'), 'Filter sheet owns modal background inert lifecycle');
expect(redesign.includes("event.key !== 'Tab'") && redesign.includes("event.key === 'Escape'"), 'Filter sheet contains keyboard focus and supports Escape');

expect(interactions.includes("['tasks', '待办'"), 'Global Search exposes 待办');
expect(interactions.includes("mount('period'") && interactions.includes("mount('search'") && interactions.includes("mount('detail'"), 'Period/Search/Detail use native interaction surfaces');
expect(interactions.includes('mobileRoot.inert = Boolean(open)'), 'Period/Search/Detail own modal background inert lifecycle');
expect(interactions.includes("event.key !== 'Tab'") && interactions.includes("event.key === 'Escape'"), 'Period/Search/Detail contain keyboard focus and support Escape');
expect(interactions.includes('lastFocus.focus'), 'Period/Search/Detail restore trigger focus');
expect(!interactions.includes("overlayRoot.setAttribute('aria-live'"), 'interactive mobile overlay root is not an over-broad live region');
expect(interactions.includes('state.inventoryDetail || detail'), 'mobile Search indexes resolved inventory snapshot');

expect(compare.includes('let lastFocus = null') && compare.includes('lastFocus.focus'), 'Mobile Compare restores trigger focus');
expect(compare.includes('mobileRoot.inert = true') && compare.includes('mobileRoot.inert = false'), 'Mobile Compare owns background inert lifecycle');
expect(compare.includes("event.key !== 'Tab'") && compare.includes("event.key === 'Escape'"), 'Mobile Compare traps focus and supports Escape');
expect(compare.includes('let requestSerial = 0') && compare.includes('requestId !== requestSerial'), 'Mobile Compare ignores stale async responses after close');

expect(runtime.includes('let rangeLoadSerial = 0') && runtime.includes('let refreshSerial = 0'), 'shared runtime serializes range and refresh requests');
expect(runtime.includes('requestId !== rangeLoadSerial'), 'stale range responses cannot overwrite active range');
expect(runtime.includes('clearRangeData();') && runtime.includes('state.from = from') && runtime.includes('state.to = to'), 'range changes clear old data before publishing a new period');
expect(runtime.includes("const previewAllowed = () => location.protocol === 'file:'") && runtime.includes("state.mode = 'offline'"), 'production API outages cannot silently substitute Demo data');
expect(runtime.includes("state.error = '实时数据服务暂时不可用，请稍后刷新重试。'"), 'offline runtime carries explicit user-visible service error');
expect(runtime.includes('async function refresh()') && runtime.includes('state.loading = true'), 'runtime refresh publishes busy state immediately');
expect(runtime.includes('resolveLiveInventoryDetail') && runtime.includes('hasInventorySnapshot'), 'inventory runtime resolves nearest valid snapshot');
expect(selectors.includes('function inventorySource(runtimeState)') && selectors.includes('if (runtimeState?.inventoryDetail) return runtimeState.inventoryDetail;'), 'inventory selector consumes resolved snapshot first');
expect(selectors.includes('const cvrFallback') && selectors.includes('cvr: value(raw.cvr, raw.traffic_cvr, cvrFallback)'), 'summary CVR keeps units/sessions fallback');
expect(selectors.includes('hasProductSessions') && selectors.includes('summary.cvr'), 'product totals preserve summary CVR when row detail is unavailable');
expect(secondarySelectors.includes('normalized.length ? reasonTotal : summary.returns'), 'returns summary remains truthful without reason-level detail');
expect(secondarySelectors.includes('refundSales: summary.refundSales ?? reasonRefundTotal') && returnsView.includes('const refundAmount = m.refundSales'), 'returns refund amount never truncates to Top 30');
expect(secondarySelectors.includes("(b.createdAt || '').localeCompare(a.createdAt || '')"), 'Data latest import resolves deterministically');

expect(!/font-size\s*:\s*(?:8|9)px\b/i.test(mobileCss), 'loaded Native Mobile CSS contains no 8px/9px text');
expect(redesignCss.includes('font-size:11px') && redesignCss.includes('font-size:11.5px'), 'redesign keeps compact-text readability floor');
expect(redesignCss.includes('@media(max-width:390px)'), 'redesign contains <=390px compact width tuning');
expect(currentCss.includes('font-variant-numeric:tabular-nums'), 'dense numeric surfaces use stable tabular numerals');
expect(currentCss.includes(':focus-visible'), 'current UI layer encodes visible keyboard focus');
expect(currentCss.includes('prefers-reduced-motion:reduce'), 'current UI layer honors reduced motion');

expect(packageJson.version === '5.0.0', `package version remains V5.0 product baseline (${packageJson.version})`);
expect(packageJson.scripts?.['check:v5:mobile:static'] === 'node scripts/v5-native-mobile-static-check.mjs', 'package exposes authoritative mobile static gate');
expect(packageJson.scripts?.['check:ui:static'] === 'node scripts/ui-integrity-static-check.mjs', 'package exposes UI integrity gate');
expect(packageJson.scripts?.['check:release:static']?.includes('check:v5:mobile:static') && packageJson.scripts?.['check:release:static']?.includes('check:ui:static'), 'release static gate composes mobile architecture + UI integrity');

if (failures.length) {
  console.error(`\nUI integrity static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nUI integrity static gate passed for Desktop + accepted Native Mobile redesign.');
