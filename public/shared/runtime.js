(() => {
  'use strict';

  const D = window.YT_DEMO || {};
  const listeners = new Set();
  const state = {
    started: false,
    mode: 'unknown',
    loading: false,
    error: null,
    periods: [],
    from: null,
    to: null,
    dashboard: null,
    monthDetail: null,
    charges: null
  };

  const monthStart = month => `${month}-01`;
  const monthEnd = month => {
    const [year, value] = month.split('-').map(Number);
    return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  };
  const addDays = (date, days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
  const isSingleFullMonth = (from, to) => Boolean(from && to && from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && to === monthEnd(to.slice(0, 7)));
  const rangeLabel = (from, to) => {
    if (!from || !to) return '选择期间';
    if (isSingleFullMonth(from, to)) {
      const [year, month] = from.slice(0, 7).split('-');
      return `${year}年${Number(month)}月`;
    }
    return `${from.replaceAll('-', '/')} – ${to.replaceAll('-', '/')}`;
  };
  const snapshot = () => Object.freeze({
    ...state,
    periods: [...state.periods],
    rangeLabel: rangeLabel(state.from, state.to)
  });
  const publish = () => {
    const current = snapshot();
    listeners.forEach(listener => {
      try { listener(current); } catch (error) { console.error('[V5 shared runtime listener]', error); }
    });
  };
  const requestJson = async path => {
    const response = await fetch(path, { method: 'GET', headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
  };
  const detectApi = async () => {
    if (location.protocol === 'file:') return false;
    try {
      await requestJson('/api/health');
      return true;
    } catch {
      return false;
    }
  };
  const activeMonth = () => isSingleFullMonth(state.from, state.to) ? state.from.slice(0, 7) : null;

  function demoDashboard() {
    const current = D.current || {};
    const period = current.meta?.period || D.monthly?.at(-1)?.month || null;
    const monthly = (D.monthly || []).find(row => row.month === period) || {};
    const overview = current.overview || {};
    return {
      summary: {
        businessSales: overview.businessSales ?? monthly.sales ?? null,
        contributionProfit: overview.profit ?? monthly.profit ?? null,
        profitMargin: overview.profitMargin ?? monthly.profitMargin ?? null,
        adSpend: overview.adSpend ?? monthly.adSpend ?? null,
        adSales: overview.adSales ?? monthly.adSales ?? null,
        acos: overview.acos ?? monthly.acos ?? null,
        tacos: overview.tacos ?? monthly.tacos ?? null,
        inventoryValue: overview.inventoryValue ?? monthly.inventoryValue ?? null,
        fulfillableUnits: overview.fulfillableUnits ?? monthly.fulfillableUnits ?? null,
        businessUnits: overview.businessUnits ?? monthly.units ?? null,
        sessions: overview.sessions ?? monthly.sessions ?? null,
        returns: overview.returns ?? monthly.returns ?? null
      },
      series: (D.dailyTraffic || [])
        .filter(row => !period || String(row.date || '').startsWith(period))
        .map(row => ({ label: row.date, sales: row.sales, units: row.units, sessions: row.sessions }))
    };
  }

  async function loadRange() {
    if (!state.from || !state.to) return snapshot();
    state.loading = true;
    state.error = null;
    publish();
    try {
      if (state.mode === 'live') {
        state.dashboard = await requestJson(`/api/dashboard?store=yt-us&from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`);
        const month = activeMonth();
        state.monthDetail = month ? await requestJson(`/api/month?store=yt-us&month=${encodeURIComponent(month)}`).catch(() => null) : null;
        state.charges = await requestJson(`/api/charges?store=yt-us&from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`).catch(() => null);
      } else {
        state.dashboard = demoDashboard();
        state.monthDetail = null;
        state.charges = null;
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.loading = false;
      publish();
    }
    return snapshot();
  }

  function quickRange(key) {
    const months = state.periods.map(item => typeof item === 'string' ? item : item.month).filter(Boolean);
    const latest = months[0] || D.current?.meta?.period || D.monthly?.at(-1)?.month;
    if (!latest) return [null, null];
    const end = monthEnd(latest);
    if (key === 'current') return [monthStart(latest), end];
    if (key === 'previous') {
      const d = new Date(`${monthStart(latest)}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      const month = d.toISOString().slice(0, 7);
      return [monthStart(month), monthEnd(month)];
    }
    if (key === '30') return [addDays(end, -29), end];
    if (key === '90') return [addDays(end, -89), end];
    if (key === 'ytd') return [`${latest.slice(0, 4)}-01-01`, end];
    return [monthStart(latest), end];
  }

  async function setRange(from, to) {
    if (!from || !to || from > to) throw new Error('Invalid date range');
    state.from = from;
    state.to = to;
    publish();
    return loadRange();
  }

  async function setQuickRange(key) {
    const [from, to] = quickRange(key);
    if (!from || !to) return snapshot();
    return setRange(from, to);
  }

  async function start() {
    if (state.started) return snapshot();
    state.started = true;
    state.loading = true;
    publish();
    const live = await detectApi();
    state.mode = live ? 'live' : 'demo';
    try {
      if (live) {
        const payload = await requestJson('/api/periods?store=yt-us');
        state.periods = payload.periods || [];
      } else {
        state.periods = [...(D.monthly || [])].reverse();
      }
      const [from, to] = quickRange('current');
      state.from = from;
      state.to = to;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.loading = false;
      publish();
    }
    return loadRange();
  }

  window.YT_SHARED_RUNTIME = Object.freeze({
    start,
    getState: snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    setRange,
    setQuickRange,
    helpers: Object.freeze({ monthStart, monthEnd, addDays, daysBetween, rangeLabel, isSingleFullMonth })
  });
})();
