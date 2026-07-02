/* ============================================
  SEARCH.JS - Database Search Engine
  Pioneer Adhesives Routing Template System

  Handles search functionality for LOOKUP and
  UPDATE modes. Tries the API first, falls back
  to the local mock-db if the API is unreachable.
  ============================================ */

/**
* Perform a search — API first, mock-db fallback.
*/
async function performSearch() {
const searchInput = document.getElementById('searchInput');
const statusLabel = document.getElementById('search-status');

if (!searchInput || !statusLabel) return;

const query = searchInput.value.trim().toUpperCase();

if (!query) {
statusLabel.textContent = 'Please enter an item code.';
statusLabel.className = 'search-status search-status--error';
return;
}

if (query.startsWith('/') || query.endsWith('/') || query.includes('//')) {
statusLabel.textContent = 'Item code cannot start/end with a slash or contain consecutive slashes.';
statusLabel.className = 'search-status search-status--error';
return;
}

// --- Try API first ---
let data = null;
try {
const res = await apiGetItem(query);
if (res.ok && res.data) {
// Normalize API response to internal field names
data = _normalizeApiItem(res.data);
// Keep local cache in sync
saveRoutingRecord(query, data);
}
} catch (_) { /* API unreachable — fall through to mock-db */ }

// --- Fallback to mock-db ---
if (!data) {
data = getRoutingRecord(query);
}

if (data) {
statusLabel.textContent = '';
statusLabel.className = 'search-status';

App.currentRecord = data; // store for activity diffing on update

// Set editable state based on current AppState BEFORE loading data into the form.
// This ensures addRow() creates rows in the correct editable/disabled state initially.
const isUpdate = App.currentState === AppState.UPDATE;
setFormEditable(isUpdate);

loadDataIntoForm(data);

// Refresh dropdowns AFTER loadDataIntoForm has set the production line value,
// so the correct activity list is available for the selected line.
if (typeof refreshAllActivityDropdowns === 'function') {
refreshAllActivityDropdowns();
}

// Populate revision field (UPDATE tab shows it as a read-only display)
const revisionInputEl = document.getElementById('revisionInput');
if (revisionInputEl) {
revisionInputEl.textContent = data.revision ? 'Rev. ' + data.revision : '—';
}

if (isUpdate) {
const itemCodeEl = document.getElementById('itemCode');
if (itemCodeEl) itemCodeEl.disabled = true;
_setUpdateActionButtonsVisible(true);
} else {
// LOOKUP mode: populate plain-text display spans
_populateLookupDisplay(data);
_setUpdateActionButtonsVisible(false);
}
} else {
App.currentRecord = null;
statusLabel.textContent = `No record found for ${query}.`;
statusLabel.className = 'search-status search-status--error';
clearForm();
setFormEditable(false);
_setUpdateActionButtonsVisible(false);

showModal({
  icon: 'warn',
  title: 'Item Not Found',
  message: `No record found for item code "${query}". It may not exist or the item code is incorrect.`,
  type: 'alert',
  confirmLabel: 'OK'
});
}
}

/**
* Show or hide the Update/Delete action buttons in the UPDATE tab header area.
* These buttons replace the bottom Save button for the UPDATE tab only.
* @param {boolean} visible
*/
function _setUpdateActionButtonsVisible(visible) {
const el = document.getElementById('update-action-buttons');
if (el) el.style.display = visible ? 'flex' : 'none';
  const archiveEl = document.getElementById('archive-button-container');
  if (archiveEl) archiveEl.style.display = visible ? 'flex' : 'none';
}

/**
* Handle the Update action: save the routing document via API.
* Identical to saveRoutingDocument() but always treats state as UPDATE.
*/
async function handleUpdateItem() {
const itemCode = document.getElementById('itemCode')?.value.trim();
if (!itemCode) return;

// ── Confirmation modal before proceeding ──────────────────────────────────
const result = await showModal({
icon:         'warn',
title:        'Confirm Update',
message:      `You are about to update the routing record for "${itemCode}". Do you want to continue?`,
type:         'confirm',
confirmLabel: 'Yes, Update',
});
if (!result.confirmed) return;

// ── Perform the save ──────────────────────────────────────────────────────
const success = await saveRoutingDocument();
if (!success) return;

// ── Auto-reload: re-fetch the saved record so the form shows the latest
//    data (bumped revision number, server-assigned activity IDs, etc.)
//    without requiring a manual page refresh. ──────────────────────────────
await performSearch();
}

/**
* Handle the Refresh action: discard all unsaved form edits and reload
* the original record from the API / local cache.
*
* This acts as an "undo" for any in-form changes — including accidentally
* removed rows — made since the record was last loaded.  Nothing is written
* to the database; we simply re-run the search for the current item code.
*/
async function handleRefreshItem() {
const itemCodeEl = document.getElementById('itemCode');
const itemCode   = itemCodeEl?.value.trim();
if (!itemCode) return;

const btn = document.querySelector('.btn-refresh-record');

// Ask the user to confirm before discarding edits
const r = await showModal({
icon:         'warning',
title:        'Discard Changes?',
message:      `This will reload the saved record for "${itemCode}" and discard any unsaved changes, including rows you may have added or deleted. Continue?`,
type:         'confirm',
confirmLabel: 'Yes, Refresh',
});
if (!r.confirmed) return;

// Disable button while loading
if (btn) { btn.disabled = true; btn.textContent = '↺ Refreshing…'; }

// Re-run the search — this re-fetches from API (or falls back to cache)
// and calls loadDataIntoForm(), restoring every field and row to the
// last-saved state.
await performSearch();

if (btn) { btn.disabled = false; btn.textContent = '↺ Refresh'; }
}

/**
* Handle the Delete action: confirm then delete item via API and local cache.
*/
async function handleDeleteItem() {
const itemCode = document.getElementById('itemCode')?.value.trim();
if (!itemCode) return;

const r = await showModal({
icon: 'danger',
title: 'Delete Routing Record',
message: `Permanently delete routing record for "${itemCode}"? This action cannot be undone.`,
type: 'password_prompt',
inputPlaceholder: 'Enter your password to confirm',
confirmStyle: 'danger',
confirmLabel: 'Yes, Delete',
});
if (!r.confirmed) return;

if (!r.value) {
  showModal({ icon: 'danger', title: 'Error', message: 'Password is required to delete a record.', type: 'confirm', confirmLabel: 'OK' });
  return;
}

const verifyRes = await apiVerifyPassword(r.value);
if (!verifyRes.ok) {
  showModal({ icon: 'danger', title: 'Access Denied', message: 'Incorrect password.', type: 'confirm', confirmLabel: 'OK' });
  return;
}

// --- Try API ---
let apiOk = false;
try {
const res = await apiDeleteItem(itemCode);

if (!res.ok) {
// Server rejected the delete — show the reason and abort
const errMsg = getApiErrorMessage(res, 'delete item', itemCode);
await showModal({
icon:         'danger',
title:        'Delete Failed',
message:      errMsg,
type:         'confirm',
confirmLabel: 'OK',
});
return; // Do not remove from local cache
}

apiOk = true;
} catch (_) {
// Network error — remove locally only
console.warn('[API] Unreachable — deleting from local cache only.');
}

// Remove from local cache (always after confirmed API delete, or on network fallback)
delete mockRoutingDB[itemCode.toUpperCase()];

// Clear tab state and reset form
clearTabFormState(AppState.UPDATE);
clearForm();
setFormEditable(false);
_setUpdateActionButtonsVisible(false);

const searchInput = document.getElementById('searchInput');
if (searchInput) searchInput.value = '';

const statusLabel = document.getElementById('search-status');
if (statusLabel) {
statusLabel.textContent = `Record "${itemCode}" deleted successfully.`;
statusLabel.className = 'search-status search-status--success';
}

showToast({ type: 'success', title: 'Successfully Deleted', message: `Routing record "${itemCode}" has been permanently removed.` });
}

/**
* Handle enter key press in search input.
*/
function handleSearchKeypress(event) {
if (event.key === 'Enter') performSearch();
}

/**
* Quick search from All Data view.
*/
function quickSearch(itemCode) {
if (!itemCode) return;
switchTab(AppState.LOOKUP);
const searchInput = document.getElementById('searchInput');
if (searchInput) searchInput.value = itemCode;
performSearch();
}

/**
* Populate the LOOKUP plain-text display spans from a record.
* @param {Object} data - The routing record
*/
function _populateLookupDisplay(data) {
const set = (id, val) => {
const el = document.getElementById(id);
if (el) el.textContent = val || '';
};

set('ld-itemCode', data.inventory_id || '');
set('ld-skuDesc',  data.revision_descr || '');
set('ld-qty',      data.qty || data.quantity || 1);
set('ld-notes',    data.notes || '');
set('ld-revision', data.revision ? 'Rev. ' + data.revision : '—');
set('ld-mode',     data.product_type
? (data.product_type.includes('Base') ? 'BM' : 'FG')
: (App.currentMode || 'FG'));
set('ld-prodLine', data.production_line_code
|| data.fg_production_line_code
|| data.bm_production_line_code
|| '');
// Line description from LINE_DESCRIPTIONS lookup
const lineCode = data.production_line_code
|| data.fg_production_line_code
|| data.bm_production_line_code
|| '';
set('ld-lineDesc', LINE_DESCRIPTIONS[lineCode] || data.production_line || '');
}

window.performSearch                  = performSearch;
window.handleSearchKeypress           = handleSearchKeypress;
window.quickSearch                    = quickSearch;
window._setUpdateActionButtonsVisible = _setUpdateActionButtonsVisible;
window.handleUpdateItem               = handleUpdateItem;
window.handleRefreshItem              = handleRefreshItem;