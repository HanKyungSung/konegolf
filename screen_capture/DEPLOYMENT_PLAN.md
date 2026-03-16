# Konegolf Score Capture — Deployment & Auto-Update Plan

> **Last updated**: Session active
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

1. **`run_hidden.vbs`** — Create the VBS hidden launcher (no dependencies)
2. **`updater.py`** — Build the GitHub release checker/downloader (no dependencies)
3. **`setup.bat`** — Enhance with Task Scheduler registration (depends on VBS being defined)
4. **`run.bat`** — Enhance with `--background` flag and updater call (depends on updater.py)
5. **`screen-capture-release.yml`** — GitHub Actions release workflow (depends on updater.py existing)
6. **Test on a real bay PC** — Validate the full flow end to end
