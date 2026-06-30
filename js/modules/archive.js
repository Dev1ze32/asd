/* ============================================
   ARCHIVE.JS - Revision History Viewer
   Pioneer Adhesives Routing Template System

   Displays a read-only revision history for an
   item code. Accessible from the UPDATE tab only.

   Strategy:
   Shows ONLY the archived revision snapshots from
   GET /api/items/{code}/revisions — the current
   live record is intentionally excluded so the
   user sees the true saved history.

   Duplicate revision numbers in the list are
   deduplicated (highest archive id wins — most
   recent snapshot for that revision number).

   Pages are ordered OLDEST → NEWEST so the user
   navigates forward through history naturally.

   API Endpoints used:
     GET /api/items/{item_code}/revisions
       Response shape: { revisions: [...], total, ... }
     GET /api/items/{item_code}/revisions/{revision}
       Response shape: { id, revision, snapshot: { ... } }
   ============================================ */

/**
 * Internal state — reset on every openArchiveModal() call.
 */
const ArchiveState = {
  itemCode:   '',
  pages:      [],   // Deduplicated, oldest-first list of archived revisions.
                    // Each entry: { label, revNum, archiveId, data }
                    // data is null until the user navigates to that page (lazy fetch).
  currentIdx: 0,    // Which page is currently displayed (0 = oldest revision).
};

/* ============================================
   PUBLIC API
   ============================================ */

/**
 * Open the archive modal for the given item code.
 * @param {string} itemCode
 */
async function openArchiveModal(itemCode) {
  if (!itemCode || !itemCode.trim()) return;

  ArchiveState.itemCode   = itemCode.trim().toUpperCase();
  ArchiveState.pages      = [];
  ArchiveState.currentIdx = 0;

  const modal = document.getElementById('archiveModal');
  if (!modal) return;

  const titleEl = document.getElementById('archive-modal-item-code');
  if (titleEl) titleEl.textContent = ArchiveState.itemCode;

  _archiveSetLoading(true);
  modal.style.display = 'flex';
  document.body.classList.add('archive-backdrop-blur');

  // ── Fetch the revisions list ───────────────────────────────────────────────
  // API response shape: { revisions: [...], total, page, per_page, total_pages }
  // Each entry: { id, inventory_id, revision, archived_at, archived_by }
  try {
    const res = await apiGetItemRevisions(ArchiveState.itemCode);

    // Handle both array response (old shape) and object with .revisions (new shape)
    const raw = res.ok
      ? (Array.isArray(res.data) ? res.data : (res.data?.revisions || []))
      : [];

    if (raw.length > 0) {
      // ── Deduplicate: for each revision number keep only the entry with the
      //    highest archive id (= the most recent snapshot for that rev). ────────
      const byRev = {};
      raw.forEach(entry => {
        const rev = String(entry.revision !== undefined ? entry.revision : '').trim();
        if (!rev) return;
        const id  = parseInt(entry.id, 10) || 0;
        if (!byRev[rev] || id > byRev[rev].id) {
          byRev[rev] = { ...entry, _revKey: rev, id };
        }
      });

      // ── Sort OLDEST → NEWEST (ascending revision number) ─────────────────
      const unique = Object.values(byRev).sort((a, b) => {
        return (parseInt(a._revKey, 10) || 0) - (parseInt(b._revKey, 10) || 0);
      });

      unique.forEach(entry => {
        const rev = entry._revKey;
        ArchiveState.pages.push({
          label:     `Rev. ${String(rev).padStart(2, '0')}`,
          revNum:    rev,
          archiveId: entry.id,
          data:      null,
        });
      });
    }
  } catch (_) { /* fall through to empty-state below */ }

  _archiveSetLoading(false);

  if (ArchiveState.pages.length === 0) {
    _archiveShowMessage('No archived revisions found for this item. Revisions are created each time the record is saved.');
    return;
  }

  // ── Start on the NEWEST (last) revision ───────────────────────────────────
  await _archiveGoTo(ArchiveState.pages.length - 1);
}

/**
 * Close the archive modal and clean up.
 */
function closeArchiveModal() {
  const modal = document.getElementById('archiveModal');
  if (modal) modal.style.display = 'none';
  document.body.classList.remove('archive-backdrop-blur');
}

/**
 * Navigate to the OLDER revision (lower index = older).
 */
async function archivePrevRevision() {
  const prev = ArchiveState.currentIdx - 1;
  if (prev < 0) return;
  await _archiveGoTo(prev);
}

/**
 * Navigate to the NEWER revision (higher index = newer).
 */
async function archiveNextRevision() {
  const next = ArchiveState.currentIdx + 1;
  if (next >= ArchiveState.pages.length) return;
  await _archiveGoTo(next);
}

/* ============================================
   PRIVATE NAVIGATION
   ============================================ */

/**
 * Navigate to a specific page index, fetching snapshot data lazily if needed.
 * @param {number} idx
 */
async function _archiveGoTo(idx) {
  const page = ArchiveState.pages[idx];
  if (!page) return;

  if (!page.data) {
    _archiveSetLoading(true);
    try {
      // GET /api/items/{code}/revisions/{revision}
      // Response shape: { id, revision, archived_at, archived_by, snapshot: { ... } }
      const res = await apiGetItemRevision(ArchiveState.itemCode, page.revNum);
      if (res.ok && res.data) {
        // The actual record fields live inside res.data.snapshot
        const raw      = res.data;
        const snapshot = raw.snapshot || raw; // fallback: if no .snapshot, use root

        // Merge top-level metadata (archived_at, archived_by) into the snapshot
        // so _archiveRenderPage can display them without extra field mapping.
        page.data = {
          ...snapshot,
          revision:    raw.revision    ?? snapshot.revision,
          archived_at: raw.archived_at ?? snapshot.archived_at ?? null,
          archived_by: raw.archived_by ?? snapshot.archived_by ?? null,
        };
      } else {
        _archiveSetLoading(false);
        _archiveShowMessage(
          `Could not load ${page.label}. `
          + (res.data?.error || `Server returned status ${res.status}.`)
        );
        return;
      }
    } catch (_) {
      _archiveSetLoading(false);
      _archiveShowMessage(`Network error loading ${page.label}.`);
      return;
    }
    _archiveSetLoading(false);
  }

  ArchiveState.currentIdx = idx;
  _archiveRenderPage(idx);
}

/* ============================================
   PRIVATE RENDER HELPERS
   ============================================ */

/**
 * Toggle between the loading spinner and the content body.
 * @param {boolean} loading
 */
function _archiveSetLoading(loading) {
  const spinner = document.getElementById('archive-modal-spinner');
  const body    = document.getElementById('archive-modal-body');
  const pagi    = document.getElementById('archive-pagination');
  if (spinner) spinner.style.display = loading ? 'flex' : 'none';
  if (body)    body.style.display    = loading ? 'none' : 'block';
  if (pagi && loading) pagi.style.display = 'none';
}

/**
 * Show a centred status / error message inside the modal body.
 * @param {string} message
 */
function _archiveShowMessage(message) {
  const body = document.getElementById('archive-modal-body');
  const pagi = document.getElementById('archive-pagination');
  if (body) {
    body.innerHTML = `
      <div style="text-align:center;padding:3.5rem 1rem;color:#94a3b8;">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#8DBCC7"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
             style="margin:0 auto 1rem;display:block;opacity:0.4;">
          <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7"/>
          <path d="M20 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5"/>
          <path d="M4 13h16"/><path d="M12 9v4m0 4h.01"/>
        </svg>
        <p style="font-size:0.88rem;font-weight:500;color:#64748b;margin:0;">
          ${_archiveSanitize(message)}
        </p>
      </div>`;
    body.style.display = 'block';
  }
  if (pagi) pagi.style.display = 'none';
}

/**
 * Render a page from ArchiveState.pages[] into the modal body.
 * @param {number} idx
 */
function _archiveRenderPage(idx) {
  const page    = ArchiveState.pages[idx];
  const body    = document.getElementById('archive-modal-body');
  const pagi    = document.getElementById('archive-pagination');
  const prevBtn = document.getElementById('archive-btn-prev');
  const nextBtn = document.getElementById('archive-btn-next');
  const infoEl  = document.getElementById('archive-page-info');
  if (!page || !body) return;

  const data  = page.data;
  const total = ArchiveState.pages.length;

  if (!data) {
    _archiveShowMessage('No data available for this revision.');
    return;
  }

  // ── Field extraction ──────────────────────────────────────────────────────
  const revRaw   = data.revision;
  const revLabel = revRaw !== undefined && revRaw !== null
    ? String(revRaw).padStart(2, '0')
    : '—';

  // Production line: snapshot may carry fg_ or bm_ prefixed fields
  const lineCode = data.production_line_code
    || data.fg_production_line_code
    || data.bm_production_line_code
    || '—';
  const lineDesc = data.production_line
    || data.fg_production_line
    || data.bm_production_line
    || (typeof LINE_DESCRIPTIONS !== 'undefined' ? (LINE_DESCRIPTIONS[lineCode] || '') : '')
    || '—';

  const isBM      = data.product_type && data.product_type.includes('Base');
  const modeLabel = isBM ? 'Base Material (BM)' : 'Finished Good (FG)';
  const qty       = data.qty ?? data.quantity ?? '—';
  const notes     = data.notes || '—';
  const savedAt   = data.archived_at || data.saved_at || data.created_at || data.updated_at || null;
  const savedBy   = data.archived_by || data.saved_by || data.created_by || data.updated_by || null;

  // ── Activities table ──────────────────────────────────────────────────────
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const qtyNum     = parseFloat(qty) || 0;
  let   activitiesHtml;

  if (activities.length > 0) {
    let sumPax = 0, sumMachine = 0, sumTime = 0, sumRunTime = 0, sumLabor = 0, sumMc = 0, sumDL = 0, sumVOH = 0, sumFOH = 0;

    const rows = activities.map((act, i) => {
      const name    = act.activities || act.activity_name || act.name || '—';
      const pax     = parseFloat(act.pax) || 0;
      const machine = parseFloat(act.machine) || 0;
      const timeRaw = act.time_min !== undefined ? act.time_min : (act.time || 0);
      const timeNum = parseFloat(timeRaw) || 0;

      // Gracefully use saved data if it exists, otherwise calculate it dynamically
      const runTimeNum = parseFloat(act.run_time) || (qtyNum > 0 ? timeNum / qtyNum : 0);
      const laborNum   = parseFloat(act.labor_min) || (pax * timeNum);
      const mcNum      = parseFloat(act.mc_min) || (machine * timeNum);
      const dlUnitsNum = (() => {
        // Mirror calculateRow() formula: ROUNDUP(1 / ROUND(runTime * pax, 5), 0)
        if (parseFloat(act.dl_units) > 0) return parseFloat(act.dl_units);
        if (timeNum <= 0) return 0;
        const roundedBase = Math.round((runTimeNum * pax) * 1e5) / 1e5;
        return roundedBase > 0 ? Math.ceil(1 / roundedBase) : 0;
      })();
      const dlNum      = parseFloat(act.dl) || (runTimeNum * pax);
      const vohNum     = parseFloat(act.voh) || runTimeNum;
      const fohNum     = parseFloat(act.foh) || runTimeNum;

      sumPax     += pax;
      sumMachine += machine;
      sumTime    += timeNum;
      sumRunTime += runTimeNum;
      sumLabor   += laborNum;
      sumMc      += mcNum;
      sumDL      += dlNum;
      sumVOH     += vohNum;
      sumFOH     += fohNum;

      const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      const tdStyle = 'padding:0.42rem 0.7rem;border-bottom:1px solid #f1f5f9;font-size:0.79rem;color:#374151;';
      const tdNum = tdStyle + 'text-align:right;font-family:monospace;';

      return `<tr style="background:${rowBg};">
        <td style="${tdStyle}color:#1e293b;font-weight:500;">${_archiveSanitize(name)}</td>
        <td style="${tdStyle}text-align:center;">${pax}</td>
        <td style="${tdStyle}text-align:center;">${machine}</td>
        <td style="${tdNum}">${timeNum.toFixed(5)}</td>
        <td style="${tdNum}">${runTimeNum.toFixed(5)}</td>
        <td style="${tdStyle}text-align:center;font-size:0.65rem;font-weight:700;">UNIT</td>
        <td style="${tdNum}">${laborNum.toFixed(5)}</td>
        <td style="${tdNum}border-right:1px solid #e2e8f0;">${mcNum.toFixed(5)}</td>
        <td style="${tdStyle}color:#1e293b;font-weight:500;text-transform:uppercase;">${_archiveSanitize(name)}</td>
        <td style="${tdNum}">${dlUnitsNum > 0 ? dlUnitsNum : ''}</td>
        <td style="${tdNum}">${dlNum.toFixed(5)}</td>
        <td style="${tdNum}">${vohNum.toFixed(5)}</td>
        <td style="${tdNum}">${fohNum.toFixed(5)}</td>
      </tr>`;
    }).join('');

    const thStyle = 'padding:0.42rem 0.7rem;font-size:0.69rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#1e293b;';
    const thGroup = 'padding:0.5rem 0.7rem;font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#fff;background:#5B97A6;';

    // Override totals with product-level saved totals if they exist in the snapshot
    if (data.total_labor_min !== undefined) sumLabor = parseFloat(data.total_labor_min) || sumLabor;
    if (data.total_mc_min !== undefined)    sumMc = parseFloat(data.total_mc_min) || sumMc;
    if (data.total_run_time !== undefined)  sumRunTime = parseFloat(data.total_run_time) || sumRunTime;
    if (data.total_dl !== undefined)        sumDL = parseFloat(data.total_dl) || sumDL;
    if (data.total_voh !== undefined)       sumVOH = parseFloat(data.total_voh) || sumVOH;
    if (data.total_foh !== undefined)       sumFOH = parseFloat(data.total_foh) || sumFOH;

    activitiesHtml = `
      <div style="overflow-x:auto;border-radius:8px;border:1px solid #e2e8f0;margin-top:0.5rem;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
        <table style="width:100%;border-collapse:collapse;min-width:1000px;">
          <thead>
            <tr>
              <th colspan="8" style="${thGroup}text-align:left;border-right:1px solid #437d8c;">ROUTING DETAILS</th>
              <th colspan="5" style="${thGroup}text-align:center;">ACUMATICA BOM</th>
            </tr>
            <tr style="background:#8DBCC7;">
              <th style="${thStyle}text-align:left;">Activity</th>
              <th style="${thStyle}text-align:center;">Pax</th>
              <th style="${thStyle}text-align:center;">Machine</th>
              <th style="${thStyle}text-align:right;">Time (min)</th>
              <th style="${thStyle}text-align:right;" colspan="2">Run Time</th>
              <th style="${thStyle}text-align:right;">Total Labor min</th>
              <th style="${thStyle}text-align:right;border-right:1px solid #73a7b5;">Total MC min</th>
              <th style="${thStyle}text-align:left;">ACTIVITIES</th>
              <th style="${thStyle}text-align:right;">DL (Units/1 min)</th>
              <th style="${thStyle}text-align:right;">DL</th>
              <th style="${thStyle}text-align:right;">VOH</th>
              <th style="${thStyle}text-align:right;">FOH</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#f1f5f9;font-weight:700;color:#0f172a;font-size:0.75rem;border-top:2px solid #cbd5e1;">
              <td style="padding:0.6rem 0.7rem;text-align:right;">TOTAL</td>
              <td style="padding:0.6rem 0.7rem;text-align:center;">${sumPax}</td>
              <td style="padding:0.6rem 0.7rem;text-align:center;">${sumMachine}</td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;">${sumTime.toFixed(5)}</td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;">${sumRunTime.toFixed(5)}</td>
              <td></td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;">${sumLabor.toFixed(5)}</td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;border-right:1px solid #e2e8f0;">${sumMc.toFixed(5)}</td>
              <td></td>
              <td></td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;">${sumDL.toFixed(5)}</td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;">${sumVOH.toFixed(5)}</td>
              <td style="padding:0.6rem 0.7rem;text-align:right;font-family:monospace;">${sumFOH.toFixed(5)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  } else {
    activitiesHtml = `
      <p style="margin:0.5rem 0 0;font-size:0.82rem;color:#94a3b8;font-style:italic;">
        No activities recorded in this revision.
      </p>`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  body.innerHTML = `
    <!-- Revision badge + meta -->
    <div style="display:flex;align-items:center;gap:0.85rem;margin-bottom:1.25rem;flex-wrap:wrap;">
      <div style="background:#8DBCC7;color:#1e293b;border-radius:7px;padding:0.38rem 1.05rem;
                  font-size:0.95rem;font-weight:800;letter-spacing:0.05em;flex-shrink:0;">
        Rev.&nbsp;${revLabel}
      </div>
      ${savedAt ? `
        <span style="font-size:0.77rem;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;
                     border-radius:5px;padding:0.25rem 0.6rem;">
          &#128197;&nbsp;<strong>Saved:</strong>&nbsp;${_archiveFormatDate(savedAt)}
        </span>` : ''}
      ${savedBy ? `
        <span style="font-size:0.77rem;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;
                     border-radius:5px;padding:0.25rem 0.6rem;">
          &#128100;&nbsp;<strong>By:</strong>&nbsp;${_archiveSanitize(savedBy)}
        </span>` : ''}
    </div>

    <!-- Header fields grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem 2rem;
                margin-bottom:1.5rem;background:#f8fafc;border-radius:10px;
                padding:1rem 1.25rem;border:1px solid #e2e8f0;">
      <div>
        ${_archiveField('Item Code',       data.inventory_id   || '—', true)}
        ${_archiveField('SKU Description', data.revision_descr || '—', true)}
        ${_archiveField('Quantity',        qty !== null && qty !== undefined ? String(qty) : '—')}
        ${_archiveField('Notes',           notes)}
      </div>
      <div>
        ${_archiveField('Template Mode',    modeLabel, true)}
        ${_archiveField('Production Line',  lineCode,  true)}
        ${_archiveField('Line Description', lineDesc)}
        ${_archiveField('Product Type',     data.product_type || '—')}
      </div>
    </div>

    <!-- Activities -->
    <div>
      <p style="margin:0 0 0.45rem;font-size:0.69rem;font-weight:700;
                text-transform:uppercase;letter-spacing:0.09em;color:#94a3b8;">
        Activities&nbsp;&middot;&nbsp;${activities.length}&nbsp;row${activities.length !== 1 ? 's' : ''}
      </p>
      ${activitiesHtml}
    </div>`;

  body.style.display = 'block';

  // ── Pagination controls ───────────────────────────────────────────────────
  if (pagi) pagi.style.display = 'flex';
  if (infoEl) {
    infoEl.textContent = `${page.label}  (${idx + 1} of ${total})`;
  }
  // Older = lower index; Newer = higher index
  if (prevBtn) prevBtn.disabled = (idx <= 0);
  if (nextBtn) nextBtn.disabled = (idx >= total - 1);

  // Render individual page buttons
  const pagesListEl = document.getElementById('archive-pages-list');
  if (pagesListEl) {
    const range = [];
    const delta = 2; // Show current page +/- delta
    for (let i = 0; i < total; i++) {
      if (i === 0 || i === total - 1 || (i >= idx - delta && i <= idx + delta)) {
        range.push(i);
      }
    }

    let last = null;
    const htmlParts = [];
    for (const i of range) {
      if (last !== null) {
        if (i - last === 2) {
          // Exactly one missing number, just render it instead of ellipsis
          const missingIdx = last + 1;
          const mPage = ArchiveState.pages[missingIdx];
          const mLabel = mPage.revNum !== undefined ? String(mPage.revNum).padStart(2, '0') : String(missingIdx + 1).padStart(2, '0');
          htmlParts.push(`
            <button class="archive-page-btn" 
                    onclick="window._archiveGoTo(${missingIdx})"
                    title="${mPage.label}">
              ${mLabel}
            </button>
          `);
        } else if (i - last > 2) {
          htmlParts.push(`<span class="archive-ellipsis">&hellip;</span>`);
        }
      }

      const pageEl = ArchiveState.pages[i];
      const isActive = (i === idx);
      const activeClass = isActive ? 'active' : '';
      const label = pageEl.revNum !== undefined ? String(pageEl.revNum).padStart(2, '0') : String(i + 1).padStart(2, '0');
      
      htmlParts.push(`
        <button class="archive-page-btn ${activeClass}" 
                onclick="window._archiveGoTo(${i})"
                title="${pageEl.label}"
                ${isActive ? 'disabled' : ''}>
          ${label}
        </button>
      `);
      last = i;
    }
    pagesListEl.innerHTML = htmlParts.join('');
  }
}

/* ============================================
   SMALL UTILITIES
   ============================================ */

function _archiveField(label, value, bold) {
  const val = _archiveSanitize(String(value ?? '—'));
  return `
    <p style="margin:0 0 0.5rem;font-size:0.81rem;">
      <span style="font-size:0.67rem;font-weight:700;text-transform:uppercase;
                   letter-spacing:0.09em;color:#94a3b8;display:block;margin-bottom:0.12rem;">
        ${label}
      </span>
      ${bold
        ? `<strong style="color:#1e293b;">${val}</strong>`
        : `<span   style="color:#374151;">${val}</span>`}
    </p>`;
}

function _archiveFormatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  } catch (_) { return String(dateStr); }
}

function _archiveSanitize(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================
   EXPOSE GLOBALLY
   ============================================ */
window.openArchiveModal    = openArchiveModal;
window.closeArchiveModal   = closeArchiveModal;
window.archivePrevRevision = archivePrevRevision;
window.archiveNextRevision = archiveNextRevision;
window._archiveGoTo        = _archiveGoTo;

// Close on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('archiveModal');
    if (modal && modal.style.display === 'flex') closeArchiveModal();
  }
});