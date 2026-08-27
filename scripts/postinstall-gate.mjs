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

function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  return result;
}

function runNode(relative, args = []) {
  return runCommand(process.execPath, [path.join(root, relative), ...args]);
}

function collectLibraryDirs(start) {
  const dirs = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some(entry => !entry.isDirectory() && entry.name.includes('.so'))) dirs.push(current);
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
    }
  }
  return dirs;
}

function bootstrapUserSpaceChromiumDeps() {
  if (process.platform !== 'linux') return;

  const packages = [
    'libasound2t64',
    'libatk-bridge2.0-0t64',
    'libatk1.0-0t64',
    'libatspi2.0-0t64',
    'libcairo2',
    'libcairo-gobject2',
    'libcups2t64',
    'libdbus-1-3',
    'libdrm2',
    'libfontconfig1',
    'libfreetype6',
    'libgbm1',
    'libgdk-pixbuf-2.0-0',
    'libglib2.0-0t64',
    'libgtk-3-0t64',
    'libnspr4',
    'libnss3',
    'libpango-1.0-0',
    'libpangocairo-1.0-0',
    'libx11-6',
    'libx11-xcb1',
    'libxcb-shm0',
    'libxcb1',
    'libxcomposite1',
    'libxcursor1',
    'libxdamage1',
    'libxext6',
    'libxfixes3',
    'libxi6',
    'libxkbcommon0',
    'libxrandr2',
    'libxrender1'
  ];

  const workspace = path.join(root, '.v5-playwright-linux-deps');
  const lists = path.join(workspace, 'apt-lists');
  const cache = path.join(workspace, 'apt-cache');
  const debs = path.join(workspace, 'debs');
  const extracted = path.join(workspace, 'rootfs');

  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(lists, 'partial'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'archives', 'partial'), { recursive: true });
  fs.mkdirSync(debs, { recursive: true });
  fs.mkdirSync(extracted, { recursive: true });

  const aptOptions = [
    '-o', 'Debug::NoLocking=true',
    '-o', `Dir::State::lists=${lists}`,
    '-o', `Dir::Cache=${cache}`
  ];

  console.log('[V5 install gate] refreshing Ubuntu package metadata in user-writable build workspace');
  runCommand('apt-get', [...aptOptions, 'update']);

  console.log(`[V5 install gate] downloading ${packages.length} Chromium runtime packages without root`);
  runCommand('apt-get', [...aptOptions, 'download', ...packages], { cwd: debs });

  const archives = fs.readdirSync(debs).filter(name => name.endsWith('.deb'));
  if (!archives.length) {
    console.error('[V5 install gate] no Chromium dependency archives were downloaded');
    process.exit(1);
  }

  for (const archive of archives) {
    runCommand('dpkg-deb', ['-x', path.join(debs, archive), extracted]);
  }

  const libraryDirs = collectLibraryDirs(extracted);
  if (!libraryDirs.length) {
    console.error('[V5 install gate] extracted Chromium dependencies contain no shared-library directories');
    process.exit(1);
  }

  process.env.LD_LIBRARY_PATH = [
    ...libraryDirs,
    process.env.LD_LIBRARY_PATH || ''
  ].filter(Boolean).join(':');
  process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(workspace, 'browsers');
  console.log(`[V5 install gate] user-space Chromium runtime ready · archives=${archives.length} · libDirs=${libraryDirs.length}`);
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

bootstrapUserSpaceChromiumDeps();
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
