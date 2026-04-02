# Kone Golf Project Guide

> Shared reference for the Kone Golf project — conventions, environment details, and workflows.
> Referenced automatically by GitHub Copilot via `.github/copilot-instructions.md`.

---

## Core Principles

- **No hallucination** — Only provide factually verified information
- **Verify before answering** — Use tools to check actual file contents, directory structures, and configurations
- **Don't make assumptions** — If uncertain, check the actual state rather than guessing

## Documentation Guidelines

- **Do not create new markdown files** unless explicitly requested by the user
- Prefer inline explanations with ASCII diagrams, code snippets, and visual representations
- Provide compact commit messages when user asks for it

## Task Management

- **After EVERY task completion** (bug fix, feature, configuration change), always:
  1. Update `TASKS.md` with completed tasks and new status
  2. Update related markdown documentation files in `docs/` if feature impacts them
  3. Commit the changes with descriptive message
- **AUTOMATIC**: Before saying "done" or "completed", check if `TASKS.md` needs updating
- Mark completed tasks, add new ones if discovered, and keep the task list current
- **Before committing or completing work**, verify all related documentation is updated
- **IMPORTANT**: Never modify or remove items from the "Personal note (Do not touch)" section in `TASKS.md`

## Communication Style

- Use visual aids (diagrams, flowcharts, ASCII art) whenever possible
- Show data flows and architecture using text-based diagrams
- Include code examples with inline comments
- Keep explanations concise and visual-first

## Command Execution Guidelines

- **Always explain commands** before or when running them on servers
- For each terminal command, provide a brief one-line explanation of what it does and expected outcome

## Git Operations

- **ALWAYS use standard git commands** (`git status`, `git add`, `git commit`, `git push`)
- **DO NOT use MCP git tools** (mcp_gitkraken_*) unless explicitly requested
- Use conventional commit messages: `feat:`, `fix:`, `docs:`, `chore:`, etc.

---

## Production Environment

### Server Access

- **IP:** 147.182.215.135
- **SSH:** `ssh root@147.182.215.135`
- **Domain:** konegolf.ca (POS: pos.konegolf.ca)

### SSH Agent Setup

If SSH connection fails with permission denied:
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa        # or ~/.ssh/id_ed25519
```

### Production Database

- **Container:** `kgolf-postgres`
- **Database:** `kgolf_app`
- **User:** `kgolf`
- **Timezone:** America/Halifax (Atlantic Time)

### Quick Commands

```bash
# Access prod psql
ssh root@147.182.215.135 "docker exec -it kgolf-postgres psql -U kgolf -d kgolf_app"

# Run single query from local
ssh root@147.182.215.135 "docker exec kgolf-postgres psql -U kgolf -d kgolf_app -c '<QUERY>'"
```

### Docker Architecture (Production)

Production uses `docker-compose.release.yml` with pre-built images from CI:

| Service | Container | Image | Notes |
|---|---|---|---|
| `db` | `kgolf-postgres` | `postgres:16` | Persistent volume `pg_data` |
| `migrate` | (one-shot) | `ghcr.io/hankyungsung/kgolf-backend:latest` | Runs `prisma migrate deploy`, then exits |
| `seed` | (one-shot) | `ghcr.io/hankyungsung/kgolf-backend:latest` | Runs seed script, then exits |
| `backend` | (auto-named) | `ghcr.io/hankyungsung/kgolf-backend:latest` | Serves API + frontend static files on port 8082→8080 |

> **Note:** `docker-compose.yml` is for local development. `docker-compose.prod.yml` is legacy. Production uses `docker-compose.release.yml`.

### Scheduled Jobs (node-cron)

All cron jobs run inside the backend container using `node-cron` with `America/Halifax` timezone:

| Job | Schedule | File | Purpose |
|---|---|---|---|
| Coupon expiry | Daily | `src/jobs/couponScheduler.ts` | Expires coupons past their end date |
| Booking report | 7:00 AM Atlantic | `src/jobs/bookingReportScheduler.ts` | Emails uncompleted bookings from previous day |
| Shift report | 11:00 PM Atlantic | `src/jobs/shiftReportScheduler.ts` | Emails daily employee clock-in/out summary |
| Stale shift cleanup | Hourly | `src/jobs/staleShiftCleanup.ts` | Auto-closes shifts open >16h (sets clockOut = clockIn+8h) |
| Weekly hours report | Mon 8:00 AM Atlantic | `src/jobs/weeklyHoursReport.ts` | Emails previous week's per-employee hours with overtime flags |

### Employee Clock In/Out

Employee time tracking via PIN-based identification on the POS dashboard.

| Component | Details |
|---|---|
| **Models** | `Employee` (name, pinHash, active), `TimeEntry` (employeeId, clockIn, clockOut) |
| **PIN storage** | scrypt hash via `authService.hashPassword()` — same as user passwords |
| **API routes** | `backend/src/routes/employees.ts` (CRUD), `backend/src/routes/timeEntries.ts` (clock in/out/status) |
| **Dashboard** | "Clock In/Out" button → PIN pad modal (clock-modal.tsx) |
| **Admin view** | Time Management page (`/pos/time-management`) — Active, Daily Log, Employees tabs |
| **Shift report** | Daily email at 11 PM Atlantic via `shiftReportScheduler.ts` |

**Flow:**
```
Admin logs in (email/pw) → POS dashboard
Staff taps "Clock In/Out" → enters PIN → check status → clock in or out
Multiple employees can be clocked in simultaneously
```

> **Security note:** Admin login (email/password) secures the POS session. PIN is used only for employee identification (time tracking), not authentication.

### Versioning

- **Backend:** `backend/VERSION.txt` (current: 1.0.0)
- **POS (web):** `pos/VERSION.txt` (current: 1.0.0)

---

## Logging

### Architecture

Production logging uses **pino** with dual output:

```
Backend Container
  └─ pino logger
       ├─ stdout (JSON) → Docker json-file driver (lost on redeploy)
       └─ /app/logs/app.log → mounted to host /var/log/kgolf/app.log (persistent)
```

### Log Location

| Location | Path | Survives Redeploy? |
|---|---|---|
| **Container stdout** | `docker logs k-golf-backend-1` | ❌ No — lost when container is replaced |
| **Persistent file** | `/var/log/kgolf/app.log` on host | ✅ Yes — volume-mounted from container |
| **Rotated archives** | `/var/log/kgolf/app.log-YYYY-MM-DD.gz` | ✅ Yes — 30 days retention |

### How to Read Logs

```bash
# SSH into prod server
ssh root@147.182.215.135

# --- Live / Recent logs ---
# Tail live container output (current session only)
docker logs --tail 100 k-golf-backend-1

# Follow live logs
docker logs -f k-golf-backend-1

# --- Persistent logs (survives deployments) ---
# View current log file
cat /var/log/kgolf/app.log

# Tail persistent log
tail -100 /var/log/kgolf/app.log

# Follow persistent log in real-time
tail -f /var/log/kgolf/app.log

# --- Searching logs ---
# Find errors
grep '"level":50' /var/log/kgolf/app.log

# Find warnings
grep '"level":40' /var/log/kgolf/app.log

# Search by module (e.g. email, booking-report-scheduler)
grep 'booking-report-scheduler' /var/log/kgolf/app.log

# Search in rotated (compressed) logs
zgrep 'error' /var/log/kgolf/app.log-2026-03-17.gz

# Count emails sent today
grep 'email sent' /var/log/kgolf/app.log | wc -l

# Find all requests to a specific endpoint
grep '/api/bookings' /var/log/kgolf/app.log | tail -20
```

### Pino Log Levels

| Level | Number | Meaning |
|---|---|---|
| `trace` | 10 | Very verbose debugging |
| `debug` | 20 | Debug information |
| `info` | 30 | Normal operations (default) |
| `warn` | 40 | Something unexpected but recoverable |
| `error` | 50 | Something failed |
| `fatal` | 60 | App is crashing |

### Log Rotation Config

- **Config file:** `/etc/logrotate.d/kgolf` on the prod server
- **Schedule:** Daily rotation
- **Retention:** 30 days
- **Compression:** gzip (delayed by 1 day via `delaycompress`)
- **Method:** `copytruncate` — no app restart needed
- **Max disk usage:** ~150 MB (30 days × ~5 MB/day at current traffic)

### Configuration

- **Log level:** Set `LOG_LEVEL` env var (default: `info`)
- **Log directory:** Set `LOG_DIR` env var (default: `/app/logs`)
- **Logger source:** `backend/src/lib/logger.ts`
- **Volume mount:** `docker-compose.release.yml` maps `/var/log/kgolf:/app/logs`

---

## Testing

### Unit Tests (Jest)

Located in `backend/tests/unit/`. Pure function tests — no database required.

```bash
cd backend && npx jest                     # Run all unit tests
cd backend && npx jest -- --watch          # Watch mode
cd backend && npx jest pricing.test.ts     # Run specific file
```

- **Config:** `backend/jest.config.js` (ts-jest, 70% coverage threshold)
- **Pattern:** Mirror functions locally, test with describe/it blocks
- **Files:** `pricing.test.ts` (tax/price calc), `phone.test.ts` (phone normalization), `tax-distribution.test.ts` (split payment rounding), `clock-in-out.test.ts` (employee PIN/clock validation)

### E2E Tests (Playwright)

Located in `e2e-tests/`. Requires local backend (port 8080) + frontend (port 5173) running.

```bash
npx playwright test                        # Run all e2e tests
npx playwright test 04-payment-flow        # Run specific suite
npx playwright test --headed               # Run with browser visible
```

- **Config:** `playwright.config.ts`
- **Helpers:** `e2e-tests/helpers.ts` — login functions, booking creation (API + UI), menu item constants
- **Global setup:** `e2e-tests/global-setup.ts` — seeds DB, verifies health endpoints
- **Naming:** `NN-description.spec.ts` (numbered for execution order)
- **Test users:** admin@konegolf.ca, staff@konegolf.ca, sales@konegolf.ca, test@example.com

### Writing Tests

- **Bug fixes:** Add a test that reproduces the bug before fixing
- **New features:** Add e2e tests for user-facing behavior, unit tests for business logic
- **Tax/pricing:** Always test rounding edge cases (split payments, odd cents)

---

## Halted / Do Not Reference

The following components are **halted indefinitely** until a decision is made to revive them. Do not reference, suggest, or modify anything related to these:

- **Electron POS** (`pos/apps/electron/`) — Replaced by web POS at pos.konegolf.ca. Do not update Electron files, release notes, or version tags.
- **Print Server** (`print-server/`) — Development paused. Do not suggest print server features or modify print server code.

If either is revived in the future, this section will be updated accordingly.
