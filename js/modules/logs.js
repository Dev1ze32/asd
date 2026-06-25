/* ============================================
   LOGS.JS - Audit Logs Module
   Pioneer Adhesives Routing Template System

   Admin-only features:
   - View audit log entries (GET /api/logs)
   - Filter logs by username, action, target_type, date range
   - Paginate through log entries
   - Cleanup old logs (DELETE /api/logs/cleanup)

   This module is only accessible to users with
   the 'admin' role. The UI tabs are conditionally
   rendered based on role.
   ============================================ */

/**
 * State for the audit logs view
 */
const LogsState = {
  page:     1,
  per_page: 20,
  total:    0,
  totalPages: 0,
  filters:  {},
  logs:     [],
};

/**
 * Initialize the Audit Logs view.
 * Resets pagination and loads the first page of logs.
 */
function initAuditLogs() {
  // Ensure only admins can access
  if (!Auth.isAdmin()) {
    showModal({
      icon: 'danger',
      title: 'Access Denied',
      message: 'You do not have permission to access Audit Logs. Admin role is required.',
      type: 'confirm',
      confirmLabel: 'OK',
    }).then(() => {
      switchTab(AppState.ADD);
    });
    return;
  }

  // Reset state
  LogsState.page = 1;
  LogsState.filters = {};

  // Reset filter inputs
  const filterInputs = [
    'log-filter-username',
    'log-filter-action',
    'log-filter-target',
    'log-filter-from',
    'log-filter-to'
  ];
  filterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset per-page select
  const perPageEl = document.getElementById('log-per-page');
  if (perPageEl) perPageEl.value = '20';

  // Load first page
  loadAuditLogs();
}

/* ============================================
   LOAD LOGS
   ============================================ */

/**
 * Load audit logs from the API with current filters and pagination.
 */
async function loadAuditLogs() {
  if (!Auth.isAdmin()) return;

  const tbody = document.getElementById('auditLogsTableBody');

  // Show loading in the table
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center" style="padding:2rem;color:#94a3b8;font-style:italic;">
          Loading audit logs...
        </td>
      </tr>`;
  }

  try {
    const res = await apiGetLogs({
      page:        LogsState.page,
      per_page:    LogsState.per_page,
      username:    LogsState.filters.username    || undefined,
      action:      LogsState.filters.action      || undefined,
      target_type: LogsState.filters.target_type || undefined,
      from_date:   LogsState.filters.from_date   || undefined,
      to_date:     LogsState.filters.to_date     || undefined,
    });

    if (res.ok && res.data) {
      const data = res.data;
      // README: response shape is { page, per_page, total, total_pages, logs: [...] }
      LogsState.total      = data.total       || 0;
      LogsState.totalPages = data.total_pages  || 1;
      LogsState.logs       = Array.isArray(data.logs) ? data.logs : [];

      renderAuditLogs();
      renderLogsPagination();
    } else {
      let msg = 'Failed to load audit logs.';
      if (res.status === 403) msg = 'Admin access required to view audit logs.';
      else if (res.status === 401) msg = 'Your session has expired. Please sign in again.';
      else if (res.data?.error) msg = res.data.error;

      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center" style="padding:2rem;color:#dc2626;font-style:italic;">
              ${sanitizeInput(msg)}
            </td>
          </tr>`;
      }
      LogsState.total      = 0;
      LogsState.totalPages = 1;
      LogsState.logs       = [];
      renderLogsPagination();
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding:2rem;color:#dc2626;font-style:italic;">
            Network error. Could not load audit logs.
          </td>
        </tr>`;
    }
    LogsState.total      = 0;
    LogsState.totalPages = 1;
    LogsState.logs       = [];
    renderLogsPagination();
  }
}

/* ============================================
   RENDER LOGS TABLE
   ============================================ */

/**
 * Calculate how many days old a log entry is based on its timestamp.
 * @param {string} timestamp - The logged_at timestamp string from the API
 * @returns {string} Number of days old, or '—' if unparseable
 */
function _calcDaysOld(timestamp) {
  if (!timestamp) return '—';
  const logged = new Date(timestamp);
  if (isNaN(logged.getTime())) return '—';
  const now = new Date();
  const diffMs = now - logged;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return days < 0 ? '0' : String(days);
}

function renderAuditLogs() {
  const tbody = document.getElementById('auditLogsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const logs = LogsState.logs;

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center" style="padding:2rem;color:#94a3b8;font-style:italic;">
          No audit log entries found.
        </td>
      </tr>`;
    return;
  }

  logs.forEach(log => {
    const tr = document.createElement('tr');

    // Suppress text-cursor blink when clicking anywhere on the row
    tr.style.userSelect = 'none';

    // Action badge color
    const actionColor = _getActionBadgeColor(log.action);

    // Days old calculation
    const daysOld = _calcDaysOld(log.logged_at);

    // Extra JSON pretty print
    let extraStr = '';
    if (log.extra && typeof log.extra === 'object') {
      try {
        extraStr = JSON.stringify(log.extra).substring(0, 120);
        if (JSON.stringify(log.extra).length > 120) extraStr += '...';
      } catch (_) { extraStr = '{...}'; }
    }

    tr.innerHTML = `
      <td style="font-family:monospace;font-size:0.78rem;color:#475569;">${log.id || ''}</td>
      <td style="font-size:0.78rem;color:#334155;white-space:nowrap;">${sanitizeInput(log.logged_at || '')}</td>
      <td style="font-size:0.82rem;font-weight:600;color:#1e293b;">${sanitizeInput(log.username || '')}</td>
      <td><span style="display:inline-block;font-size:0.72rem;font-weight:600;padding:0.15rem 0.5rem;border-radius:9999px;${actionColor}">${sanitizeInput(log.action || '')}</span></td>
      <td style="font-size:0.8rem;color:#475569;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${sanitizeInput(log.description || '')}">${sanitizeInput(_shortenDescription(log.description || ''))}</td>
      <td style="font-size:0.78rem;color:#64748b;">${sanitizeInput(log.target_type || '')}</td>
      <td style="font-size:0.78rem;color:#64748b;">${sanitizeInput(log.target_id || '')}</td>
      <td style="font-size:0.78rem;color:#64748b;text-align:center;">${sanitizeInput(daysOld)}</td>
      <td style="font-size:0.75rem;color:#94a3b8;font-family:monospace;">${sanitizeInput(log.ip_address || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Shorten a log description by replacing common long words/phrases with
 * their standard acronyms or abbreviations.
 * The full original text is preserved in the tooltip (title attribute).
 * @param {string} desc - Raw description string from the API
 * @returns {string} Shortened description
 */
function _shortenDescription(desc) {
  if (!desc) return '';

  // Order matters: longer/more-specific phrases first to avoid partial replacements
  const replacements = [
    // Strip redundant duplicate: "Finished Good (FG)" → "FG", "Base Material (BM)" → "BM"
    [/\bFinished\s+Good(?:s)?\s*\(\s*FG\s*\)/gi, 'FG'],
    [/\bBase\s+Material(?:s)?\s*\(\s*BM\s*\)/gi,  'BM'],
    // Also catch post-replacement leftover: "FG (FG)" → "FG"
    [/\b(FG)\s*\(\s*FG\s*\)/gi,              'FG'],
    [/\b(BM)\s*\(\s*BM\s*\)/gi,              'BM'],
    // Multi-word phrases → acronym/abbrev
    [/\bFinished\s+Good(?:s)?\b/gi,           'FG'],
    [/\bBase\s+Material(?:s)?\b/gi,           'BM'],
    [/\bProduction\s+Line(?:s)?\b/gi,         'PL'],
    [/\bRouting\s+(?:Template\s+)?Document(?:s)?\b/gi, 'Routing Doc'],
    [/\bRouting\s+Record(?:s)?\b/gi,          'Routing Rec'],
    [/\bUser\s+Account(?:s)?\b/gi,            'User Acct'],
    [/\bAudit\s+Log(?:s)?\b/gi,              'Audit Log'],
    [/\bInventory\s+ID\b/gi,                  'Inv. ID'],
    [/\bItem\s+Code(?:s)?\b/gi,               'Item Code'],
    [/\bActivity\s+(?:Name\s+)?Updated?\b/gi, 'Act. Upd'],
    [/\bActivity\s+(?:Name\s+)?Added?\b/gi,   'Act. Added'],
    [/\bActivity\s+(?:Name\s+)?Deleted?\b/gi, 'Act. Del'],
    [/\bActivity(?:s)?\b/gi,                  'Act.'],
    [/\bDescription\b/gi,                     'Desc.'],
    [/\bCreated?\s+by\b/gi,                   'by'],
    [/\bUpdated?\s+by\b/gi,                   'by'],
    [/\bDeleted?\s+by\b/gi,                   'del. by'],
    [/\bSuccessfully\b/gi,                    'OK'],
    [/\bAuthentication\b/gi,                  'Auth'],
    [/\bAdministrator(?:s)?\b/gi,             'Admin'],
    [/\bPassword\b/gi,                        'Pwd'],
    [/\bUsername\b/gi,                        'User'],
  ];

  let result = desc;
  replacements.forEach(([pattern, replacement]) => {
    result = result.replace(pattern, replacement);
  });

  return result;
}

/**
 * Get a color style string for action badges based on the action type.
 */
function _getActionBadgeColor(action) {
  if (!action) return 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';
  const a = action.toLowerCase();
  if (a.includes('create') || a.includes('add'))    return 'background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;';
  if (a.includes('update') || a.includes('edit'))   return 'background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;';
  if (a.includes('delete') || a.includes('remove')) return 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;';
  if (a.includes('login') || a.includes('auth'))    return 'background:#fefce8;color:#ca8a04;border:1px solid #fde68a;';
  if (a.includes('purge') || a.includes('cleanup')) return 'background:#fdf4ff;color:#a855f7;border:1px solid #e9d5ff;';
  return 'background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;';
}

/* ============================================
   PAGINATION
   ============================================ */

function renderLogsPagination() {
  const infoEl = document.getElementById('logs-pagination-info');
  const btnPrev = document.getElementById('btn-logs-prev');
  const btnNext = document.getElementById('btn-logs-next');

  const total      = LogsState.total;
  const page       = LogsState.page;
  const perPage    = LogsState.per_page;
  const totalPages = LogsState.totalPages;

  if (infoEl) {
    const start = total === 0 ? 0 : (page - 1) * perPage + 1;
    const end   = Math.min(page * perPage, total);
    infoEl.textContent = `Showing ${start} to ${end} of ${total} entries (Page ${page} of ${totalPages})`;
  }

  if (btnPrev) btnPrev.disabled = page <= 1;
  if (btnNext) btnNext.disabled = page >= totalPages || totalPages === 0;
}

function changeLogsPage(delta) {
  const newPage = LogsState.page + delta;
  if (newPage < 1) return;
  if (newPage > LogsState.totalPages && LogsState.totalPages > 0) return;

  LogsState.page = newPage;
  loadAuditLogs();
}

function changeLogsPerPage() {
  const el = document.getElementById('log-per-page');
  if (!el) return;
  const val = parseInt(el.value, 10);
  if (val && val > 0) {
    LogsState.per_page = val;
    LogsState.page = 1; // reset to first page
    loadAuditLogs();
  }
}

/* ============================================
   FILTERS
   ============================================ */

function applyLogFilters() {
  const usernameEl = document.getElementById('log-filter-username');
  const actionEl   = document.getElementById('log-filter-action');
  const targetEl   = document.getElementById('log-filter-target');
  const fromEl     = document.getElementById('log-filter-from');
  const toEl       = document.getElementById('log-filter-to');

  LogsState.filters = {
    username:    usernameEl?.value?.trim()    || undefined,
    action:      actionEl?.value?.trim()      || undefined,
    target_type: targetEl?.value?.trim()      || undefined,
    from_date:   fromEl?.value                || undefined,
    to_date:     toEl?.value                  || undefined,
  };

  // Remove empty filter values
  Object.keys(LogsState.filters).forEach(key => {
    if (!LogsState.filters[key]) delete LogsState.filters[key];
  });

  LogsState.page = 1;
  loadAuditLogs();
}

function clearLogFilters() {
  const filterInputs = [
    'log-filter-username',
    'log-filter-action',
    'log-filter-target',
    'log-filter-from',
    'log-filter-to'
  ];
  filterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  LogsState.filters = {};
  LogsState.page = 1;
  loadAuditLogs();
}

/* ============================================
   LOG CLEANUP
   ============================================ */

async function handleLogsCleanup() {
  if (!Auth.isAdmin()) {
    await showModal({
      icon: 'danger',
      title: 'Access Denied',
      message: 'Only administrators can clean up audit logs.',
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  // Prompt for days threshold
  const r1 = await showModal({
    icon: 'warn',
    title: 'Cleanup Audit Logs',
    message: 'This will permanently delete log entries older than the specified number of days. This action cannot be undone.\n\nEnter the number of days (default: 90):',
    type: 'prompt',
    inputDefault: '90',
    inputPlaceholder: 'e.g., 30, 60, 90',
    confirmStyle: 'danger',
    confirmLabel: 'Delete Old Logs',
  });

  if (!r1.confirmed) return;

  const days = parseInt(r1.value, 10);
  if (isNaN(days) || days < 1) {
    await showModal({
      icon: 'danger',
      title: 'Invalid Input',
      message: 'Please enter a valid number of days (at least 1).',
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  // Confirm again
  const r2 = await showModal({
    icon: 'danger',
    title: 'Confirm Permanent Deletion',
    message: `Are you sure you want to delete all audit log entries older than ${days} days?\n\nThis action is irreversible.`,
    type: 'confirm',
    confirmStyle: 'danger',
    confirmLabel: `Yes, Delete Logs Older Than ${days} Days`,
  });

  if (!r2.confirmed) return;

  try {
    const res = await apiCleanupLogs(days);

    if (res.ok && res.data) {
      const data = res.data;
      await showModal({
        icon: 'info',
        title: 'Cleanup Complete',
        message: `${data.message || `Deleted ${data.rows_deleted || 0} log entries older than ${days} days.`}`,
        type: 'confirm',
        confirmLabel: 'OK',
      });
      // Refresh the logs view
      LogsState.page = 1;
      loadAuditLogs();
    } else {
      let msg = 'Failed to clean up logs.';
      if (res.status === 403) msg = 'Admin access required to clean up logs.';
      else if (res.status === 401) msg = 'Your session has expired. Please sign in again.';
      else if (res.data?.error) msg = res.data.error;

      await showModal({
        icon: 'danger',
        title: 'Cleanup Failed',
        message: msg,
        type: 'confirm',
        confirmLabel: 'OK',
      });
    }
  } catch (err) {
    await showModal({
      icon: 'danger',
      title: 'Cleanup Failed',
      message: 'Network error. Please check your connection and try again.',
      type: 'confirm',
      confirmLabel: 'OK',
    });
  }
}

/* ============================================
   EXPOSE GLOBALLY
   ============================================ */
window.initAuditLogs       = initAuditLogs;
window.loadAuditLogs       = loadAuditLogs;
window.renderAuditLogs     = renderAuditLogs;
window.renderLogsPagination = renderLogsPagination;
window.changeLogsPage      = changeLogsPage;
window.changeLogsPerPage   = changeLogsPerPage;
window.applyLogFilters     = applyLogFilters;
window.clearLogFilters     = clearLogFilters;
window.handleLogsCleanup   = handleLogsCleanup;