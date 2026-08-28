import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const failures = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = message => { failures.push(message); console.error(`FAIL  ${message}`); };
const expect = (condition, message) => condition ? pass(message) : fail(message);

const css = read('public/mobile/mobile-vnext-first-screen.css');
const pkg = JSON.parse(read('package.json'));

expect(css.includes('min-height:calc(52px + env(safe-area-inset-top))'), 'Mobile toolbar targets a 52px chrome budget plus safe area');
expect(css.includes('top:calc(52px + env(safe-area-inset-top))'), 'business rail sticky offset follows the compact toolbar height');
expect(css.includes('padding-top:3px') && css.includes('padding-bottom:3px'), 'business rail chrome is reduced to a 50px row around 44px controls');
expect(css.includes('.vnext-toolbar>button:not(.vnext-period)') && css.includes('min-height:44px'), 'secondary toolbar controls retain 44px touch targets');
expect(css.includes('.vnext-period{') && css.includes('min-height:44px'), 'period control retains 44px touch target');
expect(!/\.vnext-toolbar[^\{]*\{[^\}]*display\s*:\s*none/i.test(css), 'toolbar hardening does not hide the toolbar');
expect(!/\.vnext-live[^\{]*\{[^\}]*display\s*:\s*none/i.test(css), 'runtime status remains visible');
expect(pkg.scripts?.['check:v5:mobile:toolbar'] === 'node scripts/mobile-toolbar-static-check.mjs', 'package exposes toolbar static gate');

if (failures.length) {
  console.error(`\nMobile toolbar static gate failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log('\nMobile toolbar static gate passed: persistent chrome is compact without sacrificing controls.');
