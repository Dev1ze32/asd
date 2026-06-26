/* ============================================
   MAIN.JS - Application Entry Point
   Pioneer Adhesives Routing Template System
   
   Initializes the application, loads modules,
   and sets up the default view state.
   ============================================ */

/**
 * Module loading order:
 * 1. auth.js          - Authentication manager
 * 2. api-service.js   - Backend API client
 * 3. state.js         - Constants, enums, global state
 * 4. mock-db.js       - Data layer, mock database
 * 5. utils.js         - Helper functions
 * 6. calculations.js  - Math engine
 * 7. view-controller.js - View state management
 * 8. routing-form.js  - Form handling
 * 9. search.js        - Search engine
 * 10. manage-activities.js - Activity CRUD
 * 11. all-data.js     - Paginated table view
 * 12. admin-panel.js  - Admin panel (user management)
 * 13. logs.js         - Audit logs view
 * 14. tabs.js         - Tab controller/router
 *
 * All modules expose their functions globally via window.*
 * This entry point simply initializes the app.
 */

/**
 * Initialize the application
 */
async function initApp() {
  console.log('Pioneer Adhesives Routing System - Initializing...');

  initThemeToggle();

  // --- Authentication gate: blocks until user is logged in ---
  await Auth.init();

  // --- Initialize admin tabs visibility based on role ---
  _refreshAdminTabs();

  // --- Load production lines from API into local cache ---
  try {
    const res = await apiGetProductionLines();
    if (res.ok && Array.isArray(res.data)) {
      res.data.forEach(line => {
        // API returns production_line_code and production_line_name
        // apiGetProductionLines() normalizes these to code/line_code and description/desc
        const code = line.production_line_code || line.line_code || line.code;
        const desc = line.production_line_name  || line.description || line.desc || code;

        if (code) {
          LINE_DESCRIPTIONS[code] = desc;

          // Keep each activity id from the API so edit/delete calls can target
          // the database row instead of the UI index.
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
        }
      });
      console.log(`[API] Production lines loaded: ${res.data.length} lines from server.`);
    } else {
      console.warn('[API] Could not load production lines, using local defaults.');
    }
  } catch (_) {
    console.warn('[API] Unreachable — using local production line defaults.');
  }

  // Set default tab (ADD mode)
  switchTab(AppState.ADD);

  // Set default template mode
  setMode('FG');

  // Populate production line dropdown
  populateProdLineSelect();
  if (typeof setupProdLineChangeListener === 'function') {
    setupProdLineChangeListener();
  }

  console.log('Initialization complete.');
  console.log(`Loaded ${Object.keys(mockRoutingDB).length} routing records`);
  console.log(`Loaded ${Object.keys(lineActivitiesDB).length} production lines with activities`);
}

/**
 * Populate the production line select dropdowns
 */
function populateProdLineSelect() {
  const select = document.getElementById('prodLine');
  const filterSelect = document.getElementById('alldata-filter-line');
  
  const lineCodes = Object.keys(LINE_DESCRIPTIONS).sort();

  if (select) {
    const placeholder = select.options[0];
    select.innerHTML = '';
    select.appendChild(placeholder);
    lineCodes.forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = code;
      select.appendChild(opt);
    });
  }

  if (filterSelect) {
    const placeholder = filterSelect.options[0];
    filterSelect.innerHTML = '';
    filterSelect.appendChild(placeholder);
    lineCodes.forEach(code => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = code;
      filterSelect.appendChild(opt);
    });
  }
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e
 */
function handleKeyboardShortcuts(e) {
  // Ctrl/Cmd + S: Save document
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (App.currentState === AppState.ADD || App.currentState === AppState.UPDATE) {
      saveRoutingDocument();
    }
  }
}

function initThemeToggle() {
  const button = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('routing_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = savedTheme ? savedTheme === 'dark' : prefersDark;

  applyTheme(shouldUseDark ? 'dark' : 'light');

  if (!button || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('routing_theme', nextTheme);
  });
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);

  const button = document.getElementById('theme-toggle');
  const moonIcon = document.getElementById('theme-icon-moon');
  const sunIcon = document.getElementById('theme-icon-sun');

  if (moonIcon) moonIcon.classList.toggle('hidden', isDark);
  if (sunIcon) sunIcon.classList.toggle('hidden', !isDark);
  if (button) {
    button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    button.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
document.addEventListener('keydown', handleKeyboardShortcuts);

// Also expose init function globally for manual re-initialization
window.initApp = initApp;
window.populateProdLineSelect = populateProdLineSelect; 
window.applyTheme = applyTheme;
