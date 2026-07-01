/* ============================================
   STATE.JS - Application State & Constants
   Pioneer Adhesives Routing Template System
   ============================================ */

/**
 * Production line descriptions lookup
 * Maps line codes to human-readable descriptions
 */
const LINE_DESCRIPTIONS = {
  'L01':  'L01 - L1 COATINGS',
  'L02':  'L02 - L2 CYANO BOTTLE FILLING',
  'L03':  'L03 - L3 CYANO TUBE FILLING',
  'L04A': 'L04A - L4A ELASTO MIXING',
  'L04B': 'L04B - L4B SEMI AUTO FILLING',
  'L04C': 'L04C - L4C AUTO FILLING',
  'L05':  'L05 - L5 EPOXY CLAY',
  'L06':  'L06 - L6 EPOXY LINE',
  'L07':  'L07 - L7 EPOXY TUBE FILLING',
  'L08':  'L08 - L8',
  'L09':  'L09 - L9 EPS - BLOCKS',
  'L09A': 'L09A - L9A EPS - CUTTING',
  'L10':  'L10 - L10 CONTACT BOND',
  'L11':  'L11 - L11 SILICONE FILLING LINE',
  'L12':  'L12 - L12 SPECIAL PRODUCTS - EPOXY BASED',
  'L13':  'L13 - L13 SPECIAL PRODUCTS - WATER BASED',
  'L14':  'L14 - L14 SKIM COAT',
  'SIPS': 'SIPS - STRUCTURAL INSULATED PANEL'
};

/**
 * Application States
 * @readonly
 * @enum {string}
 */
const AppState = Object.freeze({
  ADD:      'ADD',
  LOOKUP:   'LOOKUP',
  UPDATE:   'UPDATE',
  MANAGE:   'MANAGE',
  ALLDATA:  'ALLDATA',
  ADMIN:    'ADMIN',
  LOGS:     'LOGS',
  DATABASE: 'DATABASE'   // Admin-only: search + delete products
});

/**
 * Template Modes
 * @readonly
 * @enum {string}
 */
const TemplateMode = Object.freeze({
  FG: 'FG',   // Finished Goods
  BM: 'BM'    // Bulk Material
});

/**
 * Global application state container
 */
const App = {
  /** @type {string} Current application state */
  currentState: AppState.ADD,

  /** @type {string} Current template mode (FG or BM) */
  currentMode: TemplateMode.FG,

  /** @type {number} Current page for pagination */
  currentPage: 1,

  /** @type {number} Items per page for pagination */
  itemsPerPage: 20,

  /** @type {boolean} Whether form is in editable mode */
  isFormEditable: true,

  /** @type {boolean} Whether admin tabs have been initialized */
  adminTabsInitialized: false,

  // The full record last loaded into UPDATE mode (includes activity ids for diffing)
  currentRecord: null
};

/**
 * Tab Form State — persists unsaved form data when switching tabs.
 * Keyed by AppState value (ADD, LOOKUP, UPDATE).
 * Only the routing-form tabs need state saved; MANAGE, ALLDATA, ADMIN, LOGS don't have input forms.
 *
 * Each entry holds:
 *   { itemCode, skuDesc, qty, prodLine, mode, rows: [{activity, pax, machine, time, rawFormula}] }
 */
const TabFormState = {
  [AppState.ADD]:    null,
  [AppState.LOOKUP]: null,
  [AppState.UPDATE]: null,
};

// Make available globally for module access
window.LINE_DESCRIPTIONS = LINE_DESCRIPTIONS;
window.AppState          = AppState;
window.TemplateMode      = TemplateMode;
window.App               = App;
window.TabFormState      = TabFormState;

/* ===================================================
   LOCAL CACHE STATE & HELPERS (MIGRATED FROM MOCK-DB)
   =================================================== */

const lineActivitiesDB = {};

function normalizeLineActivity(activity) {
  if (activity && typeof activity === 'object') {
    return {
      id: activity.id ?? activity.activity_id ?? activity.line_activity_id ?? activity.production_line_activity_id ?? null,
      activity_name: (activity.activity_name || activity.name || activity.activities || '').toString().toUpperCase(),
      sort_order: activity.sort_order,
      stage: activity.stage,
    };
  }

  return {
    id: null,
    activity_name: String(activity || '').toUpperCase(),
  };
}

function getLineActivityName(activity) {
  return activity && typeof activity === 'object'
    ? (activity.activity_name || activity.name || activity.activities || '').toString()
    : String(activity || '');
}

function getLineActivityId(activity) {
  if (!activity || typeof activity !== 'object') return null;
  return activity.id ?? activity.activity_id ?? activity.line_activity_id ?? activity.production_line_activity_id ?? null;
}

const mockRoutingDB = {};

function seedMockData(count = 25) {}

function getRoutingRecord(itemCode) {
  return mockRoutingDB[itemCode.toUpperCase()] || null;
}

function getAllRoutingRecords() {
  return Object.values(mockRoutingDB);
}

function saveRoutingRecord(itemCode, data) {
  mockRoutingDB[itemCode.toUpperCase()] = data;
}

function getLineActivities(lineCode) {
  return lineActivitiesDB[lineCode] || [];
}

function addLineActivity(lineCode, activity) {
  if (!lineActivitiesDB[lineCode]) {
    lineActivitiesDB[lineCode] = [];
  }
  lineActivitiesDB[lineCode].push(normalizeLineActivity(activity));
}

function removeLineActivity(lineCode, index) {
  if (lineActivitiesDB[lineCode]) {
    lineActivitiesDB[lineCode].splice(index, 1);
  }
}

function updateLineActivity(lineCode, index, newValue) {
  if (lineActivitiesDB[lineCode]) {
    const existing = normalizeLineActivity(lineActivitiesDB[lineCode][index]);
    existing.activity_name = newValue.trim().toUpperCase();
    lineActivitiesDB[lineCode][index] = existing;
  }
}

function addProductionLine(code, description) {
  LINE_DESCRIPTIONS[code] = description;
  lineActivitiesDB[code] = [];
}

function updateProductionLine(code, newDescription) {
  if (LINE_DESCRIPTIONS[code]) {
    LINE_DESCRIPTIONS[code] = newDescription;
  }
}

function renameProductionLine(oldCode, newCode, newDescription) {
  if (!LINE_DESCRIPTIONS[oldCode]) return;
  LINE_DESCRIPTIONS[newCode] = newDescription;
  if (newCode !== oldCode) delete LINE_DESCRIPTIONS[oldCode];
  if (lineActivitiesDB[oldCode]) {
    lineActivitiesDB[newCode] = lineActivitiesDB[oldCode];
    if (newCode !== oldCode) delete lineActivitiesDB[oldCode];
  }
  Object.keys(mockRoutingDB).forEach(key => {
    const record = mockRoutingDB[key];
    if (record.production_line_code === oldCode) {
      record.production_line_code = newCode;
    }
  });
}

function deleteProductionLine(code) {
  delete LINE_DESCRIPTIONS[code];
  delete lineActivitiesDB[code];
}

window.lineActivitiesDB = lineActivitiesDB;
window.mockRoutingDB = mockRoutingDB;
window.seedMockData = seedMockData;
window.getRoutingRecord = getRoutingRecord;
window.getAllRoutingRecords = getAllRoutingRecords;
window.saveRoutingRecord = saveRoutingRecord;
window.getLineActivities = getLineActivities;
window.normalizeLineActivity = normalizeLineActivity;
window.getLineActivityName = getLineActivityName;
window.getLineActivityId = getLineActivityId;
window.addLineActivity = addLineActivity;
window.removeLineActivity = removeLineActivity;
window.updateLineActivity = updateLineActivity;
window.addProductionLine = addProductionLine;
window.updateProductionLine = updateProductionLine;
window.renameProductionLine = renameProductionLine;
window.deleteProductionLine = deleteProductionLine;