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

### Versioning

- **Backend:** `backend/VERSION.txt` (current: 1.0.0)
- **POS (web):** `pos/VERSION.txt` (current: 1.0.0)

---

## Halted / Do Not Reference

The following components are **halted indefinitely** until a decision is made to revive them. Do not reference, suggest, or modify anything related to these:

- **Electron POS** (`pos/apps/electron/`) — Replaced by web POS at pos.konegolf.ca. Do not update Electron files, release notes, or version tags.
- **Print Server** (`print-server/`) — Development paused. Do not suggest print server features or modify print server code.

If either is revived in the future, this section will be updated accordingly.
