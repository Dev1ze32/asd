/* ============================================
   ALL-DATA.JS - Paginated Table View
   Pioneer Adhesives Routing Template System

   Displays all routing records with pagination.
   Loads from API on init (limit=1000 to get all
   records), falls back to mock-db on failure.
   ============================================ */

/**
 * Load all records from API into local cache, then render.
 * Passes limit=1000 (API max) to ensure we get all 491 entries.
 */
async function loadAndRenderAllData() {
  // Show a loading indicator
  const tbody = document.getElementById('allDataTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-gray-500 italic">
          Loading records from server...
        </td>
      </tr>`;
  }

  try {
    // Use limit=1000 (API max) so we retrieve every record, not just the default 50
    // API response shape: { total, limit, offset, results: [...] }
    const res = await apiGetItems('', 1000);
    const items = res.ok && res.data && Array.isArray(res.data.results)
      ? res.data.results
      : null;

    if (items) {
      // Sync API response into local mock-db cache using normalized fields
      items.forEach(item => {
        const key = (item.inventory_id || item.item_code || '').toUpperCase();
        if (!key) return;

        // Normalize API item to internal format before caching
        const normalized = _normalizeApiItem(item);
        if (normalized) {
          saveRoutingRecord(key, normalized);
        }
      });
      console.log(`[API] Loaded ${items.length} items into local cache. (API total: ${res.data.total})`);
    } else {
      console.warn('[API] Could not load items (status ' + res.status + '), using local cache.');
    }
  } catch (_) {
    console.warn('[API] Unreachable — displaying local cache.');
  }
  renderAllData();
}

/**
 * Triggered when any filter dropdown or search input changes.
 */
function applyAllDataFilters() {
  App.currentPage = 1;
  renderAllData();
}

/**
 * Render the paginated data table from local cache.
 */
function renderAllData() {
  let dbArray = getAllRoutingRecords();

  // Apply Filters
  const filterSku = document.getElementById('alldata-filter-sku')?.value.trim().toUpperCase() || '';
  const filterLine = document.getElementById('alldata-filter-line')?.value || '';
  const filterType = document.getElementById('alldata-filter-type')?.value || '';

  if (filterSku) {
    dbArray = dbArray.filter(item => {
      const sku = (item.revision_descr || item.skuDesc || '').toUpperCase();
      const code = (item.inventory_id || item.item_code || item.itemCode || '').toUpperCase();
      return sku.includes(filterSku) || code.includes(filterSku);
    });
  }
  if (filterLine) {
    dbArray = dbArray.filter(item => {
      const line = item.production_line_code || item.fg_production_line_code || item.bm_production_line_code || item.prodLine || '';
      return line === filterLine;
    });
  }
  if (filterType) {
    dbArray = dbArray.filter(item => {
      // product_type usually comes in as "Finished Good (FG)" or "Base Material (BM)"
      const type = (item.product_type || item.mode || '').toUpperCase();
      if (filterType === 'FG') return type.includes('FG') || type.includes('FINISHED');
      if (filterType === 'BM') return type.includes('BM') || type.includes('BASE');
      return true;
    });
  }

  const totalItems = dbArray.length;
  const totalPages = Math.ceil(totalItems / App.itemsPerPage) || 1;

  if (App.currentPage < 1) App.currentPage = 1;
  if (App.currentPage > totalPages) App.currentPage = totalPages;

  const startIndex = (App.currentPage - 1) * App.itemsPerPage;
  const endIndex = Math.min(startIndex + App.itemsPerPage, totalItems);
  const paginatedData = dbArray.slice(startIndex, endIndex);
  const tbody = document.getElementById('allDataTableBody');

  if (!tbody) return;
  tbody.innerHTML = '';

  if (paginatedData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-gray-500 italic">
          No records found in database.
        </td>
      </tr>`;
  } else {
    paginatedData.forEach(item => {
      const tr = document.createElement('tr');

      // Support both internal and raw API field names
      const itemCode    = item.inventory_id || item.itemCode || 'N/A';
      const skuDesc     = item.revision_descr || item.skuDesc || '';
      // production_line_code may come from fg or bm fields
      const lineCode    = item.production_line_code
                        || item.fg_production_line_code
                        || item.bm_production_line_code
                        || item.prodLine
                        || '';
      const productType  = item.product_type || '';
      const typeCode    = getTypeShortCode(productType);
      const badgeClass  = getTypeBadgeClass(productType);

      tr.innerHTML = `
        <td class="col-item-code">${sanitizeInput(itemCode)}</td>
        <td>${sanitizeInput(skuDesc)}</td>
        <td>${sanitizeInput(lineCode)}</td>
        <td><span class="badge ${badgeClass}">${typeCode}</span></td>
        <td class="text-center">
          <button class="link-action btn-view-detail"
                  data-item-code="${sanitizeInput(itemCode)}"
                  type="button">
            View Details
          </button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // FIX (MEDIUM-002): Attach a single delegated listener to the tbody instead of
  // embedding item codes in inline onclick handlers.  The listener reads the item
  // code from a data-attribute, which is never executed as JavaScript.
  if (tbody && !tbody.dataset.listenerBound) {
    tbody.dataset.listenerBound = 'true';
    tbody.addEventListener('click', function(e) {
      const btn = e.target.closest('.btn-view-detail');
      if (!btn) return;
      const code = btn.getAttribute('data-item-code');
      if (code) viewFromAllData(code);
    });
  }

  const paginationInfo = document.getElementById('pagination-info');
  if (paginationInfo) {
    paginationInfo.textContent =
      `Showing ${totalItems === 0 ? 0 : startIndex + 1} to ${endIndex} of ${totalItems} entries`;
  }

  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  if (btnPrev) btnPrev.disabled = App.currentPage === 1;
  if (btnNext) btnNext.disabled = App.currentPage === totalPages || totalPages === 0;
}

/**
 * Change the current page.
 */
function changePage(delta) {
  App.currentPage += delta;
  renderAllData();
}

/**
 * View a record's details from the All Data table.
 */
function viewFromAllData(itemCode) {
  if (!itemCode) return;
  switchTab(AppState.LOOKUP);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = itemCode;
  performSearch();
}

window.loadAndRenderAllData = loadAndRenderAllData;
window.applyAllDataFilters = applyAllDataFilters;
window.renderAllData        = renderAllData;
window.changePage           = changePage;
window.viewFromAllData      = viewFromAllData;

/* ============================================
   EXPORT TO EXCEL — Database tab only
   Calls GET /api/export — the server returns a
   ready-made .xlsx blob (one row per activity,
   mirroring the ACU Routing template structure).
   Requires superuser or admin role.
   ============================================ */

/**
 * Open the export confirmation modal.
 * Only reachable from the Database tab button.
 */
function showExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  modal.classList.add('is-open');

  // Reset confirm button in case a previous export was interrupted
  _resetExportBtn();

  // Trap focus inside the modal for keyboard accessibility
  modal._releaseFocus = typeof trapFocus === 'function' ? trapFocus(modal) : function() {};

  // Close on backdrop click
  modal.addEventListener('click', _exportModalBackdropClose, { once: true });

  // Close on Escape key
  document.addEventListener('keydown', _exportModalEscClose);
}

/**
 * Close the export confirmation modal.
 */
function hideExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  modal.classList.remove('is-open');
  document.removeEventListener('keydown', _exportModalEscClose);
  // Release focus trap
  if (typeof modal._releaseFocus === 'function') {
    modal._releaseFocus();
    modal._releaseFocus = null;
  }
}

/** @private — restore confirm button to its default state */
function _resetExportBtn() {
  const btn = document.getElementById('btn-export-confirm');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download Excel`;
}

/** @private — close modal when clicking the backdrop (not the panel) */
function _exportModalBackdropClose(e) {
  if (e.target && e.target.id === 'exportModal') {
    hideExportModal();
  }
}

/** @private — close modal on Escape key */
function _exportModalEscClose(e) {
  if (e.key === 'Escape') hideExportModal();
}

/**
 * Call GET /api/export, receive the server-generated .xlsx blob,
 * and trigger a browser download.
 * Requires superuser or admin role — shows a denial modal for plain users.
 */
async function handleExportConfirm() {
  // 🔘 Disable button and show loading state 
  const btn = document.getElementById('btn-export-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  // ── Call the API export endpoint ───────────────────────────────────────
  const res = await apiExportExcel();

  if (!res.ok || !res.data) {
    // Restore button before showing the error
    _resetExportBtn();
    hideExportModal();

    const errMsg = res.status === 403
      ? 'You do not have permission to export the database. Superuser or Admin role required.'
      : res.status === 0
        ? 'Could not reach the server. Please check your connection and try again.'
        : getApiErrorMessage(res, 'export database');

    await showModal({
      icon:         'danger',
      title:        'Export Failed',
      message:      errMsg,
      type:         'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  // ── Trigger browser download from the returned blob ────────────────────
  const url = URL.createObjectURL(res.data);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = res.filename || 'Pioneer_Routing_Export.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // ── Clean up and notify ────────────────────────────────────────────────
  _resetExportBtn();
  hideExportModal();
  showToast({
    type:    'success',
    title:   'Export Complete',
    message: `Database exported as "${a.download}".`,
  });
}

window.showExportModal     = showExportModal;
window.hideExportModal     = hideExportModal;
window.handleExportConfirm = handleExportConfirm;

/* ============================================
   LOOKUP EXPORT — Single-product variant
   Uses the same #exportModal but re-labels the
   heading/message for a specific item code.
   ============================================ */

/** @private — which mode the export modal is currently in */
let _exportModalMode = 'all'; // 'all' | 'item'
let _exportModalItemCode = '';

/**
 * Open the export modal scoped to a specific item code (Lookup tab).
 * @param {string} itemCode - The item code to export.
 */
function showLookupExportModal(itemCode) {
  if (!itemCode) return;

  _exportModalMode     = 'item';
  _exportModalItemCode = itemCode.trim().toUpperCase();

  const modal    = document.getElementById('exportModal');
  const titleEl  = document.getElementById('exportModalTitle');
  const msgEl    = modal ? modal.querySelector('.modal-message') : null;

  if (titleEl)  titleEl.textContent = 'Export to Excel';
  if (msgEl)    msgEl.textContent   =
    `Are you sure you want to export the routing data for "${_exportModalItemCode}" to Excel? ` +
    `This file will contain the product information and all its line activities.`;

  showExportModal();
}

/**
 * Restore modal labels to the full-database defaults (called by hideExportModal).
 * @private
 */
function _restoreExportModalDefaults() {
  const modal   = document.getElementById('exportModal');
  const titleEl = document.getElementById('exportModalTitle');
  const msgEl   = modal ? modal.querySelector('.modal-message') : null;

  if (titleEl) titleEl.textContent = 'Export Database';
  if (msgEl)   msgEl.textContent   =
    'Are you sure you want to export the entire routing database to Excel? ' +
    'This file will contain all products and line activities.';

  _exportModalMode     = 'all';
  _exportModalItemCode = '';
}

// Wrap hideExportModal to also restore defaults when dismissed
const _origHideExportModal = hideExportModal;
window.hideExportModal = function() {
  _origHideExportModal();
  _restoreExportModalDefaults();
};

// Wrap handleExportConfirm to dispatch to the right endpoint
const _origHandleExportConfirm = handleExportConfirm;
window.handleExportConfirm = async function() {
  if (_exportModalMode === 'item') {
    await _handleLookupExportConfirm();
  } else {
    await _origHandleExportConfirm();
  }
};

/**
 * @private — item-scoped export confirm handler
 */
async function _handleLookupExportConfirm() {
  const itemCode = _exportModalItemCode;
  if (!itemCode) { hideExportModal(); return; }

  // 🔘 Disable button and show loading state 
  const btn = document.getElementById('btn-export-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  // ── Call the API export endpoint ───────────────────────────────────────
  const res = await apiExportExcelItem(itemCode);

  if (!res.ok || !res.data) {
    _resetExportBtn();
    hideExportModal();

    const errMsg = res.status === 403
      ? 'You do not have permission to export. Superuser or Admin role required.'
      : res.status === 404
        ? `No routing record found for item code "${itemCode}".`
        : res.status === 0
          ? 'Could not reach the server. Please check your connection and try again.'
          : getApiErrorMessage(res, 'export item', itemCode);

    await showModal({
      icon:         'danger',
      title:        'Export Failed',
      message:      errMsg,
      type:         'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  // ── Trigger browser download from the returned blob ────────────────────
  const url = URL.createObjectURL(res.data);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = res.filename || `Pioneer_Routing_${itemCode}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // ── Clean up and notify ────────────────────────────────────────────────
  _resetExportBtn();
  hideExportModal();
  showToast({
    type:    'success',
    title:   'Export Complete',
    message: `"${a.download}" downloaded successfully.`,
  });
}

window.showLookupExportModal = showLookupExportModal;