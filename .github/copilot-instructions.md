# GitHub Copilot Instructions

> This file is auto-loaded by GitHub Copilot in VS Code.
> Full project reference lives in `PROJECT_GUIDE.md` at the repo root — read it for details.

## Quick Reference

- **Task tracking:** Always update `TASKS.md` after every task completion. Never touch the "Personal note (Do not touch)" section.
- **Docs:** Do not create new markdown files unless explicitly requested. Prefer visual explanations inline.
- **Markdown maintenance:** When planning or implementing changes to `screen_capture/`, always update ALL related markdown files to keep them in sync:
  - `screen_capture/TASKS.md` — Update task status, add new tasks
  - `screen_capture/DEPLOYMENT_PLAN.md` — Update architecture, flows, implementation status
  - `screen_capture/README.md` — Update file structure, setup instructions, version history
  - `screen_capture/PLAN.md` — Update part status if a major milestone is completed
  - Root `TASKS.md` — Update if the change affects the broader project
  If a planning or implementation session touches any of these docs, check all of them before committing.
- **Schema changes:** When modifying `backend/prisma/schema.prisma`, always update:
  - `docs/database_schema_explanation.md` — Quick Column Reference tables
  - `docs/bank_reconciliation_investigation.md` — Schema Reference section (if Invoice/Booking/User/Payment changed)
- **Git:** Use standard git commands with conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Do not use MCP git tools unless asked.
- **Testing:** When adding new features or fixing bugs, write tests:
  - **Unit tests** (`backend/tests/unit/`): For pure logic — tax calculation, pricing, validation. Use Jest with `ts-jest`. Mirror function locally if testing pure algorithms.
  - **E2E tests** (`e2e-tests/`): For user-facing flows — booking creation, orders, payments, role access. Use Playwright with helpers from `helpers.ts`. Name files with `NN-description.spec.ts` pattern.
  - Run unit tests: `cd backend && npx jest`
  - Run e2e tests: `npx playwright test` (requires local backend + frontend running)
- **Commands:** Always explain terminal commands before running them.
- **Versioning:** `backend/VERSION.txt` and `pos/VERSION.txt`
- **Production:** `docker-compose.release.yml` (not `docker-compose.prod.yml`)
- **Prod logs:** Always use persistent log files, NOT `docker logs` (lost on redeploy):
  - `ssh root@147.182.215.135 "grep 'pattern' /var/log/kgolf/app.log"` — current day
  - `ssh root@147.182.215.135 "zgrep 'pattern' /var/log/kgolf/app.log-YYYY-MM-DD.gz"` — past days (30-day retention)
- **Deprecated:** Electron POS — use web POS at pos.konegolf.ca instead

## Production Quick Access

- **SSH:** `ssh root@147.182.215.135`
- **Domain:** konegolf.ca / pos.konegolf.ca
- **DB:** `kgolf-postgres` → `kgolf_app` (user: `kgolf`, tz: America/Halifax)
- **Prod psql:** `ssh root@147.182.215.135 "docker exec -it kgolf-postgres psql -U kgolf -d kgolf_app"`

For full details, see `PROJECT_GUIDE.md`.
