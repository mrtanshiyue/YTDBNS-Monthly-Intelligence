(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  const runtime = window.YT_SHARED_RUNTIME;
  const selectors = window.YT_SHARED_SELECTORS;
  const secondary = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  if (!root || !runtime || !selectors || !secondary || !fmt) return;

  const media = window.matchMedia('(max-width: 860px)');
  const HISTORY_KEY = 'ytdbnsMobileDensityModule';
  const MODULES = [
    ['today', '总览'],
    ['alerts', '异常'],
    ['ads', '广告'],
    ['products', '商品'],
    ['inventory', '库存'],
    ['finance', '工作台'],
    ['charges', '扣费'],
    ['returns', '退货'],
    ['history', '历史'],
    ['data', '数据']
  ];
  const RAIL_MODULES = new Set(['today', 'alerts', 'ads', 'products', 'inventory', 'finance']);
  const BUSINESS_MODULES = new Set(['ads', 'products', 'inventory', 'finance', 'charges', 'returns', 'history', 'data']);
  const WORKSPACE_CHILD_MODULES = new Set(['charges', 'returns', 'history', 'data']);
  const FILTERS = {
    ads: [
      ['all', '全部'], ['acos45', 'ACOS >45%'], ['acos60', 'ACOS >60%'], ['zeroOrders', '无订单'], ['highSpend', '高花费']
    ],
    products: [
      ['all', '全部'], ['buyBox', 'Buy Box <90%'], ['lowCvr', '高流量低CVR'], ['lowVelocity', '低动销'], ['top', 'Top 20%']
    ],
    inventory: [
      ['all', '全部'], ['lowStock', '低库存'], ['unsellable', '不可售'], ['inbound', '有在途'], ['highCapital', '高资金']
    ]
  };
  const SORTS = {
    ads: [
      ['spendDesc', '花费最高'], ['acosDesc', 'ACOS最高'], ['salesDesc', '销售最高'], ['ordersAsc', '订单最少']
    ],
    products: [
      ['salesDesc', '销售最高'], ['sessionsDesc', '流量最高'], ['cvrAsc', 'CVR最低'], ['buyBoxAsc', 'Buy Box最低']
    ],
    inventory: [
      ['capitalDesc', '资金最高'], ['fulfillableAsc', '可售最少'], ['unsellableDesc', '不可售最多'], ['inboundDesc', '在途最多']
    ]
  };

  const state = {
    module: null,
    filters: { ads: 'all', products: 'all', inventory: 'all' },
    sorts: { ads: 'spendDesc', products: 'salesDesc', inventory: 'capitalDesc' },
    workspaceFocus: null,
    applying: false
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
  const mean = values => {
    const known = values.map(number).filter(value => value != null);
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  };

  function railModuleFor(module) {
    return WORKSPACE_CHILD_MODULES.has(module) ? 'finance' : module;
  }

  function models() {
    const s = runtime.getState();
    return {
      runtimeState: s,
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

  function issueCounts(m) {
    const ads = m.ads.campaigns.filter(row => (row.acos != null && Number(row.acos) > .45) || (row.orders === 0 && Number(row.spend || 0) > 0)).length;
    const products = m.products.products.filter(row => (row.buyBox != null && Number(row.buyBox) < .90) || (row.units != null && Number(row.units) <= 1)).length;
    const inventory = m.inventory.inventory.filter(row => (row.fulfillable != null && Number(row.fulfillable) <= 20) || (row.unsellable != null && Number(row.unsellable) > 0)).length;
    const data = m.data.quality.filter(row => ['WARN', 'WARNING', 'FAIL', 'FAILED', 'ERROR'].includes(String(row.status || '').toUpperCase())).length;
    return { ads, products, inventory, data };
  }

  function moduleCount(id, m) {
    const issues = issueCounts(m);
    if (id === 'alerts') return issues.ads + issues.products + issues.inventory + issues.data;
    if (id === 'ads') return m.ads.campaigns.length;
    if (id === 'products') return m.products.products.length;
    if (id === 'inventory') return m.inventory.inventory.length;
    if (id === 'charges') return m.charges.rows.length;
    if (id === 'returns') return m.returns.total || m.returns.rows.length;
    if (id === 'history') return m.history.rows.length;
    if (id === 'data') return issues.data;
    return null;
  }

  function railMarkup(m) {
    const current = railModuleFor(state.module || root.querySelector('.vnext-app')?.dataset.tab || 'today');
    return `<nav class="vnext-module-rail" aria-label="完整业务标签">${MODULES.filter(([id]) => RAIL_MODULES.has(id)).map(([id, label]) => {
      const count = moduleCount(id, m);
      return `<button type="button" data-vnext-module="${id}" class="${current === id ? 'active' : ''}"${current === id ? ' aria-current="page"' : ''}><span>${label}</span>${count != null ? `<b>${esc(count)}</b>` : ''}</button>`;
    }).join('')}</nav>`;
  }

  function denseMetric(label, value, note = '', detail = '') {
    return `<button type="button" class="vnext-density-metric"${detail ? ` data-density-metric="${esc(detail)}"` : ''}><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</button>`;
  }

  function denseBoardMarkup(m) {
    const s = m.overview.summary;
    return `<section class="vnext-density-board" aria-label="高密度经营指标">
      ${denseMetric('销售额', fmt.compactMoney(s.sales), `${fmt.number(s.units)} 件`, 'sales')}
      ${denseMetric('贡献利润', fmt.compactMoney(s.profit), `Margin ${fmt.percent(s.profitMargin)}`, 'profit')}
      ${denseMetric('ACOS', fmt.percent(s.acos), `TACOS ${fmt.percent(s.tacos)}`, 'acos')}
      ${denseMetric('Sessions', fmt.number(s.sessions), `CVR ${fmt.percent(s.cvr)}`, 'cvr')}
      ${denseMetric('广告花费', fmt.compactMoney(s.adSpend), `广告销售 ${fmt.compactMoney(s.adSales)}`, 'adSpend')}
      ${denseMetric('库存资金', fmt.compactMoney(s.inventoryValue), `${fmt.number(s.fulfillableUnits)} 可售`, 'inventory')}
      ${denseMetric('退款销售', fmt.compactMoney(s.refundSales), `${fmt.number(s.returns)} 退货`, 'refund')}
      ${denseMetric('Campaign', fmt.number(m.ads.campaigns.length), `${issueCounts(m).ads} 需关注`)}
      ${denseMetric('SKU', fmt.number(m.products.products.length), `${issueCounts(m).products} 需关注`)}
      ${denseMetric('不可售', fmt.number(m.inventory.totals.unsellable), `${issueCounts(m).inventory} 库存风险`)}
      ${denseMetric('扣费项目', fmt.number(m.charges.rows.length), fmt.compactMoney(m.charges.total))}
      ${denseMetric('数据异常', fmt.number(issueCounts(m).data), `${fmt.number(m.data.quality.length)} 项检查`)}
    </section>`;
  }

  function moduleHero(title, value, facts = []) {
    return `<section class="vnext-module-hero"><div><span>${esc(title)}</span><strong>${esc(value)}</strong></div><div class="vnext-module-facts">${facts.map(([label, val]) => `<span><small>${esc(label)}</small><b>${esc(val)}</b></span>`).join('')}</div></section>`;
  }

  function filterMarkup(module, rows, m) {
    if (!FILTERS[module]) return '';
    return `<div class="vnext-filter-tags" role="group" aria-label="${esc(MODULES.find(row => row[0] === module)?.[1] || module)}筛选">${FILTERS[module].map(([id, label]) => {
      const count = filteredRows(module, rows, id, m).length;
      return `<button type="button" data-density-filter="${id}" data-density-filter-module="${module}" class="${state.filters[module] === id ? 'active' : ''}">${esc(label)} <b>${count}</b></button>`;
    }).join('')}</div>`;
  }

  function sortMarkup(module) {
    if (!SORTS[module]) return '';
    return `<div class="vnext-sort-tags" role="group" aria-label="${esc(MODULES.find(row => row[0] === module)?.[1] || module)}排序">${SORTS[module].map(([id, label]) => {
      const selected = state.sorts[module] === id;
      return `<button type="button" data-density-sort="${id}" data-density-sort-module="${module}" class="${selected ? 'active' : ''}" aria-pressed="${selected ? 'true' : 'false'}">${esc(label)}</button>`;
    }).join('')}</div>`;
  }

  function operationalControlsMarkup(module, rows, m) {
    if (!FILTERS[module] || !SORTS[module]) return '';
    const moduleLabel = MODULES.find(row => row[0] === module)?.[1] || module;
    return `<section class="vnext-operational-controls" aria-label="${esc(moduleLabel)}操作控制">
      <div class="vnext-operational-control"><span>筛选</span>${filterMarkup(module, rows, m)}</div>
      <div class="vnext-operational-control"><span>排序</span>${sortMarkup(module)}</div>
    </section>`;
  }

  function filteredRows(module, rows, filter = state.filters[module] || 'all', m = models()) {
    if (filter === 'all') return [...rows];
    if (module === 'ads') {
      const avgSpend = mean(rows.map(row => row.spend)) || 0;
      return rows.filter(row => {
        if (filter === 'acos45') return row.acos != null && Number(row.acos) > .45;
        if (filter === 'acos60') return row.acos != null && Number(row.acos) > .60;
        if (filter === 'zeroOrders') return row.orders != null && Number(row.orders) === 0 && Number(row.spend || 0) > 0;
        if (filter === 'highSpend') return row.spend != null && Number(row.spend) >= avgSpend && Number(row.spend) > 0;
        return true;
      });
    }
    if (module === 'products') {
      const avgSessions = mean(rows.map(row => row.sessions)) || 0;
      const baselineCvr = m.products.totals.cvr;
      const topIds = new Set([...rows].sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0)).slice(0, Math.max(1, Math.ceil(rows.length * .2))).map(row => row.id));
      return rows.filter(row => {
        if (filter === 'buyBox') return row.buyBox != null && Number(row.buyBox) < .90;
        if (filter === 'lowCvr') return row.sessions != null && row.cvr != null && baselineCvr != null && Number(row.sessions) >= avgSessions && Number(row.cvr) < Number(baselineCvr);
        if (filter === 'lowVelocity') return row.units != null && Number(row.units) <= 1;
        if (filter === 'top') return topIds.has(row.id);
        return true;
      });
    }
    if (module === 'inventory') {
      const avgValue = mean(rows.map(row => row.inventoryValue)) || 0;
      return rows.filter(row => {
        if (filter === 'lowStock') return row.fulfillable != null && Number(row.fulfillable) <= 20;
        if (filter === 'unsellable') return row.unsellable != null && Number(row.unsellable) > 0;
        if (filter === 'inbound') return row.inbound != null && Number(row.inbound) > 0;
        if (filter === 'highCapital') return row.inventoryValue != null && Number(row.inventoryValue) >= avgValue && Number(row.inventoryValue) > 0;
        return true;
      });
    }
    return [...rows];
  }

  function compareMetric(a, b, key, direction) {
    const av = number(a?.[key]);
    const bv = number(b?.[key]);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return direction === 'asc' ? av - bv : bv - av;
  }

  function sortRows(module, rows, sort = state.sorts[module]) {
    const configs = {
      ads: {
        spendDesc: ['spend', 'desc'],
        acosDesc: ['acos', 'desc'],
        salesDesc: ['sales', 'desc'],
        ordersAsc: ['orders', 'asc']
      },
      products: {
        salesDesc: ['sales', 'desc'],
        sessionsDesc: ['sessions', 'desc'],
        cvrAsc: ['cvr', 'asc'],
        buyBoxAsc: ['buyBox', 'asc']
      },
      inventory: {
        capitalDesc: ['inventoryValue', 'desc'],
        fulfillableAsc: ['fulfillable', 'asc'],
        unsellableDesc: ['unsellable', 'desc'],
        inboundDesc: ['inbound', 'desc']
      }
    };
    const [key, direction] = configs[module]?.[sort] || configs[module]?.[SORTS[module]?.[0]?.[0]] || [];
    if (!key) return [...rows];
    return [...rows].sort((a, b) => compareMetric(a, b, key, direction) || String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
  }

  function denseRecord({ type, id, kicker, title, subtitle, value, metrics = [], risk = '' }) {
    return `<button type="button" class="vnext-dense-record ${risk ? `risk-${risk}` : ''}" data-density-detail-type="${esc(type)}" data-density-detail-id="${esc(id)}"><span class="vnext-dense-record-copy"><small>${esc(kicker)}</small><strong>${esc(title)}</strong>${subtitle ? `<em>${esc(subtitle)}</em>` : ''}</span><span class="vnext-dense-record-value"><b>${esc(value)}</b>${metrics.map(([label, val]) => `<small>${esc(label)} ${esc(val)}</small>`).join('')}</span></button>`;
  }

  function adsMarkup(m) {
    const model = m.ads;
    const rows = sortRows('ads', filteredRows('ads', model.campaigns, state.filters.ads, m)).slice(0, 40);
    const risk = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .45).length;
    const zero = model.campaigns.filter(row => Number(row.orders) === 0 && Number(row.spend || 0) > 0).length;
    return `${moduleHero('广告花费', fmt.compactMoney(model.totals.spend), [['广告销售', fmt.compactMoney(model.totals.sales)], ['ACOS', fmt.percent(model.totals.acos)], ['风险', fmt.number(risk)], ['无订单', fmt.number(zero)]])}
      ${operationalControlsMarkup('ads', model.campaigns, m)}
      <section class="vnext-module-section"><header><span>Campaign</span><h2>广告活动 <b>${rows.length}/${model.campaigns.length}</b></h2></header><div class="vnext-dense-list">${rows.length ? rows.map(row => denseRecord({ type: 'campaign', id: row.id, kicker: row.portfolio || 'Campaign', title: row.campaign, subtitle: `订单 ${fmt.number(row.orders)} · CVR ${fmt.percent(row.cvr)}`, value: fmt.money(row.spend, 0), metrics: [['ACOS', fmt.percent(row.acos)], ['销售', fmt.compactMoney(row.sales)]], risk: row.acos != null && Number(row.acos) > .60 ? 'critical' : row.acos != null && Number(row.acos) > .45 ? 'warning' : '' })).join('') : '<div class="vnext-density-empty">当前筛选没有 Campaign</div>'}</div></section>`;
  }

  function productsMarkup(m) {
    const model = m.products;
    const rows = sortRows('products', filteredRows('products', model.products, state.filters.products, m)).slice(0, 40);
    const buyBoxRisk = model.products.filter(row => row.buyBox != null && Number(row.buyBox) < .90).length;
    return `${moduleHero('商品销售', fmt.compactMoney(model.totals.sales), [['销量', fmt.number(model.totals.units)], ['Sessions', fmt.number(model.totals.sessions)], ['CVR', fmt.percent(model.totals.cvr)], ['Buy Box风险', fmt.number(buyBoxRisk)]])}
      ${operationalControlsMarkup('products', model.products, m)}
      <section class="vnext-module-section"><header><span>SKU</span><h2>商品表现 <b>${rows.length}/${model.products.length}</b></h2></header><div class="vnext-dense-list">${rows.length ? rows.map(row => denseRecord({ type: 'product', id: row.id, kicker: row.model || row.asin || 'SKU', title: row.sku === '—' ? row.asin : row.sku, subtitle: `${row.asin || ''} · ${fmt.number(row.sessions)} Sessions`, value: fmt.compactMoney(row.sales), metrics: [['CVR', fmt.percent(row.cvr)], ['Buy Box', fmt.percent(row.buyBox)]], risk: row.buyBox != null && Number(row.buyBox) < .9 ? 'warning' : '' })).join('') : '<div class="vnext-density-empty">当前筛选没有 SKU</div>'}</div></section>`;
  }

  function inventoryMarkup(m) {
    const model = m.inventory;
    const rows = sortRows('inventory', filteredRows('inventory', model.inventory, state.filters.inventory, m)).slice(0, 40);
    const low = model.inventory.filter(row => row.fulfillable != null && Number(row.fulfillable) <= 20).length;
    const unsellable = model.inventory.filter(row => row.unsellable != null && Number(row.unsellable) > 0).length;
    return `${moduleHero('库存资金', fmt.compactMoney(model.totals.inventoryValue), [['可售', fmt.number(model.totals.fulfillable)], ['在途', fmt.number(model.totals.inbound)], ['不可售', fmt.number(model.totals.unsellable)], ['低库存SKU', fmt.number(low)]])}
      ${operationalControlsMarkup('inventory', model.inventory, m)}
      <section class="vnext-module-section"><header><span>Inventory</span><h2>库存记录 <b>${rows.length}/${model.inventory.length}</b></h2></header><div class="vnext-dense-list">${rows.length ? rows.map(row => denseRecord({ type: 'inventory', id: row.id, kicker: row.model || row.asin || 'SKU', title: row.sku === '—' ? row.asin : row.sku, subtitle: `${fmt.number(row.total)} 总库存 · ${fmt.number(row.inbound)} 在途`, value: `${fmt.number(row.fulfillable)} 可售`, metrics: [['不可售', fmt.number(row.unsellable)], ['资金', fmt.compactMoney(row.inventoryValue)]], risk: row.unsellable != null && Number(row.unsellable) > 0 ? 'warning' : row.fulfillable != null && Number(row.fulfillable) <= 10 ? 'critical' : row.fulfillable != null && Number(row.fulfillable) <= 20 ? 'warning' : '' })).join('') : '<div class="vnext-density-empty">当前筛选没有库存记录</div>'}</div></section>`;
  }

  function workspaceCard(module, kicker, title, value, note) {
    return `<button type="button" class="vnext-workspace-card" data-workspace-module="${esc(module)}"><span class="vnext-workspace-card-copy"><small>${esc(kicker)}</small><strong>${esc(title)}</strong><em>${esc(note)}</em></span><span class="vnext-workspace-card-value"><b>${esc(value)}</b><span aria-hidden="true">›</span></span></button>`;
  }

  function workspaceMarkup(m) {
    const f = m.finance;
    const dataIssues = issueCounts(m).data;
    const latest = m.history.rows[0] || null;
    const costs = [
      ['广告花费', f.adSpend], ['COGS', f.cogs], ['退款销售', f.refundSales], ['仓储估算', f.storageEstimate], ['Settlement', f.settlement]
    ];
    return `${moduleHero('经营工作台', fmt.money(f.profit, 0), [['利润率', fmt.percent(f.profitMargin)], ['Amazon扣费', fmt.compactMoney(m.charges.total)], ['退货', fmt.number(m.returns.total)], ['数据异常', fmt.number(dataIssues)]])}
      <section class="vnext-module-section vnext-workspace-section"><header><span>Workspace</span><h2>经营支持</h2></header><div class="vnext-workspace-grid">
        ${workspaceCard('charges', 'AMAZON FEES', '扣费', fmt.compactMoney(m.charges.total), `${fmt.number(m.charges.rows.length)} 个费用项目`)}
        ${workspaceCard('returns', 'RETURNS', '退货与退款', `${fmt.number(m.returns.total)} 次`, `退款销售 ${fmt.compactMoney(m.returns.refundSales)}`)}
        ${workspaceCard('history', 'HISTORY', '月度历史', latest?.month || '—', latest ? `销售 ${fmt.compactMoney(latest.sales)} · 利润 ${fmt.compactMoney(latest.profit)}` : '暂无历史月份')}
        ${workspaceCard('data', 'DATA QUALITY', '数据质量', `${fmt.number(dataIssues)} 项需看`, `${fmt.number(m.data.quality.length)} 项检查 · ${fmt.number(m.data.imports.length)} 个批次`)}
      </div></section>
      <section class="vnext-module-section"><header><span>Finance</span><h2>利润与成本结构</h2></header><div class="vnext-finance-grid">${costs.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${fmt.compactMoney(value)}</strong><small>${f.sales ? fmt.percent(Math.abs(Number(value || 0)) / Math.abs(Number(f.sales || 1))) : '—'} / Sales</small></div>`).join('')}</div></section>`;
  }

  function workspaceChildBackMarkup() {
    return `<button type="button" class="vnext-workspace-back" data-workspace-back><span aria-hidden="true">‹</span><strong>返回工作台</strong></button>`;
  }

  function chargesMarkup(m) {
    const rows = [...m.charges.rows].sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0))).slice(0, 50);
    return `${moduleHero('Amazon 扣费净成本', fmt.money(m.charges.total, 0), [['费用项目', fmt.number(m.charges.rows.length)], ['源记录', fmt.number(sum(m.charges.rows, 'count'))], ['Top项目', rows[0]?.name || '—']])}
      <section class="vnext-module-section"><header><span>Charge matrix</span><h2>费用项目 <b>${rows.length}</b></h2></header><div class="vnext-dense-list">${rows.length ? rows.map(row => denseRecord({ type: 'charge', id: row.id, kicker: row.category || 'Amazon fee', title: row.name, subtitle: `${fmt.number(row.count)} 条 · ${row.source || 'Settlement'}`, value: fmt.money(row.amount, 0), metrics: [['Debit', fmt.compactMoney(row.debit)], ['Credit', fmt.compactMoney(row.credit)]] })).join('') : '<div class="vnext-density-empty">当前期间没有扣费记录</div>'}</div></section>`;
  }

  function returnsMarkup(m) {
    const rows = [...m.returns.rows].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 40);
    return `${moduleHero('退货总量', fmt.number(m.returns.total), [['退款销售额', fmt.compactMoney(m.returns.refundSales)], ['原因数', fmt.number(m.returns.rows.length)], ['Top原因', rows[0]?.reason || '—']])}
      <section class="vnext-module-section"><header><span>Return reasons</span><h2>退货原因 <b>${rows.length}</b></h2></header><div class="vnext-dense-list">${rows.length ? rows.map(row => denseRecord({ type: 'return', id: row.id, kicker: '退货原因', title: row.reason, subtitle: `占比 ${fmt.percent(row.share)}`, value: `${fmt.number(row.count)} 次`, metrics: [['退款', fmt.compactMoney(row.amount)]] })).join('') : '<div class="vnext-density-empty">当前期间没有原因级明细</div>'}</div></section>`;
  }

  function historyMarkup(m) {
    const rows = m.history.rows.slice(0, 18);
    return `${moduleHero('月度历史', `${fmt.number(rows.length)} 个月`, [['最新月份', rows[0]?.month || '—'], ['最新销售', rows[0] ? fmt.compactMoney(rows[0].sales) : '—'], ['最新利润', rows[0] ? fmt.compactMoney(rows[0].profit) : '—']])}
      <section class="vnext-module-section"><header><span>Month matrix</span><h2>经营时间轴</h2></header><div class="vnext-history-dense">${rows.length ? rows.map(row => `<button type="button" data-density-month="${esc(row.month)}"><span><strong>${esc(row.month)}</strong><small>Margin ${fmt.percent(row.profitMargin)}</small></span><span><b>${fmt.compactMoney(row.sales)}</b><small>利润 ${fmt.compactMoney(row.profit)} · ACOS ${fmt.percent(row.acos)}</small></span></button>`).join('') : '<div class="vnext-density-empty">暂无月度历史</div>'}</div></section>`;
  }

  function statusLabel(status) {
    const value = String(status || '').toUpperCase();
    if (['PASS', 'PASSED', 'COMPLETE', 'COMPLETED'].includes(value)) return '正常';
    if (['WARN', 'WARNING'].includes(value)) return '需关注';
    if (['FAIL', 'FAILED', 'ERROR'].includes(value)) return '异常';
    if (['RUNNING', 'PROCESSING', 'UPLOADING'].includes(value)) return '处理中';
    return status || '未知';
  }

  function dataMarkup(m) {
    const issues = m.data.quality.filter(row => ['WARN', 'WARNING', 'FAIL', 'FAILED', 'ERROR'].includes(String(row.status || '').toUpperCase())).length;
    const rows = m.data.quality.slice(0, 40);
    return `${moduleHero('数据质量', `${fmt.number(issues)} 项需看`, [['检查项', fmt.number(m.data.quality.length)], ['批次', fmt.number(m.data.imports.length)], ['同步', m.runtimeState?.mode === 'live' ? 'Live' : 'Preview']])}
      <section class="vnext-module-section"><header><span>Quality</span><h2>数据质量 <b>${rows.length}</b></h2></header><div class="vnext-dense-list">${rows.length ? rows.map(row => denseRecord({ type: 'quality', id: row.id, kicker: row.source || '数据检查', title: row.name, subtitle: row.message || statusLabel(row.status), value: statusLabel(row.status), risk: ['FAIL', 'FAILED', 'ERROR'].includes(String(row.status || '').toUpperCase()) ? 'critical' : ['WARN', 'WARNING'].includes(String(row.status || '').toUpperCase()) ? 'warning' : '' })).join('') : '<div class="vnext-density-empty">暂无质量检查结果</div>'}</div></section>
      <section class="vnext-module-section"><header><span>Imports</span><h2>最近数据批次</h2></header><div class="vnext-import-dense">${m.data.imports.slice(0, 12).map(row => `<div><span><strong>${esc(row.month || '未标记月份')}</strong><small>${fmt.number(row.files)} 文件 · ${fmt.number(row.sources)} 数据源</small></span><b>${esc(statusLabel(row.status))}</b></div>`).join('') || '<div class="vnext-density-empty">暂无数据批次</div>'}</div></section>`;
  }

  function moduleMarkup(module, m) {
    if (module === 'ads') return adsMarkup(m);
    if (module === 'products') return productsMarkup(m);
    if (module === 'inventory') return inventoryMarkup(m);
    if (module === 'finance') return workspaceMarkup(m);
    if (module === 'charges') return `${workspaceChildBackMarkup()}${chargesMarkup(m)}`;
    if (module === 'returns') return `${workspaceChildBackMarkup()}${returnsMarkup(m)}`;
    if (module === 'history') return `${workspaceChildBackMarkup()}${historyMarkup(m)}`;
    if (module === 'data') return `${workspaceChildBackMarkup()}${dataMarkup(m)}`;
    return '';
  }

  function detailFromRecord(type, id, m) {
    if (type === 'campaign') {
      const item = m.ads.campaigns.find(row => String(row.id) === String(id));
      return item ? { type: 'campaign', title: item.campaign, item } : null;
    }
    if (type === 'product') {
      const item = m.products.products.find(row => String(row.id) === String(id));
      return item ? { type: 'product', title: item.sku === '—' ? item.asin : item.sku, item } : null;
    }
    if (type === 'inventory') {
      const item = m.inventory.inventory.find(row => String(row.id) === String(id));
      return item ? { type: 'inventory', title: item.sku === '—' ? item.asin : item.sku, item } : null;
    }
    if (type === 'charge') {
      const item = m.charges.rows.find(row => String(row.id) === String(id));
      return item ? { type: 'charge', title: item.name, item } : null;
    }
    if (type === 'return') {
      const item = m.returns.rows.find(row => String(row.id) === String(id));
      return item ? { type: 'return', title: item.reason, item } : null;
    }
    if (type === 'quality') {
      const item = m.data.quality.find(row => String(row.id) === String(id));
      return item ? { type: 'quality', title: item.name, item } : null;
    }
    return null;
  }

  function metricDetail(key, m) {
    const s = m.overview.summary;
    if (key === 'sales') return { type: 'metric', title: '销售额', value: fmt.money(s.sales, 2), rows: [['销量', fmt.number(s.units)], ['Sessions', fmt.number(s.sessions)], ['CVR', fmt.percent(s.cvr)]] };
    if (key === 'profit') return { type: 'metric', title: '贡献利润', value: fmt.money(s.profit, 2), rows: [['利润率', fmt.percent(s.profitMargin)], ['销售额', fmt.money(s.sales, 0)], ['广告花费', fmt.money(s.adSpend, 0)]] };
    if (key === 'acos') return { type: 'metric', title: 'ACOS', value: fmt.percent(s.acos), rows: [['广告花费', fmt.money(s.adSpend, 0)], ['广告销售', fmt.money(s.adSales, 0)], ['TACOS', fmt.percent(s.tacos)]] };
    if (key === 'cvr') return { type: 'metric', title: '转化率 CVR', value: fmt.percent(s.cvr), rows: [['Sessions', fmt.number(s.sessions)], ['销量', fmt.number(s.units)]] };
    if (key === 'adSpend') return { type: 'metric', title: '广告花费', value: fmt.money(s.adSpend, 2), rows: [['广告销售', fmt.money(s.adSales, 0)], ['ACOS', fmt.percent(s.acos)], ['TACOS', fmt.percent(s.tacos)]] };
    if (key === 'inventory') return { type: 'metric', title: '库存资金', value: fmt.money(s.inventoryValue, 2), rows: [['可售库存', fmt.number(s.fulfillableUnits)], ['不可售', fmt.number(m.inventory.totals.unsellable)], ['快照', m.inventory.snapshotDate || '—']] };
    if (key === 'refund') return { type: 'metric', title: '退款销售额', value: fmt.money(s.refundSales, 2), rows: [['退货量', fmt.number(s.returns)], ['销售额', fmt.money(s.sales, 0)]] };
    return null;
  }

  function removeDensityHistoryKey() {
    const next = { ...(history.state || {}) };
    delete next[HISTORY_KEY];
    history.replaceState(next, document.title);
  }

  function settleModuleAtTop() {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, 0)));
  }

  function setModule(module, { push = true } = {}) {
    if (!BUSINESS_MODULES.has(module)) return;
    state.module = module;
    const next = { ...(history.state || {}), [HISTORY_KEY]: module };
    if (push) history.pushState(next, document.title);
    else history.replaceState(next, document.title);
    applyEnhancements(true);
    settleModuleAtTop();
  }

  function clearModule() {
    if (!state.module) return;
    state.module = null;
    state.workspaceFocus = null;
    removeDensityHistoryKey();
  }

  function restoreSortFocus(module, sort) {
    requestAnimationFrame(() => {
      const replacement = root.querySelector(`.vnext-density-module-page[data-density-module="${module}"] [data-density-sort-module="${module}"][data-density-sort="${sort}"]`);
      if (!replacement?.isConnected) return;
      try { replacement.focus({ preventScroll: true }); }
      catch { replacement.focus(); }
    });
  }

  function restoreWorkspaceFocus(module = state.workspaceFocus) {
    if (!module) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const replacement = root.querySelector(`.vnext-density-module-page[data-density-module="finance"] [data-workspace-module="${module}"]`);
      if (!replacement?.isConnected) return;
      try { replacement.focus({ preventScroll: true }); }
      catch { replacement.focus(); }
    }));
  }

  function returnToWorkspace() {
    const origin = state.workspaceFocus;
    setModule('finance', { push: false });
    if (origin) restoreWorkspaceFocus(origin);
  }

  function applyEnhancements(force = false) {
    if (state.applying || !media.matches || !document.body.classList.contains('mobile-vnext-active')) return;
    const app = root.querySelector('.vnext-app');
    if (!app) return;
    state.applying = true;
    try {
      const m = models();
      let rail = root.querySelector('.vnext-module-rail');
      const toolbar = root.querySelector('.vnext-toolbar, .vnext-search-toolbar');
      if (!rail && toolbar) {
        toolbar.insertAdjacentHTML('afterend', railMarkup(m));
        rail = root.querySelector('.vnext-module-rail');
      } else if (rail && force) {
        rail.outerHTML = railMarkup(m);
      }

      const existingPage = root.querySelector('.vnext-density-module-page');
      const basePages = [...root.querySelectorAll('.vnext-main[data-vnext-page]')];
      if (state.module && BUSINESS_MODULES.has(state.module)) {
        basePages.forEach(page => page.classList.add('vnext-density-base-hidden'));
        if (!existingPage || existingPage.dataset.densityModule !== state.module || force) {
          existingPage?.remove();
          const currentRail = root.querySelector('.vnext-module-rail');
          currentRail?.insertAdjacentHTML('afterend', `<main class="vnext-main vnext-density-module-page" data-density-module="${esc(state.module)}">${moduleMarkup(state.module, m)}</main>`);
        }
      } else {
        basePages.forEach(page => page.classList.remove('vnext-density-base-hidden'));
        existingPage?.remove();
        const today = root.querySelector('[data-vnext-page="today"]');
        if (today && !today.querySelector('.vnext-density-board')) {
          const brief = today.querySelector('.vnext-brief');
          if (brief) brief.insertAdjacentHTML('afterend', denseBoardMarkup(m));
        } else if (today && force) {
          today.querySelector('.vnext-density-board')?.remove();
          today.querySelector('.vnext-brief')?.insertAdjacentHTML('afterend', denseBoardMarkup(m));
        }
      }
    } finally {
      state.applying = false;
    }
  }

  root.addEventListener('click', event => {
    const bottomTab = event.target.closest('[data-vnext-tab]');
    if (bottomTab && state.module) {
      state.module = null;
      state.workspaceFocus = null;
      removeDensityHistoryKey();
      return;
    }

    const workspaceBack = event.target.closest('[data-workspace-back]');
    if (workspaceBack) {
      event.preventDefault();
      returnToWorkspace();
      return;
    }

    const workspaceModule = event.target.closest('[data-workspace-module]')?.dataset.workspaceModule;
    if (WORKSPACE_CHILD_MODULES.has(workspaceModule)) {
      event.preventDefault();
      state.workspaceFocus = workspaceModule;
      setModule(workspaceModule);
      return;
    }

    const moduleButton = event.target.closest('[data-vnext-module]');
    if (moduleButton) {
      const module = moduleButton.dataset.vnextModule;
      event.preventDefault();
      if (module === 'today' || module === 'alerts') {
        clearModule();
        window.YT_MOBILE_VNEXT?.navigate?.(module);
        applyEnhancements(true);
      } else {
        if (module !== 'finance') state.workspaceFocus = null;
        setModule(module);
      }
      return;
    }

    const filter = event.target.closest('[data-density-filter]');
    if (filter) {
      const module = filter.dataset.densityFilterModule;
      if (FILTERS[module]) {
        state.filters[module] = filter.dataset.densityFilter;
        applyEnhancements(true);
      }
      return;
    }

    const sortButton = event.target.closest('[data-density-sort]');
    if (sortButton) {
      const module = sortButton.dataset.densitySortModule;
      const sort = sortButton.dataset.densitySort;
      if (SORTS[module]?.some(([id]) => id === sort)) {
        const restoreFocus = event.detail === 0;
        state.sorts[module] = sort;
        applyEnhancements(true);
        if (restoreFocus) restoreSortFocus(module, sort);
      }
      return;
    }

    const record = event.target.closest('[data-density-detail-type]');
    if (record) {
      const detail = detailFromRecord(record.dataset.densityDetailType, record.dataset.densityDetailId, models());
      if (detail) root.dispatchEvent(new CustomEvent('vnext:navigate', { bubbles: true, detail: { destination: state.module || 'today', detail } }));
      return;
    }

    const metric = event.target.closest('[data-density-metric]');
    if (metric) {
      const detail = metricDetail(metric.dataset.densityMetric, models());
      if (detail) root.dispatchEvent(new CustomEvent('vnext:navigate', { bubbles: true, detail: { destination: 'today', detail } }));
      return;
    }

    const month = event.target.closest('[data-density-month]')?.dataset.densityMonth;
    if (month) {
      const from = runtime.helpers.monthStart(month);
      const to = runtime.helpers.monthEnd(month);
      runtime.setRange(from, to).then(() => {
        state.module = null;
        state.workspaceFocus = null;
        removeDensityHistoryKey();
        window.YT_MOBILE_VNEXT?.navigate?.('today');
        applyEnhancements(true);
      }).catch(() => null);
    }
  }, true);

  window.addEventListener('popstate', event => {
    const previous = state.module;
    const module = event.state?.[HISTORY_KEY];
    state.module = BUSINESS_MODULES.has(module) ? module : null;
    requestAnimationFrame(() => {
      applyEnhancements(true);
      if (state.module === 'finance' && WORKSPACE_CHILD_MODULES.has(previous) && state.workspaceFocus === previous) restoreWorkspaceFocus(previous);
    });
  });

  const observer = new MutationObserver(() => {
    if (state.applying) return;
    requestAnimationFrame(() => applyEnhancements(false));
  });
  observer.observe(root, { childList: true, subtree: true });

  runtime.subscribe(() => requestAnimationFrame(() => applyEnhancements(true)));
  media.addEventListener?.('change', () => requestAnimationFrame(() => applyEnhancements(true)));

  const initial = history.state?.[HISTORY_KEY];
  if (BUSINESS_MODULES.has(initial)) state.module = initial;
  requestAnimationFrame(() => applyEnhancements(true));

  window.YT_MOBILE_VNEXT_DENSITY = Object.freeze({
    openModule: module => setModule(module),
    getState: () => Object.freeze({ module: state.module, railModule: railModuleFor(state.module), filters: { ...state.filters }, sorts: { ...state.sorts } })
  });
})();
