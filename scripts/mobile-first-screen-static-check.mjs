import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const failures = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = message => { failures.push(message); console.error(`FAIL  ${message}`); };
const expect = (condition, message) => condition ? pass(message) : fail(message);

const shell = read('public/mobile/mobile-shell.js');
const css = read('public/mobile/mobile-vnext-first-screen.css');
const fontCss = read('public/mobile/mobile-vnext-fonts.css');
const density = read('public/mobile/mobile-vnext-density.js');
const pkg = JSON.parse(read('package.json'));

expect(css.startsWith('@media (max-width:860px){'), 'first-screen stylesheet is Mobile-only');
expect(!css.includes('@media (min-width:861px)'), 'first-screen stylesheet introduces no Desktop override');
expect(shell.includes("link.href = './mobile/mobile-vnext-first-screen.css'"), 'mobile shell loads first-screen stylesheet');
expect(shell.indexOf('ensureFirstScreenStylesheet()') < shell.lastIndexOf("dataset.mobileVnextReady = 'true'"), 'first-screen stylesheet loads before Mobile readiness');

expect(fontCss.startsWith('@media (max-width:860px){'), 'font fallback stylesheet is Mobile-only');
expect(fontCss.includes('"PingFang SC"') && fontCss.includes('"Hiragino Sans GB"'), 'Apple/iOS Chinese font fallbacks are explicit');
expect(fontCss.includes('"Microsoft YaHei UI"') && fontCss.includes('"Microsoft YaHei"'), 'Windows Chinese font fallbacks are explicit');
expect(fontCss.includes('"Noto Sans CJK SC"') && fontCss.includes('"Noto Sans SC"'), 'Android/Linux/CI Chinese font fallbacks are explicit');
expect(!/@font-face|@import|url\s*\(/i.test(fontCss), 'font hardening uses local platform fallbacks only and adds no remote font dependency');
expect(shell.includes("link.href = './mobile/mobile-vnext-fonts.css'"), 'mobile shell loads CJK font fallback stylesheet');
expect(shell.indexOf('ensureFontStylesheet()') < shell.lastIndexOf("dataset.mobileVnextReady = 'true'"), 'font fallback stylesheet loads before Mobile readiness');

const expectedPriority = [
  ['sales', 1], ['profit', 2], ['acos', 3], ['adSpend', 4], ['refund', 5], ['inventory', 6], ['cvr', 7]
];
for (const [metric, order] of expectedPriority) {
  expect(css.includes(`.vnext-density-metric[data-density-metric="${metric}"]{order:${order}}`), `metric priority ${metric} -> ${order}`);
}
expect(css.includes('.vnext-density-metric{') && css.includes('order:20'), 'non-priority metrics remain after the seven decision metrics');
expect(css.includes('min-height:60px') && css.includes('min-height:58px'), 'KPI board is vertically compressed for current and narrow iPhones');
expect(css.includes('.vnext-density-metric>span{') && css.includes('font-size:10px'), 'KPI labels are upgraded to readable 10px');
expect(css.includes('.vnext-density-metric small{') && css.includes('font-size:9.5px'), 'KPI supporting text is upgraded above legacy 9px');
expect(css.includes('mask-image:linear-gradient'), 'business rail has an overflow affordance');
expect(css.includes('scroll-snap-type:x proximity') && css.includes('scroll-snap-align:start'), 'business rail horizontal navigation has predictable snapping');
expect(css.includes('.vnext-home-cost-grid small') && css.includes('font-size:9px'), 'legacy 7px home cost microcopy is overridden to at least 9px');
expect(!/font-size:\s*(?:[0-8](?:\.\d+)?)px/.test(css), 'first-screen overlay introduces no text below 9px');
expect(!/\.vnext-density-metric[^\{]*\{[^\}]*display\s*:\s*none/i.test(css), 'no operating KPI is hidden by the hardening layer');

const denseMetricCalls = [...density.matchAll(/\$\{denseMetric\(/g)].length;
expect(denseMetricCalls === 12, `all 12 operating metrics remain in the runtime (${denseMetricCalls})`);
expect(density.includes("denseMetric('销售额'") && density.includes("denseMetric('贡献利润'") && density.includes("denseMetric('退款销售'"), 'core decision KPIs remain present in runtime markup');

expect(pkg.scripts?.['check:v5:mobile:first-screen'] === 'node scripts/mobile-first-screen-static-check.mjs', 'package exposes first-screen static gate');

if (failures.length) {
  console.error(`\nMobile first-screen static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nMobile first-screen static gate passed: hierarchy, readability, and cross-platform CJK fallback are release-gated.');
