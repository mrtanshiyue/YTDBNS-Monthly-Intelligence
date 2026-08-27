(() => {
  'use strict';

  const value = (...candidates) => candidates.find(item => item != null && Number.isFinite(Number(item))) ?? null;
  const text = (...candidates) => candidates.find(item => item != null && String(item).trim()) ?? '';

  function financeModel(runtimeState) {
    const raw = runtimeState?.dashboard?.summary || {};
    const base = window.YT_SHARED_SELECTORS.normalizeSummary(raw);
    return Object.freeze({
      rangeLabel: runtimeState?.rangeLabel || '选择期间',
      sales: base.sales,
      profit: base.profit,
      profitMargin: base.profitMargin,
      adSpend: base.adSpend,
      refundSales: value(raw.refund_sales, raw.refundSales),
      cogs: value(raw.cogs),
      settlement: value(raw.settlement),
      storageEstimate: value(raw.storage_estimate, raw.storageEstimate),
      returns: base.returns
    });
  }

  function chargesModel(runtimeState) {
    const rows = runtimeState?.charges?.rows || runtimeState?.monthDetail?.charges || [];
    const normalized = rows.map((row, index) => ({
      id: text(row.id, row.name, `charge-${index}`),
      name: text(row.name, row.charge_name, '未命名扣费'),
      category: text(row.category, '其他'),
      source: text(row.source, row.source_field),
      debit: value(row.debit, row.gross_debit) ?? 0,
      credit: value(row.credit, row.credits) ?? 0,
      amount: value(row.amount, row.net_cost) ?? 0,
      count: value(row.count, row.row_count) ?? 0,
      share: value(row.share)
    })).sort((a, b) => b.amount - a.amount);
    const total = value(runtimeState?.charges?.total) ?? normalized.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return Object.freeze({ rows: normalized, total, rangeLabel: runtimeState?.rangeLabel || '选择期间' });
  }

  function returnsModel(runtimeState) {
    const rows = runtimeState?.monthDetail?.returns || [];
    const normalized = rows.map((row, index) => ({
      id: text(row.id, row.reason, row.reason_name, `return-${index}`),
      reason: text(row.reason, row.reason_name, row.return_reason, '未分类'),
      count: value(row.count, row.qty, row.quantity) ?? 0,
      share: value(row.share),
      amount: value(row.amount, row.refund_sales)
    })).sort((a, b) => b.count - a.count);
    return Object.freeze({
      rows: normalized,
      total: normalized.reduce((sum, row) => sum + Number(row.count || 0), 0),
      rangeLabel: runtimeState?.rangeLabel || '选择期间'
    });
  }

  function historyModel(runtimeState) {
    const rows = (runtimeState?.periods || []).map(row => {
      if (typeof row === 'string') return { month: row };
      const sales = value(row.business_sales, row.businessSales, row.sales);
      const adSpend = value(row.ad_spend, row.adSpend);
      const adSales = value(row.ad_sales, row.adSales);
      return {
        month: text(row.month),
        sales,
        profit: value(row.contribution_profit, row.contributionProfit, row.profit),
        profitMargin: value(row.profit_margin, row.profitMargin),
        adSpend,
        acos: value(row.acos, adSales && adSpend != null ? Number(adSpend) / Number(adSales) : null),
        status: text(row.model_status, row.batch_status, row.status)
      };
    }).filter(row => row.month).sort((a, b) => b.month.localeCompare(a.month));
    return Object.freeze({ rows });
  }

  function dataModel(runtimeState) {
    const quality = (runtimeState?.monthDetail?.quality || []).map((row, index) => ({
      id: text(row.id, row.check_name, row.name, `quality-${index}`),
      name: text(row.check_name, row.name, row.rule, '数据检查'),
      status: text(row.status, 'UNKNOWN').toUpperCase(),
      message: text(row.message, row.detail, row.notes),
      source: text(row.source, row.report_type)
    }));
    const imports = (runtimeState?.imports || []).map((row, index) => ({
      id: text(row.id, `import-${index}`),
      month: text(row.report_month, row.month),
      status: text(row.status, 'UNKNOWN').toUpperCase(),
      files: value(row.stored_files, row.file_count) ?? 0,
      sources: value(row.source_count) ?? 0,
      createdAt: text(row.created_at)
    }));
    return Object.freeze({ quality, imports, rangeLabel: runtimeState?.rangeLabel || '选择期间' });
  }

  window.YT_SHARED_SECONDARY_SELECTORS = Object.freeze({ financeModel, chargesModel, returnsModel, historyModel, dataModel });
})();
