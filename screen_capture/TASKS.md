# Konegolf Score Capture — Task Tracker

> **Last updated**: 2026-03-17

---

## Auto-Update & Autostart

| # | Task | Status | File(s) |
|---|------|--------|---------|
| 1 | Create `run_hidden.vbs` — hidden launcher | ✅ Done | `run_hidden.vbs` |
| 2 | Create `updater.py` — GitHub Release auto-updater | ✅ Done | `updater.py` |
| 3 | Enhance `setup.bat` — add Task Scheduler + VBS creation | ✅ Done | `setup.bat` |
| 4 | Enhance `run.bat` — add `--background` + updater call | ✅ Done | `run.bat` |
| 5 | Create GitHub Actions release workflow | ✅ Done | `.github/workflows/screen-capture-release.yml` |
| 6 | Update `DEPLOYMENT_PLAN.md` | ✅ Done | `DEPLOYMENT_PLAN.md` |
| 7 | Test full flow on a real bay PC | ✅ Done | Tested on Bay 1: setup.bat, autostart, auto-update all working |

## Score Integration (from PLAN.md)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8 | Part 1: Score Capture (OCR + Drive upload) | ✅ Done | `capture.py` working |
| 9 | Part 2: Score Collection (POS Integration) | ⬜ TODO | Backend ingest endpoint exists, capture.py submission not wired |
| 10 | Part 3: Customer Connection | ⬜ TODO | Player identification, booking matching |
| 11 | Part 4: Auto-Deploy to Bay PCs | ✅ Done | Auto-update + autostart fully tested on Bay 1 (items 1-7) |
| 12 | Part 5: Remote Monitoring | ⬜ TODO | Heartbeat thread, backend endpoint, admin dashboard |
| 13 | Part 6: Bay Health Check | ⬜ TODO | Stuck detection (frozen screen), alerts |

## Remote Monitoring & Health Check (Parts 5-6)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 16 | Add heartbeat thread to `capture.py` | ⬜ TODO | Background daemon thread, POST every 60s |
| 17 | Add `read_recent_logs()` helper | ⬜ TODO | Tail last 50 lines from log file |
| 18 | Track shared state dict in capture loop | ⬜ TODO | status, captures_today, errors_today, etc. |
| 19 | Add `POST /api/bays/heartbeat` endpoint | ⬜ TODO | Backend receives bay status |
| 20 | Add `GET /api/bays` endpoint | ⬜ TODO | Returns latest heartbeat per bay (FE polls every 30s) |
| 21 | Add BayHeartbeat Prisma model + migration | ⬜ TODO | Database schema for heartbeat storage |
| 22 | Build bay status dashboard (`/admin/bays`) | ⬜ TODO | 🟢🟡🔴 status per bay, log viewer, polls GET /api/bays every 30s |
| 23 | Add stuck detection (frozen screen) | ⬜ TODO | Compare consecutive frames, alert after 3+ min |
| 24 | (Future) Upgrade to WebSocket push | ⬜ TODO | socket.io broadcast on heartbeat — only if polling feels too slow |

## Backend

| # | Task | Status | Notes |
|---|------|--------|-------|
| 14 | Harden backend deployment | ⬜ TODO | Clean up env handling, docs, obsolete paths |
| 15 | Rename k-golf → konegolf in backend/workflows | ⬜ Low Priority | Functional impact is minimal |

## Email Scorecard to Booking Owner

| # | Task | Status | Notes |
|---|------|--------|-------|
| 25 | Choose email service | ⬜ TODO | SendGrid recommended (free: 100/day) |
| 26 | Add email field to Customer/User model | ⬜ TODO | If not already present |
| 27 | Create email template | ⬜ TODO | Minimal HTML with screenshot image attached |
| 28 | Add email sending after ingest + booking match | ⬜ TODO | Depends on Part 2 (score ingest) |
| 29 | Add config flag to enable/disable email | ⬜ TODO | Per-environment toggle |

## Admin Push Notification (Low Confidence)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 30 | Add socket.io emit on NEEDS_REVIEW scores | ⬜ TODO | Backend emits 'score:needs-review' event |
| 31 | Add toast notification to POS frontend | ⬜ TODO | Shows bay #, issue, link to review |
| 32 | Add notification badge on score review nav | ⬜ TODO | Counter of pending reviews |
| 33 | Add optional sound alert | ⬜ TODO | Configurable on/off |

## Konegolf Tag System (Player Identification)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 34 | Add PlayerTag + PlayerAlias Prisma models | ⬜ TODO | Migration for tag + alias tables |
| 35 | Build tag generation API (`POST /api/tags`) | ⬜ TODO | Name prefix + unique number |
| 36 | Build tag lookup API (`GET /api/tags/:tag`) | ⬜ TODO | Used by ingest pipeline + check-in |
| 37 | Add tag-based matching to score ingest | ⬜ TODO | Highest priority in matching pipeline |
| 38 | Add alias learning on manual staff linking | ⬜ TODO | Auto-creates PlayerAlias entries |
| 39 | Build QR check-in mobile page (`/checkin?bay=N`) | ⬜ TODO | Phone lookup → seat pick → show tag |
| 40 | Build customer score history page | ⬜ TODO | `/admin/customers/:id/scores` |
| 41 | Print QR code stickers for each bay | ⬜ TODO | Physical setup at the shop |

## Score Data Analysis

| # | Task | Status | Notes |
|---|------|--------|-------|
| 42 | Create `analyze_scores.py` | ✅ Done | Downloads from Drive + analyzes confidence, names, scores, courses |
| 43 | Run analysis on real collected data | ⬜ TODO | `python analyze_scores.py --download` |
