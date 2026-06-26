/* ============================================
   MOCK-DB.JS - In-Memory Data Store
   Pioneer Adhesives Routing Template System
   
   Simulates a backend database for development
   and testing. Replace with real API calls.
   ============================================ */
 
/**
 * Mock database for line standard activities
 * Maps production line codes to arrays of activity names
 * @type {Object.<string, string[]>}
 */
const lineActivitiesDB = {
  'L01': [
    'UNBOXING',
    'LABELING',
    'BOX PREPARATION'
  ],
  'L11': [
    'UNBOXING',
    'BATCH CODING',
    'PLACING OF CODED PAIL STICKER LABEL',
    'REBOXING'
  ]
};

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
 
/**
 * Mock routing database
 * Maps inventory IDs to routing records
 * @type {Object.<string, Object>}
 */
const mockRoutingDB = {};
 
/**
 * Seed mock database with dummy data for pagination testing
 * @param {number} count - Number of dummy records to generate
 */
function seedMockData(count = 25) {
  for (let i = 1; i <= count; i++) {
    const code = 'DUMMY-' + String(i).padStart(3, '0');
    mockRoutingDB[code] = {
      inventory_id: code,
      revision_descr: 'Dummy Product ' + i,
      production_line_code: 'L0' + ((i % 9) + 1),
      product_type: i % 3 === 0 ? 'Base Material (BM)' : 'Finished Good (FG)',
      activities: []
    };
  }
}
 
/**
 * Get a single routing record by item code
 * @param {string} itemCode - The inventory ID to look up
 * @returns {Object|null} The routing record or null
 */
function getRoutingRecord(itemCode) {
  return mockRoutingDB[itemCode.toUpperCase()] || null;
}
 
/**
 * Get all routing records as an array
 * @returns {Object[]}
 */
function getAllRoutingRecords() {
  return Object.values(mockRoutingDB);
}
 
/**
 * Save or update a routing record
 * @param {string} itemCode
 * @param {Object} data
 */
function saveRoutingRecord(itemCode, data) {
  mockRoutingDB[itemCode.toUpperCase()] = data;
}
 
/**
 * Get activities for a production line
 * @param {string} lineCode
 * @returns {string[]}
 */
function getLineActivities(lineCode) {
  return lineActivitiesDB[lineCode] || [];
}
 
/**
 * Add activity to a production line
 * @param {string} lineCode
 * @param {string} activity
 */
function addLineActivity(lineCode, activity) {
  if (!lineActivitiesDB[lineCode]) {
    lineActivitiesDB[lineCode] = [];
  }
  lineActivitiesDB[lineCode].push(normalizeLineActivity(activity));
}
 
/**
 * Remove activity from a production line
 * @param {string} lineCode
 * @param {number} index
 */
function removeLineActivity(lineCode, index) {
  if (lineActivitiesDB[lineCode]) {
    lineActivitiesDB[lineCode].splice(index, 1);
  }
} // Fixed: added missing closing brace here
 
/**
 * Update activity name for a production line
 * @param {string} lineCode
 * @param {number} index
 * @param {string} newValue
 */
function updateLineActivity(lineCode, index, newValue) {
  if (lineActivitiesDB[lineCode]) {
    const existing = normalizeLineActivity(lineActivitiesDB[lineCode][index]);
    existing.activity_name = newValue.trim().toUpperCase();
    lineActivitiesDB[lineCode][index] = existing;
  }
}
 
/* ===================================================
   NEW LINE CRUD OPERATIONS
   =================================================== */
 
/**
 * Add a new production line
 */
function addProductionLine(code, description) {
  LINE_DESCRIPTIONS[code] = description;
  lineActivitiesDB[code] = [];
}
 
/**
 * Update an existing production line description
 */
function updateProductionLine(code, newDescription) {
  if (LINE_DESCRIPTIONS[code]) {
    LINE_DESCRIPTIONS[code] = newDescription;
  }
}
 
/**
 * Rename a production line code and/or description.
 * Migrates activities and routing records to the new code key.
 * @param {string} oldCode
 * @param {string} newCode
 * @param {string} newDescription
 */
function renameProductionLine(oldCode, newCode, newDescription) {
  if (!LINE_DESCRIPTIONS[oldCode]) return;
 
  // Migrate LINE_DESCRIPTIONS
  LINE_DESCRIPTIONS[newCode] = newDescription;
  if (newCode !== oldCode) delete LINE_DESCRIPTIONS[oldCode];
 
  // Migrate activities
  if (lineActivitiesDB[oldCode]) {
    lineActivitiesDB[newCode] = lineActivitiesDB[oldCode];
    if (newCode !== oldCode) delete lineActivitiesDB[oldCode];
  }
 
  // Migrate any routing records that reference the old code
  Object.keys(mockRoutingDB).forEach(key => {
    const record = mockRoutingDB[key];
    if (record.production_line_code === oldCode) {
      record.production_line_code = newCode;
    }
  });
}
 
/**
 * Delete a production line entirely
 */
function deleteProductionLine(code) {
  delete LINE_DESCRIPTIONS[code];
  delete lineActivitiesDB[code];
}
 
// Expose to window
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
 
// New exposures
window.addProductionLine = addProductionLine;
window.updateProductionLine = updateProductionLine;
window.renameProductionLine = renameProductionLine;
window.deleteProductionLine = deleteProductionLine;
