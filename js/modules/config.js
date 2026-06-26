/* ============================================
   CONFIG.JS — Runtime Configuration
   Pioneer Adhesives Routing Template System

   This file is loaded BEFORE api-service.js.
   It exposes window.APP_CONFIG so that api-service.js
   can read the correct API base URL at runtime.

   HOW TO USE:
   1. Development  → set API_BASE_URL to 'http://localhost:8080'
   2. Production   → set API_BASE_URL to your HTTPS server address
                     (HTTPS is REQUIRED — JWT tokens travel with every request)
   3. Never commit a production IP/hostname with HTTP.
   ============================================ */

window.APP_CONFIG = {

  /* --------------------------------------------------
     API_BASE_URL
     The root address of the ACU Routing API server.
     - No trailing slash (api-service.js strips it, but keep it clean here too).
     - MUST be HTTPS in production to protect Bearer tokens in transit.
     -------------------------------------------------- */
  API_BASE_URL: 'http://192.168.50.65:8080',   // ← replace with your server address

  /* --------------------------------------------------
     APP_NAME
     Displayed in the browser tab title and any branded UI elements.
     -------------------------------------------------- */
  APP_NAME: 'Pioneer Adhesives Routing System',

  /* --------------------------------------------------
     APP_VERSION
     Shown in the footer or about screen. Update on each release.
     -------------------------------------------------- */
  APP_VERSION: '1.0.0',

  /* --------------------------------------------------
     REQUEST_TIMEOUT_MS
     How long (in ms) before a fetch request is aborted.
     api-service.js has its own hard-coded fallback (30 000 ms),
     but you can override it here if needed.
     Minimum recommended value: 10 000 (10 seconds).
     -------------------------------------------------- */
  REQUEST_TIMEOUT_MS: 30000,

  /* --------------------------------------------------
     DEFAULT_PAGE_SIZE
     Number of records returned per page on list endpoints
     (items, production lines, logs).
     -------------------------------------------------- */
  DEFAULT_PAGE_SIZE: 25,

  /* --------------------------------------------------
     LOG_RETENTION_DAYS
     Default number of days used by the log cleanup endpoint
     (DELETE /api/logs/cleanup?days=N).
     -------------------------------------------------- */
  LOG_RETENTION_DAYS: 90,

  /* --------------------------------------------------
     ENVIRONMENT
     Informational flag. Used for conditional logging or
     debug panels. Values: 'development' | 'production'
     -------------------------------------------------- */
  ENVIRONMENT: 'development',

};

/* ============================================
   OPTIONAL: freeze the config so it cannot be
   accidentally mutated by other scripts at runtime.
   Comment this line out if you need to patch values
   dynamically (e.g. during integration tests).
   ============================================ */
Object.freeze(window.APP_CONFIG);
