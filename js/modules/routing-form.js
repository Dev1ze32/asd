/* ============================================
   ROUTING-FORM.JS - Form Handling & Row Management
   Pioneer Adhesives Routing Template System
   
   Manages the routing table rows, adding/removing
   rows, and saving routing documents.
   ============================================ */

/**
 * Add a new activity row to the routing table
 * @param {string} activityName - Activity name
 * @param {number|string} pax - Number of workers
 * @param {number|string} machine - Number of machines
 * @param {number|string} time - Time in minutes
 */
function addRow(activityName, pax, machine, time, id) {
  // Guard against undefined values — <input type="number" value="undefined"> triggers
  // a browser parse error ("The specified value 'undefined' cannot be parsed").
  activityName = (activityName !== undefined && activityName !== null) ? activityName : '';
  pax          = (pax          !== undefined && pax          !== null) ? pax          : '';
  machine      = (machine      !== undefined && machine      !== null) ? machine      : '';
  time         = (time         !== undefined && time         !== null) ? time         : '';
  id           = (id           !== undefined && id           !== null) ? id           : '';

  var tbody = document.getElementById('tableBody');
  if (!tbody) return;

  var tr = document.createElement('tr');
  if (id) tr.dataset.id = id;

  var isDisabled  = !App.isFormEditable ? 'disabled' : '';
  var displayBtn  = App.isFormEditable  ? 'inline-flex' : 'none';

  tr.innerHTML = `
    <td class="bg-activity-green p-0">
      <select class="activity-select"
              onchange="syncActivityName(this); _updateActivityLabel(this); calculateAll();"
              ${isDisabled}>
      </select>
      <span class="activity-label"></span>
    </td>
    <td class="bg-excel-yellow p-0">
      <input type="number"
             class="excel-input pax-input"
             value="${pax}"
             min="0"
             oninput="calculateAll()"
             ${isDisabled}>
    </td>
    <td class="bg-excel-yellow p-0">
      <input type="number"
             class="excel-input machine-input"
             value="${machine}"
             min="0"
             oninput="calculateAll()"
             ${isDisabled}>
    </td>
    <td class="bg-excel-yellow p-0 time-input-cell">
      <input type="text"
             class="excel-input time-input"
             value="${time}"
             readonly
             onclick="openTimeFormulaModal(this)"
             style="cursor:pointer;padding-right:1.5rem;"
             ${isDisabled}>
      <span class="fx-indicator">&#402;</span>
    </td>

    <!-- Computed cells -->
    <td class="cell-computed run-time-cell">0.00000</td>
    <td class="cell-computed">UNIT</td>
    <td class="cell-computed labor-min-cell">0.00</td>
    <td class="cell-computed mc-min-cell">0.00</td>

    <!-- BOM cells -->
    <td class="cell-bom w-bom-activity sync-activity-cell">${sanitizeInput(activityName)}</td>
    <td class="cell-bom dl-units-cell">0</td>
    <td class="cell-bom dl-cell">0.00000</td>
    <td class="cell-bom voh-cell">0.00000</td>
    <td class="cell-bom foh-cell">0.00000</td>

    <!-- Action -->
    <td class="action-column">
      <button onclick="removeRow(this)"
              class="btn btn--danger btn-remove-row"
              style="display:${displayBtn}"
              title="Remove Row">
        &times;
      </button>
    </td>
  `;

  tbody.appendChild(tr);

  // Populate activity dropdown for this row
  const select = tr.querySelector('.activity-select');
  if (select) {
    _populateActivitySelect(select, activityName);
    _updateActivityLabel(select);
  }

  updateDelColumnVisibility();
  calculateAll();
}

/**
 * Populate an activity <select> with options from the current production line.
 * Always includes the current value as an option even if not in the line list.
 * @param {HTMLSelectElement} selectEl
 * @param {string} currentValue - Pre-selected activity name
 */
function _populateActivitySelect(selectEl, currentValue) {
  const prodLine   = document.getElementById('prodLine')?.value || '';
  const activities = getLineActivities(prodLine);

  selectEl.innerHTML = '';

  // Blank option
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '-- Select Activity --';
  selectEl.appendChild(blank);

  // Add activities from line
  const activityNames = activities.map(act =>
    typeof getLineActivityName === 'function' ? getLineActivityName(act) : String(act || '')
  );

  activityNames.forEach(act => {
    const opt = document.createElement('option');
    opt.value = act;
    opt.textContent = act;
    if (act === currentValue) opt.selected = true;
    selectEl.appendChild(opt);
  });

  // If currentValue is set but not in the list, add it as a custom option
  if (currentValue && !activityNames.includes(currentValue)) {
    const customOpt = document.createElement('option');
    customOpt.value       = currentValue;
    customOpt.textContent = currentValue;
    customOpt.selected    = true;
    selectEl.appendChild(customOpt);
  }

  // If nothing matched, select blank
  if (!currentValue) selectEl.value = '';
}

/**
 * Refresh all activity dropdowns in the table (called when production line changes).
 */
function refreshAllActivityDropdowns() {
  document.querySelectorAll('#tableBody .activity-select').forEach(select => {
    const currentVal = select.value;
    _populateActivitySelect(select, currentVal);
    _updateActivityLabel(select);
  });
}

/**
 * Sync the plain-text label span beside the <select> with its current value.
 * The label is shown in LOOKUP (read-only) mode via CSS; hidden in edit modes.
 * @param {HTMLSelectElement} selectEl
 */
function _updateActivityLabel(selectEl) {
  const label = selectEl.parentElement?.querySelector('.activity-label');
  if (!label) return;
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  label.textContent = (selectedOption && selectedOption.value) ? selectedOption.textContent : '';
}

/**
 * Toggle visibility of the DEL column based on form editable state.
 */
function updateDelColumnVisibility() {
  const table = document.getElementById('routingTable');
  if (!table) return;
  if (App.isFormEditable) {
    table.classList.remove('hide-del');
  } else {
    table.classList.add('hide-del');
  }
}

/**
 * Remove a row from the routing table.
 * Shows a confirmation modal before deleting so the user can cancel.
 * Works in both ADD and UPDATE modes.
 * @param {HTMLButtonElement} btn - The remove button clicked
 */
async function removeRow(btn) {
  var row = btn.closest('tr');
  if (!row) return;

  // Read the activity name from the select to make the message specific
  var activitySelect = row.querySelector('.activity-select');
  var activityName   = activitySelect ? activitySelect.value.trim() : '';
  var label          = activityName ? `"${activityName}"` : 'this activity row';

  var result = await showModal({
    icon:         'danger',
    title:        'Remove Activity Row',
    message:      `Are you sure you want to remove ${label}? This cannot be undone.`,
    type:         'confirm',
    confirmStyle: 'danger',
    confirmLabel: 'Yes, Remove',
  });

  if (!result.confirmed) return;

  row.remove();
  calculateAll();
}

/**
 * Attaches a change listener to the prodLine dropdown.
 * Warns the user if they change the line while activities exist,
 * and clears the table to prevent invalid data from being saved.
 */
function setupProdLineChangeListener() {
  const prodLineEl = document.getElementById('prodLine');
  if (!prodLineEl) return;

  // Store initial value
  prodLineEl.dataset.prevVal = prodLineEl.value;

  prodLineEl.addEventListener('change', async function() {
    const newVal = this.value;
    const oldVal = this.dataset.prevVal;
    const tableBody = document.getElementById('tableBody');

    // If there are existing rows with actual selected activities
    const hasActivities = Array.from(tableBody.querySelectorAll('tr')).some(row => {
      const select = row.querySelector('.activity-select');
      return select && select.value.trim() !== '';
    });

    if (hasActivities) {
      const res = await showModal({
        icon: 'warning',
        title: 'Change Production Line',
        message: 'Changing the production line will clear your current routing activities, as they are no longer valid for this line. Proceed?',
        type: 'confirm',
        confirmStyle: 'danger',
        confirmLabel: 'Yes, Clear Activities'
      });

      if (!res.confirmed) {
        // Revert change
        this.value = oldVal;
        return;
      }

      // User confirmed: Wipe the table and add a blank row
      tableBody.innerHTML = '';
      addRow('', '', '', '');
      calculateAll();
    } else {
      // No activities yet, just refresh dropdowns silently
      refreshAllActivityDropdowns();
    }

    // Update previous value
    this.dataset.prevVal = newVal;
  });
}

/**
 * Save the current routing document.
 * Collects form data, calls the API, saves locally, then clears tab state.
 */
async function saveRoutingDocument() {
  var itemCode = document.getElementById('itemCode')?.value.trim();
  var skuDesc  = document.getElementById('skuDesc')?.value.trim();
  var prodLine = document.getElementById('prodLine')?.value;
  var qty      = document.getElementById('qtyInput')?.value;
  var notes    = document.getElementById('notesInput')?.value.trim() || '';

  // ── Comprehensive validation: collect ALL problems before showing anything ──
  const _validationErrors = _validateRoutingForm(itemCode, skuDesc, prodLine, qty);
  if (_validationErrors.length > 0) {
    await showModal({
      icon:         'danger',
      title:        'Incomplete Data',
      messageHtml:  _buildValidationHtml(_validationErrors),
      type:         'confirm',
      confirmLabel: 'OK',
    });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Collect activities from table
  var activities = [];
  document.querySelectorAll('#tableBody tr').forEach(function(row) {
    var activityName = row.querySelector('.activity-select')?.value.trim();
    var pax          = parseFloat(row.querySelector('.pax-input')?.value)     || 0;
    var machine      = parseFloat(row.querySelector('.machine-input')?.value) || 0;
    var time         = parseFloat(row.querySelector('.time-input')?.value)    || 0;
    var actId        = row.dataset.id || '';

    if (activityName) {
      activities.push({
        id:            actId ? parseInt(actId, 10) : undefined,
        activities:    activityName,  // internal name kept for local cache
        activity_name: activityName,  // API field name
        pax:           pax,
        machine:       machine,
        time_min:      time
      });
    }
  });

  // Build record (internal format)
  var isBM = App.currentMode === 'BM';
  var record = {
    inventory_id:         itemCode,
    revision_descr:       skuDesc,
    qty:                  parseFloat(qty) || 1,
    notes:                notes,
    production_line_code: prodLine,
    production_line:      LINE_DESCRIPTIONS[prodLine] || prodLine,
    product_type:         isBM ? 'Base Material (BM)' : 'Finished Good (FG)',
    activities:           activities
  };

  const isUpdate = App.currentState === AppState.UPDATE;

  // --- Try API first ---
  try {
    if (!isUpdate) {
      // ── CREATE: single call, activities included in body ──────────────────
      const res = await apiCreateItem(record);
      if (!res.ok) {
        await showModal({
          icon: 'danger', title: 'Save Failed',
          message: getApiErrorMessage(res, 'create item', itemCode),
          type: 'confirm', confirmLabel: 'OK',
        });
        return false;
      }

    } else {
      // ── UPDATE: Use the Bulk Update API to solve Concurrency & Rate Limiting ─────────
      
      // 1. Get the original activities that are currently saved on the server
      const originalActivities = (App.currentRecord && App.currentRecord.activities) ? App.currentRecord.activities : [];
      const updatedActivities = record.activities || [];

      // Activities with no id are NEW → POST
      const toAdd = updatedActivities.filter(a => !a.id);

      // Activities in original but missing from updated list → DELETE
      const updatedIds = new Set(updatedActivities.filter(a => a.id).map(a => String(a.id)));
      const toDelete = originalActivities.filter(a => !updatedIds.has(String(a.id))).map(a => a.id);

      // Activities present in both but with changed fields → PATCH
      const toUpdate = updatedActivities.filter(act => {
        if (!act.id) return false;
        const orig = originalActivities.find(a => String(a.id) === String(act.id));
        if (!orig) return false;
        return ['activity_name', 'activities', 'pax', 'machine', 'time_min'].some(f => {
          const newVal  = f === 'activity_name' ? (act.activity_name  || act.activities)  : act[f];
          const origVal = f === 'activity_name' ? (orig.activity_name || orig.activities) : orig[f];
          return String(newVal ?? '') !== String(origVal ?? '');
        });
      });

      // 1b. Check if any product-level fields changed
      const origQty = App.currentRecord ? (parseFloat(App.currentRecord.qty) || 1) : 1;
      const newQty  = parseFloat(record.qty) || 1;
      
      const productChanged = !App.currentRecord ||
        String(record.revision_descr || '') !== String(App.currentRecord.revision_descr || '') ||
        String(record.notes || '') !== String(App.currentRecord.notes || '') ||
        newQty !== origQty ||
        String(record.production_line_code || '') !== String(App.currentRecord.production_line_code || '') ||
        String(record.product_type || '') !== String(App.currentRecord.product_type || '');

      // 1c. If nothing changed at all, block the update
      if (!productChanged && toAdd.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
        showToast({
          type: 'info',
          title: 'No Changes',
          message: 'No changes were detected. The record is already up to date.',
          duration: 3000
        });
        return false; // Return false to skip the performSearch reload
      }

      // 2. Build Bulk Payload
      const bulkPayload = {
        expected_revision: App.currentRecord ? App.currentRecord.revision : '00',
        product_updates: {
          revision_descr: record.revision_descr,
          notes: record.notes,
          quantity: record.qty,
          bm_production_line: record.production_line,
          bm_production_line_code: record.production_line_code,
          fg_production_line: record.production_line,
          fg_production_line_code: record.production_line_code,
          product_type: record.product_type
        },
        activities_added: toAdd,
        activities_updated: toUpdate.map(act => ({
          id: act.id,
          activity_name: act.activity_name || act.activities || '',
          pax: act.pax,
          machine: act.machine,
          time_min: act.time_min,
          type: act.type || 'Labor',
          class: act.class || 'DL',
          class_1: act.class_1 || 'DL',
          sort_order: act.sort_order
        })),
        activities_deleted: toDelete
      };

      // 3. Fire a single Bulk API request
      const res = await apiBulkUpdateItem(itemCode, bulkPayload);
      
      if (!res.ok) {
        if (res.status === 409) {
          // Concurrency Conflict: Lost Update prevented!
          await showModal({
            icon: 'danger', title: 'Update Conflict',
            message: res.data && res.data.error ? res.data.error : 'This document was modified by another user. Please refresh to see their changes before saving yours.',
            type: 'confirm', confirmLabel: 'Got it',
          });
          return false;
        }

        // Standard API error
        await showModal({
          icon: 'danger', title: 'Update Failed',
          message: res.data && res.data.error ? res.data.error : 'Failed to save. Please check your connection and try again.',
          type: 'confirm', confirmLabel: 'OK',
        });
        return false;
      }

      // 4. Re-fetch the saved record from the server so local cache is accurate
      try {
        const fresh = await apiGetItem(itemCode);
        if (fresh.ok && fresh.data) {
          const normalized = _normalizeApiItem(fresh.data);
          App.currentRecord = normalized;
          saveRoutingRecord(itemCode, normalized);
        }
      } catch (_) { /* non-fatal — local cache will be slightly stale */ }
    }

  } catch (_) {
    // Network error (server unreachable) — fall back to local-only save
    console.warn('[API] Unreachable — saving to local mock-db only.');
    saveRoutingRecord(itemCode, record);
    clearTabFormState(App.currentState);
    showToast({
      type:    'warn',
      title:   'Saved Offline',
      message: `${itemCode} — ${skuDesc} could not reach the server and was saved locally only.`,
      duration: 5000,
    });
    return true;
  }

  // --- API success: keep local cache in sync (CREATE path) ---
  if (!isUpdate) saveRoutingRecord(itemCode, record);
  clearTabFormState(App.currentState);

  const actionLabel = isUpdate ? 'Updated' : 'Added';
  const actionVerb  = isUpdate ? 'updated' : 'saved';
  showToast({
    type:    'success',
    title:   `Successfully ${actionLabel}`,
    message: `${itemCode} — ${skuDesc} (Line: ${prodLine}) has been ${actionVerb}.`,
    duration: 4000,
  });

  return true;
}

/**
 * Load routing data into the form
 * @param {Object} data - The routing record data
 */
function loadDataIntoForm(data) {
  // Determine FG or BM mode
  var isBM = isBulkMaterial(data.product_type);
  setMode(isBM ? 'BM' : 'FG');

  var itemCodeEl = document.getElementById('itemCode');
  var skuDescEl  = document.getElementById('skuDesc');
  var qtyInputEl = document.getElementById('qtyInput');
  var prodLineEl = document.getElementById('prodLine');

  if (itemCodeEl) itemCodeEl.value = data.inventory_id || '';
  if (skuDescEl)  skuDescEl.value  = data.revision_descr || '';
  if (qtyInputEl) qtyInputEl.value = data.qty || data.quantity || 1;

  const notesInputEl = document.getElementById('notesInput');
  if (notesInputEl) notesInputEl.value = data.notes || '';

  if (prodLineEl) {
    // Support both internal and raw API field names
    prodLineEl.value = data.production_line_code
                    || data.fg_production_line_code
                    || data.bm_production_line_code
                    || '';
    updateLineDescription();
  }

  // Clear and repopulate table rows
  var tableBody = document.getElementById('tableBody');
  if (tableBody) tableBody.innerHTML = '';

  if (data.activities && data.activities.length > 0) {
    data.activities.forEach(function(act) {
      // Support both "activities" (internal) and "activity_name" (API) field names
      var name    = act.activities || act.activity_name || act.name || '';
      var pax     = act.pax     || 0;
      var machine = act.machine || 0;
      var time    = act.time_min || act.time || 0;
      addRow(name, pax, machine, time, act.id);
    });
  } else {
    addRow('', '', '', '', '');
  }

  calculateAll();
}


/* ============================================
   TIME FORMULA MODAL
   ============================================ */

/**
 * Open the Time Formula modal for a given time-input cell.
 * @param {HTMLInputElement} inputEl - The clicked time-input cell
 */
function openTimeFormulaModal(inputEl) {
  if (inputEl.disabled) return;

  const modal        = document.getElementById('timeFormulaModal');
  const formulaInput = document.getElementById('timeFormulaInput');
  const resultEl     = document.getElementById('timeFormulaResult');
  const applyBtn     = document.getElementById('timeFormulaApplyBtn');
  const cancelBtn    = document.getElementById('timeFormulaCancelBtn');
  const closeBtn     = document.getElementById('timeFormulaCloseBtn');

  if (!modal) return;

  // Pre-fill with existing raw formula or value
  const existing = inputEl.dataset.rawFormula || inputEl.value || '';
  formulaInput.value = existing;
  resultEl.textContent = '0.00000';

  // Evaluate on every keystroke
  function onFormulaInput() {
    const val = formulaInput.value.trim();
    if (!val) { resultEl.textContent = '0.00000'; return; }
    try {
      const expr   = val.replace(/^=/, '');
      const result = Function('"use strict"; return (' + expr + ')')();
      if (typeof result === 'number' && isFinite(result)) {
        resultEl.textContent = result.toFixed(5);
        resultEl.style.color = '#2563eb';
      } else {
        resultEl.textContent = 'Invalid';
        resultEl.style.color = '#dc2626';
      }
    } catch (e) {
      resultEl.textContent = 'Invalid';
      resultEl.style.color = '#dc2626';
    }
  }

  formulaInput.addEventListener('input', onFormulaInput);
  onFormulaInput();

  modal.style.display = 'flex';
  setTimeout(() => formulaInput.focus(), 50);

  function cleanup() {
    modal.style.display = 'none';
    formulaInput.removeEventListener('input', onFormulaInput);
    applyBtn.onclick  = null;
    cancelBtn.onclick = null;
    if (closeBtn) closeBtn.onclick = null;
  }

  function handleApply() {
    const raw = formulaInput.value.trim();
    if (!raw) { cleanup(); return; }
    try {
      const expr   = raw.replace(/^=/, '');
      const result = Function('"use strict"; return (' + expr + ')')();
      if (typeof result === 'number' && isFinite(result)) {
        inputEl.dataset.rawFormula = raw;
        inputEl.value = result.toFixed(5);
        calculateAll();
      }
    } catch (e) { /* Invalid formula — do nothing */ }
    cleanup();
  }

  function handleCancel() { cleanup(); }

  applyBtn.onclick  = handleApply;
  cancelBtn.onclick = handleCancel;
  if (closeBtn) closeBtn.onclick = handleCancel;

  function onKey(e) {
    if (e.key === 'Escape') { handleCancel(); document.removeEventListener('keydown', onKey); }
    if (e.key === 'Enter')  { handleApply();  document.removeEventListener('keydown', onKey); }
  }
  document.addEventListener('keydown', onKey);
}

/* ============================================
   FORM VALIDATION HELPERS
   ============================================ */

/**
 * Validate every field in the routing form and return an array of error objects.
 * Each error: { section: string, field: string, reason: string }
 *
 * Header fields checked:
 *   - Item Code        — must not be empty
 *   - SKU Description  — must not be empty
 *   - Production Line  — must have a value selected
 *   - Quantity         — must be a positive number
 *
 * Table rows checked (per row):
 *   - Activity         — must have a selection (not blank)
 *   - Pax              — must have a value entered (not empty; 0 is allowed)
 *   - Machine          — must have a value entered (not empty; 0 is allowed)
 *   - Time             — must be greater than 0
 *
 * @param {string} itemCode
 * @param {string} skuDesc
 * @param {string} prodLine
 * @param {string} qty
 * @returns {Array<{section:string, field:string, reason:string}>}
 */
function _validateRoutingForm(itemCode, skuDesc, prodLine, qty) {
  const errors = [];

  // ── Header / top-of-form fields ──
  if (!itemCode)
    errors.push({ section: 'Header', field: 'Item Code', reason: 'required — cannot be blank' });

  if (!skuDesc)
    errors.push({ section: 'Header', field: 'SKU Description', reason: 'required — cannot be blank' });

  if (!prodLine)
    errors.push({ section: 'Header', field: 'Production Line', reason: 'required — please select a line' });

  const qtyNum = parseFloat(qty);
  if (qty === '' || qty === null || qty === undefined || isNaN(qtyNum) || qtyNum <= 0)
    errors.push({ section: 'Header', field: 'Quantity', reason: 'must be a number greater than zero' });

  // ── Activity table rows ──
  const rows = document.querySelectorAll('#tableBody tr');

  if (rows.length === 0) {
    errors.push({ section: 'Activities Table', field: '—', reason: 'at least one activity row is required' });
  } else {
    rows.forEach(function(row, i) {
      const rowLabel   = 'Row ' + (i + 1);
      const actSelect  = row.querySelector('.activity-select');
      const paxInput   = row.querySelector('.pax-input');
      const mcInput    = row.querySelector('.machine-input');
      const timeInput  = row.querySelector('.time-input');

      const actVal  = actSelect  ? actSelect.value.trim()  : '';
      const paxVal  = paxInput   ? paxInput.value           : '';
      const mcVal   = mcInput    ? mcInput.value            : '';
      const timeVal = timeInput  ? timeInput.value.trim()   : '';
      const timeNum = parseFloat(timeVal);

      if (!actVal)
        errors.push({ section: rowLabel, field: 'Activity', reason: 'no activity selected' });

      if (paxVal === '' || paxVal === null || paxVal === undefined)
        errors.push({ section: rowLabel, field: 'Pax', reason: 'number of workers not entered' });

      if (mcVal === '' || mcVal === null || mcVal === undefined)
        errors.push({ section: rowLabel, field: 'Machine', reason: 'machine count not entered' });

      if (!timeVal || isNaN(timeNum) || timeNum <= 0)
        errors.push({ section: rowLabel, field: 'Time', reason: 'must be greater than 0 — open the formula field to set a value' });

      // Ensure the activity is valid for the currently selected production line
      if (actVal && prodLine) {
        const validActivities = getLineActivities(prodLine);
        const isValid = validActivities.some(a => a.activity_name === actVal);
        if (!isValid) {
          errors.push({ section: rowLabel, field: 'Activity', reason: `"${actVal}" is not a valid activity for production line ${prodLine}. Please clear or change it.` });
        }
      }
    });
  }

  return errors;
}

/**
 * Build the HTML string shown inside the "Incomplete Data" modal.
 * Groups errors by section so the user can quickly see what needs fixing.
 *
 * @param {Array<{section:string, field:string, reason:string}>} errors
 * @returns {string} HTML string safe to assign to element.innerHTML
 */
function _buildValidationHtml(errors) {
  // Group errors by section
  const sections = {};
  errors.forEach(function(err) {
    if (!sections[err.section]) sections[err.section] = [];
    sections[err.section].push(err);
  });

  let html = '<p style="margin:0 0 0.65rem;font-size:0.875rem;color:#374151;">'
    + 'Please fill in the highlighted fields before saving:'
    + '</p>';

  Object.keys(sections).forEach(function(sectionName) {
    const isRow    = sectionName.startsWith('Row ');
    const isHeader = sectionName === 'Header';

    // Section heading
    html += '<p style="margin:0.55rem 0 0.2rem;font-size:0.78rem;font-weight:700;'
          + 'text-transform:uppercase;letter-spacing:0.05em;'
          + 'color:' + (isHeader ? '#1d4ed8' : '#b45309') + ';">'
          + _sanitizeHtml(sectionName)
          + '</p>';

    // Bullet list for this section
    html += '<ul style="margin:0 0 0.1rem;padding:0 0 0 1.1rem;list-style:disc;">';
    sections[sectionName].forEach(function(err) {
      html += '<li style="font-size:0.84rem;color:#374151;margin-bottom:0.18rem;">'
            + '<strong>' + _sanitizeHtml(err.field) + '</strong>'
            + ' — ' + _sanitizeHtml(err.reason)
            + '</li>';
    });
    html += '</ul>';
  });

  return html;
}

/**
 * Minimal HTML escaper for validation strings (field names / reasons).
 * These strings come from our own code, not from user input, but we sanitize
 * anyway as a good practice before injecting into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function _sanitizeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * FIX (MEDIUM-001): Partial-save recovery helper.
 *
 * Called whenever an activity add/delete/patch fails mid-batch during an UPDATE
 * save.  At that point the server record may be in a partially-synced state
 * (metadata bumped, some activities changed, others not).
 *
 * This function:
 *  1. Re-fetches the current server state for the item.
 *  2. Syncs the local cache and form with whatever the server has.
 *  3. Shows a warning toast so the user knows to review and re-save.
 *
 * @param {string} itemCode
 * @param {string} failedOp - 'add' | 'delete' | 'update' — used in the toast message
 */
async function _recoverAfterPartialSave(itemCode, failedOp) {
  try {
    const fresh = await apiGetItem(itemCode);
    if (fresh.ok && fresh.data) {
      const normalized = _normalizeApiItem(fresh.data);
      App.currentRecord = normalized;
      saveRoutingRecord(itemCode, normalized);
      // Reload the form with whatever the server actually has
      loadDataIntoForm(normalized);
      if (typeof refreshAllActivityDropdowns === 'function') {
        refreshAllActivityDropdowns();
      }
    }
  } catch (_) {
    // Non-fatal — best-effort recovery
  }

  showToast({
    type: 'warn',
    title: 'Partial Save — Review Required',
    message: `The ${failedOp} operation failed mid-save. The form has been reloaded with the current server state. Please review the activities and re-save.`,
    duration: 7000,
  });
}

// Expose globally
window.addRow                       = addRow;
window.removeRow                    = removeRow;
window.saveRoutingDocument          = saveRoutingDocument;
window.loadDataIntoForm             = loadDataIntoForm;
window.openTimeFormulaModal         = openTimeFormulaModal;
window.updateDelColumnVisibility    = updateDelColumnVisibility;
window.refreshAllActivityDropdowns  = refreshAllActivityDropdowns;
window._populateActivitySelect      = _populateActivitySelect;
window._updateActivityLabel         = _updateActivityLabel;
window._validateRoutingForm         = _validateRoutingForm;
window._buildValidationHtml         = _buildValidationHtml;