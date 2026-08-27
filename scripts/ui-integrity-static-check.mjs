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
const readme = read('README.md');
const architecture = read('V5_MOBILE_ARCHITECTURE.md');
const shell = read('public/mobile/mobile-shell.js');
const shellCss = read('public/mobile/mobile-shell.css');
const interactions = read('public/mobile/mobile-interactions.js');
const compare = read('public/mobile/mobile-compare.js');
const runtime = read('public/shared/runtime.js');
const selectors = read('public/shared/selectors.js');
const secondarySelectors = read('public/shared/secondary-selectors.js');
const coreCss = read('public/mobile/views/core.css');
const secondaryCss = read('public/mobile/views/secondary.css');
const overviewCss = read('public/mobile/views/overview.css');
const overview = read('public/mobile/views/overview.js');
const returnsView = read('public/mobile/views/returns.js');
const compareCss = read('public/mobile/mobile-compare.css');
const mobileCss = [shellCss, read('public/mobile/mobile-interactions.css'), compareCss, overviewCss, coreCss, secondaryCss].join('\n');
const recordViews = ['ads','products','inventory','charges'].map(name => read(`public/mobile/views/${name}.js`));

expect(/<title>YTDBNS Monthly Intelligence<\/title>/.test(index), 'document title reflects the current product');
expect(index.includes('./current-ui.css') && index.includes('./current-ui.js'), 'canonical current UI layer is loaded');
expect(!index.includes('./v54.css') && !index.includes('./v54-acceptance.css') && !index.includes('./v54.js'), 'retired V4.15 responsive layer is not loaded');
for (const legacy of ['v48.js','v49.js','v50.js','v51.js','v52.js','v53.js']) {
  expect(!index.includes(`./${legacy}`), `${legacy} duplicate runtime is not loaded`);
  expect(!exists(`public/${legacy}`), `${legacy} duplicate runtime file is removed`);
}
expect(/<body class="[^"]*studio-v43[^"]*studio-v53[^"]*">/.test(index), 'historical CSS compatibility classes are declared without runtime helper scripts');

const desktopRoutes = [...index.matchAll(/class="nav-item(?: active)?" data-page="([^"]+)"/g)].map(match => match[1]);
expect(desktopRoutes.length === 9, `desktop navigation keeps nine destinations (${desktopRoutes.join(', ')})`);
expect(desktopRoutes.join('|') === 'overview|finance|charges|ads|products|inventory|returns|history|data', 'desktop navigation order is stable');
expect(currentCss.includes('content:"V5.0"'), 'desktop wordmark version badge is current');
expect(currentCss.includes('@media (min-width:861px)') && currentCss.includes('.global-links{gap:0!important}'), 'desktop nine-item navigation fit rule is preserved');
expect(currentJs.includes("dataset.uiVersion = '5.0'"), 'runtime exposes current UI version');
expect(currentJs.includes('FIT_RULES') && currentJs.includes('fitDesktopNumerals'), 'desktop large-number fit behavior is consolidated');
expect(currentJs.includes('syncTopNavigation') && currentJs.includes('syncGroups'), 'desktop keyboard and ARIA behavior is consolidated');
expect(currentJs.includes("['.v43-tabs', false]") && currentJs.includes("aria-current', 'location'"), 'section anchors are not misrepresented as ARIA tabs');
expect(currentJs.includes('syncDesktopModalLock') && currentJs.includes('closeTopmostDesktopSurface'), 'desktop modal lock and Escape behavior are centrally reconciled');
expect(currentJs.includes('event.stopImmediatePropagation()'), 'topmost Desktop Escape prevents legacy multi-close cascades');

for (const [trigger, surface] of [
  ['commandButton','commandPalette'],
  ['periodButton','periodPopover'],
  ['viewMenuBtn','viewPopover'],
  ['topImportBtn','importDrawer']
]) {
  expect(index.includes(`id="${trigger}"`) && index.includes(`aria-controls="${surface}"`), `${trigger} declares its controlled surface`);
}
expect(index.includes('id="importDrawer" role="dialog"') && index.includes('aria-labelledby="importDrawerTitle"'), 'Desktop import drawer has dialog semantics');
expect(index.includes('id="detailDrawer" role="dialog"') && index.includes('aria-labelledby="detailTitle"'), 'Desktop detail drawer has dialog semantics');
expect(index.includes('id="panelModal" role="dialog"') && index.includes('aria-labelledby="panelModalTitle"'), 'Desktop focus modal has dialog semantics');
expect(index.includes('id="toastStack" aria-live="polite"'), 'Desktop toast region announces non-blocking updates');

expect(!exists('public/mobile/interactions.css'), 'dormant alternate mobile interaction stylesheet is removed');
expect(shell.includes('const ICONS = {') && shell.includes("['overview', '首页', 'home']"), 'native mobile shell uses deterministic SVG iconography');
expect(!/[⌂◎◇▦]/.test(shell), 'native mobile primary navigation no longer depends on font-specific symbol glyphs');
expect(shell.includes("event.key === 'Escape'") && shell.includes("event.key !== 'Tab'"), 'More sheet has Escape and focus containment behavior');
expect(shell.includes("typeof runtime.refresh === 'function'") && shell.includes('await runtime.refresh()'), 'mobile refresh can re-detect runtime availability');
expect(shell.includes('runtimeNoticeMarkup') && shell.includes("state.mode === 'offline'"), 'mobile shell exposes explicit loading/error/offline status');
expect(shell.includes('aria-busy=') && shell.includes('aria-disabled='), 'mobile shell publishes refresh busy semantics without stealing focus');
expect(shellCss.includes('.v5-mobile-runtime-notice') && shellCss.includes('.v5-mobile-runtime-spinner'), 'mobile runtime state has a dedicated visual treatment');
expect(shellCss.includes('background:var(--mi-bg,#edf2f5)!important'), 'mobile content canvas stays neutral below the graphite topbar');
expect(!shell.includes('分阶段重写队列'), 'mobile fallback no longer exposes development-phase copy');

for (const [name, source] of [['ads',recordViews[0]],['products',recordViews[1]],['inventory',recordViews[2]],['charges',recordViews[3]]]) {
  expect(/<button type="button" class="[^"]*\bv5-record-card\b[^"]*"/.test(source), `${name} record cards use native button semantics`);
  expect(!source.includes('<article class="v5-record-card"'), `${name} has no click-only article records`);
}
expect(currentCss.includes('V5 Mobile Intelligence Terminal') && currentCss.includes('.v5-intel-status') && currentCss.includes('.v5-intel-efficiency'), 'mobile high-density intelligence visual system is encoded in the canonical UI layer');
expect(overview.includes('v5-intel-status') && overview.includes('v5-intel-primary') && overview.includes('v5-intel-ops'), 'Overview renders status, primary business and operational intelligence tiers');
expect(overview.includes('data-v5-open-compare') && overview.includes('s.fulfillableUnits') && overview.includes('s.cvr') && overview.includes('s.returns'), 'Overview exposes compare and dense operational metrics from real selectors');
expect(overview.includes('const isLoading = Boolean(runtimeState?.loading)') && overview.includes("isLoading ? 'Updating'"), 'Overview data-health state cannot report Ready while range data is loading');
expect(recordViews[0].includes('const adSalesShare') && recordViews[0].includes('Number(adSalesShare || 0) * 100'), 'Ads Ad Sales micro bar is driven by real ad-sales share instead of decorative ROAS reuse');
expect(compare.includes('let lastFocus = null') && compare.includes('focusClose()') && compare.includes('lastFocus.focus'), 'Mobile Compare restores trigger focus');
expect(compare.includes("event.key !== 'Tab'") && compare.includes("event.key === 'Escape'"), 'Mobile Compare traps focus and supports Escape');
expect(compare.includes('let requestSerial = 0') && compare.includes('requestId !== requestSerial'), 'Mobile Compare ignores stale async responses after close');
expect(currentJs.includes('bindMobileOverlayTrap'), 'Period/Search/Detail dialogs receive shared mobile focus containment');
expect(!interactions.includes("overlayRoot.setAttribute('aria-live'"), 'interactive mobile overlay root is not an over-broad live region');
expect(interactions.includes('state.inventoryDetail || detail'), 'mobile search indexes the resolved inventory snapshot');
expect(interactions.includes("sort((a, b) => b.localeCompare(a))[0]"), 'mobile period picker resolves latest month deterministically');

expect(runtime.includes('let rangeLoadSerial = 0') && runtime.includes('let refreshSerial = 0'), 'shared runtime serializes range and refresh requests');
expect(runtime.includes('requestId !== rangeLoadSerial'), 'stale range responses cannot overwrite the active range');
expect(runtime.includes('clearRangeData();') && runtime.includes('state.from = from') && runtime.includes('state.to = to'), 'range changes clear old data before publishing a new period');
expect(runtime.includes("const previewAllowed = () => location.protocol === 'file:'") && runtime.includes("state.mode = 'offline'"), 'production API outages cannot silently substitute Demo data');
expect(runtime.includes("state.error = '实时数据服务暂时不可用，请稍后刷新重试。'"), 'offline state carries an explicit user-visible service error');
expect(runtime.includes('async function refresh()') && runtime.includes('state.loading = true'), 'runtime refresh publishes a busy state immediately');
expect(runtime.includes('function demoDashboard(from, to)') && runtime.includes('daysBetween(from, to) > 100'), 'demo runtime honors the selected range instead of pinning current month data');
expect(runtime.includes("sort((a, b) => b.localeCompare(a))"), 'runtime period selection is independent of API ordering');
expect(runtime.includes('resolveLiveInventoryDetail') && runtime.includes('hasInventorySnapshot'), 'inventory runtime resolves the nearest valid snapshot');
expect(selectors.includes('function inventorySource(runtimeState)') && selectors.includes('if (runtimeState?.inventoryDetail) return runtimeState.inventoryDetail;'), 'inventory selector consumes the resolved inventory snapshot first');
expect(selectors.includes('const cvrFallback') && selectors.includes('cvr: value(raw.cvr, raw.traffic_cvr, cvrFallback)'), 'summary CVR has a units/sessions fallback');
expect(selectors.includes('hasProductSessions') && selectors.includes('summary.cvr'), 'product totals preserve summary CVR when row detail is unavailable');
expect(secondarySelectors.includes('normalized.length ? reasonTotal : summary.returns'), 'returns summary remains truthful without reason-level detail');
expect(secondarySelectors.includes('refundSales: summary.refundSales ?? reasonRefundTotal') && returnsView.includes('const refundAmount = m.refundSales'), 'returns refund amount uses complete summary or all reason rows and never truncates to Top 30');
expect(secondarySelectors.includes("(b.createdAt || '').localeCompare(a.createdAt || '')"), 'Data latest import is resolved deterministically by creation time');

expect(!/font-size\s*:\s*(?:8|9)px\b/i.test(mobileCss), 'loaded native mobile CSS contains no 8px/9px text');
expect(coreCss.includes('.v5-record-metric span') && coreCss.includes('font-size:10px'), 'record metric labels meet the raised readability floor');
expect(secondaryCss.includes('.v5-history-metrics small') && secondaryCss.includes('font-size:10px'), 'history metric labels meet the raised readability floor');
expect(currentCss.includes('font-variant-numeric:tabular-nums'), 'dense mobile numeric surfaces use stable tabular numerals');
expect(currentCss.includes(':focus-visible'), 'current UI layer encodes a visible keyboard focus state');
expect(currentCss.includes('prefers-reduced-motion:reduce'), 'current UI layer honors reduced-motion preference');

expect(packageJson.version === '5.0.0', `package version is V5.0.0 (${packageJson.version})`);
expect(packageJson.scripts?.['check:ui:static'] === 'node scripts/ui-integrity-static-check.mjs', 'package exposes the UI integrity gate');
expect(packageJson.scripts?.['check:release:static']?.includes('check:v5:mobile:static') && packageJson.scripts?.['check:release:static']?.includes('check:ui:static'), 'release static gate composes V5 architecture + UI integrity');
expect(/^# YTDBNS Monthly Intelligence V5\.0/m.test(readme), 'README reflects V5.0');
expect(/Production status/i.test(readme), 'README records current production status');
expect(/Current production architecture/i.test(architecture), 'architecture document describes the current production architecture');

if (failures.length) {
  console.error(`\nUI integrity static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nUI integrity static gate passed for Desktop + V5 Native Mobile.');
