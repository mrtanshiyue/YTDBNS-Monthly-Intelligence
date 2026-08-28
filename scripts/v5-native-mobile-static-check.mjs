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
  return crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex');
};

const index = read('public/index.html');
const shell = read('public/mobile/mobile-shell.js');
const bridge = read('public/mobile/mobile-app-bridge.js');
const vnext = read('public/mobile/mobile-vnext.js');
const vnextCss = read('public/mobile/mobile-vnext.css');
const runtime = read('public/shared/runtime.js');
const selectors = read('public/shared/selectors.js');
const secondary = read('public/shared/secondary-selectors.js');
const activeBrowserJs = `${shell}\n${bridge}\n${vnext}\n${runtime}\n${selectors}\n${secondary}`;

expect(index.includes('id="mobileAppRoot"'), 'independent mobile root remains in canonical document');
expect(index.includes('./shared/runtime.js') && index.includes('./shared/selectors.js') && index.includes('./shared/secondary-selectors.js'), 'Mobile vNext reuses canonical read-only shared data layer');
expect(index.includes('./mobile/mobile-shell.js') && index.includes('./mobile/mobile-app-bridge.js'), 'canonical document still loads mobile bootstrap and compatibility bridge');

expect(shell.includes("link.href = './mobile/mobile-vnext.css'"), 'mobile bootstrap loads vNext stylesheet');
expect(shell.includes("script.src = './mobile/mobile-vnext.js'"), 'mobile bootstrap loads vNext runtime');
expect(shell.includes("dataset.mobileVnextReady = 'false'") && shell.includes("dataset.mobileVnextReady = 'true'"), 'vNext first paint is readiness-gated');
expect(shell.includes("document.body.classList.toggle('mobile-vnext-active'"), 'Mobile vNext owns explicit Desktop/Mobile surface switch');
expect(!shell.includes('v51-mobile.css') && !shell.includes('iphone-standalone.css'), 'vNext bootstrap no longer injects inherited V5.1 mobile styling');
expect(!shell.includes('mobile-redesign.js') && !shell.includes('mobile-redesign.css'), 'vNext bootstrap does not load previous redesign runtime');

expect(bridge.includes("root.dispatchEvent(new CustomEvent('vnext:navigate'"), 'compatibility navigation targets the vNext contract');
expect(bridge.includes("root.dispatchEvent(new CustomEvent('vnext:search'"), 'compatibility search targets the vNext contract');
expect(!bridge.includes('v5:navigate') && !bridge.includes('v52Ready') && !bridge.includes('mobile-redesign'), 'bridge contains no previous mobile architecture hooks');

const tabBlock = vnext.match(/const TABS = \[([\s\S]*?)\];/)?.[1] || '';
const tabs = [...tabBlock.matchAll(/\['([^']+)',\s*'([^']+)'/g)].map(match => [match[1], match[2]]);
expect(tabs.length === 4, `vNext has exactly four top-level destinations (${tabs.map(row => row[0]).join(', ')})`);
expect(tabs.map(row => row[0]).join('|') === 'today|alerts|trends|search', 'top-level IA is Today / Alerts / Trends / Search');
expect(tabs.map(row => row[1]).join('|') === '今日|异常|趋势|搜索', 'top-level labels match accepted Chinese IA');
expect(!/\['(?:overview|tasks|ads|products|inventory)',\s*'(?:首页|待办|广告|商品|库存)'/.test(tabBlock), 'business modules are no longer top-level mobile destinations');
expect(!vnext.includes("['workspace',") && !vnext.includes('v5MoreSheet'), 'Workspace and More garbage buckets remain absent');

expect(vnext.includes('function buildSignals()'), 'Today and Alerts share one cross-business signal engine');
for (const domain of ['finance', 'ads', 'products', 'inventory', 'returns', 'data']) {
  expect(vnext.includes(`domain: '${domain}'`), `signal engine can surface ${domain} exceptions`);
}
expect(vnext.includes("severity: 'critical'") && vnext.includes("severity: 'warning'"), 'signal engine has explicit severity rather than opaque health score');
expect(vnext.includes('function verdict(signals, summary)'), 'Today derives an executive conclusion from current signals');
expect(vnext.includes('先看这些') && vnext.includes('经营脉搏'), 'Today prioritizes conclusion → exceptions → operating pulse');

expect(vnext.includes('runtime.comparePrevious()'), 'Trends uses canonical previous-period retrieval');
expect(vnext.includes('本期 vs 上期') && vnext.includes('最近 6 个月'), 'Trends focuses on change and direction rather than module snapshots');
expect(vnext.includes('function searchItems()'), 'Search owns a single cross-domain searchable index');
for (const token of ['Campaign', 'SKU', 'ASIN', '扣费']) expect(vnext.includes(token), `universal search covers ${token}`);
expect(vnext.includes('data-vnext-search-input') && vnext.includes('type="search"'), 'Search is a dedicated first-class mobile destination');

expect(vnext.includes("const HISTORY_KEY = 'ytdbnsMobileVnext'"), 'vNext owns a distinct browser history contract');
expect(vnext.includes("window.addEventListener('popstate'"), 'vNext handles browser/Safari Back');
expect(vnext.includes('detailRegistry') && vnext.includes('detailKey'), 'detail screens participate in browser history');
expect(vnext.includes("sheet: 'period'"), 'period sheet participates in browser history');
expect(vnext.includes("event.key === 'Escape'"), 'transient vNext surfaces support Escape');
expect(vnext.includes("event.key !== 'Tab'"), 'transient vNext surfaces trap keyboard focus');

expect(vnext.includes('runtime.setQuickRange') && vnext.includes('runtime.setRange'), 'period controls use shared runtime range API');
expect(!/\bfetch\s*\(/.test(vnext), 'vNext never bypasses shared runtime with direct fetch');
expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(activeBrowserJs), 'active Mobile/shared browser layer contains no write HTTP methods');
expect(!/\/api\/imports\/(?:start|file|commit)/.test(activeBrowserJs), 'active Mobile browser layer cannot reach import mutation endpoints');
expect(!/\bRAW_REPORTS\b/.test(activeBrowserJs), 'active Mobile browser layer has no direct R2 binding access');

expect(vnextCss.includes('grid-template-columns:repeat(4,1fr)'), 'floating mobile tab bar is fixed to four top-level destinations');
expect(vnextCss.includes('backdrop-filter:blur(26px)') && vnextCss.includes('.vnext-tabbar'), 'tab bar uses restrained floating mobile chrome');
expect(vnextCss.includes('env(safe-area-inset-top)') && vnextCss.includes('env(safe-area-inset-bottom)'), 'vNext handles iPhone safe areas');
expect(/min-height:\s*44px/.test(vnextCss) || /height:\s*44px/.test(vnextCss), 'vNext encodes a 44px comfortable touch target floor');
expect(vnextCss.includes('font-size:16px') && vnextCss.includes('.vnext-search-field input'), 'Search avoids iOS focus zoom');
expect(vnextCss.includes('@media(max-width:390px)'), 'vNext has narrow-iPhone tuning');
expect(vnextCss.includes('prefers-reduced-motion:reduce'), 'vNext honors reduced-motion preference');
expect(!/<table\b/i.test(vnext), 'vNext has no desktop table markup');

expect(runtime.includes('async function comparePrevious()'), 'shared runtime still owns comparison retrieval');
expect(runtime.includes('const candidate = inventoryReferenceMonth(to);'), 'inventory startup still resolves one authoritative reference month');
expect(!runtime.includes('for (const candidate of inventoryReferenceMonths(to))'), 'inventory startup cannot regress to serial historical month scanning');
expect(selectors.includes('runtimeState?.inventoryDetail'), 'inventory selector still consumes resolved snapshot detail');

expect(index.includes('<div class="period-pane" data-pane="month">'), 'Desktop period markup remains frozen');
expect(!index.includes('<div class="period-pane active" data-pane="month">'), 'Mobile redesign does not mutate Desktop period activation');

const frozen = {
  'public/app.js': 'a6848333f0bada81120966cd4c4d6b3393366ecc',
  'public/enhancements.js': '88c4ca3d60a270a5ab0a8baa2e9ac16151b6414b',
  'public/v54.js': 'f0fe9a21fe2545e7109e77506f1bcc23e0b6a038',
  'public/v54.css': '4a582993bc6d2c2dff6cc17a2f94121bcf1c3b1c',
  'public/v54-acceptance.css': 'e152a3be81a28eaac2ac0a42276a2df4265df2c3',
  'src/worker.js': '6c82e35afc21c21c23e84af0ec60b555e90ae84e'
};
for (const [relative, expected] of Object.entries(frozen)) expect(blobSha(relative) === expected, `${relative} remains frozen at accepted baseline blob`);

if (failures.length) {
  console.error(`\nMobile vNext static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nMobile vNext static gate passed: zero-based operating radar architecture is intact.');
