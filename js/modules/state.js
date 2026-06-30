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