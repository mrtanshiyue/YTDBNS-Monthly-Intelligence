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

const index = read('public/index.html');
const shell = read('public/mobile/mobile-shell.js');
const shellCss = read('public/mobile/mobile-shell.css');
const overview = read('public/mobile/views/overview.js');
const overviewCss = read('public/mobile/views/overview.css');
const runtime = read('public/shared/runtime.js');
const formatters = read('public/shared/formatters.js');
const selectors = read('public/shared/selectors.js');
const mobileJs = [shell, overview].join('\n');
const sharedJs = [runtime, formatters, selectors].join('\n');
const v5BrowserJs = [mobileJs, sharedJs].join('\n');
const v5Css = [shellCss, overviewCss].join('\n');

expect(index.includes('id="mobileAppRoot"'), 'independent mobile root exists');
expect(index.includes('./mobile/mobile-shell.css'), 'mobile Shell CSS is loaded');
expect(index.includes('./mobile/views/overview.css'), 'mobile Overview CSS is loaded');
expect(index.includes('./shared/runtime.js'), 'shared runtime is loaded');
expect(index.includes('./shared/formatters.js'), 'shared formatters are loaded');
expect(index.includes('./shared/selectors.js'), 'shared selectors are loaded');
expect(index.includes('./mobile/views/overview.js'), 'mobile Overview renderer is loaded');
expect(index.includes('./mobile/mobile-shell.js'), 'mobile Shell is loaded last');
expect(/const PRIMARY = \[[\s\S]*?\];/.test(shell), 'primary mobile navigation is explicitly declared');

const primaryBlock = shell.match(/const PRIMARY = \[([\s\S]*?)\];/)?.[1] || '';
const primaryRoutes = [...primaryBlock.matchAll(/\['([^']+)',/g)].map(match => match[1]);
expect(primaryRoutes.length === 5, `exactly five primary mobile destinations (${primaryRoutes.join(', ')})`);
expect(primaryRoutes.join('|') === 'overview|ads|products|inventory|more', 'primary navigation matches V5 product hierarchy');
expect(overview.includes('window.YT_MOBILE_VIEWS'), 'Overview is registered as an independent mobile renderer');
expect(overview.includes('单指标视图'), 'Overview chart contract is single-focus');

const forbiddenDesktopContracts = [
  'mainNav', 'periodPopover', 'importDrawer', 'commandPalette', 'detailDrawer', 'panelModal',
  'global-links', 'data-table', 'table-wrap', 'v54-mobile-ui'
];
for (const token of forbiddenDesktopContracts) {
  expect(!mobileJs.includes(token), `mobile views do not depend on Desktop contract: ${token}`);
}

expect(!/\bv55(?:\.css|\.js|-)/i.test(index + v5BrowserJs + v5Css), 'V5 does not continue v55 responsive patch naming');
expect(shellCss.includes('env(safe-area-inset-top)') && shellCss.includes('env(safe-area-inset-bottom)'), 'iPhone safe-area insets are handled');
expect(/min-height:\s*44px/.test(shellCss) || /height:\s*44px/.test(shellCss), '44px touch target floor is encoded');
expect(shellCss.includes('overflow-x:hidden') && shellCss.includes('overflow-x:clip'), 'mobile Shell prevents accidental horizontal overflow');
expect(shellCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'), 'bottom navigation uses fixed five-column layout, not horizontal scrolling');

expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(v5BrowserJs), 'V5 browser JavaScript contains no write HTTP methods');
expect(!/\/api\/imports\/(?:start|file|commit)/.test(v5BrowserJs), 'V5 browser JavaScript cannot reach import mutation endpoints');
expect(!/\bRAW_REPORTS\b/.test(v5BrowserJs), 'V5 browser layer has no direct R2 binding access');

const frozen = {
  'public/app.js': 'a6848333f0bada81120966cd4c4d6b3393366ecc',
  'public/enhancements.js': '88c4ca3d60a270a5ab0a8baa2e9ac16151b6414b',
  'public/v54.js': 'f0fe9a21fe2545e7109e77506f1bcc23e0b6a038',
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
console.log('\nV5 native mobile static gate passed.');
