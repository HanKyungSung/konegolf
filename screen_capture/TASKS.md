# Konegolf Score Capture — Task Tracker

> **Last updated**: 2026-03-16

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
| 7 | Test full flow on a real bay PC | ⬜ TODO | — |

## Score Integration (from PLAN.md)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8 | Part 1: Score Capture (OCR + Drive upload) | ✅ Done | `capture.py` working |
| 9 | Part 2: Score Collection (POS Integration) | ⬜ TODO | Backend ingest endpoint exists, capture.py submission not wired |
| 10 | Part 3: Customer Connection | ⬜ TODO | Player identification, booking matching |
| 11 | Part 4: Auto-Deploy to Bay PCs | ✅ Done | Auto-update + autostart implemented (items 1-6) |
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
