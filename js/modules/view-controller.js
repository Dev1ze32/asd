/* ============================================
   VIEW-CONTROLLER.JS - View State Manager
   Pioneer Adhesives Routing Template System
   
   Controls form editability, visibility states,
   and UI mode toggles (FG/BM).
   Also handles per-tab form state persistence
   so unsaved data survives tab switches.
   ============================================ */

/**
 * Set the template mode (FG or BM)
 * Updates UI labels and triggers recalculation
 * @param {string} mode - 'FG' or 'BM'
 */
function setMode(mode) {
  App.currentMode = mode;

  const btnFg    = document.getElementById('btn-fg');
  const btnBm    = document.getElementById('btn-bm');
  const qtyLabel = document.getElementById('qtyLabel');

  if (mode === 'FG') {
    if (btnFg) btnFg.className = 'mode-btn mode-btn--active';
    if (btnBm) btnBm.className = 'mode-btn';
    if (qtyLabel) qtyLabel.textContent = getQtyLabel('FG');
  } else {
    if (btnBm) btnBm.className = 'mode-btn mode-btn--active';
    if (btnFg) btnFg.className = 'mode-btn';
    if (qtyLabel) qtyLabel.textContent = getQtyLabel('BM');
  }

  calculateAll();
}

/**
 * Update the line description based on selected production line
 */
function updateLineDescription() {
  const select = document.getElementById('prodLine');
  const desc   = document.getElementById('lineDesc');
  if (select && desc) {
    desc.value = LINE_DESCRIPTIONS[select.value] || '';
  }
  // Refresh activity dropdowns to match the newly selected line
  if (typeof refreshAllActivityDropdowns === 'function') {
    refreshAllActivityDropdowns();
  }
}

/**
 * Enable or disable form fields based on state
 * @param {boolean} isEditable
 */
function setFormEditable(isEditable) {
  App.isFormEditable = isEditable;

  const fields = ['itemCode', 'skuDesc', 'qtyInput', 'prodLine', 'notesInput'];

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !isEditable;
  });

  const btnFg = document.getElementById('btn-fg');
  const btnBm = document.getElementById('btn-bm');
  if (btnFg) btnFg.disabled = !isEditable;
  if (btnBm) btnBm.disabled = !isEditable;

  document.querySelectorAll('#tableBody input').forEach(input => {
    input.disabled = !isEditable;
  });

  document.querySelectorAll('#tableBody .activity-select').forEach(sel => {
    sel.disabled = !isEditable;
  });

  const addRowBtn = document.getElementById('btn-add-row');
  if (addRowBtn) {
    addRowBtn.style.display = isEditable ? 'inline-flex' : 'none';
  }

  document.querySelectorAll('.btn-remove-row').forEach(btn => {
    btn.style.display = isEditable ? 'inline-flex' : 'none';
  });

  if (typeof updateDelColumnVisibility === 'function') {
    updateDelColumnVisibility();
  }
}

/**
 * Clear the entire routing form
 */
function clearForm() {
  setMode('FG');

  const fields = {
    'itemCode':   '',
    'skuDesc':    '',
    'qtyInput':   '',
    'prodLine':   '',
    'lineDesc':   '',
    'notesInput': ''
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  const tableBody = document.getElementById('tableBody');
  if (tableBody) tableBody.innerHTML = '';

  const revInput = document.getElementById('revisionInputText');
  if (revInput) revInput.textContent = '—';

  const updatedDisplay = document.getElementById('updatedAtDisplay');
  if (updatedDisplay) updatedDisplay.textContent = '(Last Updated: —)';

  // Add empty rows for ADD mode
  if (App.currentState === AppState.ADD) {
    addRow('', '', '', '');
    addRow('', '', '', '');
  }

  // Reset search status
  const searchStatus = document.getElementById('search-status');
  if (searchStatus) {
    searchStatus.textContent = '';
    searchStatus.className   = 'search-status';
  }

  calculateAll();
}

/**
 * Sync activity name from input to the BOM side
 * @param {HTMLInputElement} input
 */
function syncActivityName(input) {
  const row = input.closest('tr');
  if (row) {
    const syncCell = row.querySelector('.sync-activity-cell');
    if (syncCell) syncCell.textContent = input.value;
  }
}

/* ============================================
   TAB FORM STATE PERSISTENCE
   Saves and restores unsaved form data when
   the user switches between routing tabs.
   ============================================ */

/**
 * Capture current form values and table rows into TabFormState
 * for the given tab key. Call this BEFORE switching away from a tab.
 * @param {string} tabKey - AppState value (ADD | LOOKUP | UPDATE)
 */
function saveTabFormState(tabKey) {
  // Only persist routing form tabs
  if (tabKey !== AppState.ADD && tabKey !== AppState.LOOKUP && tabKey !== AppState.UPDATE) return;

  const itemCode = document.getElementById('itemCode')?.value  || '';
  const skuDesc  = document.getElementById('skuDesc')?.value   || '';
  const qty      = document.getElementById('qtyInput')?.value  || '';
  const prodLine = document.getElementById('prodLine')?.value  || '';
  const notes    = document.getElementById('notesInput')?.value || '';
  const mode     = App.currentMode || 'FG';

  // Save each table row
  const rows = [];
  document.querySelectorAll('#tableBody tr').forEach(row => {
    const select   = row.querySelector('.activity-select');
    const paxInput = row.querySelector('.pax-input');
    const mcInput  = row.querySelector('.machine-input');
    const timeInput = row.querySelector('.time-input');

    rows.push({
      activity:   select     ? select.value          : '',
      pax:        paxInput   ? paxInput.value        : '',
      machine:    mcInput    ? mcInput.value         : '',
      time:       timeInput  ? timeInput.value       : '',
      rawFormula: timeInput  ? (timeInput.dataset.rawFormula || '') : '',
    });
  });

  TabFormState[tabKey] = { itemCode, skuDesc, qty, prodLine, notes, mode, rows };
}

/**
 * Restore previously saved form values for the given tab key.
 * Call this AFTER switching to a tab, instead of clearForm().
 * @param {string} tabKey - AppState value (ADD | LOOKUP | UPDATE)
 * @returns {boolean} true if state was restored, false if nothing saved
 */
function restoreTabFormState(tabKey) {
  if (tabKey !== AppState.ADD && tabKey !== AppState.LOOKUP && tabKey !== AppState.UPDATE) return false;

  const saved = TabFormState[tabKey];
  if (!saved) return false;

  // Restore top-level fields
  const itemCodeEl = document.getElementById('itemCode');
  const skuDescEl  = document.getElementById('skuDesc');
  const qtyEl      = document.getElementById('qtyInput');
  const prodLineEl = document.getElementById('prodLine');
  const notesEl    = document.getElementById('notesInput');

  if (itemCodeEl) itemCodeEl.value = saved.itemCode;
  if (skuDescEl)  skuDescEl.value  = saved.skuDesc;
  if (qtyEl)      qtyEl.value      = saved.qty;
  if (notesEl)    notesEl.value    = saved.notes || '';
  if (prodLineEl) {
    prodLineEl.value = saved.prodLine;
    updateLineDescription();
  }

  // Restore mode (FG/BM)
  setMode(saved.mode || 'FG');

  // Restore table rows
  const tableBody = document.getElementById('tableBody');
  if (tableBody) {
    tableBody.innerHTML = '';
    if (saved.rows && saved.rows.length > 0) {
      saved.rows.forEach(r => {
        addRow(r.activity || '', r.pax || '', r.machine || '', r.time || '');
        // Restore raw formula attribute on the last added time input
        if (r.rawFormula) {
          const allTimeInputs = tableBody.querySelectorAll('.time-input');
          const lastInput = allTimeInputs[allTimeInputs.length - 1];
          if (lastInput) lastInput.dataset.rawFormula = r.rawFormula;
        }
      });
    } else {
      // Add blank rows for ADD mode if nothing was saved
      if (tabKey === AppState.ADD) {
        addRow('', '', '', '');
        addRow('', '', '', '');
      }
    }
  }

  calculateAll();

  // If restoring LOOKUP tab, refresh the plain-text display spans
  if (tabKey === AppState.LOOKUP && saved.itemCode) {
    // Rebuild a minimal data object from saved state to repopulate the display
    const lineCode = saved.prodLine || '';
    const displayData = {
      inventory_id:         saved.itemCode,
      revision_descr:       saved.skuDesc,
      qty:                  saved.qty,
      notes:                saved.notes || '',
      production_line_code: lineCode,
      production_line:      LINE_DESCRIPTIONS[lineCode] || '',
      product_type:         saved.mode === 'BM' ? 'Base Material (BM)' : 'Finished Good (FG)',
    };
    if (typeof _populateLookupDisplay === 'function') {
      _populateLookupDisplay(displayData);
    }
  }

  return true;
}

/**
 * Clear saved state for a specific tab (e.g. after successful save)
 * @param {string} tabKey
 */
function clearTabFormState(tabKey) {
  if (TabFormState.hasOwnProperty(tabKey)) {
    TabFormState[tabKey] = null;
  }
}

/**
 * Show or hide the Clear button bar above the routing table.
 * Visible in ADD and UPDATE modes only.
 * @param {boolean} visible
 */
function _setClearBtnVisible(visible) {
  const bar = document.getElementById('clear-btn-bar');
  if (bar) bar.style.display = visible ? 'flex' : 'none';
}

// Expose globally
window._setClearBtnVisible  = _setClearBtnVisible;
window.setMode              = setMode;
window.updateLineDescription = updateLineDescription;
window.setFormEditable      = setFormEditable;
window.clearForm            = clearForm;
window.syncActivityName     = syncActivityName;
window.saveTabFormState     = saveTabFormState;
window.restoreTabFormState  = restoreTabFormState;
window.clearTabFormState    = clearTabFormState;