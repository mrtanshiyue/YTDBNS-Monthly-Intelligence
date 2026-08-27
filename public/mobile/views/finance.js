(() => {
  'use strict';
  const registry = window.YT_MOBILE_VIEWS = window.YT_MOBILE_VIEWS || {};
  const selectors = window.YT_SHARED_SECONDARY_SELECTORS;
  const fmt = window.YT_SHARED_FORMATTERS;

  registry.finance = ({ runtimeState, esc }) => {
    const m = selectors.financeModel(runtimeState);
    return `
      <section class="v5-mobile-view v5-core-view" data-mobile-view="finance" aria-labelledby="v5MobileViewTitle">
        <div class="v5-mobile-view-heading">
          <div><span class="v5-mobile-eyebrow">FINANCE</span><h1 id="v5MobileViewTitle">利润</h1><p>先看贡献利润，再拆解主要成本</p></div>
          <button class="v5-mobile-period-trigger" type="button" data-mobile-action="period"><span>${esc(m.rangeLabel)}</span><i>›</i></button>
        </div>
        <section class="v5-secondary-hero" aria-label="贡献利润">
          <span>贡献利润</span><strong>${fmt.money(m.profit, 0)}</strong>
          <div><small>利润率 ${fmt.percent(m.profitMargin)}</small><small>销售额 ${fmt.compactMoney(m.sales)}</small></div>
        </section>
        <section class="v5-core-stat-grid" aria-label="利润拆解">
          <div class="v5-core-stat"><span>广告花费</span><strong>${fmt.compactMoney(m.adSpend)}</strong><small>Advertising</small></div>
          <div class="v5-core-stat"><span>COGS</span><strong>${fmt.compactMoney(m.cogs)}</strong><small>采购成本</small></div>
          <div class="v5-core-stat"><span>退款销售</span><strong>${fmt.compactMoney(m.refundSales)}</strong><small>Refund Sales</small></div>
          <div class="v5-core-stat"><span>Settlement</span><strong>${fmt.compactMoney(m.settlement)}</strong><small>结算口径</small></div>
        </section>
        <section class="v5-core-section">
          <div class="v5-core-section-head"><div><span>COST CONTROL</span><h2>成本关注</h2></div><small>经营优先级</small></div>
          <div class="v5-secondary-list">
            <div class="v5-secondary-row"><div class="v5-secondary-row-copy"><span>STORAGE</span><b>仓储成本估算</b><small>关注库存结构与长期仓储风险</small></div><div class="v5-secondary-row-value"><b>${fmt.money(m.storageEstimate, 0)}</b><small>Estimate</small></div></div>
            <button class="v5-secondary-row" type="button" data-mobile-route="charges"><div class="v5-secondary-row-copy"><span>AMAZON FEES</span><b>查看扣费明细</b><small>拆分费用名称、类别、净成本</small></div><div class="v5-secondary-row-value"><b>进入</b><small>›</small></div></button>
          </div>
        </section>
      </section>`;
  };
})();
