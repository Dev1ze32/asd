/* ============================================
   APPROVALS.JS - Admin Approvals Workflow
   ============================================ */

let currentPendingApprovals = [];
let selectedApprovalId = null;

async function fetchPendingApprovals() {
  const tbody = document.getElementById('pending-approvals-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading pending approvals...</td></tr>';

  try {
    const res = await _apiFetch(`/api/approvals?_=${Date.now()}`, 'GET');
    if (res.ok) {
      currentPendingApprovals = res.data || [];
      renderPendingApprovals();
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Failed to load.</td></tr>';
    }
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Error loading.</td></tr>';
  }
}

/**
 * Silent background poll — only refreshes the badge count.
 * Does NOT touch the table DOM, so there is no visual flash or "Loading..."
 * flicker when the user is idle on the page.
 */
async function _fetchApprovalsCount() {
  try {
    const res = await _apiFetch(`/api/approvals?_=${Date.now()}`, 'GET');
    if (res.ok) {
      currentPendingApprovals = res.data || [];
      _updateApprovalsBadge();
    }
  } catch (e) {
    // Silently ignore background poll errors
  }
}

function _updateApprovalsBadge() {
  const badge = document.getElementById('approvals-badge');
  if (!badge) return;
  const count = currentPendingApprovals.length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
}

function renderPendingApprovals() {
  const tbody = document.getElementById('pending-approvals-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  _updateApprovalsBadge();

  if (currentPendingApprovals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;font-style:italic;padding:2rem;">No pending approvals. All caught up!</td></tr>';
    return;
  }

  currentPendingApprovals.forEach(app => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${app.id}</td>
      <td style="font-weight:700;">${sanitizeInput(app.inventory_id)}</td>
      <td>
        <span style="font-size:0.7rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:99px; ${app.action === 'ADD' ? 'background:#dbeafe;color:#1e40af;' : 'background:#fef9c3;color:#854d0e;'}">
          ${app.action}
        </span>
      </td>
      <td>${sanitizeInput(app.requested_by)}</td>
      <td style="font-size:0.8rem;color:#64748b;">${new Date(app.created_at).toLocaleString()}</td>
      <td style="text-align:right;">
        <button class="admin-btn admin-btn--secondary" onclick="openApprovalModal(${app.id})" style="padding:0.35rem 0.75rem;font-size:0.75rem;">Review</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function openApprovalModal(id) {
  selectedApprovalId = id;
  const app = currentPendingApprovals.find(a => a.id === id);
  if (!app) return;

  const modal = document.getElementById('approval-modal');
  const modalBody = document.getElementById('approval-modal-body');
  const title = document.getElementById('approval-modal-title');

  title.textContent = `Review ${app.action}: ${app.inventory_id}`;
  modalBody.innerHTML = '<div style="text-align:center;padding:3rem;"><span class="spinner" style="display:inline-block;width:24px;height:24px;border:3px solid #ccc;border-top-color:#0b6b78;border-radius:50%;animation:spin 1s linear infinite;"></span></div>';
  modal.classList.remove('hidden');

  try {
    let liveData = null;
    if (app.action === 'UPDATE') {
      const res = await apiGetItem(app.inventory_id);
      if (res.ok) liveData = res.data;
    }

    let html = '';

    if (app.action === 'UPDATE' && liveData) {
      html += `
        <div class="diff-container" style="flex-direction: column;">
            <div class="diff-box diff-box--old">
              <h4>
                Before (Live Database)
              </h4>
              ${_buildRecordTableHtml(liveData, app.payload, 'old')}
            </div>
            <div class="diff-box diff-box--new">
              <h4>
                After (Proposed Changes)
              </h4>
              ${_buildRecordTableHtml(app.payload, liveData, 'update')}
            </div>
        </div>
      `;
    } else {
      html += `
        <div class="diff-box diff-box--new" style="max-width:800px;margin:0 auto;">
          <h4>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Proposed New Item Data
          </h4>
          ${_buildRecordTableHtml(app.payload, null, 'new')}
        </div>
      `;
    }

    modalBody.innerHTML = html;
  } catch (e) {
    console.error(e);
    modalBody.innerHTML = '<div style="color:red;padding:2rem;text-align:center;">Error generating diff view.</div>';
  }
}

function _buildRecordTableHtml(record, compareRecord = null, mode = 'new') {
  const getDiffClass = (val, compareVal) => {
    if (!compareRecord) return '';
    if (String(val || '') !== String(compareVal || '')) {
      return (mode === 'new' || mode === 'update') ? 'diff-val--new' : 'diff-val--old';
    }
    return '';
  };

  const pLine = record.production_line_code || record.bm_production_line_code || record.fg_production_line_code;
  const cLine = compareRecord ? (compareRecord.production_line_code || compareRecord.bm_production_line_code || compareRecord.fg_production_line_code) : undefined;

  const qty = record.quantity ?? record.qty;
  const cQty = compareRecord ? (compareRecord.quantity ?? compareRecord.qty) : undefined;

  let revisionHtml = '';
  if (mode === 'new') {
    revisionHtml = '<span>00</span>';
  } else if (mode === 'old') {
    revisionHtml = `<span>${sanitizeInput(record.revision || '-')}</span>`;
  } else if (mode === 'update' && compareRecord) {
    const oldRev = compareRecord.revision || '00';
    let newRev = oldRev;
    const parsed = parseInt(oldRev, 10);
    if (!isNaN(parsed) && String(parsed) === String(Number(oldRev))) {
      newRev = String(parsed + 1).padStart(2, '0');
    } else if (!isNaN(parsed)) {
       newRev = String(parsed + 1).padStart(2, '0');
    }
    revisionHtml = `<span class="diff-val--old">${sanitizeInput(oldRev)}</span> <span style="margin:0 0.5rem; color:#94a3b8;">➔</span> <span class="diff-val--new">${sanitizeInput(newRev)}</span>`;
  }

  let html = `
    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 1rem; margin-bottom: 2rem; align-items: baseline;">
      <div style="font-weight: 600; font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Revision</div>
      <div style="font-size: 0.95rem; display:flex; align-items:center;">${revisionHtml || '-'}</div>

      <div style="font-weight: 600; font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Description</div>
      <div style="font-size: 0.95rem;"><span class="${getDiffClass(record.revision_descr, compareRecord?.revision_descr)}">${sanitizeInput(record.revision_descr || '-')}</span></div>

      <div style="font-weight: 600; font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Prod Line</div>
      <div style="font-size: 0.95rem;"><span class="${getDiffClass(pLine, cLine)}">${sanitizeInput(pLine || '-')}</span></div>

      <div style="font-weight: 600; font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Quantity</div>
      <div style="font-size: 0.95rem;"><span class="${getDiffClass(qty, cQty)}">${qty ?? '-'}</span></div>

      <div style="font-weight: 600; font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Notes</div>
      <div style="font-size: 0.95rem;"><span class="${getDiffClass(record.notes, compareRecord?.notes)}">${sanitizeInput(record.notes || '-')}</span></div>
    </div>
  `;

  if (record.activities && record.activities.length > 0) {
    html += `
      <h5 class="diff-section-title">Activities</h5>
      <div class="table-container diff-table-container">
        <table class="excel-table" style="width: 100%; min-width: 900px;">
          <thead>
            <tr>
              <th colspan="8" class="section-header--routing">ROUTING DETAILS</th>
              <th colspan="5" class="section-header--bom">ACUMATICA BOM</th>
            </tr>
            <tr>
              <th class="w-activity" style="text-align:left;">Activities</th>
              <th class="w-pax">Pax</th>
              <th class="w-machine">Machine</th>
              <th class="w-time">Time (min)</th>
              <th class="w-runtime" colspan="2">Run Time</th>
              <th class="w-labor">Total Labor min</th>
              <th class="w-mc">Total MC min</th>
              <th class="w-bom-activity th-bom">ACTIVITIES</th>
              <th class="w-dl-units th-bom">DL<br>(UNITS/1 MIN)</th>
              <th class="w-dl th-bom">DL</th>
              <th class="w-voh th-bom">VOH</th>
              <th class="w-foh th-bom">FOH</th>
            </tr>
          </thead>
          <tbody>
    `;
    record.activities.forEach((act, i) => {
      const compAct = compareRecord?.activities?.[i] || {};
      const actName = act.activity_name || act.activities;
      const compActName = compAct.activity_name || compAct.activities;

      html += `
        <tr>
          <td class="w-activity bg-activity-green"><span class="${getDiffClass(actName, compActName)}">${sanitizeInput(actName || '-')}</span></td>
          <td class="w-pax bg-activity-green" style="text-align:center;"><span class="${getDiffClass(act.pax, compAct.pax)}">${act.pax || 0}</span></td>
          <td class="w-machine bg-activity-green" style="text-align:center;"><span class="${getDiffClass(act.machine, compAct.machine)}">${act.machine || 0}</span></td>
          <td class="w-time bg-activity-green" style="text-align:right;"><span class="${getDiffClass(act.time_min, compAct.time_min)}">${act.time_min || 0}</span></td>
          <td class="w-runtime" style="text-align:right;"><span class="${getDiffClass(act.run_time, compAct.run_time)}">${act.run_time || 0}</span></td>
          <td class="w-unit" style="text-align:center;">UNIT</td>
          <td class="w-labor" style="text-align:right;"><span class="${getDiffClass(act.labor_min, compAct.labor_min)}">${act.labor_min || 0}</span></td>
          <td class="w-mc" style="text-align:right;"><span class="${getDiffClass(act.mc_min, compAct.mc_min)}">${act.mc_min || 0}</span></td>
          <td class="cell-bom w-bom-activity sync-activity-cell" style="text-align:left;"><span class="${getDiffClass(actName, compActName)}">${sanitizeInput(actName || '-')}</span></td>
          <td class="cell-bom dl-units-cell" style="text-align:right;"><span class="${getDiffClass(act.dl_units, compAct.dl_units)}">${act.dl_units || 0}</span></td>
          <td class="cell-bom dl-cell" style="text-align:right;"><span class="${getDiffClass(act.dl, compAct.dl)}">${act.dl || 0}</span></td>
          <td class="cell-bom voh-cell" style="text-align:right;"><span class="${getDiffClass(act.voh, compAct.voh)}">${act.voh || 0}</span></td>
          <td class="cell-bom foh-cell" style="text-align:right;"><span class="${getDiffClass(act.foh, compAct.foh)}">${act.foh || 0}</span></td>
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
  } else {
    html += `<p class="diff-empty-state">No activities defined.</p>`;
  }

  return html;
}

function closeApprovalModal() {
  document.getElementById('approval-modal').classList.add('hidden');
  selectedApprovalId = null;
}

async function handleApproveApproval() {
  if (!selectedApprovalId) return;
  const btn = document.getElementById('btn-approve-approval');
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.textContent = 'Approving...';

  try {
    const res = await _apiFetch(`/api/approvals/${selectedApprovalId}/approve`, 'POST');
    if (res.ok) {
      showToast({ type: 'success', title: 'Approved', message: 'Changes have been merged into the live database.' });
      closeApprovalModal();
      fetchPendingApprovals();
    } else {
      await showModal({
        icon: 'danger', title: 'Approval Failed',
        message: res.data?.error || 'Failed to approve request.',
        type: 'confirm', confirmLabel: 'OK'
      });
    }
  } catch (e) {
    console.error(e);
    await showModal({ icon: 'danger', title: 'Error', message: 'Network error approving request.', type: 'confirm', confirmLabel: 'OK' });
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function handleRejectApproval() {
  if (!selectedApprovalId) return;
  const btn = document.getElementById('btn-reject-approval');

  try {
    const confirm = await showModal({
      icon: 'warning', title: 'Reject Request',
      message: 'Are you sure you want to completely reject this request? It will be permanently discarded.',
      type: 'confirm', confirmLabel: 'Yes, Reject', confirmStyle: 'danger'
    });
    if (!confirm.confirmed) return;

    btn.disabled = true;

    const res = await _apiFetch(`/api/approvals/${selectedApprovalId}/reject`, 'POST');
    if (res.ok) {
      showToast({ type: 'success', title: 'Rejected', message: 'The request was successfully rejected.' });
      closeApprovalModal();
      fetchPendingApprovals();
    } else {
      await showModal({
        icon: 'danger', title: 'Rejection Failed',
        message: res.data?.error || 'Failed to reject request.',
        type: 'confirm', confirmLabel: 'OK'
      });
    }
  } catch (e) {
    console.error(e);
    await showModal({ icon: 'danger', title: 'Error', message: 'Network error rejecting request.', type: 'confirm', confirmLabel: 'OK' });
  } finally {
    btn.disabled = false;
  }
}

/* ============================================
   Real-time badge updates via Server-Sent Events
   ============================================

   /api/approvals/stream is admin-only (only admins can approve/reject),
   so this only ever connects when the logged-in user's role is 'admin'.

   We can't use the native EventSource API here because EventSource has
   no way to attach an Authorization header, and this backend authenticates
   every request via a Bearer JWT (see routes/utils/decorators.py). Instead
   we open the stream with fetch() (which does support custom headers) and
   read the response body as a stream, parsing "data: ..." lines ourselves.
*/

let _approvalsSSEAbort = null;   // AbortController for the current stream
let _approvalsSSEReconnectTimer = null;

function _isAdmin() {
  return (typeof Auth !== 'undefined') && Auth.isAdmin();
}

function _handleApprovalsSSEMessage(rawEventBlock) {
  // Each SSE event is one or more lines; only "data:" lines carry payload.
  // Lines starting with ":" are comments (our heartbeat) and are ignored.
  let dataStr = '';
  for (const line of rawEventBlock.split('\n')) {
    if (line.startsWith('data:')) {
      dataStr += line.slice(5).trim();
    }
  }
  if (!dataStr) return;

  let payload;
  try {
    payload = JSON.parse(dataStr);
  } catch (e) {
    return;
  }

  if (payload && payload.type === 'approvals_changed') {
    // A submission/approval/rejection happened somewhere — refresh the
    // badge (and the backing array) silently, without touching the table.
    _fetchApprovalsCount();
  }
}

async function _connectApprovalsSSE() {
  if (_approvalsSSEAbort) return; // already connected
  if (!_isAdmin()) return;

  // Same header helper _apiFetch uses — {} if not logged in yet, which will
  // simply get a 401 and fall into the catch block below to retry shortly.
  const authHeaders = (typeof Auth !== 'undefined') ? Auth.authHeaders() : {};
  _approvalsSSEAbort = new AbortController();

  try {
    const res = await fetch(API_BASE_URL + '/api/approvals/stream', {
      method: 'GET',
      headers: { ...authHeaders, Accept: 'text/event-stream' },
      signal: _approvalsSSEAbort.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed with status ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line ("\n\n")
      let sepIndex;
      while ((sepIndex = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        _handleApprovalsSSEMessage(rawEvent);
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('Approvals SSE stream disconnected, will retry:', e);
    }
  } finally {
    _approvalsSSEAbort = null;
    // Reconnect after a short delay as long as the user is still an admin.
    // This also covers the initial case where the token isn't ready yet.
    if (_isAdmin() && !_approvalsSSEReconnectTimer) {
      _approvalsSSEReconnectTimer = setTimeout(() => {
        _approvalsSSEReconnectTimer = null;
        _connectApprovalsSSE();
      }, 5000);
    }
  }
}

function _disconnectApprovalsSSE() {
  if (_approvalsSSEAbort) {
    _approvalsSSEAbort.abort();
    _approvalsSSEAbort = null;
  }
  if (_approvalsSSEReconnectTimer) {
    clearTimeout(_approvalsSSEReconnectTimer);
    _approvalsSSEReconnectTimer = null;
  }
}

// Hook into Approvals tab click to auto-refresh
document.addEventListener('DOMContentLoaded', () => {
  const approvalsTab = document.getElementById('tab-approvals');
  if (approvalsTab) {
    approvalsTab.addEventListener('click', () => {
      // Small delay to ensure tab is active and role is evaluated
      setTimeout(() => {
        const role = ((typeof Auth !== 'undefined' && Auth.getUser()) || {}).role || '';
        if (role === 'admin') {
          fetchPendingApprovals();
        }
      }, 100);
    });
  }

  // Keep the notification badge live in real time via SSE: retry shortly
  // after load in case Auth's role check resolves asynchronously.
  //
  // NOTE: incoming SSE messages call _fetchApprovalsCount() (silent,
  // badge-only) instead of fetchPendingApprovals() so the table never
  // flashes "Loading..." while the user is idle. The full table is only
  // re-rendered when the user clicks the Approvals tab.
  const RETRY_INTERVAL_MS = 1000;   // retry every 1s until role is known
  const MAX_RETRIES = 15;           // give up after 15s if never admin
  let retries = 0;

  function _attemptInitialConnect() {
    if (_isAdmin()) {
      fetchPendingApprovals();
      _connectApprovalsSSE();
      return;
    }
    retries++;
    if (retries < MAX_RETRIES) {
      setTimeout(_attemptInitialConnect, RETRY_INTERVAL_MS);
    }
  }

  _attemptInitialConnect();

  // When the tab/window regains focus, do a silent badge-only refresh in
  // case the SSE connection dropped while the tab was backgrounded, and
  // make sure the stream is (re)connected.
  window.addEventListener('focus', () => {
    if (_isAdmin()) {
      _fetchApprovalsCount();
      _connectApprovalsSSE();
    }
  });

  // Clean up the stream on logout/navigation away, if your app fires this.
  window.addEventListener('beforeunload', _disconnectApprovalsSSE);
});