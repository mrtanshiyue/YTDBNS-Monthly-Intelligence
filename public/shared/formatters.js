(() => {
  'use strict';

  const money = (value, digits = 0) => value == null || !Number.isFinite(Number(value))
    ? '—'
    : '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const number = (value, digits = 0) => value == null || !Number.isFinite(Number(value))
    ? '—'
    : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
  const percent = (value, digits = 1) => value == null || !Number.isFinite(Number(value))
    ? '—'
    : `${(Number(value) * 100).toFixed(digits)}%`;
  const compactMoney = value => {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(Math.abs(n) >= 100_000 ? 0 : 1)}K`;
    return money(n, 0);
  };

  window.YT_SHARED_FORMATTERS = Object.freeze({ money, number, percent, compactMoney });
})();
