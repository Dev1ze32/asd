# ACU Routing API (v0.1.0)

A Flask + PostgreSQL REST API for managing product routing data — item codes, their activity sequences, and the production lines those activities belong to. Documented via Swagger UI (Flasgger).

All write endpoints require authentication. Read endpoints require a valid token. See [Authentication](#authentication) for details.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Schema Design](#2-schema-design)
3. [Setup](#3-setup)
4. [Running the Server](#4-running-the-server)
5. [Interactive Docs (Swagger UI)](#5-interactive-docs-swagger-ui)
6. [API Reference](#6-api-reference)
   - [Health](#health)
   - [Authentication](#authentication)
   - [Items](#items)
   - [Archive](#archive)
   - [Production Lines](#production-lines)
   - [Logs](#logs)
7. [Error Responses](#7-error-responses)
8. [Rate Limiting](#8-rate-limiting)

---

## 1. Project Structure

```
routing_api/
├── app.py                      # Flask app factory + entry point
├── config.py                   # All configuration (DB, JWT, pool, rate limits, waitress)
├── db.py                       # SQLAlchemy connection pool helper
├── server.py          # Waitress production server entry point
├── schema.sql                  # Creates all tables
├── load_data.py                # Loads acu_routing_parsed.json into the database
├── requirements.txt            # Python dependencies
├── .env.example                # Copy to .env and fill in values
├── acu_routing_parsed.json     # Source data exported by parser.py
└── routes/
    ├── __init__.py             # Blueprint registration
    ├── auth.py                 # POST /api/auth/register, /login, GET /api/auth/me
    ├── health.py               # GET /api/health
    ├── items.py                # GET /api/items (search + single lookup, POST create)
    ├── logs.py                 # GET /api/logs, DELETE /api/logs/cleanup (admin only)
    ├── production_lines.py     # CRUD for /api/production-lines
    ├── update.py               # PATCH/DELETE for items and their activities
    ├── export.py               # GET /api/export (Excel generator)
    └── utils/
        ├── auth_utils.py       # Argon2 password hashing, JWT creation and decoding
        ├── decorators.py       # @require_auth, @require_role, @require_superuser_or_admin
        └── log_utils.py        # Audit log writer (log_action) and purge helper
```

---

## 2. Schema Design

Six tables total. Four for routing data, two for auth and auditing.

**products** — one row per item code
| Column | Type |
|---|---|
| inventory_id (PK) | varchar(50) |
| revision_descr | text |
| revision | varchar(10) |
| notes | text |
| product_type | text |
| quantity | double precision |
| bm_production_line | text |
| bm_production_line_code | varchar(20) |
| fg_production_line | text |
| fg_production_line_code | varchar(20) |

**activities** — one row per labor activity, FK → products
| Column | Type |
|---|---|
| id (PK) | serial |
| inventory_id | varchar(50) |
| type | varchar(20) |
| item_id | text |
| activity_name | text |
| class / class_1 | varchar(10) |
| pax | integer |
| machine | integer |
| time_min | double precision |
| sort_order | integer |

**production_lines** — one row per line
| Column | Type |
|---|---|
| production_line_code (PK) | varchar(20) |
| production_line_name | text |

**line_activities** — one row per activity template on a line, FK → production_lines
| Column | Type |
|---|---|
| id (PK) | serial |
| production_line_code | varchar(20) |
| activity_name | text |
| sort_order | integer |
| stage | text |

**users** — one row per application user
| Column | Type |
|---|---|
| id (PK) | serial |
| username | varchar(50) unique |
| password_hash | varchar(255) |
| role | varchar(20) — `user`, `superuser`, `admin` |
| is_active | boolean |
| created_at | timestamptz |
| updated_at | timestamptz |

**activity_logs** — audit trail for all write operations
| Column | Type |
|---|---|
| id (PK) | serial |
| logged_at | timestamptz |
| user_id | integer |
| username | varchar(50) |
| user_role | varchar(20) |
| action | text |
| description | text |
| target_type | text |
| target_id | text |
| ip_address | text |
| extra | jsonb |

`activities.inventory_id` has `ON DELETE CASCADE` — deleting a product also removes all its activities. `line_activities.production_line_code` has `ON DELETE CASCADE` as well.

---

## 3. Setup

### a) Install dependencies

```bash
pip install -r requirements.txt
```

### b) Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set DB_PASSWORD and JWT_SECRET_KEY
```

Generate a secure JWT secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Full `.env` reference:
```
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=routing_db
DB_USER=postgres
DB_PASSWORD=CHANGE_ME

# JWT — must be set, app warns loudly on startup if left as placeholder
JWT_SECRET_KEY=CHANGE_ME
JWT_ACCESS_TOKEN_EXPIRES_HOURS=24

# Connection pool (defaults work for most deployments)
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=10
DB_POOL_RECYCLE=1800
DB_CONNECT_TIMEOUT=5
DB_STATEMENT_TIMEOUT_MS=30000

# Rate limiting
RATE_LIMIT_LOGIN=10/minute
RATE_LIMIT_REGISTER=5/minute
RATE_LIMIT_DEFAULT=300/minute

# Waitress (production only)
WAITRESS_THREADS=8
WAITRESS_PORT=5000
```

### c) Create the database and load data

```bash
createdb routing_db
python load_data.py acu_routing_parsed.json
```

---

## 4. Running the Server

**Development** (single-threaded, do not use in production):
```bash
python app.py
```

**Production** (waitress, multi-threaded):
```bash
python server.py
```

**Windows Background Service**:
If deploying on a bare-metal Windows Server, you can install the API as an auto-restarting background service.
1. Run `install_service.ps1` as Administrator
2. The service will start automatically on boot and restart if it crashes.
3. Logs are written to the `logs/` directory.

Server starts at `http://0.0.0.0:5000` by default. The `WAITRESS_PORT` env var changes the port.

> **Note:** `debug=True` has been removed. Running `python app.py` now starts Flask in production mode with a warning reminding you to use waitress for real deployments.

---

## 5. Interactive Docs (Swagger UI)

Once the server is running, open:

```
http://127.0.0.1:5000/docs/
```

All endpoints that require authentication show a lock icon. Use the **Authorize** button (top right) to enter your Bearer token once and it will be sent with every request you fire from the UI.

The raw OpenAPI spec is at `/apispec_1.json`.

---

## 6. API Reference

All endpoints are under the `/api` prefix. Request/response bodies are JSON. Path parameters are **case-insensitive** unless noted.

**Authentication is required on all endpoints** except `GET /api/health` and `POST /api/auth/login`. Pass the token in the `Authorization` header:

```
Authorization: Bearer <your_token>
```

**Role permissions:**

| Role | Can do |
|---|---|
| `user` | Read-only — GET endpoints only |
| `superuser` | Read + all write operations on items and production lines |
| `admin` | Everything — including user management and audit logs |

---

### Health

#### `GET /api/health`

Quick liveness check. No authentication required.

**Response `200`:**
```json
{ "status": "ok" }
```

---

### Authentication

#### `POST /api/auth/login`

Authenticate and receive a JWT access token. Rate limited to **10 requests per IP per minute**.

**Request Body:**

| Field | Type | Required |
|---|---|---|
| `username` | string | **Yes** |
| `password` | string | **Yes** |

**Example:**
```json
{ "username": "alice_smith", "password": "SecurePass123!" }
```

**Response `200`:**
```json
{
  "message": "Login successful",
  "access_token": "eyJ0eXAiOiJKV1Q...",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "username": "alice_smith",
    "role": "superuser"
  }
}
```

**Error responses:** `400` missing fields, `401` invalid credentials, `403` account disabled, `429` rate limit exceeded.

---

#### `POST /api/auth/register`

Create a new user account. **Admin only.** Rate limited to **5 requests per IP per minute**.

**Request Body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | **Yes** | 3–50 characters |
| `password` | string | **Yes** | Minimum 8 characters |
| `role` | string | No | `user` (default), `superuser`, or `admin` |

**Response `201`:**
```json
{
  "message": "User created successfully",
  "user_id": 3,
  "username": "bob_jones",
  "role": "user"
}
```

**Error responses:** `400` invalid fields, `401` not authenticated, `403` admin required, `409` username taken, `429` rate limit exceeded.

---

#### `GET /api/auth/me`

Return the currently authenticated user's details.

**Response `200`:**
```json
{
  "id": 1,
  "username": "alice_smith",
  "role": "superuser",
  "is_active": true,
  "created_at": "2026-01-15T08:30:00+00:00",
  "updated_at": "2026-01-15T08:30:00+00:00"
}
```

---

### Items

#### `GET /api/items`

Browse or search item codes. Returns a paginated summary list (no activities). Requires `user` role or higher.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | string | No | — | Partial, case-insensitive match on `inventory_id` or `revision_descr` |
| `limit` | integer | No | 50 | Max results returned (capped at 1000) |
| `offset` | integer | No | 0 | Number of records to skip, for pagination |

**Example:** `GET /api/items?q=anti fouling&limit=10&offset=0`

**Response `200`:**
```json
{
  "total": 42,
  "limit": 10,
  "offset": 0,
  "results": [
    {
      "inventory_id": "1AF2202L",
      "revision_descr": "PG ANTI FOULING PAINT RED 4L",
      "revision": "03",
      "product_type": "Finished Good (FG)",
      "quantity": 4,
      "bm_production_line": null,
      "bm_production_line_code": null,
      "fg_production_line": "L01 - L1 COATINGS",
      "fg_production_line_code": "L01"
    }
  ]
}
```

> **Note:** The response now includes `total`, `limit`, and `offset` fields so clients can detect when results are truncated and paginate accordingly. The items array is under the `results` key.

---

#### `POST /api/items`

Create a new product with optional activities. Requires `superuser` or `admin` role.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `inventory_id` | string | **Yes** | Unique item code |
| `revision_descr` | string | **Yes** | Product description |
| `product_type` | string | **Yes** | `"Finished Good (FG)"` or `"Base Material (BM)"` |
| `quantity` | number | No | Must be a whole number. Defaults to `1` |
| `fg_production_line` | string | No | Full name of the FG production line |
| `fg_production_line_code` | string | No | Must exist in production_lines |
| `bm_production_line` | string | No | Full name of the BM production line |
| `bm_production_line_code` | string | No | Must exist in production_lines |
| `notes` | string | No | Free-text notes |
| `activities` | array | No | List of activity objects (see below) |

Each object in `activities`:

| Field | Type | Required | Default |
|---|---|---|---|
| `activity_name` | string | **Yes** | — |
| `type` | string | No | `"Labor"` |
| `item_id` | string | No | Same as `activity_name` |
| `class` | string | No | `"DL"` |
| `class_1` | string | No | `"DL"` |
| `pax` | integer | No | `0` |
| `machine` | integer | No | `0` |
| `time_min` | number | No | `0` |
| `sort_order` | integer | No | Auto-assigned |

**Example Request Body:**
```json
{
  "inventory_id": "TESTITEM01",
  "revision_descr": "Test Product",
  "product_type": "Finished Good (FG)",
  "quantity": 10,
  "fg_production_line": "L01 - L1 COATINGS",
  "fg_production_line_code": "L01",
  "activities": [
    { "activity_name": "L01 FILLING", "pax": 2, "machine": 0, "time_min": 0.15 }
  ]
}
```

**Response `201`:**
```json
{
  "message": "Product created",
  "inventory_id": "TESTITEM01",
  "revision": "00"
}
```

**Error responses:** `400` missing/invalid fields or unknown production line code, `409` item code already exists.

---

#### `GET /api/items/{item_code}`

Look up full routing details for a single item, including all activities. Requires `user` role or higher.

**Path Parameter:** `item_code` — the inventory ID (case-insensitive).

**Example:** `GET /api/items/1AF2202L`

**Response `200`:**
```json
{
  "inventory_id": "1AF2202L",
  "revision_descr": "PG ANTI FOULING PAINT RED 4L",
  "revision": "03",
  "notes": "CRN RD23-CR055",
  "product_type": "Finished Good (FG)",
  "quantity": 4,
  "bm_production_line": null,
  "bm_production_line_code": null,
  "fg_production_line": "L01 - L1 COATINGS",
  "fg_production_line_code": "L01",
  "activities": [
    {
      "id": 1,
      "type": "Labor",
      "item_id": "L01 LABELING/CODING",
      "activities": "L01 LABELING/CODING",
      "class": "DL",
      "class_1": "DL",
      "pax": 1,
      "machine": 0,
      "time_min": 0.1245
    }
  ]
}
```

**Response `404`:**
```json
{ "error": "Item code not found", "item_code": "doesnotexist" }
```

---

#### `PATCH /api/items/{item_code}`

Update product metadata. **Revision is auto-incremented on every save.** Requires `superuser` or `admin` role.

**Path Parameter:** `item_code`

**Request Body** — send only the fields you want to change:

| Field | Type | Notes |
|---|---|---|
| `revision_descr` | string | |
| `notes` | string | |
| `quantity` | number | Must be a whole number |
| `product_type` | string | `"Finished Good (FG)"`, `"Base Material (BM)"`, or `"Other / Intermediate"` |
| `fg_production_line` | string | |
| `fg_production_line_code` | string | |
| `bm_production_line` | string | |
| `bm_production_line_code` | string | |

**Example:**
```json
{ "notes": "Updated note", "quantity": 20 }
```

**Response `200`:**
```json
{
  "message": "Product metadata updated",
  "inventory_id": "1AF2202L",
  "old_revision": "03",
  "new_revision": "04",
  "fields_updated": ["notes", "quantity"]
}
```

---

#### `DELETE /api/items/{item_code}`

Permanently delete a product and **all** of its activities (cascades at DB level). Requires `superuser` or `admin` role.

**Path Parameter:** `item_code`

**Response `200`:**
```json
{ "message": "Product deleted", "inventory_id": "1AF2202L" }
```

---

#### `POST /api/items/{item_code}/activities`

Add one new activity to an existing product. **Revision is auto-incremented.** Requires `superuser` or `admin` role.

**Path Parameter:** `item_code`

**Query Parameter (optional):** `skip_revision=1` — add the activity without bumping the revision or creating an archive snapshot (useful for batch loading).

**Request Body:**

| Field | Type | Required | Default |
|---|---|---|---|
| `activity_name` | string | **Yes** | — |
| `pax` | integer | **Yes** | — |
| `machine` | integer | **Yes** | — |
| `time_min` | number | **Yes** | — |
| `type` | string | No | `"Labor"` |
| `item_id` | string | No | Same as `activity_name` |
| `class` | string | No | `"DL"` |
| `class_1` | string | No | `"DL"` |

**Example:**
```json
{
  "activity_name": "L01 PACKING/PALLETIZ",
  "pax": 2,
  "machine": 0,
  "time_min": 0.5
}
```

**Response `201`:**
```json
{
  "message": "Activity added",
  "inventory_id": "1AF2202L",
  "activity_id": 42,
  "sort_order": 3,
  "old_revision": "04",
  "new_revision": "05"
}
```

---

#### `PATCH /api/items/{item_code}/activities/{activity_id}`

Update one specific activity by its database ID. **Revision is auto-incremented.** Requires `superuser` or `admin` role.

**Path Parameters:** `item_code`, `activity_id` (integer)

**Query Parameter (optional):** `skip_revision=1`

**Request Body** — send only the fields you want to change:

| Field | Type |
|---|---|
| `activity_name` | string |
| `type` | string |
| `item_id` | string |
| `class` | string |
| `class_1` | string |
| `pax` | integer |
| `machine` | integer |
| `time_min` | number |
| `sort_order` | integer |

**Response `200`:**
```json
{
  "message": "Activity updated",
  "inventory_id": "1AF2202L",
  "activity_id": 42,
  "fields_updated": ["pax", "time_min"],
  "old_revision": "05",
  "new_revision": "06"
}
```

---

#### `DELETE /api/items/{item_code}/activities/{activity_id}`

Remove one activity from a product. **Revision is auto-incremented.** Requires `superuser` or `admin` role.

**Path Parameters:** `item_code`, `activity_id` (integer)

**Query Parameter (optional):** `skip_revision=1`

**Response `200`:**
```json
{
  "message": "Activity deleted",
  "inventory_id": "1AF2202L",
  "activity_id": 42,
  "old_revision": "06",
  "new_revision": "07"
}
```

---

### Export

#### `GET /api/export`
Generates and downloads a `.xlsx` Excel file containing all products and their associated activities. The data is flattened so that each activity is on its own row alongside its parent product data, mimicking the original ACU Routing template structure.

**Authentication:** Required (`@require_superuser_or_admin`)
**Response Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### Archive

Both archive endpoints require `superuser` or `admin` role.

#### `GET /api/items/{item_code}/revisions`

List all historical revisions (snapshots) for a product, newest first.

**Path Parameter:** `item_code`

**Response `200`:**
```json
{
  "inventory_id": "1AF2202L",
  "total": 2,
  "page": 1,
  "per_page": 50,
  "total_pages": 1,
  "revisions": [
    {
      "id": 102,
      "revision": "02",
      "archived_by": "alice_smith",
      "archived_at": "2026-06-24 09:30:00 UTC"
    }
  ]
}
```

---

#### `GET /api/items/{item_code}/revisions/{revision}`

Retrieve the full snapshot of a product and its activities at a specific past revision.

**Path Parameters:** `item_code`, `revision` (e.g. "02")

**Response `200`:**
```json
{
  "id": 102,
  "inventory_id": "1AF2202L",
  "revision": "02",
  "archived_by": "alice_smith",
  "archived_at": "2026-06-24 09:30:00 UTC",
  "snapshot": {
    "revision": "02",
    "quantity": 4,
    "activities": [ ... ]
  }
}
```

---

### Production Lines

All production line endpoints require `superuser` or `admin` role.

#### `GET /api/production-lines`

List production lines and their activity templates. Supports pagination.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `limit` | integer | No | 50 | Max lines returned (capped at 200) |
| `offset` | integer | No | 0 | Number of lines to skip |

**Response `200`:**
```json
[
  {
    "production_line_code": "L01",
    "production_line_name": "L01 - L1 COATINGS",
    "activities": [
      { "id": 1, "activity_name": "L01 MIXING", "sort_order": 1 },
      { "id": 2, "activity_name": "L01 FILLING", "sort_order": 2 }
    ]
  }
]
```

---

#### `POST /api/production-lines`

Create a new production line.

**Request Body:**

| Field | Type | Required |
|---|---|---|
| `production_line_code` | string | **Yes** |
| `production_line_name` | string | **Yes** |

**Example:**
```json
{ "production_line_code": "L20", "production_line_name": "L20 - New Filling Line" }
```

**Response `201`:**
```json
{
  "message": "Production line created",
  "production_line_code": "L20",
  "production_line_name": "L20 - New Filling Line"
}
```

**Error responses:** `400` missing fields, `409` code already exists.

---

#### `GET /api/production-lines/{line_code}`

Get a single production line and its activities.

**Path Parameter:** `line_code` (case-insensitive)

**Response `200`:**
```json
{
  "production_line_code": "L01",
  "production_line_name": "L01 - L1 COATINGS",
  "activities": [
    { "id": 1, "activity_name": "L01 MIXING", "sort_order": 1 }
  ]
}
```

**Response `404`:**
```json
{ "error": "Production line not found", "line_code": "L99" }
```

---

#### `PATCH /api/production-lines/{line_code}`

Rename a production line. **Also updates the cached name on all products that reference this line**, so `GET /api/items` responses stay consistent after a rename.

**Path Parameter:** `line_code`

**Request Body:**
```json
{ "production_line_name": "L01 - L1 COATINGS (UPDATED)" }
```

**Response `200`:**
```json
{
  "message": "Production line renamed",
  "production_line_code": "L01",
  "production_line_name": "L01 - L1 COATINGS (UPDATED)"
}
```

---

#### `PUT /api/production-lines/{line_code}`

Atomically replace a production line's name and its full activity list. All existing activities are deleted and replaced with the ones you send.

**Path Parameter:** `line_code`

**Request Body:**

| Field | Type | Required |
|---|---|---|
| `production_line_name` | string | No |
| `activities` | array | No |

Each activity in the array:

| Field | Type | Required |
|---|---|---|
| `activity_name` | string | **Yes** |
| `sort_order` | integer | **Yes** |
| `stage` | string | No |

**Example:**
```json
{
  "production_line_name": "L01 - L1 COATINGS",
  "activities": [
    { "activity_name": "L01 MIXING", "sort_order": 1 },
    { "activity_name": "L01 FILLING", "sort_order": 2 },
    { "activity_name": "L01 LABELING/CODING", "sort_order": 3 }
  ]
}
```

**Response `200`:**
```json
{
  "message": "Production line updated",
  "line_code": "L01",
  "activities": 3
}
```

---

#### `DELETE /api/production-lines/{line_code}`

Delete a production line and all of its activity templates. Returns `409` if any product still references this line.

**Path Parameter:** `line_code`

**Response `200`:**
```json
{ "message": "Production line deleted", "production_line_code": "L01" }
```

**Response `409`:**
```json
{
  "error": "Production line is still in use by one or more products and cannot be deleted",
  "line_code": "L01"
}
```

---

#### `POST /api/production-lines/{line_code}/activities`

Add a single activity to a production line.

**Path Parameter:** `line_code`

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `activity_name` | string | **Yes** | Must be non-empty |
| `sort_order` | integer | No | Defaults to the next available position |
| `stage` | string | No | Optional stage label |

**Example:**
```json
{ "activity_name": "L01 TINTING", "sort_order": 3 }
```

**Response `201`:**
```json
{
  "message": "Activity added",
  "production_line_code": "L01",
  "activity_id": 15,
  "sort_order": 3
}
```

---

#### `PATCH /api/production-lines/{line_code}/activities/{activity_id}`

Update a single activity on a production line.

**Path Parameters:** `line_code`, `activity_id` (integer)

**Request Body** — send only the fields you want to change:

| Field | Type |
|---|---|
| `activity_name` | string |
| `sort_order` | integer |
| `stage` | string |

**Response `200`:**
```json
{
  "message": "Activity updated",
  "production_line_code": "L01",
  "activity_id": 15,
  "fields_updated": ["sort_order"]
}
```

---

#### `DELETE /api/production-lines/{line_code}/activities/{activity_id}`

Delete a single activity from a production line.

**Path Parameters:** `line_code`, `activity_id` (integer)

**Response `200`:**
```json
{
  "message": "Activity deleted",
  "production_line_code": "L01",
  "activity_id": 15
}
```

---

### Logs

Both log endpoints require `admin` role.

#### `GET /api/logs`

List audit log entries with filtering and pagination.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | 1 | Page number (1-based) |
| `per_page` | integer | No | 50 | Entries per page (max 200) |
| `username` | string | No | — | Filter by exact username |
| `action` | string | No | — | Partial, case-insensitive match on action |
| `target_type` | string | No | — | `product`, `activity`, `user`, or `logs` |
| `from_date` | string | No | — | ISO-8601 date e.g. `2026-01-01` — inclusive start |
| `to_date` | string | No | — | ISO-8601 date e.g. `2026-06-30` — inclusive end |

**Response `200`:**
```json
{
  "page": 1,
  "per_page": 50,
  "total": 143,
  "total_pages": 3,
  "logs": [
    {
      "id": 99,
      "logged_at": "2026-05-10 14:32:01 UTC",
      "username": "alice_smith",
      "user_role": "superuser",
      "action": "Updated product",
      "description": "'alice_smith' updated product '1AF2202L'. Fields changed: notes. Revision 03 → 04.",
      "target_type": "product",
      "target_id": "1AF2202L",
      "ip_address": "192.168.1.45",
      "extra": { "fields_updated": ["notes"], "old_revision": "03", "new_revision": "04" }
    }
  ]
}
```

**Error responses:** `400` invalid date format, `403` admin required.

---

#### `DELETE /api/logs/cleanup`

Purge log entries older than N days.

**Query Parameter:**

| Parameter | Type | Required | Default |
|---|---|---|---|
| `days` | integer | No | 90 |

**Example:** `DELETE /api/logs/cleanup?days=30`

**Response `200`:**
```json
{
  "message": "Deleted 57 log entries older than 30 days.",
  "rows_deleted": 57,
  "days_threshold": 30
}
```

---

## 7. Error Responses

All errors return JSON with at minimum an `"error"` key.

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request — missing required fields, invalid JSON, invalid parameter value |
| `401` | Unauthorized — no token provided or token is invalid/expired |
| `403` | Forbidden — valid token but insufficient role |
| `404` | Resource not found — item code or production line does not exist |
| `409` | Conflict — duplicate code/name, or deleting a record still referenced by others |
| `429` | Too many requests — rate limit exceeded, wait and retry |
| `500` | Internal server error — check server logs |
| `503` | Service unavailable — DB connection pool exhausted or database unreachable, retry shortly |

**Example `400`:**
```json
{ "error": "inventory_id, revision_descr, and product_type are required" }
```

**Example `401`:**
```json
{ "error": "Invalid or expired token." }
```

**Example `403`:**
```json
{
  "error": "Permission denied.",
  "required_roles": ["admin"],
  "your_role": "user"
}
```

**Example `409`:**
```json
{ "error": "Item code already exists", "inventory_id": "1AF2202L" }
```

**Example `503`:**
```json
{
  "error": "Server is under heavy load. Please retry in a moment.",
  "code": "db_pool_exhausted"
}
```

---

## 8. Rate Limiting

Rate limits are applied per IP address. Limits are configurable via `.env`.

| Endpoint | Default limit |
|---|---|
| `POST /api/auth/login` | 10 requests / minute |
| `POST /api/auth/register` | 5 requests / minute |
| All other endpoints | 300 requests / minute |

When a limit is exceeded the API returns `429 Too Many Requests`. Wait for the current minute window to pass before retrying.