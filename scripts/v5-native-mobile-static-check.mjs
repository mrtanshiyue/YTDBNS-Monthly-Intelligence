import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const buffer = relative => fs.readFileSync(path.join(root, relative));
const exists = relative => fs.existsSync(path.join(root, relative));
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
const bridge = read('public/mobile/mobile-app-bridge.js');
const redesign = read('public/mobile/mobile-redesign.js');
const redesignCss = read('public/mobile/mobile-redesign.css');
const interactions = read('public/mobile/mobile-interactions.js');
const interactionCss = read('public/mobile/mobile-interactions.css');
const compare = read('public/mobile/mobile-compare.js');
const compareCss = read('public/mobile/mobile-compare.css');
const runtime = read('public/shared/runtime.js');
const selectors = read('public/shared/selectors.js');
const mobileJsFiles = filesUnder('public/mobile', '.js');
const mobileCssFiles = filesUnder('public/mobile', '.css');
const sharedJsFiles = filesUnder('public/shared', '.js');
const mobileJs = mobileJsFiles.map(read).join('\n');
const sharedJs = sharedJsFiles.map(read).join('\n');
const browserJs = `${mobileJs}\n${sharedJs}`;
const mobileCss = mobileCssFiles.map(read).join('\n');

expect(index.includes('id="mobileAppRoot"'), 'independent mobile root exists');
for (const asset of [
  './mobile/mobile-shell.css',
  './mobile/mobile-interactions.css',
  './mobile/mobile-compare.css',
  './shared/runtime.js',
  './shared/formatters.js',
  './shared/selectors.js',
  './shared/secondary-selectors.js',
  './mobile/mobile-shell.js',
  './mobile/mobile-app-bridge.js',
  './mobile/mobile-interactions.js',
  './mobile/mobile-compare.js',
  './mobile/mobile-compare-trigger.js'
]) expect(index.includes(asset), `mobile entrypoint loads ${asset}`);

expect(bridge.includes("link.href = './mobile/mobile-redesign.css'"), 'bridge loads accepted mobile redesign CSS');
expect(bridge.includes("script.src = './mobile/mobile-redesign.js'"), 'bridge loads accepted mobile redesign runtime');
expect(bridge.includes("dataset.v52Ready = 'false'") && bridge.includes("dataset.v52Ready = 'true'"), 'redesign first paint is readiness-gated');
expect(!bridge.includes('MutationObserver'), 'legacy navigation MutationObserver override is removed');
expect(!exists('public/mobile/mobile-top-tabs.css'), 'obsolete nine-top-tab stylesheet is removed');
expect(!mobileJs.includes('v5-mobile-top-tabs'), 'legacy nine-top-tab runtime contract is absent');

const primaryBlock = shell.match(/const PRIMARY = \[([\s\S]*?)\];/)?.[1] || '';
const primaryRoutes = [...primaryBlock.matchAll(/\['([^']+)',/g)].map(match => match[1]);
expect(primaryRoutes.length === 5, `exactly five primary mobile destinations (${primaryRoutes.join(', ')})`);
expect(primaryRoutes.join('|') === 'overview|tasks|ads|products|inventory', 'primary navigation matches accepted action-first IA');
expect(shell.includes("tasks: ['待办'"), '待办 has an explicit route title');
expect(!shell.includes("['workspace',") && !shell.includes('function workspaceMarkup()'), 'Workspace garbage-bucket route is removed');
expect(!shell.includes("route === 'more'") && !shell.includes('v5MoreSheet'), 'More garbage-bucket route is absent');
expect(shell.includes("const HISTORY_KEY = 'ytdbnsMobileRoute'"), 'mobile business routes own browser history state');
expect(shell.includes("window.addEventListener('popstate'"), 'mobile shell handles Safari/browser Back');
expect(shell.includes('closeTransientSurfaceForBack'), 'Back closes transient surfaces before leaving the business route');
expect(shell.includes("root.addEventListener('v5:navigate'"), 'mobile shell owns explicit route navigation events');
expect(shell.includes("root.addEventListener('v5:refresh-view'"), 'mobile shell exposes read-only rerender contract');
expect(shell.includes("data-mobile-action=\"period\"") && shell.includes("data-mobile-action=\"search\""), 'shell exposes Period and Search in sticky context');

const expectedViews = ['overview', 'ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data'];
for (const view of expectedViews) {
  expect(new RegExp(`registry\\.${view}\\s*=`).test(mobileJs), `${view} has an independent mobile renderer`);
}
expect(/registry\.tasks\s*=/.test(redesign), '待办 has an independent Action Queue renderer');
expect(redesign.includes('function collectTasks(runtimeState)'), 'Action Queue is derived from shared read-only selectors');
expect(redesign.includes("route: 'ads'") && redesign.includes('低转化'), 'Action Queue includes advertising efficiency risks');
expect(redesign.includes("route: 'products'") && redesign.includes('低动销'), 'Action Queue includes product velocity risks');
expect(redesign.includes("route: 'inventory'") && redesign.includes('高资金占用'), 'Action Queue includes inventory capital risks');
expect(read('public/mobile/views/overview.js').includes('YT_MOBILE_REDESIGN?.collectTasks'), 'Overview consumes the same Action Queue truth source');

for (const [name, token] of [['ads','ads'],['products','products'],['inventory','inventory']]) {
  const source = read(`public/mobile/views/${name}.js`);
  expect(source.includes(`data-v52-ops-open=\"${token}\"`), `${name} uses shared Filter / Sort bottom sheet trigger`);
  expect(source.includes("root?.addEventListener('v52:ops-apply'"), `${name} consumes shared Filter / Sort apply events`);
  expect(!source.includes('v51-filter-scroll'), `${name} no longer uses horizontal filter strips`);
}
expect(redesign.includes("const explicitClose = event.target.closest('[data-v52-close]:not([data-v52-close=\"backdrop\"])')"), 'Filter sheet close delegation cannot swallow internal option clicks');
expect(redesign.includes('root.inert = true') && redesign.includes('root.inert = false'), 'Filter sheet makes the background inert and restores it');
expect(redesign.includes("event.key !== 'Tab'") && redesign.includes("event.key === 'Escape'"), 'Filter sheet traps focus and supports Escape');

expect(interactions.includes("['tasks', '待办'"), 'Global Search indexes 待办 as a first-class module');
expect(interactions.includes("mount('period'") && interactions.includes('v5-interaction-sheet'), 'Period uses native mobile bottom sheet');
expect(interactions.includes("mount('search'") && interactions.includes('v5-fullscreen'), 'Search uses full-screen mobile surface');
expect(interactions.includes("mount('detail'") && interactions.includes('v5-fullscreen'), 'Detail uses full-screen mobile surface');
expect(interactions.includes('mobileRoot.inert = Boolean(open)'), 'Search / Period / Detail modal lifecycle makes background inert');
expect(interactions.includes("event.key !== 'Tab'") && interactions.includes("event.key === 'Escape'"), 'Search / Period / Detail trap focus and support Escape');
expect(interactions.includes('lastFocus.focus'), 'Search / Period / Detail restore trigger focus');
expect(interactionCss.includes('.v5-search-field input') && interactionCss.includes('font-size:16px'), 'mobile inputs avoid iOS focus zoom');
expect(interactionCss.includes('overscroll-behavior:contain'), 'interaction surfaces own their scrolling');

expect(compare.includes('runtime.comparePrevious()'), 'Compare consumes shared previous-period retrieval');
expect(!/\bfetch\s*\(/.test(compare), 'Compare does not bypass shared runtime with direct fetch');
expect(compare.includes('mobileRoot.inert = true') && compare.includes('mobileRoot.inert = false'), 'Compare owns background inert lifecycle');
expect(compare.includes("event.key !== 'Tab'") && compare.includes("event.key === 'Escape'"), 'Compare traps focus and supports Escape');
expect(compare.includes('lastFocus.focus'), 'Compare restores trigger focus');

const forbiddenDesktopContracts = [
  'mainNav', 'periodPopover', 'importDrawer', 'commandPalette', 'detailDrawer', 'panelModal',
  'global-links', 'data-table', 'table-wrap', 'v54-mobile-ui'
];
for (const token of forbiddenDesktopContracts) {
  expect(!mobileJs.includes(token), `mobile JavaScript does not depend on Desktop contract: ${token}`);
}
for (const file of mobileJsFiles.filter(file => file.includes('/views/'))) {
  expect(!/<table\b/i.test(read(file)), `${file} uses mobile records instead of table markup`);
}

expect(runtime.includes('async function comparePrevious()'), 'shared runtime owns comparison retrieval');
expect(runtime.includes('inventoryDetail: null') && runtime.includes('inventoryReferenceMonth'), 'shared runtime models inventory snapshot detail independently');
expect(runtime.includes('month <= ceiling'), 'inventory snapshot cannot move later than selected period');
expect(runtime.includes('const candidate = inventoryReferenceMonth(to);'), 'live inventory resolution uses one authoritative reference month');
expect(!runtime.includes('for (const candidate of inventoryReferenceMonths(to))'), 'live startup never serially scans historical months for inventory');
expect(selectors.includes('runtimeState?.inventoryDetail'), 'Inventory selector consumes resolved snapshot detail');

expect(shellCss.includes('env(safe-area-inset-top)') && shellCss.includes('env(safe-area-inset-bottom)'), 'shell handles iPhone safe areas');
expect(interactionCss.includes('env(safe-area-inset-top)') && interactionCss.includes('env(safe-area-inset-bottom)'), 'interaction surfaces handle iPhone safe areas');
expect(redesignCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'), 'accepted bottom navigation is fixed five-column layout');
expect(/min-height:\s*44px/.test(mobileCss) || /height:\s*44px/.test(mobileCss), '44px touch target floor is encoded');
expect(shellCss.includes('overflow-x:hidden') && shellCss.includes('overflow-x:clip'), 'mobile shell prevents accidental horizontal overflow');
expect(redesignCss.includes('@media(max-width:390px)'), 'accepted redesign contains compact iPhone width tuning');

expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(browserJs), 'mobile/shared browser JavaScript contains no write HTTP methods');
expect(!/\/api\/imports\/(?:start|file|commit)/.test(browserJs), 'mobile browser JavaScript cannot reach import mutation endpoints');
expect(!/\bRAW_REPORTS\b/.test(browserJs), 'mobile browser layer has no direct R2 binding access');

expect(index.includes('<div class="period-pane" data-pane="month">'), 'Desktop month period pane keeps frozen inactive markup');
expect(!index.includes('<div class="period-pane active" data-pane="month">'), 'mobile redesign does not alter Desktop period activation');

const frozen = {
  'public/app.js': 'a6848333f0bada81120966cd4c4d6b3393366ecc',
  'public/enhancements.js': '88c4ca3d60a270a5ab0a8baa2e9ac16151b6414b',
  'public/v54.js': 'f0fe9a21fe2545e7109e77506f1bcc23e0b6a038',
  'public/v54.css': '4a582993bc6d2c2dff6cc17a2f94121bcf1c3b1c',
  'public/v54-acceptance.css': 'e152a3be81a28eaac2ac0a42276a2df4265df2c3',
  'src/worker.js': '6c82e35afc21c21c23e84af0ec60b555e90ae84e'
};
for (const [relative, expected] of Object.entries(frozen)) {
  expect(blobSha(relative) === expected, `${relative} remains frozen at accepted baseline blob`);
}

if (failures.length) {
  console.error(`\nV5 mobile redesign static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log(`\nV5 mobile redesign static gate passed across ${mobileJsFiles.length} mobile JS, ${mobileCssFiles.length} mobile CSS and ${sharedJsFiles.length} shared JS files.`);
