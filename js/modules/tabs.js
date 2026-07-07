/* ============================================
  TABS.JS - Tab Controller & Router
  Pioneer Adhesives Routing Template System
  
  Manages switching between the 7 main views:
  ADD, LOOKUP, UPDATE, MANAGE, ALLDATA, ADMIN, LOGS

  Admin-only tabs (ADMIN, LOGS) are conditionally
  rendered based on the user's role.

  Tab form state is persisted across switches:
  - Before leaving a routing tab, form data is
    saved into TabFormState.
  - When returning to a routing tab, data is
    restored so the user doesn't lose their work.
  ============================================ */

/**
* Tab ID to DOM element ID mapping
*/
const TAB_ELEMENTS = {
[AppState.ADD]:      'tab-add',
[AppState.LOOKUP]:   'tab-lookup',
[AppState.UPDATE]:   'tab-update',
[AppState.MANAGE]:   'tab-manage',
[AppState.ALLDATA]:  'tab-alldata',
[AppState.ADMIN]:    'tab-admin',
[AppState.LOGS]:     'tab-logs',
[AppState.DATABASE]: 'tab-database',
'APPROVALS':         'tab-approvals'
};

/**
* View ID to DOM element ID mapping
*/
const VIEW_ELEMENTS = {
[AppState.ADMIN]:    'view-admin',
[AppState.LOGS]:     'view-logs',
[AppState.DATABASE]: 'view-database',
'APPROVALS':         'view-approvals'
};

const TAB_PAGE_TITLES = {
[AppState.ADD]:      'Add New Routing',
[AppState.LOOKUP]:   'Look Up Record',
[AppState.UPDATE]:   'Update Routing',
[AppState.MANAGE]:   'Line Configuration',
[AppState.ALLDATA]:  'View All Data',
[AppState.ADMIN]:    'Admin Panel',
[AppState.LOGS]:     'System Logs',
[AppState.DATABASE]: 'Database Management',
'APPROVALS':         'Pending Approvals',
};

const ROUTING_TABS = [
AppState.ADD,
AppState.LOOKUP,
AppState.UPDATE,
AppState.MANAGE,
AppState.ALLDATA,
];

/**
* Switch to a different tab/view.
* Saves the current tab's form state before switching,
* then restores the target tab's saved state if available.
* @param {string} tabId - The AppState value to switch to
*/
async function switchTab(tabId) {
const previousState = App.currentState;
const role = (Auth.getUser() || {}).role || '';

// --- Guard: admin-only tabs ---
if ((tabId === AppState.ADMIN || tabId === AppState.LOGS || tabId === AppState.DATABASE || tabId === 'APPROVALS') && role !== 'admin') {
showModal({
icon: 'danger',
title: 'Access Denied',
message: 'You do not have permission to access this page. Admin role is required.',
type: 'confirm',
confirmLabel: 'OK',
});
return;
}

// --- Guard: routing/data tabs are not available to admin ---
const routingStates = [
AppState.ADD, AppState.LOOKUP, AppState.UPDATE,
AppState.ALLDATA
];
if (role === 'admin' && routingStates.includes(tabId)) {
tabId = AppState.ADMIN;
}

// --- Guard: user role may only access Lookup and All Data ---
const userAllowedStates = [AppState.LOOKUP, AppState.ALLDATA];
if (role === 'user' && !userAllowedStates.includes(tabId)) {
// Silently redirect to Lookup (their default landing tab)
tabId = AppState.LOOKUP;
}

// --- Save current tab form state before leaving ---
// Must happen BEFORE confirmDiscardManageChanges, because that function calls
// populateProdLineSelect() which rebuilds the #prodLine dropdown and resets
// its selected value to blank — causing saveTabFormState to capture '' instead
// of the real production line the user had loaded in the Update/Add/Lookup tab.
if (
previousState !== tabId &&
(previousState === AppState.ADD ||
previousState === AppState.LOOKUP ||
previousState === AppState.UPDATE)
) {
saveTabFormState(previousState);
}

// --- Guard: if leaving MANAGE with unsaved pending changes, ask first ---
if (previousState === AppState.MANAGE && previousState !== tabId) {
  if (typeof confirmDiscardManageChanges === 'function') {
    const ok = await confirmDiscardManageChanges();
    if (!ok) return; // user chose to stay and keep editing
  }
}

// Update global state
App.currentState = tabId;

// Reset all tab styles
Object.values(TAB_ELEMENTS).forEach(id => {
const el = document.getElementById(id);
if (el) el.className = 'nav-tab nav-tab--inactive';
});

// Set active tab style
const activeTabId = TAB_ELEMENTS[tabId];
if (activeTabId) {
const activeEl = document.getElementById(activeTabId);
if (activeEl) activeEl.className = 'nav-tab nav-tab--active';
}

_updatePageTitle(tabId);

// Route to the appropriate view
routeToView(tabId, previousState);
}

function _updatePageTitle(tabId) {
const titleEl = document.getElementById('page-title');
if (titleEl) {
titleEl.textContent = TAB_PAGE_TITLES[tabId] || '';
}

  const formInstructions = document.getElementById('form-instructions');
  const instructionsAdd = document.getElementById('instructions-add');
  const instructionsUpdate = document.getElementById('instructions-update');

  if (formInstructions) {
    const isAdd = tabId === AppState.ADD;
    const isUpdate = tabId === AppState.UPDATE;
    
    if (isAdd || isUpdate) {
      formInstructions.style.display = 'block';
      if (instructionsAdd) instructionsAdd.style.display = isAdd ? 'block' : 'none';
      if (instructionsUpdate) instructionsUpdate.style.display = isUpdate ? 'block' : 'none';
    } else {
      formInstructions.style.display = 'none';
    }
  }
}

/**
* Route to the appropriate view based on state.
* @param {string} state
* @param {string} [previousState] - The state we switched FROM
*/
function routeToView(state, previousState) {
const viewRouting  = document.getElementById('view-routing');
const viewManage   = document.getElementById('view-manage');
const viewAllData  = document.getElementById('view-alldata');
const viewAdmin    = document.getElementById('view-admin');
const viewLogs     = document.getElementById('view-logs');
const viewDatabase = document.getElementById('view-database');
const viewApprovals = document.getElementById('view-approvals');

// Hide all views first
if (viewRouting)  viewRouting.classList.add('hidden');
if (viewManage)   viewManage.classList.add('hidden');
if (viewAllData)  viewAllData.classList.add('hidden');
if (viewAdmin)    viewAdmin.classList.add('hidden');
if (viewLogs)     viewLogs.classList.add('hidden');
if (viewDatabase) viewDatabase.classList.add('hidden');
if (viewApprovals) viewApprovals.classList.add('hidden');

switch (state) {
case AppState.ADD:
showRoutingView(viewRouting, viewManage, viewAllData, 'add', previousState);
break;
case AppState.LOOKUP:
showRoutingView(viewRouting, viewManage, viewAllData, 'lookup', previousState);
break;
case AppState.UPDATE:
showRoutingView(viewRouting, viewManage, viewAllData, 'update', previousState);
break;
case AppState.MANAGE:
showManageView(viewRouting, viewManage, viewAllData);
break;
case AppState.ALLDATA:
showAllDataView(viewRouting, viewManage, viewAllData);
break;
case AppState.ADMIN:
showAdminView(viewAdmin);
break;
case AppState.LOGS:
showLogsView(viewLogs);
break;
case AppState.DATABASE:
showDatabaseView();
break;
case 'APPROVALS':
if (viewApprovals) viewApprovals.classList.remove('hidden');
break;
default:
console.warn('Unknown tab state:', state);
showRoutingView(viewRouting, viewManage, viewAllData, 'add', previousState);
}
}

/**
* Configure and show the routing form view (ADD/LOOKUP/UPDATE).
* Restores saved tab state if available; otherwise sets defaults.
* @param {string} mode - 'add' | 'lookup' | 'update'
* @param {string} [previousState] - The state we came from
*/
function showRoutingView(viewRouting, viewManage, viewAllData, mode, previousState) {
viewRouting.classList.remove('hidden');
viewManage.classList.add('hidden');
viewAllData.classList.add('hidden');

const searchSection = document.getElementById('search-section');
const saveBtn       = document.getElementById('save-section');
const searchStatus  = document.getElementById('search-status');

// Map mode string to AppState key for TabFormState lookup
const tabKey = mode === 'add'    ? AppState.ADD
: mode === 'lookup' ? AppState.LOOKUP
: AppState.UPDATE;

if (mode === 'add') {
searchSection.classList.add('hidden');
saveBtn.classList.remove('hidden');
// ADD mode: hide Update, Refresh, and Archive buttons — not applicable here
if (typeof _setUpdateActionButtonsVisible === 'function') {
  _setUpdateActionButtonsVisible(false);
}
// Show Clear button in ADD mode
if (typeof _setClearBtnVisible === 'function') _setClearBtnVisible(true);
// ADD mode: hide notes field, show normal form inputs, hide lookup display
_setNotesVisible(false);
_setLookupDisplayVisible(false);

// Restore saved state or start fresh
const restored = restoreTabFormState(AppState.ADD);
if (!restored) {
clearForm();
setFormEditable(true);
} else {
setFormEditable(true);
}
updateDelColumnVisibility();

} else if (mode === 'lookup') {
searchSection.classList.remove('hidden');
saveBtn.classList.add('hidden');
// Hide UPDATE-only action buttons when on other tabs
if (typeof _setUpdateActionButtonsVisible === 'function') {
_setUpdateActionButtonsVisible(false);
}
// Hide Clear button in LOOKUP (read-only)
if (typeof _setClearBtnVisible === 'function') _setClearBtnVisible(false);
// LOOKUP mode: hide input form, show plain-text display
_setNotesVisible(false);
_setLookupDisplayVisible(true);

// Restore saved state or start fresh
const restored = restoreTabFormState(AppState.LOOKUP);
if (!restored) {
clearForm();
setFormEditable(false);
if (searchStatus) {
searchStatus.textContent = '';
searchStatus.className   = 'search-status';
}
} else {
setFormEditable(false);
}
updateDelColumnVisibility();

} else if (mode === 'update') {
searchSection.classList.remove('hidden');
saveBtn.classList.add('hidden');
// Hide Clear button in UPDATE mode
if (typeof _setClearBtnVisible === 'function') _setClearBtnVisible(false);
// UPDATE mode: show notes field, show normal form inputs, hide lookup display
_setNotesVisible(true);
_setLookupDisplayVisible(false);

// Restore saved state or start fresh
const restored = restoreTabFormState(AppState.UPDATE);
if (!restored) {
clearForm();
setFormEditable(false);
_setUpdateActionButtonsVisible(false);
if (searchStatus) {
searchStatus.textContent = '';
searchStatus.className   = 'search-status';
}
} else {
// After restore, keep editable only if a record had been loaded
// (If itemCode is filled, assume a record was loaded and form should be editable)
const itemCodeEl = document.getElementById('itemCode');
const hasRecord  = itemCodeEl && itemCodeEl.value.trim() !== '';
setFormEditable(hasRecord);
_setUpdateActionButtonsVisible(hasRecord);
if (hasRecord) {
// Item code itself stays locked (can't change it during update)
if (itemCodeEl) itemCodeEl.disabled = true;
} else if (searchStatus) {
searchStatus.textContent = '';
searchStatus.className   = 'search-status';
}
}
updateDelColumnVisibility();
}
}

/**
* Show the manage activities view
*/
function showManageView(viewRouting, viewManage, viewAllData) {
viewRouting.classList.add('hidden');
viewAllData.classList.add('hidden');
viewManage.classList.remove('hidden');
initManageLines();
}

/**
* Show the all data (paginated) view
*/
function showAllDataView(viewRouting, viewManage, viewAllData) {
viewRouting.classList.add('hidden');
viewManage.classList.add('hidden');
viewAllData.classList.remove('hidden');
App.currentPage = 1;
// Load from API (falls back to local cache if unreachable)
loadAndRenderAllData();
}

/**
* Show the Admin Panel view (admin only)
*/
function showAdminView(viewAdmin) {
if (!Auth.isAdmin()) {
switchTab(AppState.ADD);
return;
}
viewAdmin.classList.remove('hidden');
initAdminPanel();
}

/**
* Show the Audit Logs view (admin only)
*/
function showLogsView(viewLogs) {
if (!Auth.isAdmin()) {
switchTab(AppState.ADD);
return;
}
viewLogs.classList.remove('hidden');
initAuditLogs();
}

/**
* Show the Database Management view (admin only)
*/
function showDatabaseView() {
if (!Auth.isAdmin()) {
switchTab(AppState.ADD);
return;
}
const viewDatabase = document.getElementById('view-database');
if (viewDatabase) viewDatabase.classList.remove('hidden');
// Clear previous search results when navigating to the tab
const searchInput = document.getElementById('db-search-input');
if (searchInput) searchInput.value = '';
const tbody = document.getElementById('db-results-tbody');
if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;font-style:italic;padding:2rem;">Search for a product above to see results.</td></tr>';
const countEl = document.getElementById('db-result-count');
if (countEl) countEl.textContent = '';
const errEl = document.getElementById('db-error');
if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
const okEl = document.getElementById('db-success');
if (okEl) { okEl.style.display = 'none'; okEl.textContent = ''; }
}

/**
* Show or hide the notes field (visible in UPDATE/LOOKUP, hidden in ADD).
* @param {boolean} visible
*/
function _setNotesVisible(visible) {
const viewRouting = document.getElementById('view-routing');
if (viewRouting) {
if (visible) {
viewRouting.classList.add('show-notes');
} else {
viewRouting.classList.remove('show-notes');
}
}
}

/**
* Toggle between the plain-text lookup display and the editable form-grid.
* @param {boolean} showLookup
*/
function _setLookupDisplayVisible(showLookup) {
  const lookupDisplay = document.getElementById('lookup-display');
  const formGrid      = document.getElementById('form-grid-inputs');
  const formInstructions = document.getElementById('form-instructions');
  const modeToggle    = document.querySelector('.mode-toggle');
  if (lookupDisplay) lookupDisplay.style.display = showLookup ? 'block' : 'none';
  if (formGrid)      formGrid.style.display      = showLookup ? 'none'  : '';
  // Hide the instructions box and mode toggle in LOOKUP mode (read-only — not applicable)
  if (formInstructions) formInstructions.style.display  = showLookup ? 'none'  : 'block';
  if (modeToggle)    modeToggle.style.display     = showLookup ? 'none'  : '';
}

// Expose globally
window.switchTab    = switchTab;
window.routeToView  = routeToView;
window.showAdminView = showAdminView;
window.showLogsView  = showLogsView;
window._setNotesVisible         = _setNotesVisible;