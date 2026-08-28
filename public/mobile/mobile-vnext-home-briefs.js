(() => {
  'use strict';

  const root = document.getElementById('mobileAppRoot');
  const runtime = window.YT_SHARED_RUNTIME;
  const selectors = window.YT_SHARED_SELECTORS;
  const secondary = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;
  if (!root || !runtime || !selectors || !secondary || !fmt) return;

  const media = window.matchMedia('(max-width: 860px)');
  let applying = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);

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
    const ads = m.ads.campaigns.filter(row => (row.acos != null && Number(row.acos) > .45) || (Number(row.orders) === 0 && Number(row.spend || 0) > 0)).length;
    const products = m.products.products.filter(row => (row.buyBox != null && Number(row.buyBox) < .90) || (row.units != null && Number(row.units) <= 1)).length;
    const inventory = m.inventory.inventory.filter(row => (row.fulfillable != null && Number(row.fulfillable) <= 20) || (row.unsellable != null && Number(row.unsellable) > 0)).length;
    const data = m.data.quality.filter(row => ['WARN', 'WARNING', 'FAIL', 'FAILED', 'ERROR'].includes(String(row.status || '').toUpperCase())).length;
    return { ads, products, inventory, data, total: ads + products + inventory + data };
  }

  function statusLabel(status) {
    const value = String(status || '').toUpperCase();
    if (['PASS', 'PASSED', 'COMPLETE', 'COMPLETED'].includes(value)) return '正常';
    if (['WARN', 'WARNING'].includes(value)) return '需关注';
    if (['FAIL', 'FAILED', 'ERROR'].includes(value)) return '异常';
    if (['RUNNING', 'PROCESSING', 'UPLOADING'].includes(value)) return '处理中';
    return status || '未知';
  }

  function factsMarkup(facts) {
    return `<div class="vnext-home-brief-facts">${facts.map(([label, value, tone = '']) => `<span class="${tone ? `tone-${tone}` : ''}"><small>${esc(label)}</small><b>${esc(value)}</b></span>`).join('')}</div>`;
  }

  function briefShell(module, eyebrow, title, value, facts, body = '', note = '') {
    return `<section class="vnext-home-brief" data-home-brief-module="${esc(module)}">
      <header class="vnext-home-brief-head">
        <div><span>${esc(eyebrow)}</span><h2>${esc(title)}</h2>${note ? `<p>${esc(note)}</p>` : ''}</div>
        <button type="button" data-vnext-module="${esc(module)}" aria-label="打开${esc(title)}完整模块">完整模块 <b>›</b></button>
      </header>
      <div class="vnext-home-brief-primary"><strong>${esc(value)}</strong>${factsMarkup(facts)}</div>
      ${body}
    </section>`;
  }

  function record({ type, id, kicker, title, subtitle = '', value, metrics = [], risk = '' }) {
    return `<button type="button" class="vnext-dense-record ${risk ? `risk-${risk}` : ''}" data-density-detail-type="${esc(type)}" data-density-detail-id="${esc(id)}">
      <span class="vnext-dense-record-copy"><small>${esc(kicker)}</small><strong>${esc(title)}</strong>${subtitle ? `<em>${esc(subtitle)}</em>` : ''}</span>
      <span class="vnext-dense-record-value"><b>${esc(value)}</b>${metrics.map(([label, val]) => `<small>${esc(label)} ${esc(val)}</small>`).join('')}</span>
    </button>`;
  }

  function alertBrief(m) {
    const issues = issueCounts(m);
    const refundShare = Number(m.overview.summary.sales) ? Math.abs(Number(m.overview.summary.refundSales || 0)) / Math.abs(Number(m.overview.summary.sales || 1)) : null;
    const body = `<div class="vnext-home-risk-grid">
      <button type="button" data-vnext-module="ads"><span>广告</span><b>${fmt.number(issues.ads)}</b><small>高 ACOS / 无订单</small></button>
      <button type="button" data-vnext-module="products"><span>商品</span><b>${fmt.number(issues.products)}</b><small>Buy Box / 低动销</small></button>
      <button type="button" data-vnext-module="inventory"><span>库存</span><b>${fmt.number(issues.inventory)}</b><small>低库存 / 不可售</small></button>
      <button type="button" data-vnext-module="data"><span>数据</span><b>${fmt.number(issues.data)}</b><small>质量检查异常</small></button>
    </div>`;
    return briefShell('alerts', 'ALERTS', '异常简报', `${fmt.number(issues.total)} 个经营信号`, [
      ['退款率', fmt.percent(refundShare), refundShare != null && refundShare > .08 ? 'critical' : refundShare != null && refundShare > .04 ? 'warning' : ''],
      ['不可售', fmt.number(m.inventory.totals.unsellable), Number(m.inventory.totals.unsellable || 0) > 0 ? 'warning' : ''],
      ['数据异常', fmt.number(issues.data), issues.data ? 'warning' : '']
    ], body, '先把跨模块风险集中看完，再进入单模块处理');
  }

  function adsBrief(m) {
    const model = m.ads;
    const risk = model.campaigns.filter(row => row.acos != null && Number(row.acos) > .45).length;
    const zero = model.campaigns.filter(row => Number(row.orders) === 0 && Number(row.spend || 0) > 0).length;
    const rows = [...model.campaigns].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)).slice(0, 3);
    const body = `<div class="vnext-dense-list vnext-home-mini-list">${rows.length ? rows.map(row => record({
      type: 'campaign', id: row.id, kicker: row.portfolio || 'Campaign', title: row.campaign,
      subtitle: `订单 ${fmt.number(row.orders)} · CVR ${fmt.percent(row.cvr)}`,
      value: fmt.money(row.spend, 0), metrics: [['ACOS', fmt.percent(row.acos)], ['销售', fmt.compactMoney(row.sales)]],
      risk: row.acos != null && Number(row.acos) > .60 ? 'critical' : row.acos != null && Number(row.acos) > .45 ? 'warning' : ''
    })).join('') : '<div class="vnext-density-empty">当前期间没有 Campaign</div>'}</div>`;
    return briefShell('ads', 'ADS', '广告简报', fmt.compactMoney(model.totals.spend), [
      ['广告销售', fmt.compactMoney(model.totals.sales)], ['ACOS', fmt.percent(model.totals.acos), Number(model.totals.acos || 0) > .45 ? 'warning' : ''],
      ['风险活动', fmt.number(risk), risk ? 'warning' : ''], ['无订单', fmt.number(zero), zero ? 'warning' : '']
    ], body, 'Top Campaign 按花费排序');
  }

  function productsBrief(m) {
    const model = m.products;
    const buyBoxRisk = model.products.filter(row => row.buyBox != null && Number(row.buyBox) < .90).length;
    const lowVelocity = model.products.filter(row => row.units != null && Number(row.units) <= 1).length;
    const rows = [...model.products].sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0)).slice(0, 3);
    const body = `<div class="vnext-dense-list vnext-home-mini-list">${rows.length ? rows.map(row => record({
      type: 'product', id: row.id, kicker: row.model || row.asin || 'SKU', title: row.sku === '—' ? row.asin : row.sku,
      subtitle: `${row.asin || ''} · ${fmt.number(row.sessions)} Sessions`, value: fmt.compactMoney(row.sales),
      metrics: [['CVR', fmt.percent(row.cvr)], ['Buy Box', fmt.percent(row.buyBox)]], risk: row.buyBox != null && Number(row.buyBox) < .90 ? 'warning' : ''
    })).join('') : '<div class="vnext-density-empty">当前期间没有 SKU</div>'}</div>`;
    return briefShell('products', 'PRODUCTS', '商品简报', fmt.compactMoney(model.totals.sales), [
      ['销量', fmt.number(model.totals.units)], ['Sessions', fmt.number(model.totals.sessions)], ['CVR', fmt.percent(model.totals.cvr)],
      ['Buy Box风险', fmt.number(buyBoxRisk), buyBoxRisk ? 'warning' : ''], ['低动销', fmt.number(lowVelocity), lowVelocity ? 'warning' : '']
    ], body, 'Top SKU 按销售额排序');
  }

  function inventoryBrief(m) {
    const model = m.inventory;
    const low = model.inventory.filter(row => row.fulfillable != null && Number(row.fulfillable) <= 20).length;
    const unsellable = model.inventory.filter(row => row.unsellable != null && Number(row.unsellable) > 0).length;
    const rows = [...model.inventory].sort((a, b) => {
      const riskA = Number(a.unsellable || 0) > 0 ? 2 : Number(a.fulfillable) <= 20 ? 1 : 0;
      const riskB = Number(b.unsellable || 0) > 0 ? 2 : Number(b.fulfillable) <= 20 ? 1 : 0;
      return riskB - riskA || Number(a.fulfillable ?? 999999) - Number(b.fulfillable ?? 999999);
    }).slice(0, 3);
    const body = `<div class="vnext-dense-list vnext-home-mini-list">${rows.length ? rows.map(row => record({
      type: 'inventory', id: row.id, kicker: row.model || row.asin || 'SKU', title: row.sku === '—' ? row.asin : row.sku,
      subtitle: `${fmt.number(row.total)} 总库存 · ${fmt.number(row.inbound)} 在途`, value: `${fmt.number(row.fulfillable)} 可售`,
      metrics: [['不可售', fmt.number(row.unsellable)], ['资金', fmt.compactMoney(row.inventoryValue)]],
      risk: Number(row.unsellable || 0) > 0 ? 'warning' : row.fulfillable != null && Number(row.fulfillable) <= 10 ? 'critical' : row.fulfillable != null && Number(row.fulfillable) <= 20 ? 'warning' : ''
    })).join('') : '<div class="vnext-density-empty">当前期间没有库存记录</div>'}</div>`;
    return briefShell('inventory', 'INVENTORY', '库存简报', fmt.compactMoney(model.totals.inventoryValue), [
      ['可售', fmt.number(model.totals.fulfillable)], ['在途', fmt.number(model.totals.inbound)], ['不可售', fmt.number(model.totals.unsellable), unsellable ? 'warning' : ''],
      ['低库存SKU', fmt.number(low), low ? 'warning' : ''], ['快照', model.snapshotDate || '—']
    ], body, '优先展示不可售与低库存 SKU');
  }

  function financeBrief(m) {
    const f = m.finance;
    const costRows = [
      ['广告花费', f.adSpend], ['COGS', f.cogs], ['退款销售', f.refundSales], ['仓储估算', f.storageEstimate], ['Settlement', f.settlement], ['Amazon扣费', m.charges.total]
    ];
    const body = `<div class="vnext-home-cost-grid">${costRows.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${fmt.compactMoney(value)}</strong><small>${f.sales ? `${fmt.percent(Math.abs(Number(value || 0)) / Math.abs(Number(f.sales || 1)))} / Sales` : '—'}</small></div>`).join('')}</div>`;
    return briefShell('finance', 'FINANCE', '利润简报', fmt.money(f.profit, 0), [
      ['利润率', fmt.percent(f.profitMargin), Number(f.profitMargin || 0) < .1 ? 'warning' : ''], ['销售额', fmt.compactMoney(f.sales)],
      ['广告花费', fmt.compactMoney(f.adSpend)], ['退款销售', fmt.compactMoney(f.refundSales)]
    ], body, '把利润和主要成本项同时放在首页');
  }

  function chargesBrief(m) {
    const rows = [...m.charges.rows].sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0))).slice(0, 3);
    const body = `<div class="vnext-dense-list vnext-home-mini-list">${rows.length ? rows.map(row => record({
      type: 'charge', id: row.id, kicker: row.category || 'Amazon fee', title: row.name,
      subtitle: `${fmt.number(row.count)} 条 · ${row.source || 'Settlement'}`, value: fmt.money(row.amount, 0), metrics: [['Debit', fmt.compactMoney(row.debit)], ['Credit', fmt.compactMoney(row.credit)]]
    })).join('') : '<div class="vnext-density-empty">当前期间没有扣费记录</div>'}</div>`;
    return briefShell('charges', 'CHARGES', '扣费简报', fmt.money(m.charges.total, 0), [
      ['费用项目', fmt.number(m.charges.rows.length)], ['源记录', fmt.number(sum(m.charges.rows, 'count'))], ['Top项目', rows[0]?.name || '—']
    ], body, 'Top 费用按绝对金额排序');
  }

  function returnsBrief(m) {
    const rows = [...m.returns.rows].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 3);
    const refundShare = Number(m.overview.summary.sales) ? Math.abs(Number(m.returns.refundSales || 0)) / Math.abs(Number(m.overview.summary.sales || 1)) : null;
    const body = `<div class="vnext-dense-list vnext-home-mini-list">${rows.length ? rows.map(row => record({
      type: 'return', id: row.id, kicker: '退货原因', title: row.reason, subtitle: `占比 ${fmt.percent(row.share)}`,
      value: `${fmt.number(row.count)} 次`, metrics: [['退款', fmt.compactMoney(row.amount)]]
    })).join('') : '<div class="vnext-density-empty">当前期间没有原因级明细</div>'}</div>`;
    return briefShell('returns', 'RETURNS', '退货简报', `${fmt.number(m.returns.total)} 次`, [
      ['退款销售', fmt.compactMoney(m.returns.refundSales)], ['退款率', fmt.percent(refundShare), refundShare != null && refundShare > .08 ? 'critical' : refundShare != null && refundShare > .04 ? 'warning' : ''],
      ['原因数', fmt.number(m.returns.rows.length)], ['Top原因', rows[0]?.reason || '—']
    ], body, 'Top 退货原因直接展示');
  }

  function historyBrief(m) {
    const rows = m.history.rows.slice(0, 5);
    const body = `<div class="vnext-history-dense vnext-home-history">${rows.length ? rows.map(row => `<button type="button" data-density-month="${esc(row.month)}"><span><strong>${esc(row.month)}</strong><small>Margin ${fmt.percent(row.profitMargin)}</small></span><span><b>${fmt.compactMoney(row.sales)}</b><small>利润 ${fmt.compactMoney(row.profit)} · ACOS ${fmt.percent(row.acos)}</small></span></button>`).join('') : '<div class="vnext-density-empty">暂无月度历史</div>'}</div>`;
    return briefShell('history', 'HISTORY', '历史简报', `${fmt.number(rows.length)} 个最近月份`, [
      ['最新月份', rows[0]?.month || '—'], ['最新销售', rows[0] ? fmt.compactMoney(rows[0].sales) : '—'], ['最新利润', rows[0] ? fmt.compactMoney(rows[0].profit) : '—'], ['最新ACOS', rows[0] ? fmt.percent(rows[0].acos) : '—']
    ], body, '点击月份可直接切换当前经营期间');
  }

  function dataBrief(m) {
    const issueRows = m.data.quality.filter(row => ['WARN', 'WARNING', 'FAIL', 'FAILED', 'ERROR'].includes(String(row.status || '').toUpperCase()));
    const rows = (issueRows.length ? issueRows : m.data.quality).slice(0, 3);
    const latestImport = m.data.imports[0];
    const body = `<div class="vnext-dense-list vnext-home-mini-list">${rows.length ? rows.map(row => record({
      type: 'quality', id: row.id, kicker: row.source || '数据检查', title: row.name,
      subtitle: row.message || statusLabel(row.status), value: statusLabel(row.status),
      risk: ['FAIL', 'FAILED', 'ERROR'].includes(String(row.status || '').toUpperCase()) ? 'critical' : ['WARN', 'WARNING'].includes(String(row.status || '').toUpperCase()) ? 'warning' : ''
    })).join('') : '<div class="vnext-density-empty">暂无质量检查结果</div>'}</div>`;
    return briefShell('data', 'DATA', '数据简报', `${fmt.number(issueRows.length)} 项需看`, [
      ['检查项', fmt.number(m.data.quality.length)], ['数据批次', fmt.number(m.data.imports.length)], ['同步', m.runtimeState?.mode === 'live' ? 'Live' : 'Preview'],
      ['最近批次', latestImport ? `${latestImport.month || '—'} · ${statusLabel(latestImport.status)}` : '—']
    ], body, '异常质量检查优先展示');
  }

  function homeBriefsMarkup(m) {
    return `<section class="vnext-home-all-modules" aria-label="全业务简报">
      <header class="vnext-home-all-head"><span>FULL BUSINESS BRIEF</span><h2>全业务简报</h2><p>首页直接看完全部经营模块；需要深挖时再进入完整模块。</p></header>
      ${alertBrief(m)}
      ${adsBrief(m)}
      ${productsBrief(m)}
      ${inventoryBrief(m)}
      ${financeBrief(m)}
      ${chargesBrief(m)}
      ${returnsBrief(m)}
      ${historyBrief(m)}
      ${dataBrief(m)}
    </section>`;
  }

  function render(force = false) {
    if (applying || !media.matches || !document.body.classList.contains('mobile-vnext-active')) return;
    const today = root.querySelector('[data-vnext-page="today"]');
    if (!today || today.classList.contains('vnext-density-base-hidden')) return;
    applying = true;
    try {
      const existing = today.querySelector('.vnext-home-all-modules');
      if (existing && !force) return;
      existing?.remove();
      today.insertAdjacentHTML('beforeend', homeBriefsMarkup(models()));
    } finally {
      applying = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (applying) return;
    requestAnimationFrame(() => render(false));
  });
  observer.observe(root, { childList: true, subtree: true });

  runtime.subscribe(() => requestAnimationFrame(() => render(true)));
  media.addEventListener?.('change', () => requestAnimationFrame(() => render(true)));
  requestAnimationFrame(() => render(true));

  window.YT_MOBILE_VNEXT_HOME_BRIEFS = Object.freeze({ refresh: () => render(true) });
})();
