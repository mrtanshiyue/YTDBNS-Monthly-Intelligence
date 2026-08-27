(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const desktop = window.matchMedia('(min-width: 861px)');
  const body = document.body;

  document.documentElement.dataset.uiVersion = '5.0';
  body.dataset.uiGeneration = 'v5';

  /* Historical CSS layers are compatibility foundations, not active runtime versions. */
  ['studio-v48','studio-v49','studio-v50','studio-v51','studio-v52','studio-v53'].forEach(name => body.classList.add(name));

  const FIT_RULES = [
    ['.executive-card.primary .executive-value', 32],
    ['.executive-value', 30],
    ['.metric-value', 25],
    ['.charge-hero-main>strong', 34],
    ['.charge-detail-number strong', 30],
    ['.charge-total-pill b', 23]
  ];

  function fitText(element, minimum) {
    if (!desktop.matches || !element?.isConnected) return;
    element.style.removeProperty('font-size');
    const width = element.clientWidth;
    if (!width || element.scrollWidth <= width + 1) return;
    const base = parseFloat(getComputedStyle(element).fontSize) || 36;
    const ratio = Math.max(.56, (width / element.scrollWidth) * .96);
    element.style.setProperty('font-size', `${Math.max(minimum, Math.floor(base * ratio * 10) / 10)}px`, 'important');
  }

  function fitDesktopNumerals() {
    if (!desktop.matches) {
      FIT_RULES.forEach(([selector]) => $$(selector).forEach(element => element.style.removeProperty('font-size')));
      return;
    }
    FIT_RULES.forEach(([selector, minimum]) => $$(selector).forEach(element => fitText(element, minimum)));
  }

  function ensureViewNote() {
    const popover = $('#viewPopover');
    if (!popover) return;
    let note = $('.v48-visual-note', popover);
    if (!note) {
      note = document.createElement('div');
      note.className = 'v48-visual-note';
      note.innerHTML = '<span>阅读优化</span><small>数字自适应 · 高可读表格 · 温和语义色</small>';
      popover.appendChild(note);
      return;
    }
    const title = $('span', note);
    const detail = $('small', note);
    if (title) title.textContent = '阅读优化';
    if (detail) detail.textContent = '数字自适应 · 高可读表格 · 温和语义色';
  }

  function syncTopNavigation() {
    const nav = $('#mainNav');
    if (!nav) return;
    const items = $$('.nav-item', nav);
    items.forEach(button => {
      const active = button.classList.contains('active');
      button.setAttribute('aria-current', active ? 'page' : 'false');
      button.tabIndex = active ? 0 : -1;
    });

    if (!nav.dataset.currentUiKeys) {
      nav.dataset.currentUiKeys = '1';
      nav.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const buttons = $$('.nav-item:not(:disabled)', nav);
        if (!buttons.length) return;
        let index = Math.max(0, buttons.indexOf(document.activeElement));
        if (event.key === 'ArrowRight') index = (index + 1) % buttons.length;
        if (event.key === 'ArrowLeft') index = (index - 1 + buttons.length) % buttons.length;
        if (event.key === 'Home') index = 0;
        if (event.key === 'End') index = buttons.length - 1;
        buttons[index].tabIndex = 0;
        buttons[index].focus({ preventScroll: true });
        event.preventDefault();
      });
    }
  }

  const GROUPS = [
    ['.v43-tabs', true],
    ['.period-tabs', true],
    ['.charge-project-tabs', true],
    ['.quick-range', false],
    ['.studio-mode-switch', false]
  ];

  function syncGroup(group, isTabs) {
    const buttons = $$(':scope > button', group);
    if (!buttons.length) return;
    if (isTabs) group.setAttribute('role', 'tablist');
    buttons.forEach((button, index) => {
      const active = button.classList.contains('active');
      if (isTabs) {
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      } else if (!buttons.some(item => item === document.activeElement)) {
        button.tabIndex = active || (!buttons.some(item => item.classList.contains('active')) && index === 0) ? 0 : -1;
      }
    });

    if (!group.dataset.currentUiKeys) {
      group.dataset.currentUiKeys = '1';
      group.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const enabled = $$(':scope > button:not(:disabled)', group);
        if (!enabled.length) return;
        let index = Math.max(0, enabled.indexOf(document.activeElement));
        if (event.key === 'ArrowRight') index = (index + 1) % enabled.length;
        if (event.key === 'ArrowLeft') index = (index - 1 + enabled.length) % enabled.length;
        if (event.key === 'Home') index = 0;
        if (event.key === 'End') index = enabled.length - 1;
        enabled[index].tabIndex = 0;
        enabled[index].focus();
        enabled[index].click();
        event.preventDefault();
      });
    }
  }

  function syncGroups() {
    GROUPS.forEach(([selector, isTabs]) => $$(selector).forEach(group => syncGroup(group, isTabs)));
  }

  const DISCLOSURES = [
    ['#periodButton', '#periodPopover'],
    ['#commandButton', '#commandPalette'],
    ['#viewMenuBtn', '#viewPopover'],
    ['#topImportBtn', '#importDrawer']
  ];
  const DIALOGS = [
    ['#periodPopover', null],
    ['#viewPopover', null],
    ['#importDrawer', 'importDrawerTitle'],
    ['#detailDrawer', 'detailTitle'],
    ['#panelModal', 'panelModalTitle'],
    ['#commandPalette', null]
  ];

  function surfaceOpen(surface) {
    if (!surface) return false;
    const style = getComputedStyle(surface);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      (surface.classList.contains('show') || surface.classList.contains('open') || surface.classList.contains('active'));
  }

  function syncDisclosureStates() {
    DISCLOSURES.forEach(([triggerSelector, surfaceSelector]) => {
      const trigger = $(triggerSelector);
      const surface = $(surfaceSelector);
      if (!trigger || !surface) return;
      const open = surfaceOpen(surface);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      surface.setAttribute('aria-hidden', open ? 'false' : 'true');
    });
  }

  function syncDialogSemantics() {
    DIALOGS.forEach(([selector, labelledBy]) => {
      const dialog = $(selector);
      if (!dialog) return;
      dialog.setAttribute('role', 'dialog');
      if (['#importDrawer','#detailDrawer','#panelModal','#commandPalette'].includes(selector)) dialog.setAttribute('aria-modal', 'true');
      if (labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);
      dialog.setAttribute('aria-hidden', surfaceOpen(dialog) ? 'false' : 'true');
    });
  }

  function bindMobileOverlayTrap() {
    const overlayRoot = $('#v5MobileOverlayRoot');
    if (!overlayRoot || overlayRoot.dataset.currentUiTrap) return;
    overlayRoot.dataset.currentUiTrap = '1';
    overlayRoot.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const dialog = overlayRoot.querySelector('[role="dialog"][aria-modal="true"]');
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  let frame = 0;
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      ensureViewNote();
      syncTopNavigation();
      syncGroups();
      syncDialogSemantics();
      syncDisclosureStates();
      bindMobileOverlayTrap();
      requestAnimationFrame(fitDesktopNumerals);
    });
  }

  const content = $('#content');
  if (content) new MutationObserver(schedule).observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const nav = $('#mainNav');
  if (nav) new MutationObserver(schedule).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });

  [...new Set([...DISCLOSURES.map(([, surface]) => surface), ...DIALOGS.map(([surface]) => surface)])].forEach(surfaceSelector => {
    const surface = $(surfaceSelector);
    if (surface) new MutationObserver(() => { syncDisclosureStates(); syncDialogSemantics(); }).observe(surface, { attributes: true, attributeFilter: ['class','style'] });
  });

  if ('ResizeObserver' in window && content) new ResizeObserver(schedule).observe(content);
  desktop.addEventListener?.('change', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  document.fonts?.ready?.then(schedule).catch(() => {});

  schedule();
})();
