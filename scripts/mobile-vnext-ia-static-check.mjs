import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const failures = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = message => { failures.push(message); console.error(`FAIL  ${message}`); };
const expect = (condition, message) => condition ? pass(message) : fail(message);

const shell = read('public/mobile/mobile-shell.js');
const ia = read('public/mobile/mobile-vnext-ia.js');
const css = read('public/mobile/mobile-vnext-ia.css');
const density = read('public/mobile/mobile-vnext-density.js');
const pkg = JSON.parse(read('package.json'));

const expectedDomains = ['ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data'];
const domainBlock = ia.match(/const DOMAIN_IDS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
const domains = [...domainBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
expect(JSON.stringify(domains) === JSON.stringify(expectedDomains), `IA exposes exactly eight business domains (${domains.join(', ')})`);
expect(ia.includes("const DUPLICATE_PRIMARY_IDS = new Set(['today', 'alerts'])"), 'Today and Alerts are explicitly removed from the secondary business rail');
expect(ia.includes("return activePrimaryTab() === 'today' || Boolean(activeModule())"), 'business rail is visible only on Today or an active business module');
expect(ia.includes("rail.setAttribute('aria-label', '业务模块')"), 'secondary rail has a domain-specific accessible label');
expect(ia.includes("button.setAttribute('aria-hidden', 'true')") && ia.includes('button.tabIndex = -1'), 'duplicate rail controls are removed from both visual and keyboard navigation');
expect(ia.includes("window.addEventListener('popstate'"), 'IA resynchronizes after Browser/Safari Back');
expect(!/\bfetch\s*\(/.test(ia), 'IA overlay contains no direct network fetch');
expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(ia), 'IA overlay contains no write HTTP method');

expect(shell.includes("link.href = './mobile/mobile-vnext-ia.css'"), 'mobile shell loads IA stylesheet');
expect(shell.includes("script.src = './mobile/mobile-vnext-ia.js'"), 'mobile shell loads IA runtime');
expect(shell.indexOf('ensureIaRuntime()') < shell.lastIndexOf("dataset.mobileVnextReady = 'true'"), 'IA runtime loads before Mobile readiness is released');
expect(shell.includes('window.YT_MOBILE_VNEXT_IA?.refresh?.()'), 'mobile shell refreshes IA after activation');

expect(css.startsWith('@media (max-width:860px){'), 'IA styling is scoped to Mobile breakpoint only');
expect(css.includes('.vnext-module-rail[hidden]') && css.includes('display:none!important'), 'hidden business rail is fail-closed in CSS');
expect(css.includes('[data-vnext-module="today"]') && css.includes('[data-vnext-module="alerts"]'), 'duplicate Today/Alerts rail entries are fail-closed in CSS');
expect(!css.includes('@media (min-width:861px)'), 'IA stylesheet introduces no Desktop override block');
expect(css.includes('#mobileAppRoot .vnext-module-rail[data-vnext-ia="domain"] button.active') && css.includes('color:#fff'), 'active business-domain rail text overrides root button inheritance with readable white text');
expect(css.includes('#mobileAppRoot .vnext-density-module-page .vnext-filter-tags') && css.includes('mask-image:linear-gradient'), 'module filter strips expose horizontal overflow with a visual fade affordance');
expect(css.includes('scroll-snap-type:x proximity') && css.includes('scroll-snap-align:start'), 'module filters use predictable horizontal snap behavior');
expect(css.includes('#mobileAppRoot .vnext-density-module-page .vnext-filter-tags button.active') && css.includes('color:var(--vx-accent)'), 'active module filters override root button inheritance with explicit selected-state color');
expect(css.includes('#mobileAppRoot .vnext-density-module-page .vnext-module-section>header') && css.includes('flex-direction:column') && css.includes('align-items:flex-start'), 'module section headers stack label above title/count on Mobile');

const businessBlock = density.match(/const BUSINESS_MODULES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
const businessDomains = [...businessBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
expect(expectedDomains.every(domain => businessDomains.includes(domain)), 'existing business-module routes remain intact underneath the IA overlay');
expect(!businessDomains.includes('today') && !businessDomains.includes('alerts'), 'primary task destinations remain outside business-module routing');
for (const domain of ['ads', 'products', 'inventory']) {
  expect(density.includes(`${domain}: [`), `${domain} retains a first-class filter definition`);
}
expect(density.includes('class="vnext-filter-tags"') && density.includes('class="vnext-module-section"'), 'module runtime retains shared filter-strip and section-header structures');

expect(pkg.scripts?.['check:v5:mobile:ia'] === 'node scripts/mobile-vnext-ia-static-check.mjs', 'package exposes Mobile IA static gate');

if (failures.length) {
  console.error(`\nMobile vNext IA static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nMobile vNext IA static gate passed: task IA and module interaction states are cleanly separated and release-gated.');
