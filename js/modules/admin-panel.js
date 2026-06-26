/* ============================================
   ADMIN-PANEL.JS - Admin Panel Module
   Pioneer Adhesives Routing Template System

   Admin-only features:
   - Create new user accounts (POST /api/auth/register)
   - View current admin info
   - System status summary

   This module is only accessible to users with
   the 'admin' role. The UI tabs are conditionally
   rendered based on role.
   ============================================ */

/**
 * Initialize the Admin Panel view.
 * Populates any dynamic content and resets forms.
 */
function initAdminPanel() {
  // Ensure only admins can access
  if (!Auth.isAdmin()) {
    showModal({
      icon: 'danger',
      title: 'Access Denied',
      message: 'You do not have permission to access the Admin Panel. Admin role is required.',
      type: 'confirm',
      confirmLabel: 'OK',
    }).then(() => {
      switchTab(AppState.ADD);
    });
    return;
  }

  // Reset the create user form
  _resetCreateUserForm();

  // Load admin info
  _loadAdminInfo();

  // Load users table
  loadUsersTable();
}
/* ============================================
   ADMIN INFO DISPLAY
   ============================================ */

function _loadAdminInfo() {
  const user = Auth.getUser();
  if (!user) return;

  const adminNameEl = document.getElementById('admin-current-name');
  const adminRoleEl = document.getElementById('admin-current-role');

  if (adminNameEl) adminNameEl.textContent = user.username || 'Unknown';
  if (adminRoleEl) adminRoleEl.textContent = (user.role || 'Unknown').toUpperCase();
}

/* ============================================
   CREATE USER FORM
   ============================================ */

/**
 * Handle the Create User form submission.
 * Validates inputs and calls POST /api/auth/register.
 */
async function handleCreateUser() {
  // Ensure only admins can create users
  if (!Auth.isAdmin()) {
    await showModal({
      icon: 'danger',
      title: 'Access Denied',
      message: 'Only administrators can create user accounts.',
      type: 'confirm',
      confirmLabel: 'OK',
    });
    return;
  }

  const usernameEl = document.getElementById('new-username');
  const passwordEl = document.getElementById('new-password');
  const confirmEl  = document.getElementById('new-password-confirm');
  const roleEl     = document.getElementById('new-user-role');
  const btn        = document.getElementById('btn-create-user');
  const errorEl    = document.getElementById('create-user-error');
  const successEl  = document.getElementById('create-user-success');

  // Hide previous messages
  if (errorEl)  { errorEl.style.display = 'none';  errorEl.textContent = ''; }
  if (successEl) { successEl.style.display = 'none'; successEl.textContent = ''; }

  const username = usernameEl?.value.trim();
  const password = passwordEl?.value;
  const confirm  = confirmEl?.value;
  const role     = roleEl?.value || 'user';

  // ── Validation ──
  if (!username) {
    _showCreateUserError('Please enter a username.');
    usernameEl?.focus();
    return;
  }
  if (username.length < 3) {
    _showCreateUserError('Username must be at least 3 characters long.');
    usernameEl?.focus();
    return;
  }
  if (username.length > 50) {
    _showCreateUserError('Username must not exceed 50 characters.');
    usernameEl?.focus();
    return;
  }
  if (!password) {
    _showCreateUserError('Please enter a password.');
    passwordEl?.focus();
    return;
  }
  if (password.length < 8) {
    _showCreateUserError('Password must be at least 8 characters long.');
    passwordEl?.focus();
    return;
  }
  if (password !== confirm) {
    _showCreateUserError('Passwords do not match.');
    confirmEl?.focus();
    return;
  }

  // ── Submit ──
  if (btn) { btn.disabled = true; btn.textContent = 'Creating Account...'; }

  try {
    const res = await apiRegister(username, password, role);

    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }

    if (res.ok) {
      // Success
      const data = res.data || {};
      _showCreateUserSuccess(
        `Account "${data.username || username}" created successfully with role "${data.role || role}".`
      );
      showToast({ type: 'success', title: 'User Account Created', message: `"${data.username || username}" (${data.role || role}) has been added.` });
      _resetCreateUserForm();
    } else {
      // API error
      let msg = 'Failed to create account.';
      if (res.status === 400) msg = res.data?.error || 'Invalid input. Please check all fields.';
      else if (res.status === 401) msg = 'You are not authenticated. Please sign in again.';
      else if (res.status === 403) msg = 'Only administrators can create accounts.';
      else if (res.status === 409) msg = `Username "${username}" is already taken.`;
      else if (res.status === 429) msg = 'Too many requests. Please wait a moment.';
      else if (res.data?.error) msg = res.data.error;
      _showCreateUserError(msg);
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    _showCreateUserError('Network error. Please check your connection and try again.');
  }
}

/**
 * Reset the Create User form to its default state.
 */
function _resetCreateUserForm() {
  const usernameEl = document.getElementById('new-username');
  const passwordEl = document.getElementById('new-password');
  const confirmEl  = document.getElementById('new-password-confirm');
  const roleEl     = document.getElementById('new-user-role');
  const errorEl    = document.getElementById('create-user-error');
  const successEl  = document.getElementById('create-user-success');

  if (usernameEl) usernameEl.value = '';
  if (passwordEl) passwordEl.value = '';
  if (confirmEl)  confirmEl.value = '';
  if (roleEl)     roleEl.value = 'user';
  if (errorEl)    { errorEl.style.display = 'none'; errorEl.textContent = ''; }
  if (successEl)  { successEl.style.display = 'none'; successEl.textContent = ''; }
}

function _showCreateUserError(message) {
  const errorEl = document.getElementById('create-user-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

function _showCreateUserSuccess(message) {
  const successEl = document.getElementById('create-user-success');
  if (successEl) {
    successEl.textContent = message;
    successEl.style.display = 'block';
  }
}

/* ============================================
   PASSWORD VISIBILITY TOGGLE
   ============================================ */

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

/* ============================================
   MANAGE USERS
   ============================================ */

async function loadUsersTable() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  try {
    const res = await apiGetUsers();
    if (res.ok && Array.isArray(res.data)) {
      tbody.innerHTML = '';
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">No users found.</td></tr>';
        return;
      }
      res.data.forEach(user => {
        const tr = document.createElement('tr');
        const roleHtml = user.role === 'admin' 
          ? `<span style="display:inline-block;font-size:0.72rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:9999px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">ADMIN</span>`
          : user.role === 'superuser'
          ? `<span style="display:inline-block;font-size:0.72rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:9999px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">SUPERUSER</span>`
          : `<span style="display:inline-block;font-size:0.72rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:9999px;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;">USER</span>`;
        
        const statusHtml = user.is_active
          ? `<span style="color:#16a34a;font-weight:600;">Active</span>`
          : `<span style="color:#dc2626;font-weight:600;">Disabled</span>`;

        tr.innerHTML = `
          <td>${sanitizeInput(user.id)}</td>
          <td style="font-weight:600;color:#1e293b;">${sanitizeInput(user.username)}</td>
          <td>${roleHtml}</td>
          <td>${statusHtml}</td>
          <td style="text-align: right;">
            <button class="btn btn--secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="openEditUserModal('${sanitizeInput(user.id)}', '${sanitizeInput(user.username)}', '${sanitizeInput(user.role)}', ${user.is_active})">Edit</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#dc2626;">Failed to load users.</td></tr>';
    }
  } catch (err) {
    console.error("Error loading users:", err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#dc2626;">Error loading users.</td></tr>';
  }
}

function openEditUserModal(id, username, role, isActive) {
  document.getElementById('edit-user-id').value = id;
  document.getElementById('edit-user-username').textContent = username;
  document.getElementById('edit-user-password').value = '';
  document.getElementById('edit-user-role').value = role;
  document.getElementById('edit-user-active').value = isActive ? 'true' : 'false';
  
  const modal = document.getElementById('editUserModal');
  if (modal) modal.style.display = 'flex';
}

function closeEditUserModal() {
  const modal = document.getElementById('editUserModal');
  if (modal) modal.style.display = 'none';
}

async function submitEditUser() {
  const btn = document.getElementById('editUserSaveBtn');
  const id = document.getElementById('edit-user-id').value;
  const password = document.getElementById('edit-user-password').value;
  const role = document.getElementById('edit-user-role').value;
  const isActiveStr = document.getElementById('edit-user-active').value;

  const payload = {
    role: role,
    is_active: isActiveStr === 'true'
  };
  if (password.trim() !== '') {
    if (password.length < 8) {
      await showModal({
        icon: 'danger',
        title: 'Validation Error',
        message: 'Password must be at least 8 characters long.',
        type: 'confirm'
      });
      return;
    }
    payload.password = password;
  }

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    const res = await apiUpdateUser(id, payload);
    if (res.ok) {
      closeEditUserModal();
      loadUsersTable();
      await showModal({
        icon: 'success',
        title: 'Success',
        message: 'User updated successfully.',
        type: 'confirm'
      });
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
      let msg = res.data?.error || 'Failed to update user';
      await showModal({
        icon: 'danger',
        title: 'Update Failed',
        message: msg,
        type: 'confirm'
      });
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    await showModal({
      icon: 'danger',
      title: 'Error',
      message: 'Network error. Please try again.',
      type: 'confirm'
    });
  }
}

/* ============================================
   EXPOSE GLOBALLY
   ============================================ */
window.initAdminPanel           = initAdminPanel;
window.handleCreateUser         = handleCreateUser;
window.togglePasswordVisibility = togglePasswordVisibility;
window.loadUsersTable           = loadUsersTable;
window.openEditUserModal        = openEditUserModal;
window.closeEditUserModal       = closeEditUserModal;
window.submitEditUser           = submitEditUser;