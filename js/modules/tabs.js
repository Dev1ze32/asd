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
[AppState.ADD]:     'tab-add',
[AppState.LOOKUP]:  'tab-lookup',
[AppState.UPDATE]:  'tab-update',
[AppState.MANAGE]:  'tab-manage',
[AppState.ALLDATA]: 'tab-alldata',
[AppState.ADMIN]:   'tab-admin',
[AppState.LOGS]:    'tab-logs'
};

/**
* View ID to DOM element ID mapping
*/
const VIEW_ELEMENTS = {
[AppState.ADMIN]: 'view-admin',
[AppState.LOGS]:  'view-logs'
};

const TAB_PAGE_TITLES = {
[AppState.ADD]:     'Add New Routing',
[AppState.LOOKUP]:  'Look Up Record',
[AppState.UPDATE]:  'Update Routing',
[AppState.MANAGE]:  'Line Configuration',
[AppState.ALLDATA]: 'Database',
[AppState.ADMIN]:   'Admin Panel',
[AppState.LOGS]:    'System Logs',
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
if ((tabId === AppState.ADMIN || tabId === AppState.LOGS) && role !== 'admin') {
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

// --- Guard: if leaving MANAGE with unsaved pending changes, ask first ---
if (previousState === AppState.MANAGE && previousState !== tabId) {
  if (typeof confirmDiscardManageChanges === 'function') {
    const ok = await confirmDiscardManageChanges();
    if (!ok) return; // user chose to stay and keep editing
  }
}

// --- Save current tab form state before leaving ---
// Only save routing form tabs (ADD/LOOKUP/UPDATE) and only when leaving them
if (
previousState !== tabId &&
(previousState === AppState.ADD ||
previousState === AppState.LOOKUP ||
previousState === AppState.UPDATE)
) {
saveTabFormState(previousState);
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

const instructionPanel = document.getElementById('instruction-panel');
if (instructionPanel) {
const showInstructions = ROUTING_TABS.includes(tabId);
instructionPanel.classList.toggle('instruction-panel--visible', showInstructions);
}
}

/**
* Route to the appropriate view based on state.
* @param {string} state
* @param {string} [previousState] - The state we switched FROM
*/
function routeToView(state, previousState) {
const viewRouting = document.getElementById('view-routing');
const viewManage  = document.getElementById('view-manage');
const viewAllData = document.getElementById('view-alldata');
const viewAdmin   = document.getElementById('view-admin');
const viewLogs    = document.getElementById('view-logs');

// Hide all views first
if (viewRouting) viewRouting.classList.add('hidden');
if (viewManage)  viewManage.classList.add('hidden');
if (viewAllData) viewAllData.classList.add('hidden');
if (viewAdmin)   viewAdmin.classList.add('hidden');
if (viewLogs)    viewLogs.classList.add('hidden');

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
const instructions  = document.querySelector('.mode-instructions');
const modeToggle    = document.querySelector('.mode-toggle');
if (lookupDisplay) lookupDisplay.style.display = showLookup ? 'block' : 'none';
if (formGrid)      formGrid.style.display      = showLookup ? 'none'  : '';
// Hide the instructions box and mode toggle in LOOKUP mode (read-only — not applicable)
if (instructions)  instructions.style.display  = showLookup ? 'none'  : '';
if (modeToggle)    modeToggle.style.display     = showLookup ? 'none'  : '';
}

// Expose globally
window.switchTab    = switchTab;
window.routeToView  = routeToView;
window.showAdminView = showAdminView;
window.showLogsView  = showLogsView;
window._setNotesVisible         = _setNotesVisible;
