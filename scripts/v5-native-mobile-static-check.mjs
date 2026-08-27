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
const css = read('public/mobile/mobile-shell.css');
const runtime = read('public/shared/runtime.js');

expect(index.includes('id="mobileAppRoot"'), 'independent mobile root exists');
expect(index.includes('./mobile/mobile-shell.css'), 'mobile CSS is loaded');
expect(index.includes('./shared/runtime.js'), 'shared runtime is loaded');
expect(index.includes('./mobile/mobile-shell.js'), 'mobile shell is loaded');
expect(/const PRIMARY = \[[\s\S]*?\];/.test(shell), 'primary mobile navigation is explicitly declared');

const primaryBlock = shell.match(/const PRIMARY = \[([\s\S]*?)\];/)?.[1] || '';
const primaryRoutes = [...primaryBlock.matchAll(/\['([^']+)',/g)].map(match => match[1]);
expect(primaryRoutes.length === 5, `exactly five primary mobile destinations (${primaryRoutes.join(', ')})`);
expect(primaryRoutes.join('|') === 'overview|ads|products|inventory|more', 'primary navigation matches V5 product hierarchy');

const forbiddenDesktopContracts = [
  'mainNav', 'periodPopover', 'importDrawer', 'commandPalette', 'detailDrawer', 'panelModal',
  'global-links', 'data-table', 'table-wrap', 'v54-mobile-ui'
];
for (const token of forbiddenDesktopContracts) {
  expect(!shell.includes(token), `mobile shell does not depend on Desktop contract: ${token}`);
}

expect(!/\bv55(?:\.css|\.js|-)/i.test(index + shell + css), 'V5 does not continue v55 responsive patch naming');
expect(css.includes('env(safe-area-inset-top)') && css.includes('env(safe-area-inset-bottom)'), 'iPhone safe-area insets are handled');
expect(/min-height:\s*44px/.test(css) || /height:\s*44px/.test(css), '44px touch target floor is encoded');
expect(css.includes('overflow-x:hidden') && css.includes('overflow-x:clip'), 'mobile shell prevents accidental horizontal overflow');
expect(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'), 'bottom navigation uses fixed five-column layout, not horizontal scrolling');

expect(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(runtime + shell), 'V5 runtime and shell contain no write HTTP methods');
expect(!/\/api\/imports\/(?:start|file|commit)/.test(runtime + shell), 'V5 runtime and shell cannot reach import mutation endpoints');
expect(!/\b(?:DB|RAW_REPORTS)\b/.test(runtime + shell), 'V5 browser layer has no direct D1/R2 binding access');

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
