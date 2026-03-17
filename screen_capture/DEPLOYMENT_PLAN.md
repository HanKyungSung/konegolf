# Konegolf Score Capture — Deployment & Auto-Update Plan

> **Last updated**: 2026-03-16
> **Approach**: Enhance existing `setup.bat` / `run.bat` — no Inno Setup installer

---

## Problem

Setting up a new bay PC currently requires:
1. Copy files manually
2. Edit `config.json`
3. Create a desktop shortcut
4. Configure shortcut to run minimized
5. Repeat for every PC

This is slow, error-prone, and means every code update requires remoting into all 4 bay PCs.

## Goals

1. **Auto-update**: bay PCs pull new versions on startup without remoting in
2. **Autostart**: script runs hidden on Windows login without manual shortcuts

## Approach

Enhance the existing `setup.bat` and `run.bat` instead of building a full `.exe` installer. This is simpler to maintain and aligns with the existing `PLAN.md` Part 4 design.

---

## Current State

### What works today

| Component | Status |
|-----------|--------|
| `capture.py` OCR + Google Drive upload | ✅ Working |
| `setup.bat` installs Python deps | ✅ Working |
| `run.bat` finds Python + runs capture | ✅ Working |
| `config.json.example` template | ✅ Exists |
| `VERSION.txt` (`2.0.0`) | ✅ Exists |
| Backend `/api/scores/ingest` | ✅ Working |
| GitHub Actions backend deploy | ✅ Working |

### What's missing

| Feature | Status |
|---------|--------|
| Task Scheduler autostart registration | ❌ Manual shortcut |
| Hidden/minimized launch | ❌ Manual config |
| Auto-update from GitHub Releases | ❌ Not implemented |
| Release packaging workflow | ❌ Not implemented |

---

## Implementation Plan

### Files to change

| File | Action | Purpose |
|------|--------|---------|
| `screen_capture/setup.bat` | **Enhance** | Add Task Scheduler registration + VBS creation |
| `screen_capture/run.bat` | **Enhance** | Add `--background` flag + updater call |
| `screen_capture/run_hidden.vbs` | **New** | Hidden launcher for autostart |
| `screen_capture/updater.py` | **New** | GitHub Release checker + downloader |
| `.github/workflows/screen-capture-release.yml` | **New** | Release packaging workflow |

---

### 1. Enhance `setup.bat` — Add autostart registration

**Current behavior**: installs pip deps + creates `captures/` folder.

**New steps added**:

```
[1/5] Upgrading pip...
[2/5] Installing dependencies...
[3/5] Creating captures folder...
[4/5] Creating hidden launcher (run_hidden.vbs)...    ← NEW
[5/5] Registering autostart with Task Scheduler...    ← NEW
```

The Task Scheduler entry:
- **Task name**: `KonegolfScoreCapture`
- **Trigger**: on user logon (`/sc onlogon`)
- **Action**: `wscript.exe "<install_path>\run_hidden.vbs"`
- **Why `onlogon` not `onstart`**: capture needs the live desktop session for DXGI screen capture

New `--no-pause` flag for non-interactive use (e.g., called by updater after an update).

---

### 2. Create `run_hidden.vbs` — Hidden launcher

A tiny VBScript that launches `run.bat --background` with **no visible window**:

```vbscript
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c run.bat --background", 0, False
```

- `0` = hidden window style
- `False` = don't wait for completion
- This replaces the old "create shortcut → set to minimized" manual step

---

### 3. Enhance `run.bat` — Add background mode + updater

**Current behavior**: finds Python → auth check → runs `capture.py` → pause.

**New flow**:

```
run.bat [--background]
  │
  ├─ Find Python (unchanged)
  │
  ├─ If --background mode:
  │    ├─ Skip pause on exit
  │    └─ If token.json missing → exit silently (don't try interactive auth)
  │
  ├─ Call updater.py                          ← NEW
  │    ├─ Exit code 0 → no update, continue
  │    ├─ Exit code 10 → update applied, RESTART run.bat
  │    └─ Any other exit → updater failed, continue anyway
  │
  ├─ Auth check (unchanged, unless --background)
  │
  └─ Run capture.py
```

**Why `--background` skips auth when `token.json` is missing**: on first setup, the user must run `run.bat` manually (no `--background`) so the browser opens for Google OAuth. After that, `token.json` exists and background mode works silently.

---

### 4. Create `updater.py` — Auto-update via GitHub Releases API

This is the core of the auto-update system.

#### What is GitHub Releases API?

GitHub Releases is a built-in feature of every GitHub repo. When you push a git tag, a GitHub Actions workflow can automatically:
1. Create a "Release" (a named version with release notes)
2. Attach downloadable files (called "assets") to that release

The API endpoint to check the latest release:
```
GET https://api.github.com/repos/HanKyungSung/konegolf/releases/latest
```

This returns JSON including the release tag and download URLs. **No API key needed** for public repos. Rate limit: 60 requests/hour per IP (plenty for 4 bay PCs checking once on startup).

#### How `updater.py` works

```
updater.py
  │
  ├─ Step 1: Read local VERSION.txt → e.g., "2.0.0"
  │
  ├─ Step 2: HTTP GET GitHub Releases API
  │    GET https://api.github.com/repos/HanKyungSung/konegolf/releases/latest
  │
  │    Response:
  │    {
  │      "tag_name": "screen-capture-v2.1.0",
  │      "assets": [{
  │        "name": "konegolf-screen-capture-update.zip",
  │        "browser_download_url": "https://github.com/.../konegolf-screen-capture-update.zip"
  │      }]
  │    }
  │
  ├─ Step 3: Compare versions
  │    local "2.0.0" vs remote "2.1.0" → NEWER! proceed to update
  │    (if same or older → exit code 0, no update needed)
  │
  ├─ Step 4: Download the zip to a temp folder
  │
  ├─ Step 5: Extract zip to temp folder
  │
  ├─ Step 6: Copy new files over old files, but SKIP:
  │    ❌ config.json         (bay number, settings)
  │    ❌ token.json           (Google auth token)
  │    ❌ client_secret.json   (Google OAuth credentials)
  │    ❌ captures/            (saved screenshots)
  │    ❌ *.log                (log files)
  │
  ├─ Step 7: Update VERSION.txt to "2.1.0"
  │
  └─ Step 8: Exit with code 10 (signal to run.bat: "restart me")
```

#### Error handling

| Scenario | What happens |
|----------|--------------|
| No internet on bay PC | updater.py catches error, exits 0. capture.py runs with current version |
| GitHub API rate limit (60/hr) | updater.py catches 403, exits 0. Continues with current version |
| Download fails mid-way | Catches error, does NOT overwrite any files. Continues with current |
| Bad zip / corrupt download | Validates before extracting. Falls back to current version |
| No new release exists | Versions match, skip update, exits 0 |
| GitHub repo slug changed | Tries both `HanKyungSung/konegolf` and `HanKyungSung/k-golf` |

#### Config preservation rules

| File | On update |
|------|-----------|
| `capture.py` | ✅ Overwritten |
| `updater.py` | ✅ Overwritten |
| `requirements.txt` | ✅ Overwritten |
| `setup.bat` | ✅ Overwritten |
| `run.bat` | ✅ Overwritten |
| `run_hidden.vbs` | ✅ Overwritten |
| `config.json.example` | ✅ Overwritten (reference only) |
| `VERSION.txt` | ✅ Updated to new version |
| `config.json` | ❌ **Never overwritten** |
| `token.json` | ❌ **Never overwritten** |
| `client_secret.json` | ❌ **Never overwritten** |
| `captures/` | ❌ **Never overwritten** |
| `*.log` | ❌ **Never overwritten** |

---

### 5. Create GitHub Actions release workflow

**File**: `.github/workflows/screen-capture-release.yml`

#### How releases are triggered

```
Developer:
  $ vim screen_capture/capture.py    # make changes
  $ echo "2.1.0" > screen_capture/VERSION.txt
  $ git add -A && git commit -m "Fix OCR detection bug"
  $ git tag screen-capture-v2.1.0
  $ git push && git push --tags

  That's it. GitHub Actions takes over.
```

#### What the workflow does

```yaml
on:
  push:
    tags: ['screen-capture-v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - Checkout the tagged commit
      - cd screen_capture/
      - Create zip with app files (excluding config/auth/captures)
      - Create GitHub Release named after the tag
      - Attach zip as release asset
```

**Why `ubuntu-latest`?** We're just zipping Python files. No Windows build tools needed. Fast and free.

#### What's in the zip

**Included**:
- `capture.py`
- `updater.py`
- `run.bat`
- `run_hidden.vbs`
- `setup.bat`
- `requirements.txt`
- `config.json.example`
- `VERSION.txt`

**Excluded** (never packaged):
- `config.json`
- `token.json`
- `client_secret.json`
- `captures/`
- `*.log`

---

## Full Flow Diagrams

### Developer releases an update

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEVELOPER                                │
│                                                                 │
│  1. Edit files (capture.py, etc.)                              │
│  2. Bump VERSION.txt (e.g., 2.0.0 → 2.1.0)                   │
│  3. git tag screen-capture-v2.1.0 && git push --tags           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ tag push triggers workflow
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GITHUB ACTIONS (automatic, ~30s)               │
│                                                                 │
│  1. Checkout tagged commit                                      │
│  2. Zip screen_capture app files                               │
│  3. Create GitHub Release "screen-capture-v2.1.0"              │
│  4. Attach konegolf-screen-capture-update.zip                  │
│                                                                 │
│  Result: zip available at                                       │
│  github.com/HanKyungSung/konegolf/releases/latest              │
└─────────────────────────────────────────────────────────────────┘
```

### Bay PC auto-updates on startup

```
┌─────────────────────────────────────────────────────────────────┐
│                    BAY PC (on login/reboot)                      │
│                                                                 │
│  Windows login                                                  │
│       │                                                         │
│       ▼                                                         │
│  Task Scheduler triggers "KonegolfScoreCapture"                 │
│       │                                                         │
│       ▼                                                         │
│  wscript.exe run_hidden.vbs  (hidden window)                    │
│       │                                                         │
│       ▼                                                         │
│  run.bat --background                                           │
│       │                                                         │
│       ├─ Find Python ✓                                          │
│       │                                                         │
│       ├─ Call updater.py                                        │
│       │    │                                                    │
│       │    ├─ Read VERSION.txt → "2.0.0"                       │
│       │    ├─ GET GitHub API → latest is "2.1.0"               │
│       │    ├─ Download zip                                      │
│       │    ├─ Extract, copy files (preserve config)             │
│       │    └─ Exit code 10 (update applied!)                   │
│       │                                                         │
│       ├─ Exit code 10 detected → RESTART run.bat               │
│       │                                                         │
│       ├─ (Second run) updater.py → versions match → skip       │
│       │                                                         │
│       ├─ token.json exists? → yes → skip auth                  │
│       │                                                         │
│       └─ Run capture.py (v2.1.0) ← NEW VERSION RUNNING ✓      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### First-time setup on a new PC

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEW BAY PC SETUP                              │
│                                                                 │
│  Step 1: Copy screen_capture folder to PC (or clone repo)      │
│                                                                 │
│  Step 2: Run setup.bat                                          │
│          → Installs Python dependencies                         │
│          → Creates captures/ folder                             │
│          → Creates run_hidden.vbs                               │
│          → Registers Task Scheduler autostart                   │
│                                                                 │
│  Step 3: Copy client_secret.json to the folder                 │
│          (Google OAuth credentials, provisioned separately)     │
│                                                                 │
│  Step 4: Edit config.json                                       │
│          → Set bay_number (1, 2, 3, or 4)                      │
│          → Set google_drive_folder_id                           │
│                                                                 │
│  Step 5: Run run.bat (manually, NOT --background)               │
│          → Browser opens for Google OAuth                       │
│          → Log in with konegolf account                         │
│          → token.json created ✓                                │
│          → capture.py starts running                            │
│                                                                 │
│  Step 6: Reboot to verify                                       │
│          → Script auto-starts hidden ✓                         │
│          → Future updates download automatically ✓              │
│                                                                 │
│  Done! No more manual shortcuts or minimize tweaks.             │
└─────────────────────────────────────────────────────────────────┘
```

### Timeline example — pushing a real update

```
Day 1 morning:
  You fix a bug in capture.py

  $ vim screen_capture/capture.py           # fix the bug
  $ echo "2.1.0" > screen_capture/VERSION.txt
  $ git add -A && git commit -m "Fix OCR detection bug"
  $ git tag screen-capture-v2.1.0
  $ git push && git push --tags

  → GitHub Actions runs (~30 seconds)
  → Release v2.1.0 appears with zip attached
  → You're done. No remoting into bay PCs.

Day 1 evening (or next day):
  Bay PCs reboot (or someone logs in)

  → Task Scheduler triggers run_hidden.vbs
  → run.bat calls updater.py
  → updater.py: "local=2.0.0, remote=2.1.0 → updating!"
  → Downloads zip, extracts, preserves config/auth
  → run.bat restarts with new code
  → capture.py v2.1.0 is now running

  All 4 bays updated automatically ✓
```

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Installer approach | Enhanced `setup.bat` | Simpler than Inno Setup, easier to maintain |
| Autostart method | Task Scheduler (`onlogon`) | Reliable, hidden, survives reboots. `onlogon` (not `onstart`) because capture needs the desktop session for DXGI |
| Hidden launch | VBScript wrapper | `wscript.exe` can run commands with window style 0 (hidden) |
| Release runner | `ubuntu-latest` | Just zipping files, no Windows tools needed. Fast and free |
| Update check | GitHub Releases API | Free, no auth needed for public repos, already used by print-server |
| Failure handling | Graceful fallback | If update check fails for any reason, capture runs with current version |
| Background auth | Skip if no token.json | First auth must be manual (browser needed). Hidden autostart exits silently if not yet authenticated |
| Repo slug | Try both `konegolf` and `k-golf` | Handles GitHub rename transition period |

---

## Implementation Order

1. ✅ **`run_hidden.vbs`** — Create the VBS hidden launcher (no dependencies)
2. ✅ **`updater.py`** — Build the GitHub release checker/downloader (no dependencies)
3. ✅ **`setup.bat`** — Enhance with Task Scheduler registration (depends on VBS being defined)
4. ✅ **`run.bat`** — Enhance with `--background` flag and updater call (depends on updater.py)
5. ✅ **`screen-capture-release.yml`** — GitHub Actions release workflow (depends on updater.py existing)
6. ✅ **Test on a real bay PC** — Full flow validated on Bay 1 (2026-03-17):
   - `setup.bat` installs deps, Task Scheduler needs admin
   - Autostart on reboot works (hidden window via VBS)
   - Auto-update: updater detected v2.0.1 > v1.0.0, downloaded zip, applied update, preserved config
   - SSL workaround verified (bay PCs lack root CAs)

---

## Planned: Heartbeat & Remote Monitoring

### Architecture

```
capture.py process (single Python process on each bay PC)
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Main Thread                    Heartbeat Thread (daemon)   │
│  ─────────────                  ──────────────────────────  │
│                                                             │
│  ┌──────────────────┐           ┌──────────────────────┐   │
│  │ Capture Loop     │           │ Every 60 seconds:    │   │
│  │                  │           │                      │   │
│  │ 1. Grab frame    │  reads    │ 1. Read shared state │   │
│  │ 2. Run OCR       │ ──────►  │ 2. Read last 50 log  │   │
│  │ 3. Detect score  │  state    │    lines from file   │   │
│  │ 4. Upload result │  dict     │ 3. POST heartbeat    │   │
│  │ 5. Sleep 0.5s    │           │    to backend server │   │
│  │ 6. Repeat        │           │ 4. Sleep 60s         │   │
│  └──────────────────┘           └──────────────────────┘   │
│                                                             │
│  state = {                                                  │
│    "status": "watching",                                    │
│    "captures_today": 5,                                     │
│    "errors_today": 0,                                       │
│    "last_capture_at": "2026-03-10T08:14:02",               │
│    "simulator_running": true                                │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ POST /api/bays/heartbeat (every 60s)
         │ ~1 KB JSON payload
         ▼
┌──────────────────────────┐
│  Backend Server          │
│  ┌────────────────────┐  │
│  │ Bay Status Table    │  │
│  │ Bay 1: 🟢 12s ago  │  │
│  │ Bay 2: 🟢 8s ago   │  │
│  │ Bay 3: 🔴 2h ago   │  │
│  │ Bay 4: 🟡 5s ago   │  │
│  └────────────────────┘  │
│                          │
│  Admin: /admin/bays      │
└──────────────────────────┘
```

### Will This Affect the Golf Simulator?

**Short answer: No.** Here's why:

```
Resource comparison — Bay PC (Intel i5 + RTX 3060, 16GB RAM)

┌────────────────────────┬──────────────────┬──────────────────┐
│ Resource               │ Golf Simulator   │ Heartbeat Thread │
├────────────────────────┼──────────────────┼──────────────────┤
│ CPU                    │ 40-70% (GPU heavy│ ~0.01%           │
│                        │ + physics)       │ (one tiny HTTP   │
│                        │                  │  POST per minute)│
├────────────────────────┼──────────────────┼──────────────────┤
│ Memory                 │ 2-4 GB           │ ~0 MB extra      │
│                        │                  │ (reuses existing │
│                        │                  │  Python process) │
├────────────────────────┼──────────────────┼──────────────────┤
│ Network                │ ~0 (offline game)│ ~1 KB every 60s  │
│                        │                  │ (smaller than a  │
│                        │                  │  single ping)    │
├────────────────────────┼──────────────────┼──────────────────┤
│ GPU                    │ 80-100%          │ 0%               │
│                        │ (rendering game) │ (no GPU use)     │
├────────────────────────┼──────────────────┼──────────────────┤
│ Disk I/O               │ Occasional loads │ Read 50 lines    │
│                        │                  │ from log file    │
│                        │                  │ (negligible)     │
└────────────────────────┴──────────────────┴──────────────────┘
```

**The heartbeat is essentially invisible:**
- Runs once per **60 seconds** (not per frame)
- Sends ~1 KB of JSON (status + 50 log lines)
- No GPU involvement — pure Python dict read + HTTP POST
- Uses a daemon thread — if it crashes, capture keeps running
- The capture loop itself (OCR every 0.5s) is already far heavier than the heartbeat

**For comparison**, the existing capture loop already does:
- DXGI screen grab (GPU read) — every 0.5s
- PaddleOCR inference (CPU/GPU) — every 0.5s
- Google Drive upload (network) — on each detection

The heartbeat (1 tiny HTTP call per minute) is a rounding error next to that.

### What the Heartbeat Sends

```json
{
  "bay_number": 1,
  "version": "2.1.0",
  "status": "watching",
  "uptime_seconds": 3600,
  "last_capture_at": "2026-03-10T08:14:02.000Z",
  "captures_today": 5,
  "errors_today": 0,
  "simulator_running": true,
  "recent_logs": [
    "08:14:03 INFO  Player: MATT12 | Score: 92",
    "08:14:02 INFO  COMPLETED SCORECARD DETECTED!",
    "..."
  ]
}
```

### Failure Behavior

| Scenario | What happens |
|----------|--------------|
| Backend server is down | Heartbeat silently fails. Capture keeps running. |
| Network disconnected | Heartbeat times out (10s). Capture keeps running. |
| Heartbeat thread crashes | Daemon thread dies silently. Capture keeps running. |
| Backend sees no heartbeat for 2+ min | Dashboard shows bay as 🔴 Offline |

**Key principle**: heartbeat is fire-and-forget. It never blocks or interrupts the capture loop.

### Status Values

| Status | Meaning |
|--------|---------|
| `starting` | Script just launched, initializing |
| `waiting` | Waiting for simulator process to start |
| `watching` | Capture loop running, monitoring screen |
| `cooldown` | Just detected a scorecard, waiting before next capture |
| `stuck` | Screen frozen for 3+ minutes (Part 6: Health Check) |
| `error` | Something went wrong |

### Implementation Status

- [ ] Add heartbeat thread to capture.py
- [ ] Add `read_recent_logs()` helper
- [ ] Track shared state dict in capture loop
- [ ] Add `POST /api/bays/heartbeat` backend endpoint
- [ ] Add `GET /api/bays` endpoint for dashboard
- [ ] Add BayHeartbeat Prisma model
- [ ] Build bay status dashboard page
- [ ] Add stuck detection (Part 6)

### How Heartbeats Reach the Dashboard (Frontend)

Two approaches — start with polling, upgrade to WebSocket later if needed.

#### Option A: Polling (recommended to start)

```
Bay PCs                      Backend                        Admin Dashboard (FE)
                                                            (browser at /admin/bays)

┌──────┐  POST /api/bays/   ┌──────────────────┐           ┌──────────────────┐
│Bay 1 │──── heartbeat ────►│                  │           │                  │
│      │     every 60s      │  1. Validate      │  GET      │  setInterval     │
└──────┘                    │     payload       │ /api/bays │  every 30s:      │
┌──────┐  POST /api/bays/   │                  │◄──────────│                  │
│Bay 2 │──── heartbeat ────►│  2. Upsert to DB  │           │  fetch('/api/    │
│      │     every 60s      │     (latest per   │  JSON     │    bays')        │
└──────┘                    │      bay)         │──────────►│                  │
┌──────┐  POST /api/bays/   │                  │           │  Re-render       │
│Bay 3 │──── heartbeat ────►│  3. Return 200 OK │  [{bay:1, │  status table    │
│      │     every 60s      │                  │  status:   │                  │
└──────┘                    │                  │  "watching"│  🟢 Bay 1 12s ago│
┌──────┐  POST /api/bays/   │                  │  ...},     │  🟢 Bay 2 8s ago │
│Bay 4 │──── heartbeat ────►│                  │  ...]      │  🔴 Bay 3 2h ago │
│      │     every 60s      │                  │           │  🟡 Bay 4 5s ago │
└──────┘                    └──────────────────┘           └──────────────────┘
```

**How it works:**
1. Bay PCs POST heartbeat every 60s → backend saves to DB (one row per bay, upserted)
2. Dashboard FE polls `GET /api/bays` every 30s → backend returns latest heartbeat per bay
3. FE renders the status table with 🟢🟡🔴 indicators

**Pros:** Dead simple. No WebSocket. Just a REST endpoint and `setInterval`.
**Cons:** Dashboard data is up to 30s stale — totally fine for monitoring 4 bays.

#### Option B: WebSocket push (future upgrade)

```
Bay PCs                      Backend                        Admin Dashboard (FE)

┌──────┐  POST /api/bays/   ┌──────────────────┐  ws push  ┌──────────────────┐
│Bay 1 │──── heartbeat ────►│                  │──────────►│                  │
│Bay 2 │──── heartbeat ────►│  On each POST:    │  instant  │  socket.on(      │
│Bay 3 │──── heartbeat ────►│  1. Save to DB    │  event    │    'bay:update', │
│Bay 4 │──── heartbeat ────►│  2. Broadcast via │           │    (data) =>     │
└──────┘                    │     socket.io to  │           │    updateTable() │
                            │     all connected │           │  )               │
                            │     dashboard     │           │                  │
                            │     clients       │           │  Instant update  │
                            └──────────────────┘           └──────────────────┘
```

**How it works:**
1. Bay PCs POST heartbeat (same as Option A — bay PCs don't need WebSocket)
2. Backend saves to DB AND broadcasts to all connected dashboard WebSocket clients
3. FE updates instantly when a heartbeat arrives

**Pros:** Real-time. Dashboard updates the moment a bay reports in.
**Cons:** Requires socket.io setup (though backend already uses it for print-server).

#### Decision

**Start with Option A (polling).** Reasons:
- Simpler to implement and debug
- 30s staleness is perfectly acceptable for bay monitoring
- Bay PCs only need HTTP (no WebSocket client needed in Python)
- Can upgrade to Option B later without changing the bay PC side at all
- The backend already has socket.io — adding broadcast is a one-liner upgrade when needed

---

## Planned: Email Scorecard to Booking Owner

### Goal

After a scorecard is captured, automatically email the screenshot image to the person who booked the bay. No text summary — just the image.

### Flow

```
Bay PC captures scorecard
       │
       ▼
POST /api/scores/ingest (screenshot + OCR data)
       │
       ▼
Backend:
  1. Save score + screenshot to DB (existing Part 2 flow)
  2. Auto-match to Booking via bay → room → time window
  3. Booking found?
       │
       ├─ Yes → Look up booker's email
       │         │
       │         ├─ Email exists → Send email with screenshot attached
       │         │                 Subject: "Your Konegolf scorecard — Bay 3"
       │         │
       │         └─ No email → Skip (log it)
       │
       └─ No booking match → Skip email (score still saved)
```

### Email Content

```
┌─────────────────────────────────────────┐
│  From: scores@konegolf.ca               │
│  To: customer@email.com                 │
│  Subject: Your Konegolf scorecard       │
│                                         │
│  ┌───────────────────────────────┐      │
│  │                               │      │
│  │   [Scorecard Screenshot]      │      │
│  │   (attached JPEG image)       │      │
│  │                               │      │
│  └───────────────────────────────┘      │
│                                         │
│  Thanks for playing at Konegolf!        │
│  Bay 3 · March 16, 2026                │
│                                         │
└─────────────────────────────────────────┘
```

### Dependencies

- Requires **Part 2 (Score Collection)** — ingest endpoint + booking auto-match
- Requires an email service (options: SendGrid, AWS SES, Nodemailer + SMTP)
- Requires customers to have email on file in the POS

### Implementation Steps

- [ ] Choose email service (SendGrid recommended — free tier: 100 emails/day)
- [ ] Add email field to Customer/User model if not present
- [ ] Create email template (minimal HTML with embedded screenshot)
- [ ] Add email sending logic after successful ingest + booking match
- [ ] Add config flag to enable/disable email notifications
- [ ] Test with a real booking

---

## Planned: Admin Push Notification on Low Confidence

### Goal

When OCR confidence is low (< 0.7), push a notification to the POS/admin dashboard so staff can review immediately — not wait until they check the score review page.

### Flow

```
Bay PC captures scorecard
       │
       ▼
POST /api/scores/ingest
       │
       ▼
Backend:
  1. Save score (status = NEEDS_REVIEW if confidence < 0.7)
  2. If NEEDS_REVIEW:
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │  Push notification to all connected POS clients  │
  │  via socket.io                                   │
  │                                                  │
  │  Event: 'score:needs-review'                     │
  │  Data: {                                         │
  │    bay: 3,                                       │
  │    captureId: "abc-123",                         │
  │    issue: "Low name confidence (0.45)",          │
  │    timestamp: "2026-03-16T14:30:00Z"             │
  │  }                                               │
  └──────────────────────────────────────────────────┘
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │  POS Dashboard (browser)                         │
  │                                                  │
  │  🔔 Toast notification:                         │
  │  ┌──────────────────────────────────────┐        │
  │  │ ⚠️ Bay 3: Score needs review         │        │
  │  │ Low name confidence (0.45)           │        │
  │  │ [View →]                             │        │
  │  └──────────────────────────────────────┘        │
  │                                                  │
  │  Clicking "View" opens score detail with         │
  │  screenshot side-by-side for correction          │
  └──────────────────────────────────────────────────┘
```

### Confidence Thresholds

| Confidence | Status | Action |
|------------|--------|--------|
| ≥ 0.7 for all fields | `ACTIVE` ✅ | No notification |
| < 0.7 for any field | `NEEDS_REVIEW` ⚠️ | Push notification to dashboard |
| Name unreadable (empty) | `NEEDS_REVIEW` ⚠️ | Push notification + flag "unreadable" |

### Dependencies

- Requires **Part 2 (Score Collection)** — confidence scoring in ingest
- Requires **socket.io** on backend (already exists for print-server)
- Frontend needs toast notification component

### Implementation Steps

- [ ] Add socket.io emit in score ingest when status = NEEDS_REVIEW
- [ ] Add toast notification component to POS frontend
- [ ] Add socket.io listener in POS dashboard for 'score:needs-review'
- [ ] Add notification badge/counter on score review nav item
- [ ] Add sound alert option (configurable)

---

## Planned: Konegolf Tag System (Player Identification)

### Goal

Give each player a unique, OCR-friendly tag (e.g., `MATT12`) they type into the simulator as their player name. The system reads it via OCR and **deterministically matches** it to a customer — no guessing, no staff work.

### How It Works

```
FIRST VISIT:
  ┌──────────────────────────────────────────────────────────┐
  │  Customer checks in (QR code at bay or staff assists)    │
  │       │                                                  │
  │       ▼                                                  │
  │  System generates tag: MATT12                            │
  │  (first name prefix + unique number)                     │
  │       │                                                  │
  │       ▼                                                  │
  │  "Your Konegolf Tag is MATT12.                          │
  │   Type this as your player name in the simulator!"       │
  │       │                                                  │
  │       ▼                                                  │
  │  Customer plays as "MATT12"                              │
  │       │                                                  │
  │       ▼                                                  │
  │  OCR reads "MATT12" → exact match → Matt Johnson ✅      │
  └──────────────────────────────────────────────────────────┘

RETURN VISIT:
  ┌──────────────────────────────────────────────────────────┐
  │  Customer types "MATT12" again                           │
  │       │                                                  │
  │       ▼                                                  │
  │  OCR reads → tag lookup → instant match ✅               │
  │  No staff, no QR, nothing. Just works.                   │
  └──────────────────────────────────────────────────────────┘

FORGOT TAG (types real name "matthew"):
  ┌──────────────────────────────────────────────────────────┐
  │  OCR reads "matthew" → no tag match                      │
  │       │                                                  │
  │       ▼                                                  │
  │  Alias lookup → "matthew" mapped to Matt Johnson         │
  │  from previous visit → still matched ✅                  │
  └──────────────────────────────────────────────────────────┘
```

### Tag Format

```
Format:    [NAME PREFIX][UNIQUE NUMBER]
Examples:  MATT12, DONNIE7, JPARK03, 민수42
Length:    4–10 characters
Charset:  A-Z, 0-9, Korean Hangul (OCR-friendly, no special chars)
```

**Why this format:**
- Short uppercase alphanumeric → near-perfect OCR accuracy
- The capture script already strips special chars: `re.sub(r'[^0-9A-Za-z가-힣]+', '', raw)`
- Fits in Golfzon's player name field
- Easy for customers to remember

### Matching Pipeline (on each score capture)

```
OCR extracts player name
       │
       ▼
  ┌─────────────┐
  │ Tag Lookup   │── match ──► Customer identified ✅ (confidence: 1.0)
  │ (PlayerTag)  │
  └──────┬──────┘
         │ no match
         ▼
  ┌─────────────┐
  │ Alias Lookup │── match ──► Customer identified ✅ (learned from history)
  │ (PlayerAlias)│
  └──────┬──────┘
         │ no match
         ▼
  ┌─────────────┐
  │ Booking Link │── match ──► Group identified ⚠️ (know group, not individual)
  │ (bay + time) │
  └──────┬──────┘
         │ no match
         ▼
     UNMATCHED 🔴 (staff reviews later)
```

### Dependencies

- Requires **Part 2 (Score Collection)** — score ingest + storage
- Requires customer records in DB (already exist in POS)
- QR check-in page is optional but recommended for tag generation

### Database Models

- `PlayerTag` — tag ↔ customer mapping (e.g., MATT12 → Matt Johnson)
- `PlayerAlias` — OCR name ↔ customer alias (e.g., "matthew" → Matt Johnson)
- Both already designed in detail in `PLAN.md` Part 3

### Implementation Steps

- [ ] Add PlayerTag + PlayerAlias Prisma models + migration
- [ ] Build tag generation API (`POST /api/tags`)
- [ ] Build tag lookup API (`GET /api/tags/:tag`)
- [ ] Add tag-based matching to score ingest pipeline (highest priority)
- [ ] Add alias learning: when staff links an OCR name to a customer, save alias
- [ ] Build QR check-in mobile page (`/checkin?bay=N`)
- [ ] Build customer score history page (`/admin/customers/:id/scores`)
- [ ] Print QR code stickers for each bay
