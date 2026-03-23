# K-Golf Platform

This monorepo contains:

- **frontend**: Customer-facing booking web app (React + TypeScript + Tailwind)
- **backend**: Express API (TypeScript) – PostgreSQL + Prisma
- **pos**: Point-of-Sale (POS) hub (Electron + Express + SQLite offline + PostgreSQL sync) – newly scaffolded
- **print-server**: Windows service for thermal printer integration via WebSocket

## High-Level Architecture

```
[Customer Browsers] --(HTTPS)--> [Backend API (Express + Postgres)]
                                     ^
                                     |
                    +----------------+----------------+
                    |                                 |
             periodic sync                      WebSocket
                    |                                 |
                    v                                 v
[Electron POS Hub Laptop]              [Print Server (Windows Service)]
        |                                            |
        |-- Local SQLite (offline buffer)           |
        |-- Printer Control (USB / Network)         |
        |-- Embedded Express server (LAN access)    +-- Thermal Printer
                                                         (ESC/POS)
```

### POS Sync Architecture (Offline-First)

The POS system follows a **queue-based bidirectional sync** pattern where local SQLite is a cached subset of backend PostgreSQL:

```
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND (PostgreSQL)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Users   │  │  Rooms   │  │ MenuItem │  │ Bookings │   │
│  │ (10,000) │  │   (4)    │  │   (17)   │  │  (1000s) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘        │
│                          │                                   │
│                   ┌──────▼──────┐                           │
│                   │  REST API   │                           │
│                   └──────┬──────┘                           │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ SyncQueue   │ ◄─── Only communication bridge
                    │ (15 sec)    │
                    └──────┬──────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      POS (SQLite)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Users*  │  │  Rooms*  │  │ MenuItem │  │ Bookings │   │
│  │ (recent) │  │   (4)    │  │   (17)   │  │ (local)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       ▲              ▲              ▲              │         │
│       │              │              │              │         │
│  ┌────┴──────────────┴──────────────┴──────────────▼────┐  │
│  │           POS Application Logic                       │  │
│  │  - All reads from local SQLite (FAST!)               │  │
│  │  - All writes to local SQLite (OFFLINE OK!)          │  │
│  │  - Sync handles backend communication                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

* Synced periodically from backend (read-only cached subset)
```

**Design Principles:**
- **Offline-First**: All reads from local SQLite (instant), all writes go local first (optimistic)
- **Sync as Bridge**: SyncQueue (15-sec cycle) is the only communication channel with backend
- **Cached Subset**: POS stores only what it needs, backend is source of truth
- **Periodic Pull**: Menu (5 min), Rooms (5 min), Bookings (2 min) - upcoming
- **Optimistic Push**: Booking creation, room updates queued and synced

See [pos/apps/electron/README.md](pos/apps/electron/README.md) for detailed POS architecture.

### Booking (Existing)
- Pricing: $50 per player per hour (players 1–4, each player gets 1 hour).
- ~~Planned persistence: PostgreSQL (docker-compose `db` service) with overlap constraints.~~
- Persistence: PostgreSQL + Prisma with overlap constraints.
- Auth: Email verification + password login; sessions via HttpOnly cookie. Google OAuth planned.
- UI: Custom TimePicker component with 12-hour format, full minute selection (00-59), and visual timeline showing existing bookings and availability conflicts.

## What's New (Aug 2025)

Auth and UX
- Frontend verification flow: email links now land on the frontend `/verify` page before calling the backend.
- Resend verification with cooldown: UI shows remaining seconds; backend enforces a retry window.
- Structured login errors: backend returns specific codes/messages; frontend surfaces them consistently.
- Auto-logout on expiry: frontend revalidates the session on mount, window focus/visibility, online events, and every 5 minutes; a 401 clears local user and shows a toast "Session expired, please log in again."
- Enhanced booking page: Custom TimePicker component with 12-hour format, full minute selection (00-59), visual timeline showing existing bookings and real-time availability checking.

Bookings and Availability
- Availability API: `GET /api/bookings/availability?roomId&date&hours&slotMinutes` computes valid continuous windows using stored per-room operating hours (openMinutes/closeMinutes).
- Timeline API: `GET /api/bookings/by-room-date?roomId&date` returns all bookings for a specific room and date to display in the visual timeline.
- Overlap prevention: server checks for conflicting bookings; optional DB constraint planned.
- Price stored as decimal: Booking.price is `Decimal(10,2)` (replaced older cents field).
- Rooms API: `GET /api/bookings/rooms` returns active rooms only.
- Frontend booking page now calls the backend for availability and booking creation; errors shown inline.
 - No past bookings: server rejects booking requests with a start time in the past; availability marks past starts unavailable.
 - Cancellation: `PATCH /api/bookings/:id/cancel` lets users cancel their own upcoming bookings.
 - Dashboard metrics: counts and monthly spend now consider only completed bookings.
 - Custom TimePicker: Replaces native HTML time input with a custom component featuring 12-hour format, AM/PM selection, and full minute precision (00-59).

Database changes
- Booking status column switched from a Postgres ENUM to TEXT for flexibility. The Prisma model is now `status String @default("CONFIRMED")` and the migration `20250828080000_status_to_string` alters the column type safely and drops the old enum if unused.
- "completed" remains a derived UI state (when `endTime < now`); there is no DB enum value for it.
- All DateTimes are stored as UTC (timestamptz). Migration `20250828090000_use_timestamptz` converts all timestamp columns to `timestamptz` using `AT TIME ZONE 'UTC'` so existing values keep the same absolute instant. API responses return ISO-8601 UTC strings.

Rooms and Seeding
- Seed script ensures exactly four active rooms: Room 1–4 (capacity 4). All other rooms are deactivated.
- Frontend keeps the original 4-card design (Room 1–4, static images) and maps each card to a real backend UUID.

Quality
- Centralized error parsing on frontend auth; symmetric cookie handling on logout.
- Diagrams and docs updated (availability and ER), including Mermaid fixes.

### Receipt Printing (Web Frontend)
The web frontend includes a complete receipt printing system:
- **Per-seat receipt printing**: Print icon on each seat accordion in booking detail page
- **Modal preview**: Shows formatted receipt before printing (80mm thermal printer layout)
- **Print window**: Opens dedicated window with Tailwind CSS styling for clean output
- **Email receipts**: Send receipts via email with HTML template
- **Trackable receipt numbers**: 
  - Seat receipts use invoice ID as receipt number (directly trackable in database)
  - Full booking receipts use booking ID as receipt number
- **Backend API**: `GET /api/receipt/:bookingId`, `GET /api/receipt/:bookingId/seat/:seatIndex`, `POST /api/receipt/:bookingId/email`

### POS Hub (New)
A local Electron application that:
- Hosts an Express server bound to `0.0.0.0` so other devices on the same Wi‑Fi can submit orders.
- Uses **SQLite** for offline-first storage and queueing operations.
- Syncs bi-directionally with the central **PostgreSQL** database when online.
- Controls local printers (thermal receipt / kitchen) via Node printing APIs.
- Provides a small renderer UI panel (status: online/offline, pending ops, printer tests).

#### Core POS Data Model (initial draft)
- `orders(id, status, total_cents, version, updated_at, created_at, device_id, deleted_at)`
- `order_items(id, order_id, product_id, qty, price_cents, version, updated_at, deleted_at)`
- `products(id, name, sku, price_cents, active, version, updated_at, deleted_at)`
- `operations(id, entity, entity_id, op_type, payload, version, device_id, status, created_at, last_error)`

### Print Server (New)
A lightweight Windows service for thermal printer integration:

**Architecture:**
```
Backend API --> WebSocket Server --> Print Server --> Thermal Printer
                                          |
                                     [Auto-Update]
```

**Key Features:**
- **WebSocket Client**: Connects to backend, receives print jobs in real-time
- **Thermal Printer Support**: ESC/POS protocol (Epson, Star, Tanca printers)
- **Auto-Update**: Checks for new versions every 6 hours, updates silently
- **Offline Resilient**: Auto-reconnects on network failure
- **Windows Service**: Runs on startup via Task Scheduler

**Structure:**
```
print-server/
├── src/
│   ├── server.ts              # Main entry point
│   ├── websocket-client.ts    # WebSocket connection manager
│   ├── printer-service.ts     # Thermal printer integration
│   ├── update-service.ts      # Auto-update functionality
│   ├── config.ts              # Configuration loader
│   └── logger.ts              # File + console logging
├── config.json                # User configuration (printer IP, etc.)
├── install.bat                # Windows installer script
├── uninstall.bat              # Windows uninstaller script
└── README.md                  # Deployment documentation
```

**Deployment:**
1. Build with `pkg` → Creates standalone `k-golf-printer.exe` (~50MB)
2. No Node.js installation required on target machine
3. User runs `install.bat` → Creates Windows scheduled task
4. Starts on boot, connects to backend WebSocket
5. Updates automatically (downloads new .exe, replaces itself, restarts)

**Configuration:**
```json
{
  "serverUrl": "wss://k-golf.inviteyou.ca",
  "printer": {
    "type": "epson",
    "interface": "tcp://192.168.1.100"  // Network printer
  }
}
```

See [print-server/README.md](print-server/README.md) for detailed setup and deployment guide.
## Roadmap & Status (Consolidated)
- Done
  - Frontend SPA with routing, auth screens, booking flow, and availability UI wired to backend.
  - Backend API with Prisma/PostgreSQL persistence, overlap checks (excluding canceled bookings), and price stored as Decimal(10,2).
  - Rooms API and seed: ensures exactly four active rooms (Room 1–4) for deterministic mapping in the UI.
  - Session handling with HttpOnly cookie, email verification/password login, resend cooldown, structured errors, and auto-logout on expiry.
  - Availability endpoint: `GET /api/bookings/availability` computes valid slots by date/room/hours using stored room hours (defaults 09:00–19:00) and skips non-ACTIVE rooms.
  - Booking endpoints: `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/mine`, `PATCH /api/bookings/:id/cancel`.
  - Database: Booking.status switched to TEXT with default `CONFIRMED`; "completed" is derived by `endTime < now` in API responses/UI.
  - Time rules: reject past bookings; availability hides past starts. Dashboard totals only include completed bookings.

- Next
  - Endpoint: `GET /api/bookings/:id` (single booking detail).
  - Validation & rules: hours-of-operation config (DONE – per-room open/close); slot rounding server-side; optional cancel cutoff window (e.g., cannot cancel within N minutes).
  - Pricing: extract unified calculator used by server and (optionally) client.
  - Observability: logging with request IDs; health/readiness checks; basic metrics stub.
  - Security: tighten CORS, add rate limiting, refine headers, and ensure secure cookie settings in prod.
  - Deployment: Dockerfile for backend, Nginx proxy, env matrices, and `prisma migrate deploy` in release flow.
  - POS Hub: continue scaffolding Electron app (local SQLite, printer control, sync engine) once web app is stable.
  - Linting: re‑introduce enterprise lint stack (ESLint + TypeScript strict rules + import/order + promise + security + prettier) with phased enforcement.
1. Logging: pino logger with request ID middleware.
2. Metrics stub (expose `/metrics` for future Prometheus) – optional.
3. Health endpoints: `/healthz` (basic), `/readyz` (DB connectivity check).
4. Tests:
  - Unit: price calculator, availability logic.
  - Integration: booking creation + overlap rejection.
5. Add Prisma seed test data for local dev convenience.

### Flat TODO Backlog (No Phases)
Core API / Booking
- `GET /api/bookings/:id` endpoint.
- Optional cancellation cutoff window + confirm dialog.
- Unified price calculation utility shared (server + potential client reuse).
- Hours-of-operation config & slot rounding on server.

Quality / Observability / Security
- Logging: request ID middleware (pino child logger).
- Health endpoints: `/healthz` (basic), `/readyz` (DB check).
- Metrics stub (expose `/metrics`).
- Rate limiting on auth & booking create.
- CORS allowlist via env.
- Helmet (curated headers) & secure cookie flags.

Deployment / Infra
- Backend Dockerfile (multi-stage) & production docker-compose override.
- Nginx reverse proxy (TLS, gzip, static caching for frontend build).
- Automated `prisma migrate deploy` in release.
- Document environment matrices (dev/staging/prod).

Codebase & Docs
- API contract examples in README.
- Remove unused legacy packages.
- Shared utilities module (pricing, time helpers).
- Architectural Decision Records (ORM, auth, overlap strategy).
- Shared types package groundwork for POS.

Enhancements (Later / Nice-to-have)
- WebSocket push for booking updates.
- Admin reporting (revenue, utilization).
- Email notifications (confirmation, reminder, cancel).
- Dynamic / peak pricing rules abstraction.

POS Hub
- Continue Electron app scaffolding (SQLite sync, printer integration, sync engine).

### Technical Debt & Known Constraints
This section tracks notable limitations / design debts that have explicit follow-up actions.

#### Room Hours Shrink Guard
- Behavior: PATCH room hours rejects shrinking when any future (non-canceled) booking would end up outside the new `[openMinutes, closeMinutes)` window (HTTP 409, `{"error":"Future bookings exist outside new window"}`).
- Current Gaps:
  - Blocking bookings not enumerated to the client.
  - No preview / confirmation or force override.
  - Early POS HH:MM parser required zero‑padding (`09:00`); non‑padded forms could cause silent no-op (parser now relaxed but needs tests).
- Planned:
  1. Impact preview endpoint (list blocking booking IDs).
  2. UI confirmation modal (Cancel / Force / Adjust manually).
  3. Optional `force=true` path (cancels blocking bookings with audit log) – pending decision.
  4. Distinct UI feedback: No Change vs Updated vs Blocked.
  5. Parser test coverage & validation messages.
- Workaround: Adjust/cancel conflicting future bookings first, or widen temporarily then shrink.
- Tracking: `pos/TASKS.md` Phase 0.6a follow-ups.

_(Add additional items here as they’re discovered: e.g., sync batching, auth refresh strategy, pricing calculator duplication.)_

## Getting Started (Current)
```
# 1) Start the database (from repo root)
npm run db:up

# 2) Apply Prisma migrations and generate client (from backend/)
cd backend
npm install
npm run prisma:migrate
npm run prisma:generate

# 3) Seed rooms (creates Room 1–4 active, deactivates others)
npm run db:seed

# 4) Run backend API
npm run dev

# 5) In a new terminal, run the frontend
cd ../frontend
npm install
npm run dev
```

Notes on migrations
- In development, always add new migrations; do not delete or rewrite migrations that were already applied to your local DB. If your database has migrations applied that are no longer present in the repository, Prisma will detect a divergence and may prompt to reset (drop and recreate) the schema during `prisma migrate dev`.
- If you see: "The migrations recorded in the database diverge from the local migrations directory… We need to reset the schema", this is due to history divergence, not because every change resets data. In dev, you can accept the reset and then run `npm run db:seed` to restore sample data.
- In production, never reset and never use `prisma migrate dev`. Use `prisma migrate deploy`, keep a linear, append‑only migration history, and avoid deleting past migrations.

Testing: See [backend/README.md](backend/README.md#testing) for comprehensive testing documentation.

### E2E Testing (Playwright)

End-to-end tests live in `e2e-tests/` and run against the live dev servers using Playwright (Chromium).

**Prerequisites:** Backend running on `:8080`, frontend running on `:5173`.

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

**Run tests** (from repo root):

| Command | Description |
|---------|-------------|
| `npm run test:e2e` | Headless run (fastest) |
| `npm run test:e2e:headed` | Shows browser window |
| `npm run test:e2e:ui` | Playwright interactive UI |
| `npm run test:e2e:report` | Opens the last HTML report |

**Test suites (23 tests):**

| File | Tests | What it covers |
|------|-------|----------------|
| `01-auth-flow.spec.ts` | 6 | Login, invalid credentials, admin/user redirect, auth guard |
| `02-booking-flow.spec.ts` | 5 | Dashboard rooms, walk-in booking modal, validation, booking detail |
| `03-pos-order-flow.spec.ts` | 5 | Add food/drink items to seats, menu categories, custom/discount buttons |
| `04-payment-flow.spec.ts` | 7 | Card/Cash payment, tips, tip method toggle, complete booking, quick sale |

**Key files:**

- `e2e-tests/global-setup.ts` — Seeds DB and verifies servers before tests
- `e2e-tests/helpers.ts` — Shared login, booking creation, and API helpers
- `playwright.config.ts` — Playwright config (Chromium, sequential, screenshots on failure)

### Timestamps & Timezones (UTC)

- Storage: All Prisma `DateTime` fields are mapped to Postgres `timestamptz` and persisted as UTC instants.
- Migration: `20250828090000_use_timestamptz` casts existing columns to `timestamptz` with `AT TIME ZONE 'UTC'` to preserve the exact moment in time.
- Input: Booking creation expects an ISO string (`startTimeIso`) that should be UTC. Server parses via `new Date(startTimeIso)`.
- Output: API returns ISO-8601 strings in UTC for all timestamps.
- Availability: The `/api/bookings/availability` endpoint builds the requested day window using the server's local timezone, but it doesn't persist those intermediary times; emitted slot times are ISO UTC strings.
- Future: If the venue timezone should be fixed regardless of server location, introduce a `VENUE_TIMEZONE` env and compute availability in that IANA zone.

Why status is TEXT now
- The booking status needs to evolve (e.g., adding new states) without brittle enum churn. Using TEXT avoids destructive enum alterations and complex migrations. Validation is enforced in application code, and the current allowed values are `CONFIRMED` and `CANCELED` (with `CONFIRMED` as default). Canceled bookings are ignored in availability/overlap checks.

Env
- Backend: set `CORS_ORIGIN` (frontend origin) and optionally `FRONTEND_ORIGIN` for email links; `DATABASE_URL` for Postgres.
- Frontend: set `REACT_APP_API_BASE` to the backend base URL (e.g., `http://localhost:8080`).

## Production Deployment (Docker + Nginx Summary)
Compact reference of the current live setup:

Docker (release compose):
- backend container listens on 8080 (Express API)
- frontend container listens on 8081 (Nginx serving built SPA)
- Postgres service internal only
- `prisma migrate deploy` run via a one‑shot migrate service
- Environment loaded from `.env.production` via `env_file`

Nginx (host) terminates TLS and reverse‑proxies:
1. `inviteyou.ca` (legacy build on disk)
2. `k-golf.inviteyou.ca` (proxies to containers)
3. Wildcard `*.inviteyou.ca` (dynamic subdomains → containers, excluding the explicit k-golf)

Key HTTPS server block for k-golf (Option 2: hard-coded Connection header):

```
server {
  listen 443 ssl http2;
  server_name k-golf.inviteyou.ca;

  ssl_certificate /etc/letsencrypt/live/inviteyou.ca-0002/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/inviteyou.ca-0002/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  # Security headers
  add_header X-Frame-Options SAMEORIGIN;
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy strict-origin-when-cross-origin;
  add_header X-XSS-Protection "1; mode=block";
  add_header Cross-Origin-Opener-Policy same-origin always;
  add_header Cross-Origin-Resource-Policy same-origin always;
  add_header Cross-Origin-Embedder-Policy require-corp always;

  # API → backend container
  location /api/ {
    proxy_pass http://127.0.0.1:8080/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade"; # Option 2 (no map)
    proxy_cache_bypass $http_upgrade;
  }

  # SPA → frontend container
  location / {
    proxy_pass http://127.0.0.1:8081/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}

server { listen 80; server_name k-golf.inviteyou.ca; return 301 https://$host$request_uri; }
```

Wildcard pattern (concept):
```
server {
  listen 443 ssl http2;
  server_name ~^(?!(k-golf))(?<sub>[a-z0-9-]+)\.inviteyou\.ca$;
  # proxy /api to 8080, everything else to 8081 (same blocks as above)
}
```

If WebSockets are later required, switch to Option 1:
```
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
proxy_set_header Connection $connection_upgrade;
```

Operational commands:
```
sudo nginx -t && sudo systemctl reload nginx
curl -I https://k-golf.inviteyou.ca/ ; curl -I https://k-golf.inviteyou.ca/api/health
```

Update `.env.production` after domain/origin changes (redeploy backend):
`CORS_ORIGIN=https://k-golf.inviteyou.ca`

Future improvements (not yet automated): gzip/static caching at proxy, rate limiting, unified cert (SAN or wildcard).

## API quick reference

- GET `/api/bookings/rooms` → list active rooms
- GET `/api/bookings/availability?roomId&date=YYYY-MM-DD&hours=1..4&slotMinutes=30` → available slots (ISO UTC) within stored hours
- GET `/api/bookings` → list all bookings (admin/dev)
- GET `/api/bookings/mine` → current user's bookings (status normalized: `booked` | `completed` | `canceled`)
 - POST `/api/bookings` { roomId, startTimeIso, players, hours } → create booking (rejects past-start)
 - PATCH `/api/bookings/:id/cancel` → cancel own upcoming booking
 - PATCH `/api/bookings/rooms/:id` (ADMIN) { openMinutes?, closeMinutes?, status? } → update room schedule/status

## Notes: Room IDs vs UI Labels

- Database Room IDs are UUIDs (Prisma `@default(uuid())`). The UI continues to display four cards labeled “Room 1–4”.
- The frontend fetches active rooms (`GET /api/bookings/rooms`), then maps those UUIDs onto the four display cards. API calls (availability, create booking) always send the real UUID, not the UI label.
- The seed ensures exactly four active rooms (names: Room 1–4) so mapping is deterministic in development.
POS hub dev scripts will be added as implementation progresses.

## Quick Concepts
**Repository (e.g. bookingRepo)**: A thin module wrapping all database calls for one domain (create/find/list/cancel bookings) so route handlers stay simple (validate → call → respond) and future logic/ORM changes live in one place.

**Zod**: A TypeScript-first schema validator used to define expected request body shapes once, validate incoming JSON at runtime, and infer static types—reducing boilerplate and preventing malformed data from reaching business logic.

### Room Operating Hours & Status
Each room stores:
- `openMinutes` / `closeMinutes` (minutes from midnight local, defaults 540=09:00, 1140=19:00)
- `status` one of `ACTIVE | MAINTENANCE | CLOSED`

Rules:
- Non-ACTIVE rooms return empty availability (status included in meta).
- Bookings must fit entirely within `[openMinutes, closeMinutes)` same calendar day.
- Creation rejected if room status != ACTIVE.
- Admin-only update endpoint prevents shrinking hours if future bookings would fall outside the new window.

Migration added enum `RoomStatus` + columns with defaults; existing rooms inherit ACTIVE 09:00–19:00.

### Booking Status Fields

The `Booking` model uses two separate status fields to track different aspects of the booking lifecycle:

#### **1. Booking Status (`bookingStatus`)**
Tracks the overall lifecycle state of the booking reservation.

**Values:**
- `CONFIRMED` (default) - Booking is active and valid
- `COMPLETED` - Booking has finished successfully, customer has left
- `CANCELLED` - Booking was cancelled by customer or staff

**Usage:**
- Used to filter active bookings: `WHERE bookingStatus = 'CONFIRMED'`
- Revenue reports use `COMPLETED` status
- Can be reset from `CANCELLED` back to `CONFIRMED` if needed

#### **2. Payment Status (`paymentStatus`)**
Tracks the payment and billing workflow during the customer's visit.

**Values:**
- `UNPAID` (default) - Customer has been seated, no bill issued yet
- `BILLED` - Bill has been issued, waiting for payment
- `PAID` - Payment received, transaction complete

**Progression Flow:**
```
┌─────────┐    Create Booking    ┌─────────┐
│ No      │ ──────────────────► │ UNPAID  │
│ Booking │                       │(Yellow) │
└─────────┘                       └─────┬───┘
                                        │
                                        │ Issue Bill
                                        ▼
                                  ┌─────────┐
                                  │ BILLED  │
                                  │  (Red)  │
                                  └─────┬───┘
                                        │
                                        │ Mark as Paid
                                        ▼
                                  ┌─────────┐
                                  │  PAID   │
                                  │ (Blue)  │
                                  └─────┬───┘
                                        │
                                        │ Complete Booking
                                        ▼
                            bookingStatus → COMPLETED
```

**Supporting Fields:**
- `billedAt` (DateTime?) - Timestamp when bill was issued
- `paidAt` (DateTime?) - Timestamp when payment was received
- `paymentMethod` (String?) - Payment method used: `CARD` | `CASH`
- `tipAmount` (Decimal?) - Tip amount if applicable

**Valid State Combinations:**
```
bookingStatus=CONFIRMED + paymentStatus=UNPAID   → Customer seated, no orders yet
bookingStatus=CONFIRMED + paymentStatus=BILLED  → Bill issued, waiting for payment
bookingStatus=CONFIRMED + paymentStatus=PAID    → Paid, ready to complete booking
bookingStatus=COMPLETED + paymentStatus=PAID    → Booking closed successfully
bookingStatus=CANCELLED + paymentStatus=UNPAID  → Cancelled before billing
bookingStatus=CANCELLED + paymentStatus=BILLED  → Cancelled after billing (refund needed)
```

**Why Two Fields?**
- **Separation of Concerns**: Booking lifecycle (confirmed/completed/cancelled) is independent from payment workflow (unpaid/billed/paid)
- **Better Analytics**: Can query "all billed bookings today" without complex status checks
- **Flexible States**: Can track scenarios like "cancelled after billing" for refund processing
- **Clearer Queries**: `WHERE bookingStatus='CONFIRMED'` means "active bookings" regardless of payment stage

**Database Schema:**
```prisma
model Booking {
  // ... other fields
  bookingStatus   String    @default("CONFIRMED")     // CONFIRMED | COMPLETED | CANCELLED
  paymentStatus   String    @default("UNPAID")        // UNPAID | BILLED | PAID
  billedAt        DateTime? @db.Timestamptz
  paidAt          DateTime? @db.Timestamptz
  paymentMethod   String?                             // CARD | CASH
  tipAmount       Decimal?  @db.Decimal(10, 2)
}
```

**Note:** Previously the field was named `status`. It was renamed to `bookingStatus` for clarity when `paymentStatus` was added.

### Room Status Update Flow

When an admin updates a room's status in the POS:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROOM STATUS UPDATE FLOW                         │
└─────────────────────────────────────────────────────────────────────────┘

1. USER INTERACTION (RoomsTable.tsx)
   ┌──────────────────────┐
   │  Admin clicks "Edit" │ → setEditing(roomId)
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────────────────────┐
   │  User selects status from dropdown:  │
   │  • ACTIVE (green badge)              │
   │  • MAINTENANCE (amber badge)         │
   │  • CLOSED (gray badge)               │
   └──────────┬───────────────────────────┘
              │
              ▼
   ┌──────────────────────┐
   │  User clicks "Save"  │
   └──────────┬───────────┘
              │
              ▼

2. API CALL (bridge.ts)
   ┌─────────────────────────────────────────────────┐
   │ api().updateRoom(id, { status: 'MAINTENANCE' })│
   └──────────┬──────────────────────────────────────┘
              │
              ▼

3. IPC BRIDGE (preload.ts)
   ┌────────────────────────────────────────────────┐
   │ ipcRenderer.invoke('rooms:update', {          │
   │   id: roomId,                                 │
   │   patch: { status: 'MAINTENANCE' }            │
   │ })                                            │
   └──────────┬─────────────────────────────────────┘
              │
              ▼

4. MAIN PROCESS IPC HANDLER (main.ts:439)
   ┌────────────────────────────────────┐
   │ ipcMain.handle('rooms:update')    │
   │ • Check auth (admin only)         │
   │ • Validate patch data             │
   └──────────┬─────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────────────┐
   │ axios.patch(                                        │
   │   'http://localhost:8080/api/bookings/rooms/:id',  │
   │   { status: 'MAINTENANCE' },                       │
   │   { withCredentials: true, cookies }               │
   │ )                                                   │
   └──────────┬──────────────────────────────────────────┘
              │
              ▼

5. BACKEND API (backend/src/routes/booking.ts:255)
   ┌────────────────────────────────────┐
   │ router.patch('/rooms/:id')        │
   │ • requireAuth middleware          │
   │ • Check ADMIN role                │
   │ • Validate with zod schema        │
   └──────────┬─────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────────────┐
   │ prisma.room.update({                            │
   │   where: { id },                                │
   │   data: { status: 'MAINTENANCE' }               │
   │ })                                              │
   └──────────┬──────────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │ PostgreSQL: Room table updated      │
   │ status: 'ACTIVE' → 'MAINTENANCE'    │
   └──────────┬──────────────────────────┘
              │
              ▼

6. RESPONSE BACK TO POS
   ┌────────────────────────────────┐
   │ Backend returns: { room: {...}}│
   └──────────┬───────────────────────┘
              │
              ▼
   ┌────────────────────────────────────┐
   │ RoomsTable: onUpdated() callback  │
   │ • Clear editing state             │
   │ • Refresh room list               │
   └──────────┬────────────────────────┘
              │
              ▼

7. SYNC PROPAGATION (5 min later)
   ┌─────────────────────────────────────┐
   │ Periodic rooms:pull triggers        │
   │ • pullRooms() runs                  │
   │ • DELETE all from Room table        │
   │ • INSERT fresh data from backend    │
   │ • Status now in SQLite cache        │
   └──────────┬──────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────┐
   │ Other POS terminals sync within 5 min   │
   │ • See updated status                    │
   │ • Badge color changes automatically     │
   └─────────────────────────────────────────┘
```

**Key Points:**
- **Direct API Update**: Status changes bypass sync queue, go straight to backend
- **No Immediate Local Update**: The change doesn't immediately update local Room table in SQLite
- **Eventual Consistency**: Status syncs back via periodic `rooms:pull` (every 5 minutes)
- **Booking Validation**: Backend rejects bookings for non-ACTIVE rooms
- **Multi-Terminal Support**: Other terminals see the change within 5 minutes via sync

**Current Limitation**: The updating terminal sees the change immediately (from API response), but the local SQLite cache remains stale until the next `rooms:pull`. This could cause inconsistencies if other parts of the UI read directly from SQLite.

---
This README will expand as the POS hub and persistence layers are implemented.

### TODO – Lint & Code Quality (Deferred)
When re‑enabling linting:
- Add deps: eslint, @typescript-eslint/parser + plugin, eslint-plugin-import, eslint-plugin-promise, eslint-config-prettier (plus prettier), eslint-plugin-security (optional).
- Create root `.eslintrc.cjs` with per-workspace `parserOptions.project`.
- Start with: recommended, import/order (warn), promise rules (warn), prettier (warn), eqeqeq, curly, no-console (warn).
- Then add: no-floating-promises, no-misused-promises.
- Gradually enable type-safety rules (`no-unsafe-*`, `no-explicit-any`) from warn → error.
- Add CI gate once noise is low.
