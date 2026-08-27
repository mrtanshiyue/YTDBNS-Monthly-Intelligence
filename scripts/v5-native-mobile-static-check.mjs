import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const buffer = relative => fs.readFileSync(path.join(root, relative));
const failures = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = message => { failures.push(message); console.error(`FAIL  ${message}`); };
const expect = (condition, message) => condition ? pass(message) : fail(message);
const blobSha = relative => {
  const body = buffer(relative);
  const header = Buffer.from(`blob ${body.length}\0`);
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
};
const filesUnder = (relative, extension) => {
  const absolute = path.join(root, relative);
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (!extension || entry.name.endsWith(extension)) out.push(path.relative(root, target).replaceAll(path.sep, '/'));
    }
  };
  walk(absolute);
  return out.sort();
};

const index = read('public/index.html');
const shell = read('public/mobile/mobile-shell.js');
const shellCss = read('public/mobile/mobile-shell.css');
const interactions = read('public/mobile/mobile-interactions.js');
const interactionCss = read('public/mobile/mobile-interactions.css');
const bridge = read('public/mobile/mobile-app-bridge.js');
const compare = read('public/mobile/mobile-compare.js');
const compareCss = read('public/mobile/mobile-compare.css');
const compareTrigger = read('public/mobile/mobile-compare-trigger.js');
const runtime = read('public/shared/runtime.js');
const selectors = read('public/shared/selectors.js');
const mobileJsFiles = filesUnder('public/mobile', '.js');
const mobileCssFiles = filesUnder('public/mobile', '.css');
const sharedJsFiles = filesUnder('public/shared', '.js');
const mobileJs = mobileJsFiles.map(read).join('\n');
const sharedJs = sharedJsFiles.map(read).join('\n');
const v5BrowserJs = `${mobileJs}\n${sharedJs}`;
const v5Css = mobileCssFiles.map(read).join('\n');

expect(index.includes('id="mobileAppRoot"'), 'independent mobile root exists');
expect(index.includes('./mobile/mobile-shell.css'), 'mobile Shell CSS is loaded');
expect(index.includes('./mobile/mobile-interactions.css'), 'mobile interaction CSS is loaded');
expect(!index.includes('./mobile/interactions.css'), 'dormant alternate interaction CSS is not simultaneously loaded');
expect(index.includes('./mobile/mobile-compare.css'), 'mobile Compare CSS is loaded');
expect(index.includes('./shared/runtime.js'), 'shared runtime is loaded');
expect(index.includes('./shared/formatters.js'), 'shared formatters are loaded');
expect(index.includes('./shared/selectors.js'), 'shared core selectors are loaded');
expect(index.includes('./shared/secondary-selectors.js'), 'shared secondary selectors are loaded');
expect(index.includes('./mobile/mobile-shell.js'), 'mobile Shell is loaded');
expect(index.includes('./mobile/mobile-app-bridge.js'), 'mobile app bridge is loaded');
expect(index.includes('./mobile/mobile-interactions.js'), 'mobile interaction controller is loaded');
expect(index.includes('./mobile/mobile-compare.js') && index.includes('./mobile/mobile-compare-trigger.js'), 'mobile Compare is loaded');
expect(/const PRIMARY = \[[\s\S]*?\];/.test(shell), 'primary mobile navigation is explicitly declared');

const primaryBlock = shell.match(/const PRIMARY = \[([\s\S]*?)\];/)?.[1] || '';
const primaryRoutes = [...primaryBlock.matchAll(/\['([^']+)',/g)].map(match => match[1]);
expect(primaryRoutes.length === 5, `exactly five primary mobile destinations (${primaryRoutes.join(', ')})`);
expect(primaryRoutes.join('|') === 'overview|ads|products|inventory|more', 'primary navigation matches V5 product hierarchy');

const expectedViews = ['overview', 'ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data'];
for (const view of expectedViews) {
  expect(new RegExp(`registry\\.${view}\\s*=`).test(mobileJs), `${view} has an independent mobile renderer`);
}
expect(read('public/mobile/views/overview.js').includes('单指标视图'), 'Overview chart contract is single-focus');

const forbiddenDesktopContracts = [
  'mainNav', 'periodPopover', 'importDrawer', 'commandPalette', 'detailDrawer', 'panelModal',
  'global-links', 'data-table', 'table-wrap', 'v54-mobile-ui'
];
for (const token of forbiddenDesktopContracts) {
  expect(!mobileJs.includes(token), `mobile JavaScript does not depend on Desktop contract: ${token}`);
}
for (const file of mobileJsFiles.filter(file => file.includes('/views/'))) {
  const source = read(file);
  expect(!/<table\b/i.test(source), `${file} uses mobile records instead of table markup`);
}

expect(interactions.includes("mount('period'") && interactions.includes('v5-interaction-sheet'), 'Period uses an independent mobile bottom sheet');
expect(interactions.includes("mount('search'") && interactions.includes('v5-fullscreen'), 'Search uses a full-screen mobile surface');
expect(interactions.includes("mount('detail'") && interactions.includes('v5-fullscreen'), 'Detail uses a full-screen mobile surface');
expect(interactions.includes('data-v5-date-from') && interactions.includes('data-v5-date-to'), 'Period supports mobile custom date controls');
expect(interactions.includes("state.mode === 'live' || !state.monthDetail ? null"), 'Search never falls back to stale Demo detail outside the active Demo month');
expect(interactions.includes('const METRICS = [') && interactions.includes("['ACOS', 'acos', 'ads'") && interactions.includes("['库存资金', 'inventoryValue', 'inventory'"), 'Search index includes core business metrics');
expect(interactions.includes("'function', '选择期间'") && interactions.includes("'function', '对比上期'"), 'Search index includes mobile function entries');
expect(interactions.includes("item.action === 'period'") && interactions.includes("item.action === 'compare'"), 'Search actions open native Period and Compare surfaces');
expect(interactions.includes('inputmode="search"'), 'Search uses a mobile search keyboard contract');
expect(interactionCss.includes('.v5-search-field input') && interactionCss.includes('font-size:16px'), 'mobile inputs use 16px text to avoid iOS focus zoom');
expect(interactionCss.includes('overscroll-behavior:contain'), 'interaction surfaces own their scrolling');
expect(!/v5-mobile-overlay-open\{[^}]*touch-action\s*:\s*none/i.test(interactionCss), 'background lock does not disable descendant touch gestures');
expect(interactionCss.includes('v5-interaction-sheet') && interactionCss.includes('touch-action:pan-y'), 'Bottom Sheet explicitly preserves vertical touch scrolling');
expect(interactionCss.includes('.v5-fullscreen-body') && interactionCss.includes('touch-action:pan-y'), 'Full-screen body explicitly preserves vertical touch scrolling');
expect(bridge.includes("new CustomEvent('v5:navigate'"), 'Search navigation crosses the explicit mobile route bridge');
expect(shell.includes("root.addEventListener('v5:navigate'"), 'Mobile Shell owns route changes requested by interaction layer');

expect(runtime.includes('async function comparePrevious()'), 'shared runtime owns previous-period retrieval');
expect(compare.includes('runtime.comparePrevious()'), 'Mobile Compare consumes the shared comparison API');
expect(!/\bfetch\s*\(/.test(compare), 'Mobile Compare does not bypass shared runtime with direct fetch');
expect(compare.includes("['ACOS', 'acos', 'pct', 'down']") && compare.includes("['TACOS', 'tacos', 'pct', 'down']"), 'Compare treats lower ACOS/TACOS as favorable');
expect(compare.includes("['广告花费', 'adSpend', 'money', 'neutral']"), 'Compare keeps ad-spend movement semantically neutral');
expect(compareTrigger.includes('data-v5-open-compare'), 'Overview exposes a one-tap mobile Compare action');
expect(compareCss.includes('.v5-compare-row') && compareCss.includes('.v5-compare-range'), 'Compare has an independent mobile presentation');

expect(runtime.includes('inventoryDetail: null') && runtime.includes('inventoryReferenceMonth'), 'shared runtime models inventory as a dedicated snapshot detail');
expect(runtime.includes('month <= ceiling'), 'inventory snapshot reference cannot move later than the selected period');
expect(selectors.includes('runtimeState?.inventoryDetail'), 'Inventory selector consumes the dedicated snapshot detail');

expect(!/\bv55(?:\.css|\.js|-)/i.test(index + v5BrowserJs + v5Css), 'V5 does not continue v55 responsive patch naming');
expect(shellCss.includes('env(safe-area-inset-top)') && shellCss.includes('env(safe-area-inset-bottom)'), 'iPhone safe-area insets are handled');
expect(interactionCss.includes('env(safe-area-inset-top)') && interactionCss.includes('env(safe-area-inset-bottom)'), 'interaction surfaces respect iPhone safe areas');
expect(/min-height:\s*44px/.test(v5Css) || /height:\s*44px/.test(v5Css), '44px touch target floor is encoded');
expect(shellCss.includes('overflow-x:hidden') && shellCss.includes('overflow-x:clip'), 'mobile Shell prevents accidental horizontal overflow');
expect(shellCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'), 'bottom navigation uses fixed five-column layout, not horizontal scrolling');

expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(v5BrowserJs), 'V5 browser JavaScript contains no write HTTP methods');
expect(!/\/api\/imports\/(?:start|file|commit)/.test(v5BrowserJs), 'V5 browser JavaScript cannot reach import mutation endpoints');
expect(!/\bRAW_REPORTS\b/.test(v5BrowserJs), 'V5 browser layer has no direct R2 binding access');

expect(index.includes('<div class="period-pane" data-pane="month">'), 'Desktop month period pane keeps the frozen inactive markup');
expect(!index.includes('<div class="period-pane active" data-pane="month">'), 'V5 wiring does not activate the Desktop month pane');

const frozen = {
  'public/app.js': 'a6848333f0bada81120966cd4c4d6b3393366ecc',
  'public/enhancements.js': '88c4ca3d60a270a5ab0a8baa2e9ac16151b6414b',
  'public/v54.js': 'f0fe9a21fe2545e7109e77506f1bcc23e0b6a038',
  'public/v54.css': '4a582993bc6d2c2dff6cc17a2f94121bcf1c3b1c',
  'public/v54-acceptance.css': 'e152a3be81a28eaac2ac0a42276a2df4265df2c3',
  'src/worker.js': '6c82e35afc21c21c23e84af0ec60b555e90ae84e'
};
for (const [relative, expected] of Object.entries(frozen)) {
  const actual = blobSha(relative);
  expect(actual === expected, `${relative} remains frozen at V4.15 baseline blob`);
}

if (failures.length) {
  console.error(`\nV5 native mobile static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log(`\nV5 native mobile static gate passed across ${mobileJsFiles.length} mobile JS, ${mobileCssFiles.length} mobile CSS and ${sharedJsFiles.length} shared JS files.`);
