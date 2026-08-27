import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const featureBranch = 'audit/v5-pc-mobile-polish';
const branch = process.env.WORKERS_CI_BRANCH || '';
const commit = process.env.WORKERS_CI_COMMIT_SHA || 'local';
const workersBuild = process.env.WORKERS_CI === '1';
const previewAcceptance = workersBuild && branch === featureBranch;
const marker = path.join(root, `.v5-preview-acceptance-${commit}.done`);

function runNode(relative, args = []) {
  const target = path.join(root, relative);
  const result = spawnSync(process.execPath, [target, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`[V5 install gate] static release gate · branch=${branch || 'local'} · commit=${commit}`);
runNode('scripts/v5-native-mobile-static-check.mjs');
runNode('scripts/ui-integrity-static-check.mjs');

if (!previewAcceptance) {
  console.log('[V5 install gate] Chromium matrix skipped outside the V5 feature Preview branch.');
  process.exit(0);
}

if (fs.existsSync(marker)) {
  console.log(`[V5 install gate] Chromium matrix already passed for ${commit}; skipping duplicate lifecycle execution.`);
  process.exit(0);
}

const playwrightCli = path.join(root, 'node_modules', 'playwright-core', 'cli.js');
if (!fs.existsSync(playwrightCli)) {
  console.error(`[V5 install gate] playwright-core CLI not found: ${playwrightCli}`);
  process.exit(1);
}

console.log(`[V5 install gate] installing Playwright Chromium for exact-head acceptance · ${commit}`);
runNode('node_modules/playwright-core/cli.js', ['install', 'chromium']);
console.log(`[V5 install gate] running 4 iPhone + 2 Desktop Chromium matrix · ${commit}`);
runNode('scripts/v5-browser-acceptance.mjs');

fs.writeFileSync(marker, `${commit}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'public', '__v5_acceptance.json'), `${JSON.stringify({
  version: 'V5.0',
  commit,
  branch,
  staticGate: 'PASS',
  chromiumMatrix: 'PASS',
  mobileViewports: ['375x812', '390x844', '393x852', '430x932'],
  desktopViewports: ['1440x900', '1920x1080'],
  generatedBy: 'Workers Builds postinstall gate'
}, null, 2)}\n`, 'utf8');
console.log(`[V5 install gate] exact-head acceptance PASS · ${commit}`);
