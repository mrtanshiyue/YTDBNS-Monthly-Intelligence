(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  const runtime = window.YT_SHARED_RUNTIME;
  const selectors = window.YT_SHARED_SELECTORS;
  const secondary = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  if (!root || !runtime || !selectors || !secondary || !fmt) return;

  const media = window.matchMedia('(max-width: 860px)');
  const HISTORY_KEY = 'ytdbnsMobileVnext';
  const detailRegistry = new Map();
  let detailSerial = 0;
  let lastFocused = null;

  const TABS = [
    ['today', '今日', 'today'],
    ['alerts', '异常', 'alert'],
    ['trends', '趋势', 'trend'],
    ['search', '搜索', 'search']
  ];

  const ICONS = {
    today: '<path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6"/><circle cx="12" cy="12" r="3.8"/>',
    alert: '<path d="M12 4.2 20 18H4L12 4.2Z"/><path d="M12 9v4.2M12 16.1h.01"/>',
    trend: '<path d="M4 18.5V5.5M4 18.5h16"/><path d="m7 14 3.2-3.4 3 2.2L18 7.5"/>',
    search: '<circle cx="10.7" cy="10.7" r="5.7"/><path d="m15 15 4.2 4.2"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M8 3.8v3.4M16 3.8v3.4M4 9.2h16"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4 4L19 7"/>',
    dot: '<circle cx="12" cy="12" r="3.2"/>'
  };

  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const state = {
    active: false,
    tab: 'today',
    runtimeState: runtime.getState(),
    severity: 'all',
    query: '',
    detail: null,
    sheet: null,
    compare: { key: null, loading: false, payload: null, error: null }
  };

  const DOMAIN = {
    finance: '利润',
    ads: '广告',
    products: '商品',
    inventory: '库存',
    returns: '退货',
    charges: '扣费',
    data: '数据'
  };

  const SEVERITY = {
    critical: { label: '优先处理', rank: 3 },
    warning: { label: '值得关注', rank: 2 },
    info: { label: '观察', rank: 1 }
  };

  const ISSUE_META = {
    'finance-profit': { title: '利润已经转负', noun: '指标' },
    'finance-margin': { title: '利润安全垫偏薄', noun: '指标' },
    'ads-acos': { title: '广告 ACOS 高位', noun: 'Campaign' },
    'ads-zero-orders': { title: '广告花费无订单', noun: 'Campaign' },
    'products-buybox': { title: 'Buy Box 流失', noun: 'SKU' },
    'products-cvr': { title: '高流量低转化', noun: 'SKU' },
    'inventory-low-stock': { title: '库存即将见底', noun: 'SKU' },
    'inventory-unsellable': { title: '不可售库存积压', noun: 'SKU' },
    'inventory-capital': { title: '库存资金过度集中', noun: 'SKU' },
    'returns-refund': { title: '退款侵蚀销售', noun: '指标' },
    'data-quality': { title: '数据质量异常', noun: '检查项' }
  };

  function models() {
    const s = state.runtimeState || {};
    return {
      overview: selectors.overviewModel(s),
      ads: selectors.adsModel(s),
      products: selectors.productsModel(s),
      inventory: selectors.inventoryModel(s),
      finance: secondary.financeModel(s),
      charges: secondary.chargesModel(s),
      returns: secondary.returnsModel(s),
      history: secondary.historyModel(s),
      data: secondary.dataModel(s)
    };
  }

  function median(values) {
    const list = values
      .filter(value => value != null && Number.isFinite(Number(value)))
      .map(Number)
      .sort((a, b) => a - b);
    if (!list.length) return null;
    const mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  }

  function signalKey(domain, id, issue = '') {
    return `${domain}:${id}${issue ? `:${issue}` : ''}`;
  }

  function buildSignals() {
    const m = models();
    const signals = [];
    const push = signal => signals.push({ score: 0, ...signal });

    if (m.finance.profit != null && m.finance.profit < 0) {
      push({
        id: 'finance:profit-negative', issueKey: 'finance-profit', severity: 'critical', domain: 'finance', score: 100,
        title: '贡献利润为负', subtitle: '先拆广告、退款、扣费与采购成本', value: fmt.money(m.finance.profit, 0),
        detail: { type: 'metric', title: '贡献利润', value: fmt.money(m.finance.profit, 2), rows: [
          ['销售额', fmt.money(m.finance.sales, 0)], ['利润率', fmt.percent(m.finance.profitMargin)], ['广告花费', fmt.money(m.finance.adSpend, 0)], ['退款销售额', fmt.money(m.finance.refundSales, 0)]
        ] }
      });
    } else if (m.finance.profitMargin != null && m.finance.profitMargin < 0.08) {
      push({
        id: 'finance:margin-low', issueKey: 'finance-margin', severity: 'warning', domain: 'finance', score: 72,
        title: '利润率偏薄', subtitle: '销售有规模，但安全垫较小', value: fmt.percent(m.finance.profitMargin),
        detail: { type: 'metric', title: '利润率', value: fmt.percent(m.finance.profitMargin), rows: [['贡献利润', fmt.money(m.finance.profit, 0)], ['销售额', fmt.money(m.finance.sales, 0)]] }
      });
    }

    const knownSpends = m.ads.campaigns.map(row => row.spend).filter(value => value != null && Number.isFinite(Number(value))).map(Number);
    const averageSpend = knownSpends.length ? knownSpends.reduce((sum, value) => sum + value, 0) / knownSpends.length : 0;
    for (const row of m.ads.campaigns) {
      if (row.acos != null && row.acos > 0.45) {
        const critical = row.acos > 0.65;
        push({
          id: signalKey('ads', row.id, 'acos'), issueKey: 'ads-acos', severity: critical ? 'critical' : 'warning', domain: 'ads', score: critical ? 94 : 78,
          title: row.campaign, subtitle: `ACOS ${fmt.percent(row.acos)}，${critical ? '明显高于' : '高于'}目标线`, value: fmt.percent(row.acos),
          detail: { type: 'campaign', title: row.campaign, context: `ACOS ${fmt.percent(row.acos)}，${critical ? '明显高于' : '高于'}目标线`, item: row }
        });
      }
      if (row.orders === 0 && row.spend != null && Number(row.spend) >= Math.max(averageSpend, 20)) {
        const critical = Number(row.spend) >= Math.max(averageSpend * 2, 50);
        push({
          id: signalKey('ads', row.id, 'zero-orders'), issueKey: 'ads-zero-orders', severity: critical ? 'critical' : 'warning', domain: 'ads', score: critical ? 90 : 80,
          title: row.campaign, subtitle: `${fmt.money(row.spend, 0)} 花费仍无订单`, value: fmt.money(row.spend, 0),
          detail: { type: 'campaign', title: row.campaign, context: `${fmt.money(row.spend, 0)} 花费仍无订单`, item: row }
        });
      }
    }

    const productMedianSessions = median(m.products.products.map(row => row.sessions));
    const baselineCvr = m.products.totals.cvr;
    for (const row of m.products.products) {
      if (row.buyBox != null && row.buyBox < 0.9) {
        const critical = row.buyBox < 0.8;
        push({
          id: signalKey('products', row.id, 'buybox'), issueKey: 'products-buybox', severity: critical ? 'critical' : 'warning', domain: 'products', score: critical ? 92 : 76,
          title: row.sku === '—' ? row.asin : row.sku, subtitle: `Buy Box ${critical ? '仅 ' : ''}${fmt.percent(row.buyBox)}`, value: fmt.percent(row.buyBox),
          detail: { type: 'product', title: row.sku === '—' ? row.asin : row.sku, context: `Buy Box ${fmt.percent(row.buyBox)}`, item: row }
        });
      }
      if (row.sessions != null && row.cvr != null && productMedianSessions != null && baselineCvr != null && row.sessions >= productMedianSessions && row.cvr < baselineCvr * 0.65) {
        push({
          id: signalKey('products', row.id, 'cvr'), issueKey: 'products-cvr', severity: 'warning', domain: 'products', score: 82,
          title: row.sku === '—' ? row.asin : row.sku, subtitle: `高流量但 CVR 仅 ${fmt.percent(row.cvr)}`, value: fmt.percent(row.cvr),
          detail: { type: 'product', title: row.sku === '—' ? row.asin : row.sku, context: `高流量但 CVR 仅 ${fmt.percent(row.cvr)}`, item: row }
        });
      }
    }

    const inventoryValues = m.inventory.inventory.map(row => row.inventoryValue).filter(value => value != null && Number.isFinite(Number(value))).map(Number);
    const averageInventoryValue = inventoryValues.length ? inventoryValues.reduce((sum, value) => sum + value, 0) / inventoryValues.length : null;
    for (const row of m.inventory.inventory) {
      if (row.fulfillable != null && row.fulfillable <= 20) {
        const critical = row.fulfillable <= 10;
        push({
          id: signalKey('inventory', row.id, 'low-stock'), issueKey: 'inventory-low-stock', severity: critical ? 'critical' : 'warning', domain: 'inventory', score: critical ? 90 : 74,
          title: row.sku === '—' ? row.asin : row.sku, subtitle: `可售库存${critical ? '仅 ' : ' '}${fmt.number(row.fulfillable)} 件`, value: `${fmt.number(row.fulfillable)}件`,
          detail: { type: 'inventory', title: row.sku === '—' ? row.asin : row.sku, context: `可售库存 ${fmt.number(row.fulfillable)} 件`, item: row }
        });
      }
      if (row.unsellable != null && row.unsellable > 0) {
        const ratio = row.total ? row.unsellable / row.total : null;
        const critical = ratio != null && ratio >= 0.1;
        push({
          id: signalKey('inventory', row.id, 'unsellable'), issueKey: 'inventory-unsellable', severity: critical ? 'critical' : 'warning', domain: 'inventory', score: critical ? 88 : 70,
          title: row.sku === '—' ? row.asin : row.sku, subtitle: `不可售库存 ${fmt.number(row.unsellable)} 件`, value: `${fmt.number(row.unsellable)}件`,
          detail: { type: 'inventory', title: row.sku === '—' ? row.asin : row.sku, context: `不可售库存 ${fmt.number(row.unsellable)} 件`, item: row }
        });
      }
      if (averageInventoryValue != null && row.inventoryValue != null && Number(row.inventoryValue) > averageInventoryValue * 2) {
        push({
          id: signalKey('inventory', row.id, 'capital'), issueKey: 'inventory-capital', severity: 'warning', domain: 'inventory', score: 68,
          title: row.sku === '—' ? row.asin : row.sku, subtitle: `库存资金占用 ${fmt.money(row.inventoryValue, 0)}`, value: fmt.money(row.inventoryValue, 0),
          detail: { type: 'inventory', title: row.sku === '—' ? row.asin : row.sku, context: `库存资金占用 ${fmt.money(row.inventoryValue, 0)}`, item: row }
        });
      }
    }

    const refundRate = m.finance.sales && m.finance.refundSales != null ? m.finance.refundSales / m.finance.sales : null;
    if (refundRate != null && refundRate > 0.04) {
      push({
        id: 'returns:refund-rate', issueKey: 'returns-refund', severity: refundRate > 0.08 ? 'critical' : 'warning', domain: 'returns', score: refundRate > 0.08 ? 86 : 66,
        title: '退款占销售偏高', subtitle: `退款销售额占本期销售 ${fmt.percent(refundRate)}`, value: fmt.percent(refundRate),
        detail: { type: 'metric', title: '退款销售额', value: fmt.money(m.finance.refundSales, 2), rows: [['退款占比', fmt.percent(refundRate)], ['退货量', fmt.number(m.returns.total)], ['销售额', fmt.money(m.finance.sales, 0)]] }
      });
    }

    for (const row of m.data.quality) {
      if (!['FAIL', 'ERROR', 'WARN', 'WARNING'].includes(row.status)) continue;
      const critical = ['FAIL', 'ERROR'].includes(row.status);
      push({
        id: signalKey('data', row.id, 'quality'), issueKey: 'data-quality', severity: critical ? 'critical' : 'warning', domain: 'data', score: critical ? 96 : 64,
        title: row.name, subtitle: row.message || `数据检查状态：${row.status}`, value: row.status,
        detail: { type: 'quality', title: row.name, context: row.message, item: row }
      });
    }

    return signals.sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || b.score - a.score || a.title.localeCompare(b.title));
  }

  function buildIssueGroups() {
    const groups = new Map();
    for (const signal of buildSignals()) {
      const meta = ISSUE_META[signal.issueKey] || { title: signal.title, noun: '对象' };
      if (!groups.has(signal.issueKey)) {
        groups.set(signal.issueKey, {
          id: `group:${signal.issueKey}`,
          issueKey: signal.issueKey,
          title: meta.title,
          noun: meta.noun,
          domain: signal.domain,
          severity: signal.severity,
          score: signal.score,
          members: []
        });
      }
      const group = groups.get(signal.issueKey);
      group.members.push(signal);
      if (SEVERITY[signal.severity].rank > SEVERITY[group.severity].rank || signal.score > group.score) {
        if (SEVERITY[signal.severity].rank >= SEVERITY[group.severity].rank) group.severity = signal.severity;
        group.score = Math.max(group.score, signal.score);
      }
    }

    return [...groups.values()].map(group => {
      const members = group.members.sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || b.score - a.score);
      const top = members[0];
      const countText = `${members.length} 个${group.noun}受影响`;
      return {
        ...group,
        members,
        subtitle: `${countText}${top?.subtitle ? ` · ${top.subtitle}` : ''}`,
        value: `${members.length} 项`,
        detail: {
          type: 'issue-group',
          title: group.title,
          context: `${countText}。先看影响最大的对象，不把数百条记录平铺成待办。`,
          group: { ...group, members }
        }
      };
    }).sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || b.score - a.score || b.members.length - a.members.length || a.title.localeCompare(b.title));
  }

  function periodLabel() {
    return state.runtimeState?.rangeLabel || '选择期间';
  }

  function liveStatusMarkup() {
    const s = state.runtimeState;
    if (s?.loading) return '<span class="vnext-live loading"><i></i>更新中</span>';
    if (s?.mode === 'live' && !s?.error) return '<span class="vnext-live"><i></i>实时</span>';
    if (s?.mode === 'demo') return '<span class="vnext-live demo"><i></i>预览</span>';
    return '<span class="vnext-live offline"><i></i>离线</span>';
  }

  function shellHeaderMarkup(title = '') {
    return `
      <header class="vnext-toolbar">
        <div class="vnext-toolbar-left">
          ${title ? `<span class="vnext-toolbar-title">${esc(title)}</span>` : '<span class="vnext-wordmark">YTDBNS</span>'}
          ${liveStatusMarkup()}
        </div>
        <button class="vnext-period" type="button" data-vnext-period aria-haspopup="dialog">
          ${icon('calendar')}<span>${esc(periodLabel())}</span>
        </button>
      </header>`;
  }

  function kpiMarkup(label, value, note = '') {
    return `<div class="vnext-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  }

  function verdict(signals, summary) {
    const critical = signals.filter(item => item.severity === 'critical').length;
    const warning = signals.filter(item => item.severity === 'warning').length;
    if (critical) return { tone: 'critical', eyebrow: '需要处理', text: `${critical} 类问题需要先看` };
    if (warning) return { tone: 'warning', eyebrow: '整体可控', text: `${warning} 类信号值得关注` };
    if (summary.sales != null) return { tone: 'calm', eyebrow: '本期平稳', text: '没有发现明显的经营异常' };
    return { tone: 'calm', eyebrow: '等待数据', text: '导入数据后，这里只展示真正需要看的内容' };
  }

  function signalRow(signal, compact = false) {
    return `
      <button class="vnext-signal ${compact ? 'compact' : ''}" type="button" data-vnext-signal="${esc(signal.id)}">
        <span class="vnext-severity ${signal.severity}" aria-hidden="true"></span>
        <span class="vnext-signal-copy">
          <span class="vnext-signal-meta">${esc(DOMAIN[signal.domain] || signal.domain)} · ${esc(SEVERITY[signal.severity].label)}</span>
          <strong>${esc(signal.title)}</strong>
          <small>${esc(signal.subtitle)}</small>
        </span>
        <span class="vnext-signal-value">${esc(signal.value || '')}${icon('chevron')}</span>
      </button>`;
  }

  function emptyMarkup(title, text) {
    return `<div class="vnext-empty"><span>${icon('check')}</span><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  }

  function todayMarkup() {
    const m = models();
    const summary = m.overview.summary;
    const signals = buildIssueGroups();
    const topSignals = signals.slice(0, 3);
    const v = verdict(signals, summary);
    const critical = signals.filter(item => item.severity === 'critical').length;
    const warning = signals.filter(item => item.severity === 'warning').length;

    return `
      ${shellHeaderMarkup()}
      <main class="vnext-main vnext-today" data-vnext-page="today">
        <section class="vnext-brief ${v.tone}">
          <span class="vnext-eyebrow">${esc(v.eyebrow)}</span>
          <h1>${esc(v.text)}</h1>
          <p>${summary.sales != null ? `${fmt.compactMoney(summary.sales)} 销售 · ${fmt.money(summary.profit, 0)} 贡献利润 · ACOS ${fmt.percent(summary.acos)}` : '手机端不再复制桌面报表，只保留结论、异常和查找。'}</p>
        </section>

        <section class="vnext-kpi-strip" aria-label="关键指标">
          ${kpiMarkup('销售', fmt.compactMoney(summary.sales), fmt.number(summary.units) + ' 件')}
          ${kpiMarkup('利润', fmt.compactMoney(summary.profit), fmt.percent(summary.profitMargin))}
          ${kpiMarkup('ACOS', fmt.percent(summary.acos), `TACOS ${fmt.percent(summary.tacos)}`)}
        </section>

        <section class="vnext-section">
          <div class="vnext-section-head">
            <div><span>现在</span><h2>先看这些</h2></div>
            ${signals.length ? `<button type="button" data-vnext-tab="alerts">全部 ${signals.length} 类</button>` : ''}
          </div>
          <div class="vnext-list">
            ${topSignals.length ? topSignals.map(item => signalRow(item, true)).join('') : emptyMarkup('当前没有明显异常', '销售、利润、广告、商品、库存和数据质量都没有触发高优先级信号。')}
          </div>
        </section>

        <section class="vnext-section">
          <div class="vnext-section-head"><div><span>轮廓</span><h2>经营脉搏</h2></div></div>
          <div class="vnext-facts">
            <div><span>转化率</span><strong>${fmt.percent(summary.cvr)}</strong><small>${fmt.number(summary.sessions)} Sessions</small></div>
            <div><span>广告销售</span><strong>${fmt.compactMoney(summary.adSales)}</strong><small>${fmt.compactMoney(summary.adSpend)} 花费</small></div>
            <div><span>库存资金</span><strong>${fmt.compactMoney(summary.inventoryValue)}</strong><small>${fmt.number(summary.fulfillableUnits)} 可售</small></div>
            <div><span>退款销售额</span><strong>${fmt.compactMoney(summary.refundSales)}</strong><small>${fmt.number(summary.returns)} 退货</small></div>
          </div>
        </section>

        <section class="vnext-footnote">
          <span>${critical} 类优先处理</span>
          <span>${warning} 类值得关注</span>
          <span>${esc(m.inventory.snapshotDate ? `库存快照 ${m.inventory.snapshotDate}` : '库存快照暂无')}</span>
        </section>
      </main>`;
  }

  function alertsMarkup() {
    const signals = buildIssueGroups();
    const counts = {
      all: signals.length,
      critical: signals.filter(item => item.severity === 'critical').length,
      warning: signals.filter(item => item.severity === 'warning').length
    };
    const visible = state.severity === 'all' ? signals : signals.filter(item => item.severity === state.severity);
    return `
      ${shellHeaderMarkup('异常')}
      <main class="vnext-main" data-vnext-page="alerts">
        <section class="vnext-page-intro">
          <span class="vnext-eyebrow">经营信号</span>
          <h1>先看问题类型，再看受影响对象</h1>
          <p>同类异常先聚合成一个决策入口，避免把几十个 Campaign 或 SKU 平铺成待办。</p>
        </section>
        <div class="vnext-segmented" role="group" aria-label="异常级别">
          <button type="button" data-vnext-severity="all" class="${state.severity === 'all' ? 'active' : ''}">全部 <b>${counts.all}</b></button>
          <button type="button" data-vnext-severity="critical" class="${state.severity === 'critical' ? 'active' : ''}">优先 <b>${counts.critical}</b></button>
          <button type="button" data-vnext-severity="warning" class="${state.severity === 'warning' ? 'active' : ''}">关注 <b>${counts.warning}</b></button>
        </div>
        <section class="vnext-section vnext-alert-list">
          <div class="vnext-list">
            ${visible.length ? visible.map(item => signalRow(item)).join('') : emptyMarkup('这个级别没有异常', '切换到“全部”查看其他经营信号。')}
          </div>
        </section>
      </main>`;
  }

  function delta(current, previous, inverse = false) {
    if (current == null || previous == null || Number(previous) === 0) return { text: '—', tone: 'neutral' };
    const change = (Number(current) - Number(previous)) / Math.abs(Number(previous));
    const better = inverse ? change <= 0 : change >= 0;
    return { text: `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`, tone: Math.abs(change) < 0.001 ? 'neutral' : better ? 'positive' : 'negative' };
  }

  function comparisonRow(label, currentValue, previousValue, formatter, inverse = false) {
    const d = delta(currentValue, previousValue, inverse);
    return `<div class="vnext-compare-row"><span>${esc(label)}</span><strong>${esc(formatter(currentValue))}</strong><small>${esc(formatter(previousValue))}</small><b class="${d.tone}">${esc(d.text)}</b></div>`;
  }

  function sparkBars(rows) {
    const data = rows.slice(0, 6).reverse();
    const max = Math.max(1, ...data.map(row => Math.max(0, Number(row.sales || 0))));
    return `<div class="vnext-bars" aria-label="最近月份销售趋势">${data.map(row => {
      const height = clamp((Number(row.sales || 0) / max) * 100, 4, 100);
      return `<div class="vnext-bar-col"><span class="vnext-bar" style="--bar:${height}%"></span><small>${esc(row.month.slice(5))}月</small></div>`;
    }).join('')}</div>`;
  }

  function trendsMarkup() {
    const m = models();
    const current = m.overview.summary;
    const previousRaw = state.compare.payload?.dashboard?.summary || null;
    const previous = previousRaw ? selectors.normalizeSummary(previousRaw) : null;
    const historyRows = m.history.rows;

    return `
      ${shellHeaderMarkup('趋势')}
      <main class="vnext-main" data-vnext-page="trends">
        <section class="vnext-page-intro">
          <span class="vnext-eyebrow">变化，而不是快照</span>
          <h1>本期正在往哪走</h1>
          <p>先看与上一等长期间的变化，再看月度方向。</p>
        </section>

        <section class="vnext-section">
          <div class="vnext-section-head"><div><span>对比</span><h2>本期 vs 上期</h2></div>${state.compare.loading ? '<span class="vnext-inline-loader">读取中</span>' : ''}</div>
          ${state.compare.error ? `<div class="vnext-inline-error">${esc(state.compare.error)}</div>` : previous ? `
            <div class="vnext-compare-head"><span>指标</span><span>本期</span><span>上期</span><span>变化</span></div>
            <div class="vnext-compare-table">
              ${comparisonRow('销售', current.sales, previous.sales, value => fmt.compactMoney(value))}
              ${comparisonRow('利润', current.profit, previous.profit, value => fmt.compactMoney(value))}
              ${comparisonRow('广告花费', current.adSpend, previous.adSpend, value => fmt.compactMoney(value), true)}
              ${comparisonRow('ACOS', current.acos, previous.acos, value => fmt.percent(value), true)}
            </div>` : '<div class="vnext-skeleton"><i></i><i></i><i></i><i></i></div>'}
        </section>

        <section class="vnext-section">
          <div class="vnext-section-head"><div><span>月度</span><h2>最近 6 个月</h2></div></div>
          ${historyRows.length ? `
            ${sparkBars(historyRows)}
            <div class="vnext-history-list">${historyRows.slice(0, 6).map(row => `<button type="button" data-vnext-month="${esc(row.month)}"><span>${esc(row.month)}</span><strong>${fmt.compactMoney(row.sales)}</strong><small>${fmt.compactMoney(row.profit)} 利润</small>${icon('chevron')}</button>`).join('')}</div>` : emptyMarkup('暂无历史月份', '导入更多月份后，这里会形成连续趋势。')}
        </section>
      </main>`;
  }

  function searchItems() {
    const m = models();
    const summary = m.overview.summary;
    return [
      { id: 'metric-sales', type: 'metric', domain: 'finance', title: '销售额', subtitle: 'Business Sales', value: fmt.money(summary.sales, 0), detail: { type: 'metric', title: '销售额', value: fmt.money(summary.sales, 2), rows: [['销量', fmt.number(summary.units)], ['Sessions', fmt.number(summary.sessions)], ['转化率', fmt.percent(summary.cvr)]] } },
      { id: 'metric-profit', type: 'metric', domain: 'finance', title: '贡献利润', subtitle: 'Contribution Profit', value: fmt.money(summary.profit, 0), detail: { type: 'metric', title: '贡献利润', value: fmt.money(summary.profit, 2), rows: [['利润率', fmt.percent(summary.profitMargin)], ['销售额', fmt.money(summary.sales, 0)]] } },
      { id: 'metric-acos', type: 'metric', domain: 'ads', title: 'ACOS', subtitle: '广告投入产出', value: fmt.percent(summary.acos), detail: { type: 'metric', title: 'ACOS', value: fmt.percent(summary.acos), rows: [['广告花费', fmt.money(summary.adSpend, 0)], ['广告销售', fmt.money(summary.adSales, 0)], ['TACOS', fmt.percent(summary.tacos)]] } },
      { id: 'metric-cvr', type: 'metric', domain: 'products', title: '转化率 CVR', subtitle: 'Sessions → Units', value: fmt.percent(summary.cvr), detail: { type: 'metric', title: '转化率 CVR', value: fmt.percent(summary.cvr), rows: [['Sessions', fmt.number(summary.sessions)], ['销量', fmt.number(summary.units)]] } },
      { id: 'metric-inventory', type: 'metric', domain: 'inventory', title: '库存资金', subtitle: 'Inventory Value', value: fmt.money(summary.inventoryValue, 0), detail: { type: 'metric', title: '库存资金', value: fmt.money(summary.inventoryValue, 2), rows: [['可售库存', fmt.number(summary.fulfillableUnits)], ['库存快照', m.inventory.snapshotDate || '—']] } },
      ...m.ads.campaigns.map(row => ({ id: `campaign-${row.id}`, type: 'campaign', domain: 'ads', title: row.campaign, subtitle: `广告活动 · ${fmt.money(row.spend, 0)} 花费`, value: fmt.percent(row.acos), keywords: `${row.campaign} ${row.portfolio} Campaign 广告`, detail: { type: 'campaign', title: row.campaign, item: row } })),
      ...m.products.products.map(row => ({ id: `product-${row.id}`, type: 'product', domain: 'products', title: row.sku === '—' ? row.asin : row.sku, subtitle: `${row.asin} · ${row.model || '商品'}`, value: fmt.money(row.sales, 0), keywords: `${row.sku} ${row.asin} ${row.model} SKU ASIN 商品`, detail: { type: 'product', title: row.sku === '—' ? row.asin : row.sku, item: row } })),
      ...m.inventory.inventory.map(row => ({ id: `inventory-${row.id}`, type: 'inventory', domain: 'inventory', title: row.sku === '—' ? row.asin : row.sku, subtitle: `${row.asin} · 库存`, value: `${fmt.number(row.fulfillable)} 可售`, keywords: `${row.sku} ${row.asin} ${row.model} 库存`, detail: { type: 'inventory', title: row.sku === '—' ? row.asin : row.sku, item: row } })),
      ...m.charges.rows.map(row => ({ id: `charge-${row.id}`, type: 'charge', domain: 'charges', title: row.name, subtitle: `${row.category} · Amazon 扣费`, value: fmt.money(row.amount, 0), keywords: `${row.name} ${row.category} ${row.source} 扣费 fee`, detail: { type: 'charge', title: row.name, item: row } })),
      ...m.returns.rows.map(row => ({ id: `return-${row.id}`, type: 'return', domain: 'returns', title: row.reason, subtitle: '退货原因', value: `${fmt.number(row.count)} 次`, keywords: `${row.reason} 退货 refund return`, detail: { type: 'return', title: row.reason, item: row } }))
    ];
  }

  function filteredSearchItems() {
    const query = state.query.trim().toLowerCase();
    if (!query) return [];
    return searchItems().filter(item => `${item.title} ${item.subtitle || ''} ${item.keywords || ''} ${DOMAIN[item.domain] || ''}`.toLowerCase().includes(query)).slice(0, 50);
  }

  function searchResultRow(item) {
    return `<button class="vnext-search-result" type="button" data-vnext-result="${esc(item.id)}"><span class="vnext-result-domain">${esc(DOMAIN[item.domain] || '指标')}</span><span class="vnext-result-copy"><strong>${esc(item.title)}</strong><small>${esc(item.subtitle || '')}</small></span><b>${esc(item.value || '')}</b>${icon('chevron')}</button>`;
  }

  function searchMarkup() {
    const results = filteredSearchItems();
    const signals = buildIssueGroups().slice(0, 4);
    return `
      <header class="vnext-search-toolbar">
        <label class="vnext-search-field">
          ${icon('search')}
          <input type="search" inputmode="search" autocomplete="off" data-vnext-search-input value="${esc(state.query)}" placeholder="搜指标、Campaign、SKU、ASIN、扣费…" aria-label="全局搜索" />
          ${state.query ? `<button type="button" data-vnext-clear-search aria-label="清空搜索">${icon('close')}</button>` : ''}
        </label>
        <button class="vnext-period-icon" type="button" data-vnext-period aria-label="选择期间">${icon('calendar')}</button>
      </header>
      <main class="vnext-main vnext-search-page" data-vnext-page="search">
        ${state.query ? `
          <section class="vnext-section vnext-search-results">
            <div class="vnext-section-head"><div><span>结果</span><h2>${results.length} 个匹配</h2></div></div>
            <div class="vnext-list">${results.length ? results.map(searchResultRow).join('') : emptyMarkup('没有找到', '试试 SKU、ASIN、Campaign 名称、ACOS、利润或扣费名称。')}</div>
          </section>` : `
          <section class="vnext-search-landing">
            <span class="vnext-eyebrow">一个入口，查全部</span>
            <h1>你想查什么？</h1>
            <div class="vnext-quick-search">
              ${['ACOS', '利润', '销售', 'SKU', '库存', '扣费'].map(value => `<button type="button" data-vnext-query="${esc(value)}">${esc(value)}</button>`).join('')}
            </div>
          </section>
          <section class="vnext-section">
            <div class="vnext-section-head"><div><span>可能要查</span><h2>当前问题类型</h2></div></div>
            <div class="vnext-list">${signals.length ? signals.map(item => signalRow(item, true)).join('') : emptyMarkup('没有异常类型', '可以直接搜索任意指标、Campaign、SKU、ASIN 或扣费名称。')}</div>
          </section>`}
      </main>`;
  }

  function tabBarMarkup() {
    return `<nav class="vnext-tabbar" aria-label="手机端主导航">${TABS.map(([id, label, iconName]) => `<button type="button" data-vnext-tab="${id}" class="${state.tab === id ? 'active' : ''}"${state.tab === id ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${esc(label)}</span></button>`).join('')}</nav>`;
  }

  function runtimeNoticeMarkup() {
    const s = state.runtimeState;
    if (!s) return '';
    if (s.loading && !s.dashboard) return '<div class="vnext-runtime"><i></i><span><strong>正在读取经营数据</strong><small>先显示框架，数据完成后自动更新</small></span></div>';
    if (s.error) return `<div class="vnext-runtime error"><span>!</span><div><strong>数据读取异常</strong><small>${esc(s.error)}</small></div></div>`;
    if (s.mode === 'live' && !s.periods?.length) return '<div class="vnext-runtime"><span>·</span><div><strong>还没有可查看月份</strong><small>数据库已连接，等待导入月度数据。</small></div></div>';
    return '';
  }

  function detailRowsMarkup(rows = []) {
    return `<div class="vnext-detail-facts">${rows.filter(row => row && row[0]).map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`).join('')}</div>`;
  }

  function issueMembersMarkup(group) {
    if (!group?.members?.length) return '';
    const members = group.members.slice(0, 8);
    return `
      <section class="vnext-section" style="margin-top:28px">
        <div class="vnext-section-head"><div><span>影响最大</span><h2>前 ${members.length} 个对象</h2></div></div>
        <div class="vnext-list">${members.map(member => signalRow(member, true)).join('')}</div>
      </section>`;
  }

  function detailBody(detail) {
    if (!detail) return '';
    const item = detail.item || {};
    let value = detail.value || '';
    let rows = detail.rows || [];
    let kicker = detail.type === 'metric' ? '指标' : DOMAIN[detail.type === 'campaign' ? 'ads' : detail.type === 'product' ? 'products' : detail.type] || '详情';
    let extra = '';

    if (detail.type === 'issue-group') {
      const group = detail.group || {};
      kicker = '问题类型';
      value = `${group.members?.length || 0} 个受影响对象`;
      rows = [['业务', DOMAIN[group.domain] || group.domain || '—'], ['级别', SEVERITY[group.severity]?.label || '—'], ['查看方式', '先看影响最大的对象']];
      extra = issueMembersMarkup(group);
    } else if (detail.type === 'campaign') {
      value = item.acos != null ? fmt.percent(item.acos) : fmt.money(item.spend, 0);
      rows = [['花费', fmt.money(item.spend, 2)], ['广告销售', fmt.money(item.sales, 2)], ['ACOS', fmt.percent(item.acos)], ['订单', fmt.number(item.orders)], ['CTR', fmt.percent(item.ctr)], ['CVR', fmt.percent(item.cvr)], ['Portfolio', item.portfolio || '—']];
    } else if (detail.type === 'product') {
      value = fmt.money(item.sales, 0);
      rows = [['SKU', item.sku], ['ASIN', item.asin], ['销售额', fmt.money(item.sales, 2)], ['销量', fmt.number(item.units)], ['Sessions', fmt.number(item.sessions)], ['CVR', fmt.percent(item.cvr)], ['Buy Box', fmt.percent(item.buyBox)]];
    } else if (detail.type === 'inventory') {
      value = `${fmt.number(item.fulfillable)} 可售`;
      rows = [['SKU', item.sku], ['ASIN', item.asin], ['可售', fmt.number(item.fulfillable)], ['在途', fmt.number(item.inbound)], ['总库存', fmt.number(item.total)], ['不可售', fmt.number(item.unsellable)], ['库存资金', fmt.money(item.inventoryValue, 2)]];
    } else if (detail.type === 'charge') {
      value = fmt.money(item.amount, 2);
      rows = [['类别', item.category], ['净成本', fmt.money(item.amount, 2)], ['Debit', fmt.money(item.debit, 2)], ['Credit', fmt.money(item.credit, 2)], ['记录数', fmt.number(item.count)], ['来源', item.source || '—']];
    } else if (detail.type === 'return') {
      value = `${fmt.number(item.count)} 次`;
      rows = [['退货次数', fmt.number(item.count)], ['占比', fmt.percent(item.share)], ['退款销售额', fmt.money(item.amount, 2)]];
    } else if (detail.type === 'quality') {
      value = item.status || '';
      rows = [['状态', item.status], ['来源', item.source || '—'], ['说明', item.message || detail.context || '—']];
    }

    return `
      <section class="vnext-detail-screen" role="dialog" aria-modal="true" aria-labelledby="vnextDetailTitle">
        <header class="vnext-detail-toolbar">
          <button type="button" data-vnext-close-detail aria-label="返回">${icon('back')}</button>
          <span>${esc(kicker)}</span>
          <span class="vnext-detail-spacer"></span>
        </header>
        <main class="vnext-detail-main">
          <span class="vnext-eyebrow">${esc(kicker)}</span>
          <h1 id="vnextDetailTitle">${esc(detail.title || '详情')}</h1>
          ${detail.context ? `<p class="vnext-detail-context">${esc(detail.context)}</p>` : ''}
          ${value ? `<div class="vnext-detail-value">${esc(value)}</div>` : ''}
          ${detailRowsMarkup(rows)}
          ${extra}
          <div class="vnext-detail-note">只读查看 · 当前期间 ${esc(periodLabel())}</div>
        </main>
      </section>`;
  }

  function periodSheetMarkup() {
    if (state.sheet !== 'period') return '';
    const periods = (state.runtimeState?.periods || []).map(row => typeof row === 'string' ? row : row.month).filter(Boolean).sort((a, b) => b.localeCompare(a)).slice(0, 18);
    return `
      <div class="vnext-sheet-backdrop" data-vnext-close-sheet></div>
      <section class="vnext-sheet" role="dialog" aria-modal="true" aria-labelledby="vnextPeriodTitle">
        <div class="vnext-sheet-handle" aria-hidden="true"></div>
        <header><div><span>查看期间</span><h2 id="vnextPeriodTitle">换一个时间窗口</h2></div><button type="button" data-vnext-close-sheet aria-label="关闭">${icon('close')}</button></header>
        <div class="vnext-quick-periods">
          <button type="button" data-vnext-quick="current">本月</button>
          <button type="button" data-vnext-quick="previous">上月</button>
          <button type="button" data-vnext-quick="30">30天</button>
          <button type="button" data-vnext-quick="90">90天</button>
          <button type="button" data-vnext-quick="ytd">今年</button>
        </div>
        <div class="vnext-months">${periods.map(month => `<button type="button" data-vnext-period-month="${esc(month)}"><span>${esc(month)}</span>${state.runtimeState?.from?.slice(0, 7) === month ? icon('check') : ''}</button>`).join('')}</div>
      </section>`;
  }

  function render() {
    if (!media.matches || !state.active) return;
    const previousFocus = document.activeElement;
    const searchFocused = previousFocus?.matches?.('[data-vnext-search-input]');
    const periodSheetCloseFocused = previousFocus?.matches?.('.vnext-sheet [data-vnext-close-sheet]');
    const scrollY = window.scrollY;

    const page = state.tab === 'alerts' ? alertsMarkup() : state.tab === 'trends' ? trendsMarkup() : state.tab === 'search' ? searchMarkup() : todayMarkup();
    root.innerHTML = `
      <div class="vnext-app" data-tab="${esc(state.tab)}" aria-busy="${state.runtimeState?.loading ? 'true' : 'false'}">
        ${runtimeNoticeMarkup()}
        ${page}
        ${tabBarMarkup()}
        ${periodSheetMarkup()}
        ${state.detail ? detailBody(state.detail) : ''}
      </div>`;

    requestAnimationFrame(() => {
      if (periodSheetCloseFocused && state.sheet === 'period') {
        root.querySelector('.vnext-sheet [data-vnext-close-sheet]')?.focus({ preventScroll: true });
      }
      if (searchFocused || state.tab === 'search' && document.documentElement.dataset.vnextAutofocus === 'true') {
        const input = root.querySelector('[data-vnext-search-input]');
        if (input) {
          input.focus({ preventScroll: true });
          const length = input.value.length;
          input.setSelectionRange?.(length, length);
        }
        delete document.documentElement.dataset.vnextAutofocus;
      }
      if (!state.detail && !state.sheet) window.scrollTo(0, scrollY);
    });
  }

  function historyPayload(overrides = {}) {
    return {
      ...(history.state || {}),
      [HISTORY_KEY]: {
        tab: state.tab,
        detailKey: state.detail?._historyKey || null,
        sheet: state.sheet || null,
        ...overrides
      }
    };
  }

  function pushHistory(overrides = {}) {
    history.pushState(historyPayload(overrides), document.title);
  }

  function replaceHistory(overrides = {}) {
    history.replaceState(historyPayload(overrides), document.title);
  }

  function changeTab(tab, { historyMode = 'push' } = {}) {
    if (!TABS.some(([id]) => id === tab)) return;
    const changed = state.tab !== tab || state.detail || state.sheet;
    state.tab = tab;
    state.detail = null;
    state.sheet = null;
    if (tab === 'search') document.documentElement.dataset.vnextAutofocus = 'true';
    render();
    window.scrollTo(0, 0);
    if (changed) {
      if (historyMode === 'replace') replaceHistory({ tab, detailKey: null, sheet: null });
      else if (historyMode === 'push') pushHistory({ tab, detailKey: null, sheet: null });
    }
    if (tab === 'trends') loadComparison();
  }

  function registerDetail(detail) {
    const key = `d${++detailSerial}`;
    detailRegistry.set(key, detail);
    return key;
  }

  function openDetail(detail) {
    if (!detail) return;
    lastFocused = document.activeElement;
    const key = registerDetail(detail);
    state.detail = { ...detail, _historyKey: key };
    state.sheet = null;
    render();
    pushHistory({ tab: state.tab, detailKey: key, sheet: null });
    requestAnimationFrame(() => root.querySelector('[data-vnext-close-detail]')?.focus());
  }

  function closeDetail({ historyBack = true } = {}) {
    if (!state.detail) return;
    state.detail = null;
    render();
    if (historyBack) history.back();
    else requestAnimationFrame(() => lastFocused?.focus?.({ preventScroll: true }));
  }

  function openPeriodSheet() {
    lastFocused = document.activeElement;
    state.sheet = 'period';
    render();
    pushHistory({ tab: state.tab, detailKey: null, sheet: 'period' });
    requestAnimationFrame(() => root.querySelector('.vnext-sheet [data-vnext-close-sheet]')?.focus());
  }

  function closeSheet({ historyBack = true } = {}) {
    if (!state.sheet) return;
    state.sheet = null;
    render();
    if (historyBack) history.back();
    else requestAnimationFrame(() => lastFocused?.focus?.({ preventScroll: true }));
  }

  async function applyQuickRange(key) {
    state.sheet = null;
    render();
    history.back();
    await runtime.setQuickRange(key).catch(() => null);
  }

  async function setMonthRange(month) {
    if (!month) return;
    const from = runtime.helpers.monthStart(month);
    const to = runtime.helpers.monthEnd(month);
    await runtime.setRange(from, to).catch(() => null);
  }

  async function applyPeriodMonth(month) {
    if (!month) return;
    state.sheet = null;
    render();
    history.back();
    await setMonthRange(month);
  }

  async function selectTrendMonth(month) {
    if (!month) return;
    await setMonthRange(month);
    window.scrollTo(0, 0);
  }

  async function loadComparison() {
    const s = state.runtimeState;
    if (!s?.from || !s?.to || s.mode !== 'live') return;
    const key = `${s.from}:${s.to}`;
    if (state.compare.key === key && (state.compare.loading || state.compare.payload || state.compare.error)) return;
    state.compare = { key, loading: true, payload: null, error: null };
    if (state.tab === 'trends') render();
    try {
      const payload = await runtime.comparePrevious();
      if (state.compare.key !== key) return;
      state.compare = { key, loading: false, payload, error: payload?.unavailable ? '当前期间暂时无法生成上期对比。' : null };
    } catch (error) {
      if (state.compare.key !== key) return;
      state.compare = { key, loading: false, payload: null, error: error instanceof Error ? error.message : String(error) };
    }
    if (state.tab === 'trends') render();
  }

  function findSignal(id) {
    return buildIssueGroups().find(item => item.id === id) || buildSignals().find(item => item.id === id) || null;
  }

  function findSearchItem(id) {
    return searchItems().find(item => item.id === id) || null;
  }

  function trapLayerFocus(event) {
    if (event.key !== 'Tab' || (!state.detail && !state.sheet)) return;
    const layer = state.detail ? root.querySelector('.vnext-detail-screen') : root.querySelector('.vnext-sheet');
    if (!layer) return;
    const focusable = [...layer.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-vnext-tab]')?.dataset.vnextTab;
    if (tab) {
      event.preventDefault();
      changeTab(tab);
      return;
    }

    if (event.target.closest('[data-vnext-period]')) {
      event.preventDefault();
      openPeriodSheet();
      return;
    }

    if (event.target.closest('[data-vnext-close-sheet]')) {
      event.preventDefault();
      closeSheet();
      return;
    }

    const quick = event.target.closest('[data-vnext-quick]')?.dataset.vnextQuick;
    if (quick) {
      event.preventDefault();
      applyQuickRange(quick);
      return;
    }

    const periodMonth = event.target.closest('[data-vnext-period-month]')?.dataset.vnextPeriodMonth;
    if (periodMonth) {
      event.preventDefault();
      applyPeriodMonth(periodMonth);
      return;
    }

    const severity = event.target.closest('[data-vnext-severity]')?.dataset.vnextSeverity;
    if (severity) {
      state.severity = severity;
      render();
      return;
    }

    const signalId = event.target.closest('[data-vnext-signal]')?.dataset.vnextSignal;
    if (signalId) {
      const signal = findSignal(signalId);
      if (signal?.detail) openDetail({ ...signal.detail, context: signal.detail.context || signal.subtitle });
      return;
    }

    const resultId = event.target.closest('[data-vnext-result]')?.dataset.vnextResult;
    if (resultId) {
      const item = findSearchItem(resultId);
      if (item?.detail) openDetail(item.detail);
      return;
    }

    const query = event.target.closest('[data-vnext-query]')?.dataset.vnextQuery;
    if (query) {
      state.query = query;
      render();
      requestAnimationFrame(() => root.querySelector('[data-vnext-search-input]')?.focus());
      return;
    }

    if (event.target.closest('[data-vnext-clear-search]')) {
      state.query = '';
      render();
      requestAnimationFrame(() => root.querySelector('[data-vnext-search-input]')?.focus());
      return;
    }

    if (event.target.closest('[data-vnext-close-detail]')) {
      event.preventDefault();
      closeDetail();
      return;
    }

    const month = event.target.closest('[data-vnext-month]')?.dataset.vnextMonth;
    if (month) {
      event.preventDefault();
      selectTrendMonth(month);
    }
  });

  root.addEventListener('input', event => {
    if (!event.target.matches('[data-vnext-search-input]')) return;
    state.query = event.target.value;
    render();
  });

  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (state.detail) { event.preventDefault(); closeDetail(); return; }
      if (state.sheet) { event.preventDefault(); closeSheet(); return; }
    }
    trapLayerFocus(event);
  });

  root.addEventListener('vnext:navigate', event => {
    const destination = event.detail?.destination;
    const detail = event.detail?.detail;
    if (TABS.some(([id]) => id === destination)) changeTab(destination);
    else if (detail) openDetail(detail);
    else if (['ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'data'].includes(destination)) {
      state.query = DOMAIN[destination] || destination;
      changeTab('search');
    }
  });

  root.addEventListener('vnext:search', event => {
    state.query = event.detail?.query || '';
    changeTab('search');
  });

  window.addEventListener('popstate', event => {
    if (!media.matches) return;
    const payload = event.state?.[HISTORY_KEY];
    if (!payload) {
      state.detail = null;
      state.sheet = null;
      state.tab = 'today';
      render();
      return;
    }
    state.tab = TABS.some(([id]) => id === payload.tab) ? payload.tab : 'today';
    state.sheet = payload.sheet || null;
    state.detail = payload.detailKey && detailRegistry.has(payload.detailKey)
      ? { ...detailRegistry.get(payload.detailKey), _historyKey: payload.detailKey }
      : null;
    render();
    if (state.tab === 'trends') loadComparison();
  });

  runtime.subscribe(next => {
    const periodChanged = state.runtimeState?.from !== next.from || state.runtimeState?.to !== next.to;
    state.runtimeState = next;
    if (periodChanged) state.compare = { key: null, loading: false, payload: null, error: null };
    if (state.active && media.matches) {
      render();
      if (state.tab === 'trends') loadComparison();
    }
  });

  function activate() {
    if (!media.matches || document.documentElement.dataset.mobileVnextReady !== 'true') return;
    state.active = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-vnext-active');
    const payload = history.state?.[HISTORY_KEY];
    if (payload?.tab && TABS.some(([id]) => id === payload.tab)) {
      state.tab = payload.tab;
      state.sheet = payload.sheet === 'period' ? 'period' : null;
    } else {
      state.sheet = null;
      replaceHistory({ tab: state.tab, detailKey: null, sheet: null });
    }
    render();
    if (state.sheet === 'period') {
      requestAnimationFrame(() => root.querySelector('.vnext-sheet [data-vnext-close-sheet]')?.focus());
    }
    runtime.start();
    if (state.tab === 'trends') loadComparison();
  }

  function deactivate() {
    state.active = false;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-vnext-active');
  }

  window.YT_MOBILE_VNEXT = Object.freeze({
    activate,
    deactivate,
    navigate: changeTab,
    getState: () => Object.freeze({ tab: state.tab, severity: state.severity, query: state.query, detailOpen: Boolean(state.detail), sheet: state.sheet })
  });
})();
