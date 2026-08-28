(() => {
  'use strict';

  const engine = window.YT_ENGINE;
  const normalizer = window.YT_NORMALIZER;
  const fileInput = document.getElementById('importFiles');
  const monthInput = document.getElementById('importMonth');
  const validateButton = document.getElementById('validateBtn');
  const statusBox = document.getElementById('importPeriodStatus');
  if (!engine || !normalizer || !fileInput || !monthInput || !validateButton || !statusBox) return;
  if (window.YT_MASTER_DATA_IMPORT_PERIOD?.version === 1) return;

  const MASTER_ROLES = new Set(['cost', 'product']);
  const ROLE_LABELS = normalizer.ROLE_LABELS || {};
  let generation = 0;
  let masterOnly = false;
  let activeRoles = [];
  let auditMonth = '';

  function pacificMonth() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(new Date());
    const year = parts.find(part => part.type === 'year')?.value || String(new Date().getFullYear());
    const month = parts.find(part => part.type === 'month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  function formatMonth(month) {
    const [year, value] = String(month || '').split('-');
    return year && value ? `${year}年${Number(value)}月` : month;
  }

  function labelsFor(roles) {
    return [...new Set(roles)].map(role => ROLE_LABELS[role] || role).join('、');
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function applyMasterState() {
    if (!masterOnly || !auditMonth) return;
    const valueNode = statusBox.querySelector('#importPeriodValue');
    const detailNode = statusBox.querySelector('#importPeriodDetail');
    const labels = labelsFor(activeRoles) || '主数据';
    if (monthInput.value !== auditMonth) monthInput.value = auditMonth;
    if (monthInput.dataset.periodMode !== 'master') monthInput.dataset.periodMode = 'master';
    if (statusBox.dataset.state !== 'ready') statusBox.dataset.state = 'ready';
    if (statusBox.dataset.periodMode !== 'master') statusBox.dataset.periodMode = 'master';
    setText(valueNode, '主数据导入');
    setText(
      detailNode,
      `${labels}属于长期主数据，不要求报告月份。本次仅以 ${formatMonth(auditMonth)} 作为导入批次的内部审计归档月份；不会因此生成该月份的业务月报数据。`
    );
    if (validateButton.disabled) validateButton.disabled = false;
  }

  function clearMasterState() {
    masterOnly = false;
    activeRoles = [];
    auditMonth = '';
    delete monthInput.dataset.periodMode;
    delete statusBox.dataset.periodMode;
  }

  async function detectMasterOnly(files) {
    const run = ++generation;
    clearMasterState();
    const selected = [...(files || [])].filter(file => /\.(csv|xlsx)$/i.test(file.name));
    if (!selected.length) return;

    const roles = [];
    for (const file of selected) {
      try {
        const parsed = await engine.parseFile(file);
        if (run !== generation) return;
        const role = engine.detectRole(file.name, parsed);
        if (!role) return;
        roles.push(role);
      } catch {
        return;
      }
    }

    if (run !== generation || !roles.length || !roles.every(role => MASTER_ROLES.has(role))) return;
    masterOnly = true;
    activeRoles = roles;
    auditMonth = pacificMonth();
    applyMasterState();
  }

  fileInput.addEventListener('change', event => detectMasterOnly(event.target.files || []));
  document.getElementById('dropzone')?.addEventListener('drop', event => detectMasterOnly(event.dataTransfer?.files || []));

  const observer = new MutationObserver(() => applyMasterState());
  observer.observe(statusBox, { childList: true, subtree: true, characterData: true });

  window.YT_MASTER_DATA_IMPORT_PERIOD = Object.freeze({
    version: 1,
    isMasterOnly: () => masterOnly,
    getState: () => ({ masterOnly, roles: [...activeRoles], auditMonth })
  });
})();
