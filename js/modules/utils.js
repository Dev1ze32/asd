/* ============================================
   UTILS.JS - Helper Functions & Utilities
   Pioneer Adhesives Routing Template System
   ============================================ */

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Format a value as currency string
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5
  }).format(value);
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function sanitizeInput(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Capitalize first letter of a string
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Generate a unique ID
 * @returns {string}
 */
function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get the label for quantity based on current mode
 * @param {string} mode - 'FG' or 'BM'
 * @returns {string}
 */
function getQtyLabel(mode) {
  return mode === 'BM'
    ? 'BM Qty per BATCH (Kg)'
    : 'FG Qty/Unit';
}

/**
 * Check if a product type is Bulk Material
 * @param {string} productType
 * @returns {boolean}
 */
function isBulkMaterial(productType) {
  if (!productType) return false;
  return productType.includes('Base') || productType === 'BM';
}

/**
 * Get type badge class based on product type
 * @param {string} productType
 * @returns {string}
 */
function getTypeBadgeClass(productType) {
  return isBulkMaterial(productType) ? 'badge--bm' : 'badge--fg';
}

/**
 * Get type short code
 * @param {string} productType
 * @returns {string}
 */
function getTypeShortCode(productType) {
  return isBulkMaterial(productType) ? 'BM' : 'FG';
}

/**
 * Deep clone an object
 * @param {Object} obj
 * @returns {Object}
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Validate item code format
 * @param {string} code
 * @returns {boolean}
 */
function isValidItemCode(code) {
  return code && code.trim().length > 0;
}

// Expose globally
window.debounce = debounce;
window.formatCurrency = formatCurrency;
window.sanitizeInput = sanitizeInput;
window.capitalize = capitalize;
window.generateId = generateId;
window.getQtyLabel = getQtyLabel;
window.isBulkMaterial = isBulkMaterial;
window.getTypeBadgeClass = getTypeBadgeClass;
window.getTypeShortCode = getTypeShortCode;
window.deepClone = deepClone;
window.isValidItemCode = isValidItemCode;
