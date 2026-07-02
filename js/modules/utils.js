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

/**
 * Trap keyboard focus inside a modal element.
 * Prevents Tab from cycling to elements outside the modal while it is open.
 *
 * @param {HTMLElement} modalEl - The modal container to restrict focus to.
 * @returns {Function} cleanup - Call this function when the modal closes to
 *                               remove the event listener.
 */
function trapFocus(modalEl) {
  if (!modalEl) return function() {};

  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  function getFocusable() {
    return Array.from(modalEl.querySelectorAll(FOCUSABLE)).filter(function(el) {
      return !el.closest('[style*="display:none"]') && !el.closest('[style*="display: none"]');
    });
  }

  function handler(e) {
    if (e.key !== 'Tab') return;
    var focusable = getFocusable();
    if (focusable.length === 0) { e.preventDefault(); return; }

    var first = focusable[0];
    var last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap backward
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: wrap forward
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener('keydown', handler);

  // Auto-focus the first focusable element inside the modal
  var focusable = getFocusable();
  if (focusable.length > 0) {
    // Small delay allows modal animations/display to finish before focusing
    setTimeout(function() { focusable[0].focus(); }, 50);
  }

  return function cleanup() {
    document.removeEventListener('keydown', handler);
  };
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
window.trapFocus = trapFocus;
