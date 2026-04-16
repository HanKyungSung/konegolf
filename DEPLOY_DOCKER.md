## Architecture Overview

**Current Deployment Model (as of 2025):**
- **Single Container Architecture**: One backend image that includes both the Express.js API server **and** the compiled React frontend static files
- **Multi-stage Docker Build**: 
  1. `backend-deps`: Install backend dependencies + Prisma
  2. `backend-build`: Compile TypeScript backend code
  3. `frontend-build`: Build React frontend into static files
  4. `runner`: Combine backend runtime + frontend static files in final image
- **Static File Serving**: Backend Express server serves frontend from `/dist/public`
- **Container Registry**: GitHub Container Registry (`ghcr.io/hankyungsung/kgolf-backend`)
- **Deployment**: CI/CD via GitHub Actions (`docker-deploy.yml`)

**Port Structure:**
- Backend exposes internal port `8080`
- Host maps to external port `8082` (`8082:8080`)
- Backend serves:
  - API endpoints at `/api/*`
  - Frontend static files at `/` (root)
  - Health check at `/health`

**No separate frontend container** - The old `frontend/Dockerfile` and `frontend/nginx.conf` have been removed.

## Recommended deployment steps (blue/green style)

1. Prep server
    - Install Docker Engine + Docker Compose v2 (details below)
    - Keep existing PM2 processes running for now (we'll cut over later)

    <details>
    <summary><strong>Install Docker & Compose v2 on Ubuntu (expand)</strong></summary>

    Why Compose v2: integrated with `docker` CLI (`docker compose`), faster (Go), new features (only v2 receives them), unified auth/context.

    Assumptions: Ubuntu 22.04/20.04, sudo user, no need to preserve legacy docker-compose v1.

    ```bash
    # Remove legacy packages (safe if absent)
    sudo apt-get remove -y docker docker-engine docker.io containerd runc docker-compose || true

    # Prereqs
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg lsb-release

    # Add Docker GPG key & repo
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Engine + CLI + Buildx + Compose plugin (this is Compose v2)
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Enable & start
    sudo systemctl enable --now docker

    # Add current user to docker group (logout/in OR newgrp for current shell)
    sudo usermod -aG docker $USER
    newgrp docker

    # Smoke test
    docker run --rm hello-world

    # Verify versions
    docker --version
    docker compose version

    # (Optional) log rotation hardening
    sudo tee /etc/docker/daemon.json > /dev/null <<'JSON'
    {
       "log-driver": "json-file",
       "log-opts": { "max-size": "10m", "max-file": "3" },
       "storage-driver": "overlay2"
    }
    JSON
    sudo systemctl restart docker

    # Quick compose test
    cat > test-compose.yml <<'YML'
    services:
       web:
          image: nginx:alpine
          ports:
             - "8089:80"
    YML
    docker compose -f test-compose.yml up -d
    curl -I http://localhost:8089 || true
    docker compose -f test-compose.yml down
    rm test-compose.yml
    ```

    Troubleshooting:
    - Permission denied to daemon: re-login or `newgrp docker`.
    - `docker-compose` not found: use `docker compose` (space) after plugin install.
    - DNS issues: add a `"dns": ["1.1.1.1","8.8.8.8"]` entry in daemon.json and restart.
    - Rate limit pulls: `docker login` (if using Docker Hub heavily).

    </details>

2. Copy / pull repo to server (or git pull latest).
    - Purpose: Ensure the server has the latest Docker-related files (compose files, Dockerfiles) if you plan to build on the server or run prod compose manually.
    - If you rely solely on CI-built images + `docker-compose.release.yml`, you technically only need that compose file on the server (CI copies it during deploy). Keeping the full repo is still useful for emergency manual builds or debugging.
    - Command examples:
       ```bash
       # first time
       git clone https://github.com/your-org/k-golf.git
       # subsequent updates
       git pull origin main
       ```

3. Create `.env.production` (don’t commit) if you prefer env file; otherwise set env in compose override. Replace placeholders:
   - SMTP_* values, CORS_ORIGIN, any secrets.
   - Optionally remove them from compose and use `env_file:`.
    - Why: Keeps secrets out of version control & GitHub Actions logs. Easier to rotate credentials.
    - Example `.env.production`:
       ```dotenv
       CORS_ORIGIN=https://your-domain
       SMTP_HOST=smtp.mailprovider.com
       SMTP_PORT=587
       SMTP_USER=apikey-user
       SMTP_PASS=super-secret
       EMAIL_FROM=general@konegolf.ca
       DATABASE_URL=postgres://kgolf:kgolf_password@db:5432/kgolf_app?schema=public
       ```
    - Then in compose add:
       ```yaml
       env_file:
          - .env.production
       ```

4. First build & start (detached):
```bash
# For production deployment (recommended - uses CI-built images)
IMAGE_TAG=<commit-sha> docker compose -f docker-compose.release.yml pull
IMAGE_TAG=<commit-sha> docker compose -f docker-compose.release.yml up -d
docker compose -f docker-compose.release.yml ps
docker compose -f docker-compose.release.yml logs -f backend

# For local testing only (builds from source)
docker build -t ghcr.io/hankyungsung/kgolf-backend:test -f backend/Dockerfile .
IMAGE_TAG=test docker compose -f docker-compose.release.yml up -d
```
    - Why: Pulls pre-built images from CI (production) or builds locally (testing).
    - **Note**: The Dockerfile in `backend/` builds **both** backend and frontend in a multi-stage process
    - `pull`: fetches the unified backend image from GitHub Container Registry
    - `up -d`: creates containers in background
    - `ps`: sanity list of running containers & states
    - `logs -f backend`: tail backend logs to confirm startup & DB connection

5. Verify health:
```bash
# Backend serves both API and frontend - check unified health endpoint
curl http://SERVER_IP:8082/health
# Verify migration ran successfully
docker compose -f docker-compose.release.yml logs --since=5m migrate
# Test frontend static files are accessible
curl -I http://SERVER_IP:8082/
```
    - The backend Express server serves both `/health` (API) and `/` (frontend HTML)
    - Checking `migrate` logs ensures Prisma migrations ran successfully (should show completion then container exits)
    - If errors appear, fix schema/DB issues before proceeding

6. App API test (inside network):
```bash
docker compose -f docker-compose.release.yml exec backend wget -qO- http://localhost:8080/health
docker compose -f docker-compose.release.yml exec backend ls -la /app/dist/public
```
    - Runs from inside the backend container network namespace; isolates issues
    - Second command verifies frontend static files are present in the container
    - If health check fails, check env vars, DB connectivity, or port conflicts

7. Point reverse proxy (Nginx/Caddy) to backend on port 8082:
   - **Single unified endpoint**: `http://127.0.0.1:8082`
   - Backend serves:
     - Root `/` → React SPA (index.html + assets)
     - API routes `/api/*` → Express API handlers
     - Health check `/health` → Status endpoint
    - Why: Simplified architecture with one container serving both concerns
    - Strategy: Add upstream pointing to 8082, configure server block to proxy all traffic
    - Example Nginx config:
      ```nginx
      upstream kgolf_app {
          server 127.0.0.1:8082;
      }
      
      server {
          listen 80;
          server_name your-domain.com;
          
          location / {
              proxy_pass http://kgolf_app;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection 'upgrade';
              proxy_set_header Host $host;
              proxy_cache_bypass $http_upgrade;
          }
      }
      ```
    - Test with a staging subdomain before cutting production DNS if possible

8. Cutover:
   - Update DNS / virtual host to route traffic to Docker-backed endpoints.
   - Monitor logs for 10–15 min.
   - If stable: `pm2 delete <old-processes>` (after saving a backup: `pm2 save`).
    - Checklist before deleting PM2:
       - 200 responses from health
       - No migration errors
       - TLS / assets load correctly
       - Authentication & booking flows tested
    - Keep PM2 configs exported somewhere (`pm2 save && pm2 dump`) for rollback window.

9. Rollback (if needed):
   - Revert proxy to PM2 services.
   - Stop containers: `docker compose -f docker-compose.prod.yml down` (db volume persists).
    - Alternative (faster) rollback if using CI images:
       ```bash
       IMAGE_TAG=<previous_sha> docker compose -f docker-compose.release.yml pull
       IMAGE_TAG=<previous_sha> docker compose -f docker-compose.release.yml up -d
       ```
    - Only use full `down -v` if you intentionally want to destroy DB data (almost never in prod).

10. Ongoing ops:
   - Deploy new version: `IMAGE_TAG=<new-sha> docker compose -f docker-compose.release.yml pull && IMAGE_TAG=<new-sha> docker compose -f docker-compose.release.yml up -d`
   - Rebuild locally: `docker build -t ghcr.io/hankyungsung/kgolf-backend:test -f backend/Dockerfile . && IMAGE_TAG=test docker compose -f docker-compose.release.yml up -d backend`
   - Tail logs: `docker compose -f docker-compose.release.yml logs -f --tail=100 backend`
   - DB psql: `docker compose -f docker-compose.release.yml exec db psql -U kgolf -d kgolf_app`
    - Scale / debug:
       - Restart a single service: `docker compose -f docker-compose.prod.yml restart backend`
       - Inspect environment inside container: `docker compose exec backend env | grep PORT`
    - Image cleanup: `docker image prune -f` (removes dangling layers; safe periodically).
    - Backups:
       ```bash
       docker run --rm -v pg_data:/data -v $(pwd):/backup alpine tar czf /backup/pg_backup_$(date +%F).tgz -C /data .
       ```
    - Security updates: `sudo apt-get update && sudo apt-get upgrade -y` (host) + rebuild images to get patched base layers.

## Environment variables to finalize

**Environment File Approach (Recommended):**

Create `.env.production` on the server (see `.env.production.example` for template):
```bash
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://kgolf:kgolf_password@db:5432/kgolf_app?schema=public
CORS_ORIGIN=https://your-domain.com
FRONTEND_ORIGIN=https://your-domain.com
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=apikey-or-username
SMTP_PASS=secret-password
EMAIL_FROM=general@konegolf.ca
SEED_ADMIN_EMAIL=admin@your-domain.com
SEED_ADMIN_PASSWORD=secure-password
POS_ADMIN_KEY=pos-secret-key
```

If receipt/image analysis will be delegated to a private Ollama worker on a Raspberry Pi, add:
```bash
OLLAMA_BASE_URL=http://<pi-tailnet-ip>:11434
OLLAMA_MODEL=gemma4:e2b
```

Use the Pi's tailnet IP from Docker unless you've already verified that MagicDNS resolves correctly inside the backend container.

The `docker-compose.release.yml` file already references this via:
```yaml
services:
  backend:
    env_file:
      - .env.production
```

**Alternative: GitHub Secrets Injection (Current Workflow):**
The GitHub Actions workflow currently injects SMTP variables via command line. This works but is less maintainable. Consider migrating to the env file approach by:
1. Creating `.env.production` on server with all variables
2. Removing SMTP_* from the deploy command in `.github/workflows/docker-deploy.yml`

## Receipt OCR Service (EasyOCR on Pi5)

Receipt analysis uses an EasyOCR service running on the Raspberry Pi 5, accessed via Tailscale.

**Architecture:**
- EasyOCR runs on Pi5 (8GB RAM) — Python Flask + gunicorn
- Backend reaches Pi via Tailscale: `http://100.83.253.110:5050`
- If Pi is unreachable, receipts are marked UNREADABLE (no retry/queue)
- Admin dashboard shows Pi health status (green/red indicator)

**Pi setup:**
```bash
# On Pi5 — build and run EasyOCR service
cd ~/ocr-service
docker build -t konegolf-ocr .
docker run -d --name konegolf-ocr -p 5050:5000 --restart unless-stopped konegolf-ocr
```

**Verify from DO server:**
```bash
# Health check via Tailscale
curl http://100.83.253.110:5050/health

# Warm up model
curl -X POST http://100.83.253.110:5050/warmup
```

**Environment:**
```env
# .env.production
OCR_SERVICE_URL=http://100.83.253.110:5050
OCR_TIMEOUT=120000
```

**Monitoring:**
- Dashboard: Admin → Receipt Analysis → Pi OCR status bar at top
- Direct: `curl http://100.83.253.110:5050/health`
- Pi memory: `ssh pi5 'docker stats konegolf-ocr --no-stream'`

## Notes / adjustments you might consider
- If production Postgres is managed (e.g., DO Managed DB), remove the `db` service and point `DATABASE_URL` at the managed instance
- Add a volume for backend logs only if you introduce a file logger (currently stdout)
- For HTTPS terminate at host Nginx / Caddy (recommended) rather than adding a reverse proxy container
- The backend service already has `restart: unless-stopped` configured
- **Build Scripts**: 
  - Backend: `npm run build` only compiles TypeScript (Docker-compatible)
  - Backend: `npm run build:full` builds both frontend and backend (for local development)
  - Frontend: `npm run build` only builds React app (Docker-compatible)
  - Frontend: `npm run build:copy` builds and copies to backend/public (for local development)

## Next optional improvements
- Add a lightweight health/status page with build SHA
- Add `ARG GIT_SHA` to Dockerfile and log it on startup
- The CI pipeline already builds images automatically on push to main

## Deployment Checklist (Actionable Sequence)

This assumes you will use the CI-produced images + `docker-compose.release.yml` (preferred). A build-on-server fallback path is included near the end for emergencies.

Legend: (O) optional, (A) choose one path.

### Pre‑Flight
- [x] 1. Local repo main branch pushed (CI must see latest code)
- [ ] 2. GitHub Actions "Docker Deploy" workflow succeeded (unified backend image with new SHA tag in GHCR)
- [ ] 3. Record commit SHA (short 7 chars) you intend to deploy: `export RELEASE_SHA=<sha>` (for notes & rollback)
- [ ] 4. Server: Docker & Compose v2 installed (`docker compose version` shows v2.x)
- [ ] 5. Deploy user added to `docker` group (log out/in or `newgrp docker`)
- [ ] 6. Host time in sync (`timedatectl` → NTP active) – avoids token / TLS oddities
- [ ] 7. Firewall open: 22 (SSH), 80/443 (HTTP/HTTPS). Port 8082 temporarily allowed only if testing directly (close later)

### Secrets & Environment
- [ ] 8. Decide secrets strategy (A):
   - Path A1 (current workflow injects SMTP_ vars): Keep existing `docker-compose.release.yml` as-is; ensure GitHub secrets set: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.
   - Path A2 (env file on server): Create `.env.production` and add `env_file:` to services (`backend`, optionally `migrate`) then remove those vars from `environment:` and from SSH deploy command in workflow (edit workflow before deploying).
- [ ] 9. If Path A2: create file `/home/<deploy-user>/k-golf/.env.production`:
   ```dotenv
   NODE_ENV=production
   CORS_ORIGIN=https://your-domain
   SMTP_HOST=...
   SMTP_PORT=587
   SMTP_USER=...
   SMTP_PASS=...
   EMAIL_FROM=general@konegolf.ca
   DATABASE_URL=postgres://kgolf:kgolf_password@db:5432/kgolf_app?schema=public
   ```
- [ ] 10. (O) Add future secrets placeholders (e.g. `JWT_SECRET=`) even if app not using yet

### First Pull & Run (Release Compose)
- [ ] 11. Ensure deploy directory exists: `mkdir -p ~/k-golf && cd ~/k-golf`
- [ ] 12. Confirm `docker-compose.release.yml` present (copied by workflow or manual scp)
- [ ] 13. Pull images explicitly (manual or during automated deploy):
   ```bash
   IMAGE_TAG=$RELEASE_SHA docker compose -f docker-compose.release.yml pull
   ```
- [ ] 14. Start stack:
   ```bash
   IMAGE_TAG=$RELEASE_SHA docker compose -f docker-compose.release.yml up -d
   ```
- [ ] 15. List services & health states: `docker compose -f docker-compose.release.yml ps`
- [ ] 16. Migration logs clean (no errors, exits 0): `docker compose -f docker-compose.release.yml logs --since=15m migrate`
- [ ] 17. Backend internal health: `docker compose -f docker-compose.release.yml exec backend wget -qO- http://localhost:8080/health`
- [ ] 18. Backend serves frontend: `curl http://SERVER_IP:8082/` (should return HTML)
- [ ] 19. Verify static files in container: `docker compose -f docker-compose.release.yml exec backend ls -la /app/dist/public` (temporary port)

### Database & Persistence
- [ ] 19. Inspect volume exists: `docker volume inspect pg_data >/dev/null`
- [ ] 20. (O) Pre-initial backup after migrations:
   ```bash
   docker run --rm -v pg_data:/data -v $PWD:/backup alpine tar czf /backup/pg_initial_$(date +%F).tgz -C /data .
   ```
- [ ] 21. Restart backend only (proves stateless container + persistent DB): `docker compose -f docker-compose.release.yml restart backend`

### Reverse Proxy / Cutover
- [ ] 22. Add / update host Nginx server block to proxy 80/443 → unified backend (127.0.0.1:8082) - serves both frontend and API
- [ ] 23. Reload Nginx (`nginx -t && systemctl reload nginx`)
- [ ] 24. Confirm HTTPS loads SPA + API calls succeed (check browser dev tools / network)
- [ ] 25. Disable direct exposure of 8082 (firewall drop or remove any public mapping after verifying proxy works)

### Functional Verification
- [ ] 26. Test core flows: sign up / login, booking creation, email send (check SMTP logs or inbox)
- [ ] 27. CORS working (no console errors)
- [ ] 28. Check logs (10–15m): `docker compose -f docker-compose.release.yml logs -f backend`
- [ ] 29. Note deployed commit SHA & time in an internal changelog / ticket

### Decommission Legacy & Hardening
- [ ] 30. Stop PM2 processes after parity: `pm2 delete <names>` (keep dump for 24h)
- [ ] 31. (O) Remove stale static directory `/root/k-golf/dist` if no longer served
- [ ] 32. Ensure log rotation (Docker default json-file + daemon.json config if added)
- [ ] 33. Schedule recurring DB backup (cron + tar or use pg_dump inside temporary container)
- [ ] 34. Add external uptime / health monitoring hitting `GET /health`
- [ ] 35. (O) Add image prune cron (weekly): `docker image prune -f`
- [ ] 36. (O) Remove legacy GitHub workflow (non-docker) once rollback window closed

### Rollback Procedure (Keep Handy)
- [ ] 37. Rollback test (off-hours): deploy prior SHA:
   ```bash
   IMAGE_TAG=<previous_sha> docker compose -f docker-compose.release.yml pull
   IMAGE_TAG=<previous_sha> docker compose -f docker-compose.release.yml up -d
   ```
- [ ] 38. If catastrophic: revert Nginx proxy to PM2 (only if PM2 still available) or redeploy previous SHA

### Emergency Build Fallback (Only if CI unavailable)
- [ ] 39. (O) Use `docker-compose.prod.yml` to build locally on server:
   ```bash
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d
   ```
- [ ] 40. Tag locally built images for consistency (O): `docker tag <img> ghcr.io/...:<temporary>` (if you later want to push)

### Completion
- [ ] 41. Confirm no high CPU / memory anomalies (`docker stats` short check)
- [ ] 42. Document anything non-standard discovered during deploy
- [ ] 43. Deployment marked COMPLETE

---
Tip: Never run `docker compose ... down -v` in production unless you intentionally want to destroy persistent DB data. Use `down` (without `-v`) or prefer `up -d` with new images for zero data loss redeploys.

## Local CI Pipeline Simulation (Exact Steps)

Run these from the repository root to mimic what the GitHub Actions "Docker Deploy" workflow does. This helps you catch build or migration failures before pushing.

### 1. (Optional) Clean Workspace
```bash
docker system prune -f  # removes dangling images/containers/networks
```

### 2. Choose a Tag
Use the real commit SHA (preferred) or a temporary `local` tag:
```bash
export IMAGE_TAG=$(git rev-parse HEAD)  # or: export IMAGE_TAG=local
echo "Using IMAGE_TAG=$IMAGE_TAG"
```

### 3. Build Unified Backend Image (includes frontend)
```bash
docker build --progress=plain -t ghcr.io/hankyungsung/kgolf-backend:$IMAGE_TAG -f backend/Dockerfile .
```
This builds:
- Backend dependencies and TypeScript compilation
- Frontend React app build
- Combined final image with backend serving frontend static files

If it fails, check:
- Backend TypeScript errors
- Frontend webpack build issues
- Prisma schema problems

### 4. (Optional) Verify Image Contents
Check that both backend and frontend are present:
```bash
docker run --rm ghcr.io/hankyungsung/kgolf-backend:$IMAGE_TAG ls -la /app/dist/
docker run --rm ghcr.io/hankyungsung/kgolf-backend:$IMAGE_TAG ls -la /app/dist/public/
```
Should see:
- `/app/dist/src/` - Compiled backend TypeScript
- `/app/dist/public/` - Frontend static files (index.html, assets/, images)

### 5. (Optional) Test Pushing (Requires Personal PAT with `write:packages`)
Skip unless you explicitly want to push your local test images.
```bash
# docker login ghcr.io -u <gh-user>
# docker push ghcr.io/hankyungsung/kgolf-backend:$IMAGE_TAG
```

### 6. Start Stack Using Release Compose
`docker-compose.release.yml` expects images already built/pulled; we provide `IMAGE_TAG`.
```bash
IMAGE_TAG=$IMAGE_TAG docker compose -f docker-compose.release.yml up -d
```
If image is missing you mistyped the tag or forgot to build it.

### 7. Check Container Status
```bash
docker compose -f docker-compose.release.yml ps
```
Look for `healthy` (backend) and `exit 0` (migrate) once it finishes.

### 8. Inspect Migration Logs
```bash
docker compose -f docker-compose.release.yml logs --since=10m migrate
```
Expect successful Prisma output and container exit.

### 9. Backend Health (API)
```bash
docker compose -f docker-compose.release.yml exec backend wget -qO- http://localhost:8080/health
```
Should return JSON with ok / uptime.

### 10. Frontend Health (Static Files)
```bash
curl http://localhost:8082/
```
Should return HTML (the React SPA index.html).

### 11. Verify Static Assets
```bash
docker compose -f docker-compose.release.yml exec backend ls -la /app/dist/public
```
Should see index.html, assets/, and image files.

### 12. Tail Backend Logs (Live)
```bash
docker compose -f docker-compose.release.yml logs -f --tail=100 backend
```
Cancel with Ctrl+C.

### 13. Common Failure Spots
- **Build fails**: 
  - Backend TypeScript errors → check `backend/src/**/*.ts`
  - Frontend webpack errors → check `frontend/webpack.config.js` and React components
  - Prisma schema issues → verify `backend/prisma/schema.prisma`
- **Migrate fails**: schema mismatch / existing constraint → adjust migration or DB state
- **Backend unhealthy**: env variables missing (SMTP_* / DATABASE_URL) or DB not ready
- **Frontend 404 root**: 
  - Check frontend built correctly in Docker stage
  - Verify `/app/dist/public` exists in container
  - Check backend Express static file serving configured

### 14. Rebuild After Code Change (Fast Loop)
Any change (backend OR frontend) requires rebuilding the unified image:
```bash
docker build -t ghcr.io/hankyungsung/kgolf-backend:$IMAGE_TAG -f backend/Dockerfile .
IMAGE_TAG=$IMAGE_TAG docker compose -f docker-compose.release.yml up -d backend
```
The multi-stage build automatically rebuilds only changed layers (Docker layer caching).

### 15. Tear Down (Keep Volume)
```bash
docker compose -f docker-compose.release.yml down
```
Postgres data persists in `pg_data` volume.

### 16. Full Cleanup (Removes DB Data — DANGEROUS)
Only for local throwaway tests, never in production:
```bash
docker compose -f docker-compose.release.yml down -v
docker volume ls | grep pg_data || true
```

### 17. Simulate Rollback Locally
Build a second tag, then switch tags:
```bash
export PREV_TAG=$IMAGE_TAG
export IMAGE_TAG=testrollback
docker build -t ghcr.io/hankyungsung/kgolf-backend:$IMAGE_TAG -f backend/Dockerfile .
IMAGE_TAG=$IMAGE_TAG docker compose -f docker-compose.release.yml up -d backend
# Roll back
IMAGE_TAG=$PREV_TAG docker compose -f docker-compose.release.yml up -d backend
```

### 18. Compare With CI
CI additionally: sets labels, uses buildx cache, pushes to GHCR, then SSH deploys and runs `pull` + `up -d`. 

**CI Build Process:**
1. Builds unified backend image (includes frontend) from `backend/Dockerfile`
2. Tags with commit SHA
3. Pushes to `ghcr.io/hankyungsung/kgolf-backend:<sha>`
4. SSH to server, sets `IMAGE_TAG=<sha>`, runs `docker compose -f docker-compose.release.yml pull && up -d`

Functional app behavior should match your local simulation if the tag is identical.

---
Use this section whenever a CI run fails; locate the failing phase locally, fix, then push again.
