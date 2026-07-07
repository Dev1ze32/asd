/* ============================================
   API-SERVICE.JS - Backend API Integration
   Pioneer Adhesives Routing Template System

   Centralized API client for the ACU Routing API.
   All fetch calls go through this module.
   Replace API_BASE_URL with your server address.

   Endpoints (from apispec):
   --- Health ---
   GET  /api/health

   --- Auth ---
   POST /api/auth/login
   GET  /api/auth/me
   POST /api/auth/register (admin only)

   --- Items ---
   GET    /api/items                              Browse / search item codes
   POST   /api/items                              Create a new product
   GET    /api/items/{item_code}                  Look up routing details
   PATCH  /api/items/{item_code}                  Update product metadata
   DELETE /api/items/{item_code}                  Permanently delete a product
   POST   /api/items/{item_code}/activities       Add one activity to a product
   PATCH  /api/items/{item_code}/activities/{id}  Update one activity
   DELETE /api/items/{item_code}/activities/{id}  Remove one activity

   --- Production Lines ---
   GET    /api/production-lines                              List all lines + activities
   POST   /api/production-lines                              Create a new line
   GET    /api/production-lines/{line_code}                  Get a single line
   PATCH  /api/production-lines/{line_code}                  Rename a line
   PUT    /api/production-lines/{line_code}                  Replace line + activities atomically
   DELETE /api/production-lines/{line_code}                  Delete a line
   POST   /api/production-lines/{line_code}/activities       Add one activity to a line
   PATCH  /api/production-lines/{line_code}/activities/{id}  Update one line activity
   DELETE /api/production-lines/{line_code}/activities/{id}  Remove one line activity

   --- Logs (Admin Only) ---
   GET    /api/logs                                         List audit log entries
   DELETE /api/logs/cleanup                                 Purge old log entries
   ============================================ */

/**
 * API Base URL — loaded from config.js (window.APP_CONFIG) at runtime.
 *
 * PRODUCTION REQUIREMENT: The server MUST be served over HTTPS so that
 * JWT tokens and all routing data are transmitted encrypted.
 * Plain HTTP exposes Bearer tokens to anyone on the same network.
 *
 * Configure in js/config.js:
 *   window.APP_CONFIG = { API_BASE_URL: 'https://your-server.local' };
 *
 * Falls back to the value below ONLY for local development.
 * Never commit a production IP/hostname here.
 */
const API_BASE_URL = (
  (typeof window !== 'undefined' && window.APP_CONFIG && typeof window.APP_CONFIG.API_BASE_URL === 'string')
    ? window.APP_CONFIG.API_BASE_URL
    : 'http://localhost:8080'
).replace(/\/$/, ''); // strip trailing slash

/* ============================================
   LOADING ANIMATION SYSTEM
   ============================================ */

/**
 * Reference counter for nested / concurrent API calls.
 * The overlay stays visible as long as any call is still in flight.
 * Only when the counter drops back to 0 is the overlay hidden.
 *
 * FIX (HIGH-001): Previously showLoading/hideLoading had no counter,
 * so the overlay flickered in/out for every individual call during a
 * multi-step UPDATE save. The counter keeps it solid throughout.
 */
let _loadingRefCount = 0;

/**
 * Show the loading overlay spinner.
 * Increments the internal reference counter — safe to call from nested
 * or parallel async functions.  The overlay only appears on the first call
 * (counter 0→1) and the message is updated on every call.
 */
function showLoading(message) {
  _loadingRefCount++;

  let overlay = document.getElementById('api-loading-overlay');
  if (!overlay) {
    // Create the overlay if it doesn't exist
    overlay = document.createElement('div');
    overlay.id = 'api-loading-overlay';
    overlay.setAttribute('role', 'status');          // FIX (MEDIUM-003): screen-reader hint
    overlay.setAttribute('aria-live', 'polite');     // FIX (MEDIUM-003): announced on change
    overlay.setAttribute('aria-label', 'Loading');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'flex-direction:column', 'gap:1rem',
      'background:rgba(15,23,42,0.65)', 'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'transition:opacity 0.2s ease'
    ].join(';');

    overlay.innerHTML = `
      <div style="position:relative;width:56px;height:56px;">
        <div style="position:absolute;inset:0;border:4px solid rgba(255,255,255,0.15);border-radius:50%;"></div>
        <div style="position:absolute;inset:0;border:4px solid transparent;border-top-color:#3b82f6;border-radius:50%;
                    animation:apiSpinner 0.8s linear infinite;"></div>
      </div>
      <span id="api-loading-message" style="color:#e2e8f0;font-size:0.9rem;font-weight:500;letter-spacing:0.02em;"></span>
      <style>@keyframes apiSpinner{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(overlay);
  }

  const msgEl = document.getElementById('api-loading-message');
  if (msgEl) msgEl.textContent = message || 'Loading...';

  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
}

/**
 * Decrement the loading reference counter.
 * The overlay is only hidden when ALL in-flight calls have finished
 * (counter reaches 0), preventing the flicker seen during multi-step saves.
 */
function hideLoading() {
  _loadingRefCount = Math.max(0, _loadingRefCount - 1);
  if (_loadingRefCount > 0) return; // other calls still in flight — keep overlay visible

  const overlay = document.getElementById('api-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
  }
}

/**
 * Force-hide the loading overlay regardless of the reference counter.
 * Use ONLY in error-recovery paths where a hung request must be cleared.
 * @private
 */
function _forceHideLoading() {
  _loadingRefCount = 0;
  const overlay = document.getElementById('api-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
  }
}

/**
 * Request timeout in milliseconds.
 * If the server does not respond within this window the request is
 * aborted and the user sees a "Request timed out" error.
 * FIX (HIGH-002): Previously fetch() had no timeout, so a hung server
 * left the loading overlay on screen forever with no way to recover.
 */
const API_REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Internal helper — perform a fetch request and return parsed JSON.
 * Automatically shows/hides the loading animation.
 * Aborts and surfaces a friendly error if the server doesn't respond
 * within API_REQUEST_TIMEOUT_MS.
 * @param {string} path - API path (e.g. '/api/items')
 * @param {string} method - HTTP method
 * @param {Object|null} body - Request body (will be JSON-serialized)
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function _apiFetch(path, method, body, extraOptions) {
  // Derive a human-friendly loading message from the path and method
  const loadingMsg = _getLoadingMessage(path, method);
  showLoading(loadingMsg);

  // Inject Authorization header from Auth module if a token is stored
  const authHeaders = (typeof Auth !== 'undefined') ? Auth.authHeaders() : {};

  const options = {
    method:  method || 'GET',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    ...(extraOptions || {}),
  };
  if (body !== null && body !== undefined) {
    options.body = JSON.stringify(body);
  }

  // FIX (HIGH-002): AbortController timeout — prevents the loading overlay
  // from hanging forever when the server is slow or unresponsive.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  options.signal   = controller.signal;

  try {
    const response = await fetch(API_BASE_URL + path, options);
    clearTimeout(timeoutId);

    // If the server returns 401 (token expired / invalid), force logout.
    // Skip auto-logout for endpoints where 401 simply means "wrong password".
    if (
      response.status === 401 && 
      typeof Auth !== 'undefined' && 
      !path.includes('/auth/login') && 
      !path.includes('/auth/verify-password')
    ) {
      console.warn('[API] 401 Unauthorized — logging out.');
      hideLoading();
      Auth.logout();
      return { ok: false, status: 401, data: null };
    }

    let data = null;
    try { data = await response.json(); } catch (_) {}
    hideLoading();
    return { ok: response.ok, status: response.status, data };

  } catch (err) {
    clearTimeout(timeoutId);
    hideLoading();

    // Distinguish timeout (AbortError) from other network errors
    if (err && err.name === 'AbortError') {
      console.error('[API] Request timed out:', path);
      // Show a user-visible timeout modal if the modal system is available
      if (typeof showModal === 'function') {
        showModal({
          icon:         'danger',
          title:        'Request Timed Out',
          message:      'The server did not respond in time. Please check your connection and try again.',
          type:         'confirm',
          confirmLabel: 'OK',
        });
      }
      return { ok: false, status: 0, data: { error: 'Request timed out.' } };
    }

    console.error('[API] Network error:', err);
    return { ok: false, status: 0, data: null };
  }
}

/**
 * Generate a user-friendly loading message based on the API endpoint and method.
 * @param {string} path
 * @param {string} method
 * @returns {string}
 */
function _getLoadingMessage(path, method) {
  const m = (method || 'GET').toUpperCase();
  if (path.includes('/auth/login')) return 'Signing in...';
  if (path.includes('/auth/register')) return 'Creating user account...';
  if (path.includes('/auth/me')) return 'Verifying session...';
  if (path.includes('/items?')) return 'Loading records...';
  if (m === 'POST' && path.endsWith('/items')) return 'Saving routing document...';
  if (m === 'PATCH' && path.includes('/items')) return 'Updating routing document...';
  if (m === 'DELETE' && path.includes('/items')) return 'Deleting routing document...';
  if (path.includes('/items/') && path.includes('/activities')) return 'Saving activity...';
  if (path.includes('/items/')) return 'Loading routing details...';
  if (path.includes('/production-lines') && m === 'POST') return 'Creating production line...';
  if (path.includes('/production-lines') && m === 'PATCH') return 'Updating production line...';
  if (path.includes('/production-lines') && m === 'DELETE') return 'Deleting production line...';
  if (path.includes('/production-lines') && m === 'PUT') return 'Updating production line...';
  if (path.includes('/production-lines')) return 'Loading production lines...';
  if (path.includes('/logs') && m === 'DELETE') return 'Cleaning up old logs...';
  if (path.includes('/logs')) return 'Loading audit logs...';
  if (path.includes('/health')) return 'Checking server...';
  if (path.includes('/revisions/')) return 'Loading revision snapshot...';
  if (path.includes('/revisions'))  return 'Loading revision history...';
  return 'Processing...';
}

/* ── Auth endpoints ── */

/** POST /api/auth/login */
/**
 * POST /api/auth/verify-password
 * Verify the currently authenticated user's password before a destructive action.
 * @param {string} password
 */
async function apiVerifyPassword(password) {
  return _apiFetch('/api/auth/verify-password', 'POST', { password });
}

async function apiLogin(username, password) {
  return _apiFetch('/api/auth/login', 'POST', { username, password });
}

/** GET /api/auth/me */
async function apiGetMe() {
  return _apiFetch('/api/auth/me');
}

/** POST /api/auth/register (admin only) */
async function apiRegister(username, password, role) {
  return _apiFetch('/api/auth/register', 'POST', { username, password, role });
}

/** GET /api/auth/users (admin only)
 *  cacheBust: appends a unique timestamp param and requests cache:'no-store'
 *  so the Manage Users dashboard always reflects the true, latest data
 *  right after a create/delete (browsers can otherwise serve a stale
 *  cached response for this exact GET URL). */
async function apiGetUsers() {
  return _apiFetch(`/api/auth/users?_=${Date.now()}`, 'GET', null, { cache: 'no-store' });
}

/** PATCH /api/auth/users/<user_id> (admin only) */
async function apiUpdateUser(userId, data) {
  return _apiFetch(`/api/auth/users/${encodeURIComponent(userId)}`, 'PATCH', data);
}

/** DELETE /api/auth/users/<user_id> (admin only) */
async function apiDeleteUser(userId) {
  return _apiFetch(`/api/auth/users/${encodeURIComponent(userId)}`, 'DELETE');
}

/* ============================================
   HEALTH
   ============================================ */

/** GET /api/health */
async function apiHealthCheck() {
  return _apiFetch('/api/health');
}

/* ============================================
   ITEMS
   ============================================ */

/**
 * GET /api/items
 * Browse / search item codes.
 * Uses limit=1000 to fetch all records (API caps at 1000).
 * @param {string} [query] - Optional search query
 * @param {number} [limit] - Max results (default 1000 to get all)
 * @param {number} [offset] - Offset for pagination
 */
async function apiGetItems(query, limit, offset) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('limit', String(limit || 1000));
  if (offset !== undefined && offset !== null) params.set('offset', String(offset));
  return _apiFetch(`/api/items?${params.toString()}`);
}

/**
 * POST /api/items
 * Create a new product with optional activities.
 * Maps internal field names to the API's expected schema.
 * @param {Object} payload - Internal record object
 */
async function apiCreateItem(payload) {
  const body = _mapItemPayload(payload);
  return _apiFetch('/api/items', 'POST', body);
}

/**
 * GET /api/items/{item_code}
 * Look up an item's full routing details.
 * @param {string} itemCode
 */
async function apiGetItem(itemCode) {
  return _apiFetch(`/api/items/${encodeURIComponent(itemCode)}`);
}

/**
 * PATCH /api/items/{item_code}
 * Update product metadata. Revision is auto-incremented.
 * @param {string} itemCode
 * @param {Object} payload - Internal record object (fields to update)
 */
async function apiUpdateItem(itemCode, payload) {
  const body = _mapItemMetaPayload(payload);
  return _apiFetch(`/api/items/${encodeURIComponent(itemCode)}`, 'PATCH', body);
}

/**
 * PUT /api/items/{item_code}/bulk
 * Bulk update product metadata and activities. Solves Concurrency & Rate Limiting.
 * @param {string} itemCode
 * @param {Object} bulkPayload
 */
async function apiBulkUpdateItem(itemCode, bulkPayload) {
  return _apiFetch(`/api/items/${encodeURIComponent(itemCode)}/bulk`, 'PUT', bulkPayload);
}

/**
 * DELETE /api/items/{item_code}
 * Permanently delete a product and all its activities.
 * @param {string} itemCode
 */
async function apiDeleteItem(itemCode) {
  return _apiFetch(`/api/items/${encodeURIComponent(itemCode)}`, 'DELETE');
}

/**
 * POST /api/items/{item_code}/activities
 * Add one new activity to a product.
 * @param {string} itemCode
 * @param {Object} activity - { activity_name, pax, machine, time_min, ... }
 * @param {Object} [options]
 * @param {boolean} [options.skipRevision=false] - Append ?skip_revision=1 to suppress
 *   the revision bump and archive snapshot (used during batch UPDATE saves where the
 *   metadata PATCH already handled the single revision bump).
 */
async function apiAddItemActivity(itemCode, activity, options) {
  // Map activities field to activity_name if needed
  const body = {
    activity_name: activity.activity_name || activity.activities || activity.name || '',
    pax: activity.pax || 0,
    machine: activity.machine || 0,
    time_min: activity.time_min || 0,
    run_time: activity.run_time || 0,
    labor_min: activity.labor_min || 0,
    mc_min: activity.mc_min || 0,
    dl_units: activity.dl_units || 0,
    dl: activity.dl || 0,
    voh: activity.voh || 0,
    foh: activity.foh || 0,
    type: activity.type || 'Labor',
    item_id: activity.item_id || activity.activity_name || activity.activities || '',
    class: activity.class || 'DL',
    class_1: activity.class_1 || 'DL',
  };
  const qs = (options && options.skipRevision) ? '?skip_revision=1' : '';
  return _apiFetch(`/api/items/${encodeURIComponent(itemCode)}/activities${qs}`, 'POST', body);
}

/**
 * PATCH /api/items/{item_code}/activities/{activity_id}
 * Update one specific activity by its ID.
 * @param {string} itemCode
 * @param {string|number} activityId
 * @param {Object} payload - Fields to update
 * @param {Object} [options]
 * @param {boolean} [options.skipRevision=false] - Append ?skip_revision=1 to suppress
 *   the revision bump and archive snapshot (used during batch UPDATE saves where the
 *   metadata PATCH already handled the single revision bump).
 */
async function apiUpdateItemActivity(itemCode, activityId, payload, options) {
  const qs = (options && options.skipRevision) ? '?skip_revision=1' : '';
  return _apiFetch(
    `/api/items/${encodeURIComponent(itemCode)}/activities/${activityId}${qs}`,
    'PATCH',
    payload
  );
}

/**
 * DELETE /api/items/{item_code}/activities/{activity_id}
 * Remove one activity from a product.
 * @param {string} itemCode
 * @param {string|number} activityId
 * @param {Object} [options]
 * @param {boolean} [options.skipRevision=false] - Append ?skip_revision=1 to suppress
 *   the revision bump and archive snapshot (used during batch UPDATE saves where the
 *   metadata PATCH already handled the single revision bump).
 */
async function apiDeleteItemActivity(itemCode, activityId, options) {
  const qs = (options && options.skipRevision) ? '?skip_revision=1' : '';
  return _apiFetch(
    `/api/items/${encodeURIComponent(itemCode)}/activities/${activityId}${qs}`,
    'DELETE'
  );
}

/* ============================================
   INTERNAL FIELD MAPPING HELPERS
   ============================================ */

/**
 * Map our internal record format to the API's expected field names.
 * Used for POST /api/items (create) — includes activities.
 * @param {Object} record - Internal routing record
 * @returns {Object} API-ready payload
 */
function _mapItemPayload(record) {
  const isBM = record.product_type && record.product_type.includes('Base');

  const body = {
    inventory_id:   record.inventory_id || record.itemCode || '',
    revision_descr: record.revision_descr || record.skuDesc || '',
    product_type:   record.product_type || 'Finished Good (FG)',
    quantity:       record.qty || record.quantity || 1,
    notes:          record.notes || '',
  };

  // Map production line to correct FG/BM field based on product type
  const lineCode = record.production_line_code || record.prodLine || '';
  const lineName = record.production_line || (typeof LINE_DESCRIPTIONS !== 'undefined' ? LINE_DESCRIPTIONS[lineCode] : '') || lineCode;

  if (isBM) {
    body.bm_production_line_code = lineCode;
    body.bm_production_line      = lineName;
    body.fg_production_line_code = null;
    body.fg_production_line      = null;
  } else {
    body.fg_production_line_code = lineCode;
    body.fg_production_line      = lineName;
    body.bm_production_line_code = null;
    body.bm_production_line      = null;
  }

  // Map activities — API expects "activity_name", not "activities"
  // Only included on CREATE (POST); PATCH uses _mapItemMetaPayload instead
  if (Array.isArray(record.activities) && record.activities.length > 0) {
    body.activities = record.activities.map((act, i) => ({
      activity_name: act.activities || act.activity_name || act.name || '',
      pax:        Number(act.pax)     || 0,
      machine:    Number(act.machine) || 0,
      time_min:   Number(act.time_min || act.time) || 0,
      run_time:   Number(act.run_time)  || 0,
      labor_min:  Number(act.labor_min) || 0,
      mc_min:     Number(act.mc_min)    || 0,
      dl_units:   Number(act.dl_units)  || 0,
      dl:         Number(act.dl)        || 0,
      voh:        Number(act.voh)       || 0,
      foh:        Number(act.foh)       || 0,
      type:       act.type    || 'Labor',
      item_id:    act.item_id || act.activities || act.activity_name || '',
      class:      act.class   || 'DL',
      class_1:    act.class_1 || 'DL',
      sort_order: act.sort_order || (i + 1),
    }));
  }

  // Include totals so they are saved on CREATE
  body.total_run_time  = Number(record.total_run_time)  || 0;
  body.total_labor_min = Number(record.total_labor_min) || 0;
  body.total_mc_min    = Number(record.total_mc_min)    || 0;
  body.total_dl_units  = Number(record.total_dl_units)  || 0;
  body.total_dl        = Number(record.total_dl)        || 0;
  body.total_voh       = Number(record.total_voh)       || 0;
  body.total_foh       = Number(record.total_foh)       || 0;

  return body;
}

/**
 * Map only metadata fields for PATCH /api/items/{item_code}.
 * The PATCH endpoint does NOT accept activities — those are managed separately.
 * @param {Object} record - Internal routing record
 * @returns {Object} API-ready metadata-only payload
 */
function _mapItemMetaPayload(record) {
  const isBM = record.product_type && record.product_type.includes('Base');
  const lineCode = record.production_line_code || record.prodLine || '';
  const lineName = record.production_line || (typeof LINE_DESCRIPTIONS !== 'undefined' ? LINE_DESCRIPTIONS[lineCode] : '') || lineCode;

  const body = {
    revision_descr: record.revision_descr || record.skuDesc || '',
    product_type:   record.product_type || 'Finished Good (FG)',
    quantity:       record.qty || record.quantity || 1,
    notes:          record.notes || '',
  };

  if (isBM) {
    body.bm_production_line_code = lineCode;
    body.bm_production_line      = lineName;
    body.fg_production_line_code = null;
    body.fg_production_line      = null;
  } else {
    body.fg_production_line_code = lineCode;
    body.fg_production_line      = lineName;
    body.bm_production_line_code = null;
    body.bm_production_line      = null;
  }

  return body;
}

/**
 * Normalize an API item response to our internal format.
 * API returns: fg_production_line_code, bm_production_line_code, quantity
 * Internal uses: production_line_code, qty
 * Also normalizes activity field: activity_name → activities
 * @param {Object} apiItem
 * @returns {Object} Normalized internal record
 */
function _normalizeApiItem(apiItem) {
  if (!apiItem) return null;

  // Determine production line: prefer FG, fall back to BM
  const lineCode = apiItem.fg_production_line_code || apiItem.bm_production_line_code || '';
  const lineName = apiItem.fg_production_line      || apiItem.bm_production_line      || lineCode;

  const normalized = {
    inventory_id:         apiItem.inventory_id,
    revision_descr:       apiItem.revision_descr,
    revision:             apiItem.revision,
    notes:                apiItem.notes || '',
    product_type:         apiItem.product_type || 'Finished Good (FG)',
    qty:                  apiItem.quantity || 1,
    production_line_code: lineCode,
    production_line:      lineName,
    // Keep raw API fields too for reference
    fg_production_line_code: apiItem.fg_production_line_code,
    bm_production_line_code: apiItem.bm_production_line_code,
    // Totals from DB
    total_run_time:  apiItem.total_run_time  || 0,
    total_labor_min: apiItem.total_labor_min || 0,
    total_mc_min:    apiItem.total_mc_min    || 0,
    total_dl_units:  apiItem.total_dl_units  || 0,
    total_dl:        apiItem.total_dl        || 0,
    total_voh:       apiItem.total_voh       || 0,
    total_foh:       apiItem.total_foh       || 0,
    // Timestamps
    created_at: apiItem.created_at || null,
    updated_at: apiItem.updated_at || null,
  };

  // Normalize activities: map activity_name → activities for UI compatibility
  // Preserve computed columns so loadDataIntoForm shows real saved values
  if (Array.isArray(apiItem.activities)) {
    normalized.activities = apiItem.activities.map(act => ({
      id:            act.id,
      activities:    act.activities || act.activity_name || act.name || '',
      activity_name: act.activities || act.activity_name || act.name || '',
      type:          act.type    || 'Labor',
      item_id:       act.item_id || '',
      class:         act.class   || 'DL',
      pax:           act.pax     || 0,
      machine:       act.machine || 0,
      time_min:      act.time_min || 0,
      sort_order:    act.sort_order || 0,
      // Computed columns — stored values from DB
      run_time:      act.run_time  || 0,
      labor_min:     act.labor_min || 0,
      mc_min:        act.mc_min    || 0,
      dl_units:      act.dl_units  || 0,
      dl:            act.dl        || 0,
      voh:           act.voh       || 0,
      foh:           act.foh       || 0,
    }));
  } else {
    normalized.activities = [];
  }

  return normalized;
}

/**
 * GET /api/items/{item_code}/revisions
 * List all archived revisions for an item code.
 * @param {string} itemCode
 */
async function apiGetItemRevisions(itemCode) {
  return _apiFetch(`/api/items/${encodeURIComponent(itemCode)}/revisions`);
}

/**
 * GET /api/items/{item_code}/revisions/{revision}
 * Retrieve the full snapshot of a specific archived revision.
 * @param {string} itemCode
 * @param {string|number} revision
 */
async function apiGetItemRevision(itemCode, revision) {
  return _apiFetch(
    `/api/items/${encodeURIComponent(itemCode)}/revisions/${encodeURIComponent(revision)}`
  );
}

/* ============================================
   PRODUCTION LINES
   ============================================ */

/**
 * GET /api/production-lines
 * List all production lines and their activities.
 * Normalizes response to internal format.
 */
async function apiGetProductionLines() {
  const res = await _apiFetch('/api/production-lines');
  if (res.ok && Array.isArray(res.data)) {
    // Normalize field names: production_line_name → description/desc
    res.data = res.data.map(line => ({
      ...line,
      // Expose as both "code" and "line_code" for compatibility
      code:        line.production_line_code,
      line_code:   line.production_line_code,
      // Expose description under both keys
      description: line.production_line_name,
      desc:        line.production_line_name,
      // Normalize activities
      activities: Array.isArray(line.activities) ? line.activities : [],
    }));
  }
  return res;
}

/**
 * POST /api/production-lines
 * Create a new production line.
 * @param {Object} payload - { line_code, description } (internal names)
 */
async function apiCreateProductionLine(payload) {
  // Map to API field names
  const body = {
    production_line_code: payload.line_code || payload.production_line_code || '',
    production_line_name: payload.description || payload.production_line_name || '',
  };
  return _apiFetch('/api/production-lines', 'POST', body);
}

/**
 * GET /api/production-lines/{line_code}
 * Get a single production line and its activities.
 * @param {string} lineCode
 */
async function apiGetProductionLine(lineCode) {
  return _apiFetch(`/api/production-lines/${encodeURIComponent(lineCode)}`);
}

/**
 * PATCH /api/production-lines/{line_code}
 * Rename a production line (name only per API spec).
 * @param {string} lineCode
 * @param {Object} payload - { new_line_code?, description? }
 */
async function apiRenameProductionLine(lineCode, payload) {
  // API PATCH only accepts production_line_name
  const body = {
    production_line_name: payload.description || payload.production_line_name || '',
  };
  return _apiFetch(`/api/production-lines/${encodeURIComponent(lineCode)}`, 'PATCH', body);
}

/**
 * PUT /api/production-lines/{line_code}
 * Replace a production line and its activities atomically.
 * @param {string} lineCode
 * @param {Object} payload - { description, activities[] }
 */
async function apiReplaceProductionLine(lineCode, payload) {
  const body = {
    production_line_name: payload.description || payload.production_line_name || '',
    activities: Array.isArray(payload.activities) ? payload.activities : [],
  };
  return _apiFetch(`/api/production-lines/${encodeURIComponent(lineCode)}`, 'PUT', body);
}

/**
 * DELETE /api/production-lines/{line_code}
 * Delete a production line and all its activities.
 * @param {string} lineCode
 */
async function apiDeleteProductionLine(lineCode) {
  return _apiFetch(`/api/production-lines/${encodeURIComponent(lineCode)}`, 'DELETE');
}

/**
 * POST /api/production-lines/{line_code}/activities
 * Add a single activity to a production line.
 * @param {string} lineCode
 * @param {Object} activity - { activity_name } or { name }
 */
async function apiAddLineActivity(lineCode, activity) {
  const body = {
    activity_name: activity.activity_name || activity.name || '',
  };
  if (activity.sort_order !== undefined) body.sort_order = activity.sort_order;
  if (activity.stage      !== undefined) body.stage      = activity.stage;
  return _apiFetch(
    `/api/production-lines/${encodeURIComponent(lineCode)}/activities`,
    'POST',
    body
  );
}

/**
 * PATCH /api/production-lines/{line_code}/activities/{activity_id}
 * Update a single activity on a production line.
 * @param {string} lineCode
 * @param {string|number} activityId
 * @param {Object} payload
 */
async function apiUpdateLineActivity(lineCode, activityId, payload) {
  return _apiFetch(
    `/api/production-lines/${encodeURIComponent(lineCode)}/activities/${activityId}`,
    'PATCH',
    payload
  );
}

/**
 * DELETE /api/production-lines/{line_code}/activities/{activity_id}
 * Delete a single activity from a production line.
 * @param {string} lineCode
 * @param {string|number} activityId
 */
async function apiDeleteLineActivity(lineCode, activityId) {
  return _apiFetch(
    `/api/production-lines/${encodeURIComponent(lineCode)}/activities/${activityId}`,
    'DELETE'
  );
}

/* ============================================
   EXPORT (SUPERUSER / ADMIN ONLY)
   ============================================ */

/**
 * GET /api/export
 * Download the full routing database as a server-generated .xlsx file.
 * The server flattens all products + activities into one row per activity.
 * Requires superuser or admin role.
 *
 * Returns { ok, status, data: Blob, filename } on success.
 * Returns { ok: false, status, data: null }    on error.
 */
async function apiExportExcel() {
  showLoading('Generating Excel export…');
  const authHeaders = (typeof Auth !== 'undefined') ? Auth.authHeaders() : {};

  // FIX (HIGH-002): timeout on the export request too
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_BASE_URL + '/api/export', {
      method:  'GET',
      headers: { ...authHeaders },
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);

    hideLoading();

    if (response.status === 401 && typeof Auth !== 'undefined') {
      console.warn('[API] 401 Unauthorized — logging out.');
      Auth.logout();
      return { ok: false, status: 401, data: null };
    }

    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch (_) {}
      return { ok: false, status: response.status, data };
    }

    const blob = await response.blob();

    const disposition = response.headers.get('Content-Disposition') || '';
    const match       = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename    = match
      ? match[1].replace(/['"]/g, '').trim()
      : 'Pioneer_Routing_Export.xlsx';

    return { ok: true, status: response.status, data: blob, filename };
  } catch (err) {
    clearTimeout(timeoutId);
    hideLoading();

    if (err && err.name === 'AbortError') {
      console.error('[API] Export request timed out.');
      if (typeof showModal === 'function') {
        showModal({
          icon: 'danger', title: 'Export Timed Out',
          message: 'The export did not complete in time. Please try again.',
          type: 'confirm', confirmLabel: 'OK',
        });
      }
      return { ok: false, status: 0, data: null };
    }

    console.error('[API] Export network error:', err);
    return { ok: false, status: 0, data: null, filename: null };
  }
}

/**
 * GET /api/export?item_code=XXX
 * Download a single product's routing data as a server-generated .xlsx file.
 * Same Excel template as the full export, filtered to one item.
 * Requires superuser or admin role.
 *
 * @param {string} itemCode - The inventory ID / item code to export.
 * Returns { ok, status, data: Blob, filename } on success.
 * Returns { ok: false, status, data: null }    on error.
 */
async function apiExportExcelItem(itemCode) {
  showLoading('Generating Excel export…');
  const authHeaders = (typeof Auth !== 'undefined') ? Auth.authHeaders() : {};

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    const url      = API_BASE_URL + '/api/export?item_code=' + encodeURIComponent(itemCode);
    const response = await fetch(url, {
      method:  'GET',
      headers: { ...authHeaders },
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);

    hideLoading();

    if (response.status === 401 && typeof Auth !== 'undefined') {
      console.warn('[API] 401 Unauthorized — logging out.');
      Auth.logout();
      return { ok: false, status: 401, data: null };
    }

    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch (_) {}
      return { ok: false, status: response.status, data };
    }

    const blob = await response.blob();

    const disposition = response.headers.get('Content-Disposition') || '';
    const match       = disposition.match(/filename[^;=\n]*=((['""]).*?\2|[^;\n]*)/);
    const filename    = match
      ? match[1].replace(/['"]/g, '').trim()
      : `Pioneer_Routing_${itemCode}.xlsx`;

    return { ok: true, status: response.status, data: blob, filename };
  } catch (err) {
    clearTimeout(timeoutId);
    hideLoading();

    if (err && err.name === 'AbortError') {
      console.error('[API] Export request timed out.');
      if (typeof showModal === 'function') {
        showModal({
          icon: 'danger', title: 'Export Timed Out',
          message: 'The export did not complete in time. Please try again.',
          type: 'confirm', confirmLabel: 'OK',
        });
      }
      return { ok: false, status: 0, data: null };
    }

    console.error('[API] Export network error:', err);
    return { ok: false, status: 0, data: null, filename: null };
  }
}

/* ============================================
   LOGS (ADMIN ONLY)
   ============================================ */

/**
 * GET /api/logs
 * List audit log entries with filtering and pagination.
 * Requires admin role.
 *
 * Query Parameters:
 *   page, per_page, username, action, target_type, from_date, to_date
 *
 * @param {Object} filters - Optional filters
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiGetLogs(filters) {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.page)     params.set('page', String(filters.page));
    if (filters.per_page) params.set('per_page', String(filters.per_page));
    if (filters.username) params.set('username', filters.username);
    if (filters.action)   params.set('action', filters.action);
    if (filters.target_type) params.set('target_type', filters.target_type);
    if (filters.from_date)   params.set('from_date', filters.from_date);
    if (filters.to_date)     params.set('to_date', filters.to_date);
  }
  const qs = params.toString();
  return _apiFetch(`/api/logs${qs ? '?' + qs : ''}`);
}

/**
 * DELETE /api/logs/cleanup
 * Purge log entries older than N days.
 * Requires admin role.
 *
 * @param {number} days - Number of days (default 90)
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiCleanupLogs(days) {
  const params = new URLSearchParams();
  if (days !== undefined && days !== null) params.set('days', String(days));
  const qs = params.toString();
  return _apiFetch(`/api/logs/cleanup${qs ? '?' + qs : ''}`, 'DELETE');
}

/* ============================================
   SHARED API ERROR MESSAGE HELPER
   ============================================ */

/**
 * Convert an API error response into a user-friendly message for modal display.
 *
 * Distinction between error types:
 *   status  0  = network/connection error (server unreachable) — caller should
 *                save locally and show a warn toast instead of this message.
 *   status 4xx = definitive client-side rejection — show modal, do NOT proceed.
 *   status 5xx = server-side failure — show modal, do NOT proceed.
 *
 * @param {{ok: boolean, status: number, data: any}} res - Response from _apiFetch
 * @param {string} [operation] - Short verb phrase, e.g. 'create item', 'delete line'
 * @param {string} [identifier] - Item code / line code being acted on
 * @returns {string} Human-readable error message
 */
function getApiErrorMessage(res, operation, identifier) {
  // Prefer the server's own error string when available
  const serverMsg  = res?.data?.error || '';
  const idLabel    = identifier ? ` "${identifier}"` : '';
  const opLabel    = operation  ? ` while trying to ${operation}` : '';

  switch (res.status) {
    case 400:
      return serverMsg || `Invalid data${opLabel}. Please check all fields and try again.`;

    case 401:
      return 'Your session has expired. Please sign in again.';

    case 403:
      return serverMsg
        || 'You do not have permission to perform this action. Contact an administrator.';

    case 404:
      return serverMsg
        || `The record${idLabel} was not found on the server. It may have been deleted.`;

    case 409:
      // Most common 409 cases: duplicate key on create, or line still referenced on delete
      if (serverMsg) return serverMsg;
      if (identifier) return `"${identifier}" already exists or is still referenced by other records.`;
      return 'A conflict occurred. The record may already exist or is still in use.';

    case 429:
      return 'Too many requests. Please wait a moment and try again.';

    case 500:
      return serverMsg
        || `Server error (500)${opLabel}. Please try again later or contact your administrator.`;

    case 503:
      return serverMsg
        || 'The server is currently unavailable (503). Please retry in a moment.';

    default:
      return serverMsg
        || `Unexpected error (HTTP ${res.status})${opLabel}. Please try again.`;
  }
}

/**
 * Trigger the download of the deployment manual
 */
async function apiDownloadDeploymentGuide() {
  const authHeaders = (typeof Auth !== 'undefined') ? Auth.authHeaders() : {};
  try {
    const response = await fetch(API_BASE_URL + '/api/auth/docs/deployment', {
      method: 'GET',
      headers: { ...authHeaders }
    });

    if (response.status === 401 && typeof Auth !== 'undefined') {
      Auth.logout();
      return { ok: false, status: 401 };
    }

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = match
      ? match[1].replace(/['"]/g, '').trim()
      : 'ACU_Routing_Deployment_Maintenance_Manual.pdf';

    return { ok: true, data: blob, filename };
  } catch (err) {
    console.error('[API] Download manual failed:', err);
    return { ok: false };
  }
}

/* ============================================
   EXPOSE GLOBALLY
   ============================================ */
window.showLoading             = showLoading;
window.hideLoading             = hideLoading;
window._forceHideLoading       = _forceHideLoading;
window.apiLogin                = apiLogin;
window.apiGetMe                = apiGetMe;
window.apiRegister             = apiRegister;
window.apiGetUsers             = apiGetUsers;
window.apiUpdateUser           = apiUpdateUser;
window.apiDeleteUser           = apiDeleteUser;
window.apiHealthCheck          = apiHealthCheck;
window.apiGetItems             = apiGetItems;
window.apiCreateItem           = apiCreateItem;
window.apiGetItem              = apiGetItem;
window.apiUpdateItem           = apiUpdateItem;
window.apiBulkUpdateItem       = apiBulkUpdateItem;
window.apiDeleteItem           = apiDeleteItem;
window.apiAddItemActivity      = apiAddItemActivity;
window.apiUpdateItemActivity   = apiUpdateItemActivity;
window.apiDeleteItemActivity   = apiDeleteItemActivity;
window.apiGetItemRevisions     = apiGetItemRevisions;
window.apiGetItemRevision      = apiGetItemRevision;
window.apiGetProductionLines   = apiGetProductionLines;
window.apiCreateProductionLine = apiCreateProductionLine;
window.apiGetProductionLine    = apiGetProductionLine;
window.apiRenameProductionLine = apiRenameProductionLine;
window.apiReplaceProductionLine = apiReplaceProductionLine;
window.apiDeleteProductionLine = apiDeleteProductionLine;
window.apiAddLineActivity      = apiAddLineActivity;
window.apiUpdateLineActivity   = apiUpdateLineActivity;
window.apiDeleteLineActivity   = apiDeleteLineActivity;
window.apiGetLogs              = apiGetLogs;
window.apiCleanupLogs          = apiCleanupLogs;
window.apiExportExcel          = apiExportExcel;
window.apiExportExcelItem      = apiExportExcelItem;
window.apiDownloadDeploymentGuide = apiDownloadDeploymentGuide;
// Internal helpers exposed for use in other modules
window._normalizeApiItem       = _normalizeApiItem;
window._mapItemPayload         = _mapItemPayload;
window._mapItemMetaPayload     = _mapItemMetaPayload;
window.getApiErrorMessage      = getApiErrorMessage;