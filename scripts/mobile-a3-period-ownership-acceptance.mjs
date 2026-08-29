import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = pathToFileURL(path.join(root, 'public', 'index.html')).href;
const artifactDir = path.join(root, 'artifacts', 'mobile-a3-period-ownership');
fs.mkdirSync(artifactDir, { recursive: true });

const failures = [];
const pass = message => console.log(`PASS  ${message}`);
const fail = (message, detail = '') => {
  const full = detail ? `${message} — ${detail}` : message;
  failures.push(full);
  console.error(`FAIL  ${full}`);
};
const expect = (condition, message, detail = '') => condition ? pass(message) : fail(message, detail);

function staticContract() {
  const bridge = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-app-bridge.js'), 'utf8');
  expect(
    bridge.includes('const storedRange = rangeFromState(current);') &&
      bridge.includes('if (storedRange && !pendingPeriodSelection) return false;'),
    'A3 period ownership static contract: a valid history period cannot be rewritten by a generic runtime publish'
  );
  expect(
    bridge.includes('[data-vnext-month]') && bridge.includes('[data-density-month]'),
    'A3 period ownership static contract: direct user month selectors still create explicit period-write intent'
  );
  expect(
    bridge.includes('if (pendingRestore) requestAnimationFrame(() => restorePendingRange(runtime?.getState?.()));'),
    'A3 period ownership static contract: an in-flight restore must resume the latest queued Back/Forward target'
  );
}

async function ready(page) {
  await page.goto(entry, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => document.documentElement.dataset.mobileVnextReady === 'true', null, { timeout: 12_000 });
  await page.waitForSelector('#mobileAppRoot:not([hidden]) .vnext-app', { state: 'visible', timeout: 12_000 });
  await page.waitForFunction(() => {
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    const period = window.YT_MOBILE_APP?.getPeriodContext?.();
    return ['live', 'demo'].includes(runtime?.mode) && runtime?.from && runtime?.to &&
      period?.history?.from === runtime.from && period?.history?.to === runtime.to;
  }, null, { timeout: 12_000 });
}

async function selectAlternateMonth(page) {
  await page.evaluate(() => document.querySelector('.vnext-toolbar [data-vnext-period]')?.click());
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'visible', timeout: 4_000 });
  const month = await page.evaluate(() => {
    const current = window.YT_SHARED_RUNTIME?.getState?.()?.from?.slice(0, 7);
    return [...document.querySelectorAll('.vnext-sheet [data-vnext-period-month]')]
      .map(button => button.dataset.vnextPeriodMonth)
      .find(value => value && value !== current) || null;
  });
  if (!month) throw new Error('No alternate month available');
  await page.evaluate(target => document.querySelector(`.vnext-sheet [data-vnext-period-month="${target}"]`)?.click(), month);
  await page.waitForSelector('.vnext-sheet[role="dialog"]', { state: 'detached', timeout: 4_000 });
  await page.waitForFunction(target => {
    const runtime = window.YT_SHARED_RUNTIME?.getState?.();
    const historyRange = history.state?.ytdbnsMobileVnext;
    const from = window.YT_SHARED_RUNTIME?.helpers?.monthStart?.(target);
    const to = window.YT_SHARED_RUNTIME?.helpers?.monthEnd?.(target);
    return runtime?.from === from && runtime?.to === to && historyRange?.from === from && historyRange?.to === to;
  }, month, { timeout: 8_000 });
  return month;
}

async function runQueuedRestoreRace() {
  const bridge = fs.readFileSync(path.join(root, 'public', 'mobile', 'mobile-app-bridge.js'), 'utf8');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message || String(error)));

  try {
    await page.setContent('<!doctype html><html><body><div id="mobileAppRoot"></div></body></html>');
    await page.evaluate(() => {
      const listeners = new Set();
      const state = { mode: 'live', loading: false, error: null, from: '2026-01-01', to: '2026-01-31' };
      const snapshot = () => ({ ...state });
      const publish = () => {
        const next = snapshot();
        for (const listener of listeners) listener(next);
      };
      window.__A3_RESTORE_CALLS = [];
      window.YT_SHARED_RUNTIME = Object.freeze({
        getState: snapshot,
        subscribe(listener) {
          listeners.add(listener);
          listener(snapshot());
          return () => listeners.delete(listener);
        },
        setRange(from, to) {
          state.from = from;
          state.to = to;
          state.loading = true;
          window.__A3_RESTORE_CALLS.push({ from, to, phase: 'start' });
          publish();
          return new Promise(resolve => setTimeout(() => {
            state.loading = false;
            publish();
            window.__A3_RESTORE_CALLS.push({ from, to, phase: 'settled' });
            resolve(snapshot());
          }, 80));
        }
      });
      document.documentElement.dataset.mobileVnextReady = 'true';
      history.replaceState({
        ytdbnsMobileVnext: { tab: 'today', detailKey: null, sheet: null, from: '2026-01-01', to: '2026-01-31' }
      }, document.title);
    });

    await page.addScriptTag({ content: bridge });
    await page.waitForTimeout(40);

    const result = await page.evaluate(async () => {
      const makeState = (from, to) => ({
        ytdbnsMobileVnext: { tab: 'today', detailKey: null, sheet: null, from, to }
      });
      const dispatchTarget = (from, to) => {
        history.replaceState(makeState(from, to), document.title);
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      };

      dispatchTarget('2026-02-01', '2026-02-28');
      await new Promise(resolve => setTimeout(resolve, 12));
      dispatchTarget('2026-03-01', '2026-03-31');
      await new Promise(resolve => setTimeout(resolve, 240));

      const runtime = window.YT_SHARED_RUNTIME.getState();
      return {
        runtime: { from: runtime.from, to: runtime.to, loading: runtime.loading },
        history: {
          from: history.state?.ytdbnsMobileVnext?.from,
          to: history.state?.ytdbnsMobileVnext?.to
        },
        period: window.YT_MOBILE_APP?.getPeriodContext?.(),
        calls: [...window.__A3_RESTORE_CALLS]
      };
    });

    const starts = result.calls.filter(call => call.phase === 'start');
    expect(
      starts.length >= 2 && starts[0].from === '2026-02-01' && starts.at(-1).from === '2026-03-01',
      'A3 queued restore race: Forward target is resumed after the in-flight Back restore settles',
      JSON.stringify(result)
    );
    expect(
      result.history.from === '2026-03-01' && result.history.to === '2026-03-31',
      'A3 queued restore race: Browser History keeps ownership of the latest Forward period',
      JSON.stringify(result)
    );
    expect(
      result.runtime.from === '2026-03-01' && result.runtime.to === '2026-03-31' && result.runtime.loading === false,
      'A3 queued restore race: runtime converges to the latest Forward period instead of remaining stranded on Back',
      JSON.stringify(result)
    );
    expect(
      result.period?.history?.from === '2026-03-01' && result.period?.runtime?.from === '2026-03-01' && result.period?.restoring === false,
      'A3 queued restore race: public period context converges with no restore left in flight',
      JSON.stringify(result.period)
    );
    expect(pageErrors.length === 0, 'A3 queued restore race: zero page errors', JSON.stringify(pageErrors));
  } catch (error) {
    fail('A3 queued restore race acceptance completed', error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

async function run(viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const label = `${viewport.width}x${viewport.height}`;
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  page.on('pageerror', error => pageErrors.push(error.message || String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', request => { if (request.url().includes('/api/')) requests.push({ method: request.method(), url: request.url() }); });

  try {
    await ready(page);
    const selectedMonth = await selectAlternateMonth(page);
    const owned = await page.evaluate(() => ({ ...history.state.ytdbnsMobileVnext }));
    expect(Boolean(owned.from && owned.to), `${label}: explicit period selection gives the current history entry an owned range`, JSON.stringify(owned));

    const driftMonth = await page.evaluate(ownedFrom => {
      const current = ownedFrom.slice(0, 7);
      return window.YT_SHARED_RUNTIME.getState().periods.map(row => row.month).find(month => month && month !== current) || null;
    }, owned.from);
    if (!driftMonth) throw new Error('No drift month available');

    await page.evaluate(async month => {
      const runtime = window.YT_SHARED_RUNTIME;
      await runtime.setRange(runtime.helpers.monthStart(month), runtime.helpers.monthEnd(month));
    }, driftMonth);

    const guarded = await page.evaluate(() => ({
      runtime: { from: window.YT_SHARED_RUNTIME.getState().from, to: window.YT_SHARED_RUNTIME.getState().to },
      history: { from: history.state?.ytdbnsMobileVnext?.from, to: history.state?.ytdbnsMobileVnext?.to },
      period: window.YT_MOBILE_APP?.getPeriodContext?.()
    }));
    expect(
      guarded.history.from === owned.from && guarded.history.to === owned.to,
      `${label}: non-user runtime drift cannot overwrite the owned Browser History period`,
      JSON.stringify({ owned, guarded })
    );
    expect(
      guarded.runtime.from !== guarded.history.from || guarded.runtime.to !== guarded.history.to,
      `${label}: guard is proven against an intentionally mismatched late runtime publish`,
      JSON.stringify(guarded)
    );

    await page.evaluate(async ({ from, to }) => window.YT_SHARED_RUNTIME.setRange(from, to), { from: owned.from, to: owned.to });
    await page.waitForFunction(({ from, to }) => {
      const runtime = window.YT_SHARED_RUNTIME?.getState?.();
      return runtime?.from === from && runtime?.to === to;
    }, { from: owned.from, to: owned.to }, { timeout: 8_000 });

    const restored = await page.evaluate(() => ({
      runtime: { from: window.YT_SHARED_RUNTIME.getState().from, to: window.YT_SHARED_RUNTIME.getState().to },
      history: { from: history.state?.ytdbnsMobileVnext?.from, to: history.state?.ytdbnsMobileVnext?.to },
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewport: innerWidth,
      pending: window.YT_MOBILE_APP?.getPeriodContext?.()?.pendingSelection
    }));
    expect(restored.runtime.from === owned.from && restored.history.from === owned.from && restored.pending === false, `${label}: runtime can realign to the owned history period without mutating ownership`, JSON.stringify(restored));
    expect(restored.width <= restored.viewport + 1, `${label}: period ownership guard creates no horizontal overflow`, JSON.stringify(restored));
    expect(requests.every(request => request.method === 'GET'), `${label}: Mobile API activity remains GET-only`, JSON.stringify(requests.filter(request => request.method !== 'GET')));
    expect(pageErrors.length === 0, `${label}: zero page errors`, JSON.stringify(pageErrors));
    expect(consoleErrors.length === 0, `${label}: zero console errors`, JSON.stringify(consoleErrors));
    await page.screenshot({ path: path.join(artifactDir, `period-ownership-${label}.png`), fullPage: true });
    pass(`${label}: selected ${selectedMonth} period ownership scenario completed`);
  } catch (error) {
    fail(`${label}: period ownership acceptance completed`, error.stack || error.message || String(error));
  } finally {
    await browser.close();
  }
}

staticContract();
await runQueuedRestoreRace();
for (const viewport of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) await run(viewport);

if (failures.length) {
  console.error(`\n${failures.length} A3 period ownership acceptance failure(s)`);
  process.exit(1);
}
console.log('\nMobile A3 period ownership acceptance PASS');
