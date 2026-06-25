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
   EXPOSE GLOBALLY
   ============================================ */
window.initAdminPanel      = initAdminPanel;
window.handleCreateUser    = handleCreateUser;
window.togglePasswordVisibility = togglePasswordVisibility;