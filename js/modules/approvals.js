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
    const res = await _apiFetch('/api/approvals', 'GET');
    if (res.ok) {
      currentPendingApprovals = res.data || [];
      renderPendingApprovals();
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Failed to load.</td></tr>';
    }
  } catch(e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Error loading.</td></tr>';
  }
}

function renderPendingApprovals() {
  const tbody = document.getElementById('pending-approvals-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
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
            ${_buildRecordTableHtml(liveData, null, 'old')}
          </div>
          <div class="diff-box diff-box--new">
            <h4>
              After (Proposed Changes)
            </h4>
            ${_buildRecordTableHtml(app.payload, liveData, 'new')}
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
  } catch(e) {
    console.error(e);
    modalBody.innerHTML = '<div style="color:red;padding:2rem;text-align:center;">Error generating diff view.</div>';
  }
}

function _buildRecordTableHtml(record, compareRecord = null, mode = 'new') {
  const getDiffClass = (val, compareVal) => {
    if (!compareRecord) return '';
    if (String(val||'') !== String(compareVal||'')) {
      return mode === 'new' ? 'diff-val--new' : 'diff-val--old';
    }
    return '';
  };

  const pLine = record.production_line_code || record.bm_production_line_code || record.fg_production_line_code;
  const cLine = compareRecord ? (compareRecord.production_line_code || compareRecord.bm_production_line_code || compareRecord.fg_production_line_code) : undefined;
  
  const qty = record.quantity ?? record.qty;
  const cQty = compareRecord ? (compareRecord.quantity ?? compareRecord.qty) : undefined;

  let html = `
    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 1rem; margin-bottom: 2rem; align-items: baseline;">
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
      showToast({type: 'success', title: 'Approved', message: 'Changes have been merged into the live database.'});
      closeApprovalModal();
      fetchPendingApprovals();
    } else {
      await showModal({
        icon: 'danger', title: 'Approval Failed',
        message: res.data?.error || 'Failed to approve request.',
        type: 'confirm', confirmLabel: 'OK'
      });
    }
  } catch(e) {
    console.error(e);
    await showModal({icon: 'danger', title: 'Error', message: 'Network error approving request.', type: 'confirm', confirmLabel: 'OK'});
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
      showToast({type: 'success', title: 'Rejected', message: 'The request was successfully rejected.'});
      closeApprovalModal();
      fetchPendingApprovals();
    } else {
      await showModal({
        icon: 'danger', title: 'Rejection Failed',
        message: res.data?.error || 'Failed to reject request.',
        type: 'confirm', confirmLabel: 'OK'
      });
    }
  } catch(e) {
    console.error(e);
    await showModal({icon: 'danger', title: 'Error', message: 'Network error rejecting request.', type: 'confirm', confirmLabel: 'OK'});
  } finally {
    btn.disabled = false;
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
});