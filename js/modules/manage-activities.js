/* ============================================
   MANAGE-ACTIVITIES.JS - Line Activity CRUD
   Pioneer Adhesives Routing Template System

   Manages the line activity database.
   Supports viewing, adding, editing, and deleting
   activities per production line with safety guards.

   PENDING-CHANGES SYSTEM:
   All edits (add/rename/delete activity, create/
   edit/delete line) are staged locally and only
   committed to the API when the user clicks "Done".
   The Done button is shown in the lower-left of
   the manage view and triggers a confirmation modal.

   Uses custom modal dialogs instead of browser
   prompt()/confirm() for a consistent UI experience.
   ============================================ */

/* ============================================
   PENDING CHANGES STATE
   Tracks all unsaved mutations for the current
   Manage Lines session.
   ============================================ */

/**
 * Pending change log for the current manage session.
 * Each entry describes one mutation:
 *   { type, ...payload }
 *
 * Types:
 *   'create_line'    – { code, desc }
 *   'edit_line'      – { oldCode, newCode, newDesc }
 *   'delete_line'    – { code }
 *   'add_activity'   – { lineCode, activityName }
 *   'rename_activity'– { lineCode, index, oldName, newName }
 *   'delete_activity'– { lineCode, index, activityName }
 *
 * @type {Array<Object>}
 */
let _pendingChanges = [];

/**
 * Snapshot of LINE_DESCRIPTIONS and lineActivitiesDB
 * taken when the Manage tab is first opened.
 * Used to restore state if the user cancels.
 * @type {{ lines: Object, activities: Object } | null}
 */
let _manageSnapshot = null;

/**
 * Whether any pending changes exist for the current session.
 * @returns {boolean}
 */
function _hasPendingChanges() {
  return _pendingChanges.length > 0;
}

/**
 * Take a deep snapshot of the current line/activity data.
 * Called at the start of each Manage session.
 */
function _takeManageSnapshot() {
  _manageSnapshot = {
    lines:      JSON.parse(JSON.stringify(LINE_DESCRIPTIONS)),
    activities: JSON.parse(JSON.stringify(lineActivitiesDB)),
  };
}

/**
 * Restore LINE_DESCRIPTIONS and lineActivitiesDB from snapshot.
 * Called when the user cancels without saving.
 */
function _restoreManageSnapshot() {
  if (!_manageSnapshot) return;

  // Restore LINE_DESCRIPTIONS keys
  Object.keys(LINE_DESCRIPTIONS).forEach(k => delete LINE_DESCRIPTIONS[k]);
  Object.assign(LINE_DESCRIPTIONS, _manageSnapshot.lines);

  // Restore lineActivitiesDB keys
  Object.keys(lineActivitiesDB).forEach(k => delete lineActivitiesDB[k]);
  Object.assign(lineActivitiesDB, _manageSnapshot.activities);
}

/**
 * Record a pending change and update the Done button badge.
 * @param {Object} change
 */
function _recordChange(change) {
  _pendingChanges.push(change);
  _updateDoneButtonBadge();
}

/**
 * Update the pending-count badge on the Done button.
 */
function _updateDoneButtonBadge() {
  const badge = document.getElementById('manage-done-badge');
  const btn   = document.getElementById('btn-manage-done');
  if (!badge || !btn) return;

  const count = _pendingChanges.length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  } else {
    badge.style.display = 'none';
    btn.style.opacity = '0.55';
    btn.style.pointerEvents = 'none';
  }
}

/**
 * Reset all pending state. Call after commit or cancel.
 */
function _clearPendingChanges() {
  _pendingChanges = [];
  _manageSnapshot = null;
  _updateDoneButtonBadge();
}


/* ============================================
   CUSTOM MODAL SYSTEM
   ============================================ */

/**
 * Show a custom modal. Returns a Promise that resolves with:
 *   { confirmed: true, value: string } on OK
 *   { confirmed: false } on Cancel
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {'confirm'|'prompt'} opts.type
 * @param {string} [opts.inputDefault]   - Pre-fill value for prompt type
 * @param {string} [opts.inputPlaceholder]
 * @param {'primary'|'danger'} [opts.confirmStyle] - Button color
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.icon]           - 'warn' | 'info' | 'danger'
 */
function showModal(opts) {
  return new Promise(resolve => {
    const modal       = document.getElementById('customModal');
    const titleEl     = document.getElementById('modalTitle');
    const msgEl       = document.getElementById('modalMessage');
    const inputWrap   = document.getElementById('modalInputWrap');
    const inputEl     = document.getElementById('modalInput');
    const confirmBtn  = document.getElementById('modalConfirmBtn');
    const cancelBtn   = document.getElementById('modalCancelBtn');
    const iconWrap    = document.getElementById('modalIconWrap');

    titleEl.textContent = opts.title || '';

    // messageHtml lets callers inject a pre-built HTML string (e.g. a bullet list).
    // Prefer that over plain text when provided.
    if (opts.messageHtml) {
      msgEl.innerHTML = opts.messageHtml;
    } else {
      msgEl.textContent = opts.message || '';
    }

    // Icon
    iconWrap.innerHTML = '';
    if (opts.icon === 'danger') {
      iconWrap.innerHTML = '<div class="modal-icon-circle-danger"><span style="font-size:1.1rem;">&#9888;</span></div>';
    } else if (opts.icon === 'warn') {
      iconWrap.innerHTML = '<div class="modal-icon-circle-warn"><span style="font-size:1.1rem;">&#9888;</span></div>';
    } else if (opts.icon === 'info') {
      iconWrap.innerHTML = '<div class="modal-icon-circle-info"><span style="font-size:1.1rem;">&#8505;</span></div>';
    }

    // Input field
    if (opts.type === 'prompt') {
      inputWrap.style.display = 'block';
      inputEl.value = opts.inputDefault || '';
      inputEl.placeholder = opts.inputPlaceholder || '';
      setTimeout(() => inputEl.focus(), 50);
    } else {
      inputWrap.style.display = 'none';
    }

    // Confirm button style
    const isDanger = opts.confirmStyle === 'danger';
    confirmBtn.textContent = opts.confirmLabel || 'Confirm';
    confirmBtn.style.background = isDanger ? '#dc2626' : '#005c66';
    confirmBtn.style.color = '#ffffff';
    confirmBtn.onmouseover = () => { confirmBtn.style.background = isDanger ? '#b91c1c' : '#0b5360'; };
    confirmBtn.onmouseout  = () => { confirmBtn.style.background = isDanger ? '#dc2626' : '#005c66'; };

    modal.style.display = 'flex';

    // Keyboard: Enter = confirm, Escape = cancel
    function onKey(e) {
      if (e.key === 'Enter')  handleConfirm();
      if (e.key === 'Escape') handleCancel();
    }
    document.addEventListener('keydown', onKey);

    function cleanup() {
      modal.style.display = 'none';
      document.removeEventListener('keydown', onKey);
      confirmBtn.onclick = null;
      cancelBtn.onclick  = null;
    }

    function handleConfirm() {
      cleanup();
      resolve({ confirmed: true, value: inputEl.value.trim() });
    }
    function handleCancel() {
      cleanup();
      resolve({ confirmed: false });
    }

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick  = handleCancel;
  });
}


/**
 * Show a modal with TWO labeled input fields.
 * Returns a Promise resolving with:
 *   { confirmed: true, value1: string, value2: string } on Done
 *   { confirmed: false } on Cancel
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} opts.label1
 * @param {string} opts.label2
 * @param {string} [opts.default1]
 * @param {string} [opts.default2]
 * @param {string} [opts.placeholder1]
 * @param {string} [opts.placeholder2]
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.icon]
 */
function showDualInputModal(opts) {
  return new Promise(resolve => {
    const modal      = document.getElementById('customModal');
    const titleEl    = document.getElementById('modalTitle');
    const msgEl      = document.getElementById('modalMessage');
    const inputWrap  = document.getElementById('modalInputWrap');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn  = document.getElementById('modalCancelBtn');
    const iconWrap   = document.getElementById('modalIconWrap');

    titleEl.textContent = opts.title || '';
    msgEl.textContent   = opts.message || '';

    // Icon
    iconWrap.innerHTML = '';
    if (opts.icon === 'info') {
      iconWrap.innerHTML = '<div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:#eff6ff;border:1px solid #bfdbfe;"><span style="font-size:1.1rem;color:#2563eb;">&#8505;</span></div>';
    } else if (opts.icon === 'warn') {
      iconWrap.innerHTML = '<div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:#fffbeb;border:1px solid #fde68a;"><span style="font-size:1.1rem;color:#d97706;">&#9888;</span></div>';
    }

    // Build dual input UI inside inputWrap
    inputWrap.style.display = 'block';
    inputWrap.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <div>
          <label style="display:block;font-size:0.78rem;font-weight:600;color:#64748b;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em;">${opts.label1 || 'Field 1'}</label>
          <input id="modalDualInput1"
                 value="${opts.default1 || ''}"
                 placeholder="${opts.placeholder1 || ''}"
                 style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:0.55rem 0.8rem;font-size:0.875rem;color:#0f172a;box-sizing:border-box;outline:none;"
                 onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#cbd5e1'">
        </div>
        <div>
          <label style="display:block;font-size:0.78rem;font-weight:600;color:#64748b;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em;">${opts.label2 || 'Field 2'}</label>
          <input id="modalDualInput2"
                 value="${opts.default2 || ''}"
                 placeholder="${opts.placeholder2 || ''}"
                 style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:0.55rem 0.8rem;font-size:0.875rem;color:#0f172a;box-sizing:border-box;outline:none;"
                 onfocus="this.style.borderColor='#005c66'" onblur="this.style.borderColor='#cbd5e1'">
        </div>
      </div>
    `;

    const input1 = document.getElementById('modalDualInput1');
    const input2 = document.getElementById('modalDualInput2');
    setTimeout(() => input1.focus(), 50);

    // Confirm button — no inline color override so it follows the
    // theme-aware .modal-btn-confirm CSS class (bright vs dark mode),
    // instead of always looking dark regardless of theme.
    confirmBtn.textContent = opts.confirmLabel || 'Done';
    confirmBtn.style.background = '';
    confirmBtn.style.color = '';
    confirmBtn.onmouseover = null;
    confirmBtn.onmouseout  = null;

    modal.style.display = 'flex';

    function onKey(e) {
      if (e.key === 'Escape') handleCancel();
    }
    document.addEventListener('keydown', onKey);

    function cleanup() {
      modal.style.display = 'none';
      // Restore inputWrap to its original single-input state for showModal reuse
      inputWrap.innerHTML = '<input id="modalInput" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:0.55rem 0.8rem;font-size:0.875rem;color:#0f172a;box-sizing:border-box;outline:none;" onfocus="this.style.borderColor=\'#005c66\'" onblur="this.style.borderColor=\'#cbd5e1\'">';
      document.removeEventListener('keydown', onKey);
      confirmBtn.onclick = null;
      cancelBtn.onclick  = null;
    }

    function handleConfirm() {
      cleanup();
      resolve({
        confirmed: true,
        value1: document.getElementById('modalDualInput1')?.value.trim() || input1.value.trim(),
        value2: document.getElementById('modalDualInput2')?.value.trim() || input2.value.trim(),
      });
    }
    function handleCancel() {
      cleanup();
      resolve({ confirmed: false });
    }

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick  = handleCancel;
  });
}


/* ============================================
   TOAST NOTIFICATION SYSTEM
   Non-blocking success/error/info popups that
   auto-dismiss after a short delay.
   ============================================ */

/**
 * Show a toast notification popup.
 * @param {Object} opts
 * @param {'success'|'error'|'info'|'warn'} opts.type
 * @param {string} opts.title       - Bold headline
 * @param {string} opts.message     - Supporting detail (optional)
 * @param {number} [opts.duration]  - Auto-dismiss ms (default 3500)
 */
function showToast(opts) {
  // Ensure container exists
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = [
      'position:fixed',
      'bottom:1.25rem',
      'right:1.25rem',
      'z-index:99999',
      'display:flex',
      'flex-direction:column-reverse',
      'gap:0.6rem',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(container);
  }

  // Color palette per type
  const palette = {
    success: { bg: '#f0fdf4', border: '#86efac', icon: '✓', iconBg: '#dcfce7', iconColor: '#16a34a', titleColor: '#15803d' },
    error:   { bg: '#fff1f2', border: '#fca5a5', icon: '✕', iconBg: '#fee2e2', iconColor: '#dc2626', titleColor: '#b91c1c' },
    warn:    { bg: '#fffbeb', border: '#fde68a', icon: '!', iconBg: '#fef9c3', iconColor: '#d97706', titleColor: '#b45309' },
    info:    { bg: '#eff6ff', border: '#93c5fd', icon: 'i', iconBg: '#dbeafe', iconColor: '#2563eb', titleColor: '#1d4ed8' },
  };
  const p = palette[opts.type] || palette.info;
  const duration = opts.duration || 3500;

  // Build toast element
  const toast = document.createElement('div');
  toast.style.cssText = [
    `background:${p.bg}`,
    `border:1.5px solid ${p.border}`,
    'border-radius:12px',
    'padding:0.9rem 1.1rem',
    'min-width:280px',
    'max-width:360px',
    'display:flex',
    'align-items:flex-start',
    'gap:0.75rem',
    'box-shadow:0 8px 24px rgba(0,0,0,0.10)',
    'pointer-events:all',
    'transform:translateY(120%)',
    'transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
    'opacity:0',
    'cursor:default',
  ].join(';');

  toast.innerHTML = `
    <div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:${p.iconBg};
                display:flex;align-items:center;justify-content:center;
                font-size:0.95rem;font-weight:800;color:${p.iconColor};font-style:normal;">
      ${p.icon}
    </div>
    <div style="flex:1;min-width:0;">
      <p style="margin:0 0 ${opts.message ? '0.2rem' : '0'};font-size:0.875rem;font-weight:700;color:${p.titleColor};line-height:1.3;">
        ${opts.title || ''}
      </p>
      ${opts.message ? `<p style="margin:0;font-size:0.8rem;color:#475569;line-height:1.45;">${opts.message}</p>` : ''}
    </div>
    <button style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:1rem;color:#94a3b8;
                   line-height:1;padding:0.1rem 0.3rem;border-radius:4px;align-self:flex-start;"
            onmouseover="this.style.color='#475569'" onmouseout="this.style.color='#94a3b8'"
            onclick="this.closest('[data-toast]').remove()">
      &times;
    </button>
  `;
  toast.setAttribute('data-toast', '1');
  container.appendChild(toast);

  // Slide up
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity   = '1';
    });
  });

  // Auto-dismiss
  const timer = setTimeout(() => _dismissToast(toast), duration);

  // Click to dismiss early
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    _dismissToast(toast);
  });
}

function _dismissToast(toast) {
  toast.style.transform = 'translateY(120%)';
  toast.style.opacity   = '0';
  setTimeout(() => toast.remove(), 300);
}

window.showToast = showToast;


/**
 * Initialize the production line dropdown.
 * Also resets pending changes and takes a fresh snapshot
 * so each Manage session starts clean.
 */
function initManageLines(preselectCode = null) {
  const select = document.getElementById('manageLineSelect');
  if (!select) return;

  // Start a fresh pending session each time the Manage tab is entered.
  // Only reset if there are no pending changes yet (don't clobber mid-session).
  if (!_hasPendingChanges()) {
    _clearPendingChanges();
    _takeManageSnapshot();
  }
  _updateDoneButtonBadge();

  select.innerHTML = '<option value="" disabled selected>-- Choose Line --</option>';

  const lineCodes = Object.keys(LINE_DESCRIPTIONS).sort();
  lineCodes.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    select.appendChild(opt);
  });

  if (preselectCode && LINE_DESCRIPTIONS[preselectCode]) {
    select.value = preselectCode;
    renderManageActivities();
  } else {
    // No line selected: hide editor + action buttons
    _hideEditorAndButtons();
  }
}

/**
 * Refresh the Manage Lines dropdown — re-fetches production lines (and their
 * activities) from the API into the local cache, then rebuilds the selector.
 * Falls back gracefully to the existing local cache if the API is unreachable.
 * Preserves the currently selected line (if any) after refreshing.
 */
async function refreshManageLines() {
  const btn = document.getElementById('btn-refresh-manage-lines');
  const select = document.getElementById('manageLineSelect');
  const currentSelection = select ? select.value : null;

  if (btn) {
    btn.disabled = true;
    btn.dataset.originalHtml = btn.dataset.originalHtml || btn.innerHTML;
    btn.innerHTML = 'Refreshing…';
  }

  try {
    const res = await apiGetProductionLines();
    if (res.ok && Array.isArray(res.data)) {
      res.data.forEach(line => {
        const code = line.production_line_code || line.line_code || line.code;
        const desc = line.production_line_name || line.description || line.desc || code;
        if (!code) return;

        LINE_DESCRIPTIONS[code] = desc;

        if (Array.isArray(line.activities) && line.activities.length > 0) {
          lineActivitiesDB[code] = line.activities.map(a => {
            if (typeof normalizeLineActivity === 'function') {
              return normalizeLineActivity(a);
            }
            return a.activity_name || a.name || String(a);
          });
        } else if (!lineActivitiesDB[code]) {
          lineActivitiesDB[code] = [];
        }
      });
      showToast({ type: 'success', title: 'Lines Refreshed', message: `Loaded ${res.data.length} production line(s) from the server.` });
    } else {
      showToast({ type: 'warning', title: 'Refresh Limited', message: 'Could not reach the server — showing locally cached lines.' });
    }
  } catch (_) {
    showToast({ type: 'warning', title: 'Refresh Limited', message: 'Could not reach the server — showing locally cached lines.' });
  }

  // Keep the production line dropdown on the routing form in sync too
  if (typeof populateProdLineSelect === 'function') {
    populateProdLineSelect();
  }

  initManageLines(currentSelection || null);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml;
  }
}

/**
 * Render the activities list and toggle UI visibility
 */
function renderManageActivities() {
  const selectedLine  = document.getElementById('manageLineSelect')?.value;
  const lineDescEl    = document.getElementById('manageLineDesc');
  const editorSection = document.getElementById('activityEditorSection');
  const listContainer = document.getElementById('manageActivityList');
  const emptyMsg      = document.getElementById('emptyActivitiesMsg');
  const countBadge    = document.getElementById('activityCountBadge');

  const btnEdit   = document.getElementById('btnEditLine');
  const btnDelete = document.getElementById('btnDeleteLine');

  if (!selectedLine) {
    _hideEditorAndButtons();
    if (lineDescEl) { lineDescEl.textContent = ''; lineDescEl.style.display = 'none'; }
    return;
  }

  // Show line description
  if (lineDescEl) {
    const desc = LINE_DESCRIPTIONS[selectedLine] || '';
    lineDescEl.textContent = desc;
    lineDescEl.style.display = desc ? 'block' : 'none';
  }

  // Show editor + action buttons
  if (editorSection) editorSection.style.display = 'block';
  if (btnEdit)   { btnEdit.style.display   = 'block'; btnEdit.classList.remove('hidden'); }
  if (btnDelete) { btnDelete.style.display = 'block'; btnDelete.classList.remove('hidden'); }

  if (listContainer) listContainer.innerHTML = '';

  const activities = getLineActivities(selectedLine);

  // Update count badge
  if (countBadge) {
    countBadge.textContent = activities.length === 1 ? '1 activity' : `${activities.length} activities`;
  }

  if (activities.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
  } else {
    if (emptyMsg) emptyMsg.style.display = 'none';

    activities.forEach((act, index) => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex; gap:0.5rem; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.45rem 0.6rem;';

      // Index indicator
      const numSpan = document.createElement('span');
      numSpan.textContent = String(index + 1).padStart(2, '0');
      numSpan.style.cssText = 'font-size:0.72rem; font-weight:700; color:#94a3b8; min-width:1.5rem; text-align:center;';

      const activityName = typeof getLineActivityName === 'function'
        ? getLineActivityName(act)
        : String(act || '');
      const sanitizedAct = sanitizeInput(activityName);
      const input = document.createElement('input');
      input.type = 'text';
      input.value = sanitizedAct;
      input.dataset.original = sanitizedAct;
      input.style.cssText = 'flex:1; font-size:0.875rem; font-weight:500; color:#1e293b; border:1px solid transparent; border-radius:6px; padding:0.3rem 0.5rem; background:transparent; outline:none;';
      input.title = 'Click to rename';
      input.addEventListener('focus', () => { input.style.borderColor = '#93c5fd'; input.style.background = '#fff'; });
      input.addEventListener('blur',  () => { input.style.borderColor = 'transparent'; input.style.background = 'transparent'; });
      input.addEventListener('change', () => updateActivityName(selectedLine, index, input, sanitizedAct));

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.cssText = 'font-size:0.75rem; font-weight:600; padding:0.25rem 0.65rem; border-radius:6px; background:#fff; color:#dc2626; border:1px solid #fca5a5; cursor:pointer;';
      deleteBtn.onmouseover = () => { deleteBtn.style.background = '#fff1f2'; };
      deleteBtn.onmouseout  = () => { deleteBtn.style.background = '#fff'; };
      deleteBtn.addEventListener('click', () => deleteActivity(selectedLine, index));

      li.appendChild(numSpan);
      li.appendChild(input);
      li.appendChild(deleteBtn);
      listContainer.appendChild(li);
    });
  }
}

function _hideEditorAndButtons() {
  const editorSection = document.getElementById('activityEditorSection');
  const btnEdit       = document.getElementById('btnEditLine');
  const btnDelete     = document.getElementById('btnDeleteLine');
  if (editorSection) editorSection.style.display = 'none';
  if (btnEdit)       { btnEdit.style.display   = 'none'; btnEdit.classList.add('hidden'); }
  if (btnDelete)     { btnDelete.style.display = 'none'; btnDelete.classList.add('hidden'); }
}


/* ============================================
   LINE CRUD  (now staged — no API calls here)
   ============================================ */

async function handleCreateLine() {
  const r1 = await showDualInputModal({
    icon: 'info',
    title: 'Create New Production Line',
    message: 'Fill in both fields below. Line code will be converted to uppercase.',
    label1: 'Line Code',
    label2: 'Description',
    placeholder1: 'e.g., L12',
    placeholder2: 'e.g., L1 COATINGS LINE',
    confirmLabel: 'Add Line',
  });
  if (!r1.confirmed) return;

  const cleanCode = r1.value1.toUpperCase();
  const cleanDesc = r1.value2;

  if (!cleanCode || !cleanDesc) {
    await showModal({
      icon: 'danger',
      title: 'Invalid Input',
      message: 'Line code and description cannot be empty.',
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  if (LINE_DESCRIPTIONS[cleanCode]) {
    await showModal({
      icon: 'danger',
      title: 'Code Already Exists',
      message: `Production line code "${cleanCode}" already exists. Please use a different code.`,
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  // Stage locally (no API call yet)
  addProductionLine(cleanCode, cleanDesc);
  _recordChange({ type: 'create_line', code: cleanCode, desc: cleanDesc });

  if (typeof populateProdLineSelect === 'function') populateProdLineSelect();
  initManageLines(cleanCode);
  _showPendingBanner(`Line "${cleanCode}" added — click Done to save.`);
}

async function handleEditLine() {
  const selectedLine = document.getElementById('manageLineSelect')?.value;
  if (!selectedLine) return;

  const currentDesc = LINE_DESCRIPTIONS[selectedLine];

  const r1 = await showDualInputModal({
    icon: 'info',
    title: 'Edit Production Line',
    message: 'Update the line code and/or description below.',
    label1: 'Line Code',
    label2: 'Description',
    default1: selectedLine,
    default2: currentDesc,
    placeholder1: 'e.g., L12',
    placeholder2: 'e.g., L1 COATINGS LINE',
    confirmLabel: 'Apply',
  });
  if (!r1.confirmed) return;

  const newCode = r1.value1.toUpperCase();
  const newDesc = r1.value2;

  if (!newCode || !newDesc) {
    await showModal({
      icon: 'danger',
      title: 'Invalid Input',
      message: 'Line code and description cannot be empty.',
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  if (newCode !== selectedLine && LINE_DESCRIPTIONS[newCode]) {
    await showModal({
      icon: 'danger',
      title: 'Code Already Exists',
      message: `Production line code "${newCode}" already exists. Please use a different code.`,
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  if (newCode === selectedLine && newDesc === currentDesc) return;

  // Stage locally
  renameProductionLine(selectedLine, newCode, newDesc);
  _recordChange({ type: 'edit_line', oldCode: selectedLine, newCode, newDesc });

  if (typeof populateProdLineSelect === 'function') populateProdLineSelect();
  initManageLines(newCode);
  _showPendingBanner(`Line "${newCode}" updated — click Done to save.`);
}

async function handleDeleteLine() {
  const selectedLine = document.getElementById('manageLineSelect')?.value;
  if (!selectedLine) return;

  const r = await showModal({
    icon: 'danger',
    title: 'Delete Production Line',
    message: `"${selectedLine}" and all its activities will be removed. This will take effect when you click Done.`,
    type: 'confirm',
    confirmStyle: 'danger',
    confirmLabel: 'Mark for Deletion',
  });
  if (!r.confirmed) return;

  // Stage locally
  deleteProductionLine(selectedLine);
  _recordChange({ type: 'delete_line', code: selectedLine });

  if (typeof populateProdLineSelect === 'function') populateProdLineSelect();
  initManageLines();
  renderManageActivities();
  _showPendingBanner(`Line "${selectedLine}" marked for deletion — click Done to save.`);
}


/* ============================================
   ACTIVITY CRUD  (now staged — no API calls here)
   ============================================ */

async function addActivityToLine() {
  const selectedLine = document.getElementById('manageLineSelect')?.value;
  const input        = document.getElementById('newActivityInput');
  if (!selectedLine || !input) return;

  const newAct = input.value.trim().toUpperCase();
  if (!newAct) return;

  // Stage locally
  addLineActivity(selectedLine, newAct);
  _recordChange({ type: 'add_activity', lineCode: selectedLine, activityName: newAct });

  input.value = '';
  renderManageActivities();
  _showPendingBanner(`"${newAct}" added — click Done to save.`);
}

async function deleteActivity(line, index) {
  const activities = getLineActivities(line);
  const target     = activities[index];
  const targetAct  = typeof getLineActivityName === 'function'
    ? getLineActivityName(target)
    : String(target || '');

  const r = await showModal({
    icon: 'danger',
    title: 'Delete Activity',
    message: `"${targetAct}" will be removed. This will take effect when you click Done.`,
    type: 'confirm',
    confirmStyle: 'danger',
    confirmLabel: 'Mark for Deletion',
  });
  if (!r.confirmed) return;

  // Stage locally
  removeLineActivity(line, index);
  _recordChange({ type: 'delete_activity', lineCode: line, index, activityName: targetAct });

  renderManageActivities();
  _showPendingBanner(`"${targetAct}" marked for deletion — click Done to save.`);
}

async function updateActivityName(line, index, inputElement, originalValue) {
  const newValue = inputElement.value.trim().toUpperCase();
  const activities = getLineActivities(line);
  const target = activities[index];

  if (newValue === originalValue) return;

  if (newValue === '') {
    const r = await showModal({
      icon: 'warn',
      title: 'Delete Activity?',
      message: 'You cleared the activity name. Do you want to delete this activity?',
      type: 'confirm',
      confirmStyle: 'danger',
      confirmLabel: 'Mark for Deletion',
    });
    if (r.confirmed) {
      deleteActivity(line, index);
    } else {
      inputElement.value = originalValue;
    }
  } else {
    const r = await showModal({
      icon: 'info',
      title: 'Rename Activity',
      message: `Rename "${originalValue}" → "${newValue}"? Changes will apply when you click Done.`,
      type: 'confirm',
      confirmLabel: 'Apply Rename',
    });
    if (r.confirmed) {
      // Stage locally
      updateLineActivity(line, index, newValue);
      _recordChange({ type: 'rename_activity', lineCode: line, index, oldName: originalValue, newName: newValue });
      renderManageActivities();
      _showPendingBanner(`"${originalValue}" renamed — click Done to save.`);
    } else {
      inputElement.value = originalValue;
    }
  }
}

function handleActivityKeypress(event) {
  if (event.key === 'Enter') {
    addActivityToLine();
  }
}


/* ============================================
   PENDING BANNER
   Small inline notice shown below the activity
   editor reminding the user to click Done.
   ============================================ */

/**
 * Show a brief inline banner inside the manage view.
 * Auto-dismisses after 4 s.
 * @param {string} message
 */
function _showPendingBanner(message) {
  const banner  = document.getElementById('manage-pending-banner');
  const textEl  = document.getElementById('manage-pending-banner-text');
  if (!banner) return;
  if (textEl) textEl.textContent = message;
  banner.style.display = 'flex';
  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => {
    banner.style.display = 'none';
  }, 4000);
}


/* ============================================
   DONE BUTTON — commit or discard all changes
   ============================================ */

/**
 * Handle the "Done" button click.
 * Shows a summary modal of all pending changes,
 * then either commits them all to the API or
 * discards them entirely (restoring the snapshot).
 */
async function handleManageDone() {
  if (!_hasPendingChanges()) return;

  // Build a human-readable summary list
  const summaryLines = _pendingChanges.map(c => {
    switch (c.type) {
      case 'create_line':     return `• Create line <strong>${c.code}</strong> — ${c.desc}`;
      case 'edit_line':       return `• Edit line <strong>${c.oldCode}</strong> → <strong>${c.newCode}</strong> (${c.newDesc})`;
      case 'delete_line':     return `• Delete line <strong>${c.code}</strong>`;
      case 'add_activity':    return `• Add activity "<strong>${c.activityName}</strong>" to ${c.lineCode}`;
      case 'rename_activity': return `• Rename activity "<strong>${c.oldName}</strong>" → "<strong>${c.newName}</strong>" (${c.lineCode})`;
      case 'delete_activity': return `• Delete activity "<strong>${c.activityName}</strong>" from ${c.lineCode}`;
      default:                return `• Unknown change`;
    }
  });

  const messageHtml = `
    <div style="margin-bottom:0.6rem; font-size:0.875rem; color:#475569;">
      You are about to save <strong>${_pendingChanges.length}</strong> change${_pendingChanges.length !== 1 ? 's' : ''}:
    </div>
    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.35rem;max-height:220px;overflow-y:auto;">
      ${summaryLines.map(l => `<li style="font-size:0.82rem;color:#1e293b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:0.4rem 0.7rem;line-height:1.5;">${l}</li>`).join('')}
    </ul>
    <div style="margin-top:0.75rem; font-size:0.8rem; color:#64748b;">
      Click <strong>Save All Changes</strong> to commit, or <strong>Cancel</strong> to keep editing.
    </div>
  `;

  const result = await showModal({
    icon:         'warn',
    title:        'Save All Changes?',
    messageHtml,
    type:         'confirm',
    confirmLabel: 'Save All Changes',
  });

  if (!result.confirmed) return;

  // --- Commit all pending changes to the API ---
  await _commitPendingChanges();
}

/**
 * Commit all staged changes to the API in sequence.
 * Shows a progress toast and a final success/error toast.
 */
async function _commitPendingChanges() {
  const btn = document.getElementById('btn-manage-done');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  let successCount = 0;
  let failCount    = 0;
  const errors     = [];

  // We replay changes in order against the API.
  // The local cache is already up-to-date (changes were applied immediately
  // to local state when the user made them), so we only need API calls here.
  for (const change of _pendingChanges) {
    try {
      let res;
      switch (change.type) {

        case 'create_line':
          res = await apiCreateProductionLine({ line_code: change.code, description: change.desc });
          if (!res.ok) { failCount++; errors.push(`Create "${change.code}": ${_apiErrMsg(res)}`); }
          else successCount++;
          break;

        case 'edit_line':
          res = await apiRenameProductionLine(change.oldCode, { new_line_code: change.newCode, description: change.newDesc });
          if (!res.ok) { failCount++; errors.push(`Edit "${change.oldCode}": ${_apiErrMsg(res)}`); }
          else successCount++;
          break;

        case 'delete_line':
          res = await apiDeleteProductionLine(change.code);
          if (!res.ok) { failCount++; errors.push(`Delete "${change.code}": ${_apiErrMsg(res)}`); }
          else successCount++;
          break;

        case 'add_activity': {
          // We need to find the activity's server-assigned id after saving.
          // Re-fetch the updated activity from the line after adding.
          res = await apiAddLineActivity(change.lineCode, { activity_name: change.activityName });
          if (!res.ok) { failCount++; errors.push(`Add "${change.activityName}": ${_apiErrMsg(res)}`); }
          else {
            // Sync the server-returned activity object (with real id) into local cache
            // Ensure activity_name is present because the API response might not echo it back
            const savedActivity = Object.assign({ activity_name: change.activityName }, res.data || {});
            const lineActs = lineActivitiesDB[change.lineCode];
            if (lineActs) {
              // Find the locally-added entry (still a plain string or id-less object) and replace
              const localIdx = lineActs.findIndex(a =>
                (typeof getLineActivityName === 'function' ? getLineActivityName(a) : String(a)) === change.activityName
              );
              if (localIdx !== -1) lineActs[localIdx] = normalizeLineActivity(savedActivity);
            }
            successCount++;
          }
          break;
        }

        case 'rename_activity': {
          const lineActs = lineActivitiesDB[change.lineCode];
          // Find the renamed activity by its current (new) name to retrieve its id
          const target = lineActs ? lineActs.find(a =>
            (typeof getLineActivityName === 'function' ? getLineActivityName(a) : String(a)) === change.newName
          ) : null;
          const activityId = target && typeof getLineActivityId === 'function'
            ? getLineActivityId(target)
            : null;
          res = await apiUpdateLineActivity(change.lineCode, activityId ?? change.index, { activity_name: change.newName });
          if (!res.ok) { failCount++; errors.push(`Rename "${change.oldName}": ${_apiErrMsg(res)}`); }
          else successCount++;
          break;
        }

        case 'delete_activity': {
          // Retrieve the original activity from the snapshot because it was already removed from local cache
          const snapshotActs = _manageSnapshot && _manageSnapshot.activities ? _manageSnapshot.activities[change.lineCode] || [] : [];
          const target = snapshotActs.find(a =>
            (typeof getLineActivityName === 'function' ? getLineActivityName(a) : String(a)) === change.activityName
          );
          const activityId = target && typeof getLineActivityId === 'function'
            ? getLineActivityId(target)
            : null;
            
          res = await apiDeleteLineActivity(change.lineCode, activityId ?? change.index);
          if (!res.ok) { failCount++; errors.push(`Delete "${change.activityName}": ${_apiErrMsg(res)}`); }
          else successCount++;
          break;
        }

        default:
          console.warn('[manage] Unknown pending change type:', change.type);
      }
    } catch (_) {
      // Network error — count as failure but keep going
      failCount++;
      errors.push(`${change.type} (network error)`);
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = '✓ Done'; }

  // --- Post-commit cleanup ---
  _clearPendingChanges();
  _takeManageSnapshot(); // new baseline after successful save
  _updateDoneButtonBadge();

  // Refresh the dropdown and re-render
  if (typeof populateProdLineSelect === 'function') populateProdLineSelect();
  initManageLines(document.getElementById('manageLineSelect')?.value || null);

  // Hide any pending banner
  const banner = document.getElementById('manage-pending-banner');
  if (banner) banner.style.display = 'none';

  // Final feedback
  if (failCount === 0) {
    showToast({
      type: 'success',
      title: 'All Changes Saved',
      message: `${successCount} change${successCount !== 1 ? 's' : ''} committed successfully.`,
    });
  } else if (successCount > 0) {
    showToast({
      type: 'warn',
      title: `Saved with ${failCount} Error${failCount !== 1 ? 's' : ''}`,
      message: errors.slice(0, 3).join(' | '),
      duration: 6000,
    });
  } else {
    showToast({
      type: 'error',
      title: 'Save Failed',
      message: errors.slice(0, 3).join(' | '),
      duration: 6000,
    });
  }
}

/** Helper: extract a short error string from an API response. */
function _apiErrMsg(res) {
  return res?.data?.error || res?.data?.message || `HTTP ${res?.status || '?'}`;
}


/**
 * Handle the "Discard Changes" action — restores snapshot and resets state.
 * Called when the user navigates away from the Manage tab with pending changes.
 * @returns {Promise<boolean>} true if the user confirmed the discard (or no changes exist)
 */
async function confirmDiscardManageChanges() {
  if (!_hasPendingChanges()) return true;

  const r = await showModal({
    icon:         'warn',
    title:        'Discard Unsaved Changes?',
    message:      `You have ${_pendingChanges.length} unsaved change${_pendingChanges.length !== 1 ? 's' : ''} in the Line Configuration tab. Leave without saving?`,
    type:         'confirm',
    confirmStyle: 'danger',
    confirmLabel: 'Discard Changes',
  });

  if (!r.confirmed) return false;

  // Restore snapshot so local state reflects what was on the server
  _restoreManageSnapshot();
  _clearPendingChanges();
  if (typeof populateProdLineSelect === 'function') populateProdLineSelect();
  return true;
}


// Expose globally
window.initManageLines              = initManageLines;
window.refreshManageLines           = refreshManageLines;
window.renderManageActivities       = renderManageActivities;
window.addActivityToLine            = addActivityToLine;
window.deleteActivity               = deleteActivity;
window.updateActivityName           = updateActivityName;
window.handleActivityKeypress       = handleActivityKeypress;
window.handleCreateLine             = handleCreateLine;
window.handleEditLine               = handleEditLine;
window.handleDeleteLine             = handleDeleteLine;
window.handleManageDone             = handleManageDone;
window.confirmDiscardManageChanges  = confirmDiscardManageChanges;