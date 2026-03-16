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
| 11 | Part 4: Auto-Deploy to Bay PCs | 🔧 In Progress | This task group (items 1-7) |
| 12 | Part 5: Remote Monitoring | ⬜ TODO | Heartbeats, health checks, dashboard |
| 13 | Part 6: Bay Health Check | ⬜ TODO | Hardware/software status reporting |

## Backend

| # | Task | Status | Notes |
|---|------|--------|-------|
| 14 | Harden backend deployment | ⬜ TODO | Clean up env handling, docs, obsolete paths |
| 15 | Rename k-golf → konegolf in backend/workflows | ⬜ Low Priority | Functional impact is minimal |
