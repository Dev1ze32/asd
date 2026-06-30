/* ============================================
   AUTH.JS - Authentication Manager
   Pioneer Adhesives Routing Template System

   Handles login, logout, JWT token storage,
   and the Authorization header for all API calls.

   Flow:
   1. On page load, main.js calls Auth.init().
   2. If no valid token found, the login screen
      is shown and the app is blocked.
   3. On successful login, the token is stored
      in sessionStorage and the app initializes.
   4. On logout, the token is cleared and the
      login screen is shown again.

   Admin Features:
   - Admin-only tab visibility (Admin Panel, Audit Logs)
   - Admin role badge in user badge
   - isAdmin() helper for module checks
   ============================================ */

const Auth = {
  TOKEN_KEY: 'routing_access_token',
  USER_KEY:  'routing_user',

  /* ── Token helpers ── */

  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY) || null;
  },

  setToken(token) {
    sessionStorage.setItem(this.TOKEN_KEY, token);
  },

  getUser() {
    try {
      const raw = sessionStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  },

  setUser(user) {
    sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  /**
   * Check if the currently logged-in user has the 'admin' role.
   * @returns {boolean}
   */
  isAdmin() {
    const user = this.getUser();
    return !!(user && user.role === 'admin');
  },

  /**
   * Return the Authorization header object for fetch calls.
   * Returns {} if no token is stored (API handles the 401).
   */
  authHeaders() {
    const token = this.getToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  },

  /* ── Login / Logout ── */

  /**
   * POST /api/auth/login
   * @param {string} username
   * @param {string} password
   * @returns {{ ok: boolean, user?: Object, error?: string }}
   */
  async login(username, password) {
    try {
      const response = await fetch(API_BASE_URL + '/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        this.setToken(data.access_token);
        this.setUser(data.user);
        return { ok: true, user: data.user };
      }

      // Map status codes to friendly messages
      if (response.status === 401) return { ok: false, error: 'Invalid username or password.' };
      if (response.status === 403) return { ok: false, error: 'Your account has been disabled. Contact an administrator.' };
      if (response.status === 429) return { ok: false, error: 'Too many login attempts. Please wait a moment and try again.' };
      return { ok: false, error: data.error || 'Login failed. Please try again.' };

    } catch (_) {
      return { ok: false, error: 'Cannot connect to server. Please check your connection.' };
    }
  },

  /**
   * Clear token and user, then reload the page.
   *
   * WHY RELOAD instead of just _showLoginScreen():
   * _waitForLogin() creates a one-shot Promise whose resolve function is stored
   * in window._loginSuccessCallback.  That callback is consumed (set to null)
   * the first time a login succeeds.  If we only call _showLoginScreen() here,
   * any subsequent Sign-In attempt will authenticate correctly (Auth.login()
   * returns ok:true and the token is stored), but _loginSuccessCallback is null
   * so _hideLoginScreen() is never called and the app never initialises for the
   * new session — the login screen just sits there with "no changes".
   *
   * A full page reload lets initApp() run from scratch: isLoggedIn() returns
   * false, _waitForLogin() registers a fresh callback, and the next login works
   * correctly for every role (admin, superuser, user).
   */
  logout() {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
    window.location.reload();
  },

  async confirmLogout() {
    if (typeof showModal !== 'function') {
      this.logout();
      return;
    }

    const result = await showModal({
      icon: 'warn',
      title: 'Log Out',
      message: 'Are you sure you want to log out?',
      type: 'confirm',
      confirmStyle: 'danger',
      confirmLabel: 'Log Out',
    });

    if (result.confirmed) this.logout();
  },

  /**
   * GET /api/auth/me — verify the stored token is still valid.
   * @returns {boolean} true if token is valid, false otherwise
   */
  async verifyToken() {
    if (!this.getToken()) return false;
    try {
      const response = await fetch(API_BASE_URL + '/api/auth/me', {
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.username) this.setUser(data); // refresh stored user info
        return true;
      }
      return false;
    } catch (_) {
      // Network error — allow offline use with cached token
      return this.isLoggedIn();
    }
  },

  /* ── App initialization gate ── */

  /**
   * Call this from main.js before initializing the app.
   * Shows the login screen if no valid token exists.
   * Resolves when the user is authenticated.
   */
  async init() {
    if (this.isLoggedIn()) {
      const valid = await this.verifyToken();
      if (valid) {
        // We already have a valid token, no need to ever show the login screen.
        _updateUserBadge(this.getUser());
        _refreshAdminTabs();
        document.body.classList.remove('app-loading');
        return; // Proceed to app init
      }
      // Token expired
      sessionStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.removeItem(this.USER_KEY);
    }

    // If we reach here, there is no valid token. Now we show the login screen.
    _renderLoginScreen();

    // Block until login succeeds
    await _waitForLogin();
    _hideLoginScreen();
    _updateUserBadge(this.getUser());
    _refreshAdminTabs();
    document.body.classList.remove('app-loading');
  },
};


/* ============================================
   LOGIN SCREEN UI
   ============================================ */

function _renderLoginScreen() {
  if (document.getElementById('login-screen')) return;

  const screen = document.createElement('div');
  screen.id = 'login-screen';
  screen.className = 'login-screen';

  screen.innerHTML = `

    <!-- LEFT PANEL: photo hero -->
    <div class="login-screen__hero">
      <div class="login-screen__hero-overlay"></div>

      <!-- TOP: logo + "Routing Headquarters" label stacked -->
      <div class="login-screen__logo-wrap">
        <svg viewBox="0 0 1150 120" xmlns="http://www.w3.org/2000/svg" class="login-screen__logo" aria-label="Pioneer Adhesives, Inc.">
          <path d="M 0 5 L 360 5 C 450 5 450 105 360 105 L 0 105 Z" fill="#da291c" />
          <g transform="skewX(-16)">
            <text x="80" y="86" fill="#ffffff" style="font-family:'Arial Black',Impact,system-ui,sans-serif;font-weight:900;font-size:96px;letter-spacing:-2px">
              <tspan style="font-size:96px">P</tspan><tspan style="font-size:74px;letter-spacing:-1px" dy="-4">ioneer</tspan>
            </text>
          </g>
          <g transform="translate(480, 0)">
            <text x="0" y="86" fill="#ffffff" style="font-family:'Arial Black',Impact,system-ui,sans-serif;font-weight:900;font-size:76px;letter-spacing:-2.5px;font-style:italic">Adhesives, Inc.</text>
            <path d="M -10 100 L 590 100 Q 620 100 640 80 Q 620 112 590 112 L -10 112 Z" fill="rgba(255,255,255,0.2)" />
          </g>
        </svg>
      </div>

      <!-- BOTTOM: tagline block, separate from logo -->
      <div class="login-screen__hero-content">
        <h2 class="login-screen__hero-title">Do it right.</h2>
        <p class="login-screen__hero-desc">Routing management center</p>
        
        <!-- Developer Credits -->
        <div style="margin-top: 0.5rem; font-size: 0.55rem; color: rgba(255, 255, 255, 0.15); letter-spacing: 0.05em;">
          Aerial Oliver (UI/UX) & Wendell Anciso (API)
        </div>
      </div>
    </div>

    <!-- RIGHT PANEL: form -->
    <div class="login-screen__form-area">
      <div class="login-screen__form-wrap">

        <!-- Card heading -->
        <div class="login-screen__form-heading">
          <h1 class="login-screen__form-title">Routing Headquarters</h1>
          <p class="login-screen__form-subtitle">Sign in to your account to continue.</p>
        </div>

        <!-- Form fields -->
        <div class="login-form">
          <div class="login-form__row">
            <label class="login-form__label" for="login-username">Username</label>
            <input id="login-username" type="text" autocomplete="username"
                   class="login-form__input" placeholder="Enter username">
          </div>

          <div class="login-form__row">
            <label class="login-form__label" for="login-password">Password</label>
            <div style="position:relative;">
              <input id="login-password" type="password" autocomplete="current-password"
                     class="login-form__input" placeholder="Enter password"
                     style="padding-right:2.5rem;">
              <button
                type="button"
                id="login-pw-toggle"
                onclick="_toggleLoginPassword()"
                tabindex="-1"
                aria-label="Show password"
                style="position:absolute;right:0.65rem;top:50%;transform:translateY(-50%);background:none;border:none;padding:0;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;outline:none;">
                <svg id="login-pw-icon-show" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <svg id="login-pw-icon-hide" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <div id="login-error" class="login-form__error hidden"></div>

          <div class="login-form__submit-wrap">
            <button id="login-btn" type="button" onclick="_handleLoginSubmit()" class="login-form__submit">
              Login
            </button>
          </div>

        </div>

        <!-- Card footer -->
        <div class="login-form__footer">
          Routing Headquarters Internal System.<br>
          Authorized personnel only.
        </div>

        <button type="button" id="about-btn" onclick="_showAboutModal()" class="login-screen__about-btn">
          About us
        </button>
      </div>
    </div>

    <!-- ABOUT MODAL -->
    <div id="about-modal" class="about-modal" style="display:none;">
      <div class="about-modal__backdrop" onclick="_hideAboutModal()"></div>
      <div class="about-modal__panel" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
        <button type="button" class="about-modal__close" onclick="_hideAboutModal()" aria-label="Close">&times;</button>

        <h2 id="about-modal-title" class="about-modal__title">Routing Headquarters</h2>
        <p class="about-modal__version">Version 1.0.0</p>

        <p class="about-modal__desc">
          Internal routing management system for Pioneer Adhesives, Inc.
          Streamlines line management, BOM lookups, and production routing workflows.
        </p>

        <div class="about-modal__section">
          <h3 class="about-modal__section-title">Developers</h3>
          <ul class="about-modal__list">
            <li>Aerial Oliver &mdash; UI/UX</li>
            <li>Wendell Anciso &mdash; API</li>
          </ul>
        </div>

        <div class="about-modal__footer">
          &copy; 2026 Pioneer Adhesives, Inc. All rights reserved.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(screen);

  screen.addEventListener('keydown', e => {
    if (e.key === 'Enter') _handleLoginSubmit();
  });

  setTimeout(() => document.getElementById('login-username')?.focus(), 100);
}


function _showLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (screen) {
    screen.style.display = 'flex';
    setTimeout(() => document.getElementById('login-username')?.focus(), 100);
  }
}

function _showAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) modal.style.display = 'flex';
}

function _hideAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) modal.style.display = 'none';
}

function _hideLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (screen) screen.style.display = 'none';
}

/**
 * Returns a Promise that resolves only after a successful login.
 */
function _waitForLogin() {
  return new Promise(resolve => {
    window._loginSuccessCallback = resolve;
  });
}

async function _handleLoginSubmit() {
  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  const btn        = document.getElementById('login-btn');
  const errorEl    = document.getElementById('login-error');

  // Read values FIRST — before touching the DOM — so we never
  // need to change input.type (which causes the visible flash).
  const username = usernameEl?.value.trim();
  const password = passwordEl?.value;

  // Clear previous error
  if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }

  if (!username || !password) {
    _showLoginError('Please enter both username and password.');
    return;
  }

  // Loading state — blank & lock the password field WITHOUT changing its type,
  // then hide the toggle button so nothing is ever visible during the async wait.
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
  if (passwordEl) { passwordEl.value = ''; passwordEl.disabled = true; }
  const toggleBtn = document.getElementById('login-pw-toggle');
  if (toggleBtn) toggleBtn.style.display = 'none';

  const result = await Auth.login(username, password);

  if (result.ok) {
    // Login succeeded — leave the field blank and hidden; the screen will close.
    if (btn) { btn.textContent = 'Login'; btn.disabled = false; }
    if (typeof window._loginSuccessCallback === 'function') {
      window._loginSuccessCallback();
      window._loginSuccessCallback = null;
    }
  } else {
    // Login failed — restore the field so the user can try again.
    if (btn) { btn.textContent = 'Login'; btn.disabled = false; }
    if (passwordEl) {
      passwordEl.disabled = false;
      passwordEl.value = '';
      // Reset to hidden state regardless of what the toggle was set to before
      passwordEl.type = 'password';
    }
    // Restore toggle button in its default (eye/show) state
    const iconShow = document.getElementById('login-pw-icon-show');
    const iconHide = document.getElementById('login-pw-icon-hide');
    if (iconShow) iconShow.style.display = '';
    if (iconHide) iconHide.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.style.display = '';
      toggleBtn.setAttribute('aria-label', 'Show password');
    }
    _showLoginError(result.error);
    if (passwordEl) passwordEl.focus();
  }
}

function _showLoginError(message) {
  const errorEl = document.getElementById('login-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

function _getInitials(username) {
  if (!username) return '?';
  const parts = username.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

function _updateUserBadge(user) {
  const badge = document.getElementById('user-badge');
  const roleBadge = document.getElementById('role-badge');
  if (!badge || !user) return;

  const roleLabel = { admin: 'Admin', superuser: 'Super User', user: 'User' }[user.role] || user.role;
  const displayName = user.full_name || user.username || 'User';

  badge.innerHTML = `
    <div class="user-profile-menu" id="user-profile-menu">
      <button type="button"
              class="user-profile-trigger"
              id="user-profile-trigger"
              aria-expanded="false"
              aria-haspopup="true"
              aria-label="Open profile menu">
        <div class="user-avatar"><span id="user-initials">${_getInitials(displayName)}</span></div>
      </button>
      <div class="user-profile-dropdown hidden" id="user-profile-dropdown">
        <p class="user-profile-dropdown__role" id="user-role-text">${roleLabel}</p>
        <button type="button" class="user-profile-dropdown__logout" id="user-logout-btn">Logout</button>
      </div>
    </div>
  `;
  badge.style.display = 'block';

  const trigger = document.getElementById('user-profile-trigger');
  const dropdown = document.getElementById('user-profile-dropdown');
  const logoutBtn = document.getElementById('user-logout-btn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      _closeProfileDropdown();
      Auth.confirmLogout();
    });
  }

  if (trigger && dropdown) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      if (isOpen) {
        _closeProfileDropdown();
      } else {
        _openProfileDropdown();
      }
    });
  }

  if (!window._profileDropdownBound) {
    window._profileDropdownBound = true;
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('user-profile-menu');
      if (menu && !menu.contains(e.target)) {
        _closeProfileDropdown();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') _closeProfileDropdown();
    });
  }

  if (roleBadge) {
    if (user.role === 'admin') {
      roleBadge.classList.remove('hidden');
    } else {
      roleBadge.classList.add('hidden');
    }
  }
}

function _openProfileDropdown() {
  const trigger = document.getElementById('user-profile-trigger');
  const dropdown = document.getElementById('user-profile-dropdown');
  if (!trigger || !dropdown) return;
  dropdown.classList.remove('hidden');
  trigger.setAttribute('aria-expanded', 'true');
}

function _closeProfileDropdown() {
  const trigger = document.getElementById('user-profile-trigger');
  const dropdown = document.getElementById('user-profile-dropdown');
  if (!dropdown) return;
  dropdown.classList.add('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

/* ============================================
   ADMIN TAB VISIBILITY
   ============================================ */

/**
 * Show or hide navigation tabs based on the current user's role.
 *
 * admin     → Admin Panel, Audit Logs only.
 * superuser → All routing/data tabs (Add, Lookup, Update, Manage, All Data).
 * user      → Look Up Routing and View All Data only.
 *
 * Call this after login and after role changes.
 */
function _refreshAdminTabs() {
  const user    = Auth.getUser();
  const role    = user ? user.role : '';
  const isAdmin = role === 'admin';
  const isUser  = role === 'user';

  // Per-tab visibility map  { tabId: visibleForRoles[] }
  const tabVisibility = {
    'tab-add':      ['superuser'],
    'tab-lookup':   ['superuser', 'user'],
    'tab-update':   ['superuser'],
    'tab-manage':   ['admin'],
    'tab-alldata':  ['superuser', 'user'],
    'tab-admin':    ['admin'],
    'tab-logs':     ['admin'],
    'tab-database': ['admin'],
  };

  Object.entries(tabVisibility).forEach(([id, allowedRoles]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = allowedRoles.includes(role) ? 'inline-flex' : 'none';
  });

  // Redirect if the user is on a tab their role doesn't allow
  const allowedStates = {
    admin:     [AppState.ADMIN, AppState.MANAGE, AppState.LOGS, AppState.DATABASE],
    superuser: [AppState.ADD, AppState.LOOKUP, AppState.UPDATE, AppState.ALLDATA],
    user:      [AppState.LOOKUP, AppState.ALLDATA],
  };

  const allowed = allowedStates[role] || allowedStates['superuser'];
  if (!allowed.includes(App.currentState)) {
    // Send each role to their default landing tab
    if (isAdmin) switchTab(AppState.ADMIN);
    else if (isUser) switchTab(AppState.LOOKUP);
    else switchTab(AppState.ADD);
  }
}

/* ============================================
   PASSWORD VISIBILITY TOGGLE
   ============================================ */

/**
 * Toggle the login password field between visible and hidden.
 * Swaps the eye / eye-off SVG icons accordingly.
 */
function _toggleLoginPassword() {
  const input    = document.getElementById('login-password');
  const iconShow = document.getElementById('login-pw-icon-show');
  const iconHide = document.getElementById('login-pw-icon-hide');
  const btn      = document.getElementById('login-pw-toggle');
  if (!input) return;

  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';

  if (iconShow) iconShow.style.display = isHidden ? 'none' : '';
  if (iconHide) iconHide.style.display = isHidden ? ''     : 'none';
  if (btn)      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}


/* ============================================
   EXPOSE GLOBALLY
   ============================================ */
window.Auth                 = Auth;
window._handleLoginSubmit   = _handleLoginSubmit;
window._refreshAdminTabs    = _refreshAdminTabs;
window._toggleLoginPassword = _toggleLoginPassword;