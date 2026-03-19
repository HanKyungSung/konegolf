# Deployment Pipeline Status & Issues

**Date:** November 24, 2025  
**Current Architecture:** Single backend container serving both API + frontend static files

---

## Current State Analysis

### ✅ What's Working

1. **Active Workflow:** `.github/workflows/docker-deploy.yml`
   - Triggers on push to `main` branch
   - Builds backend image (includes frontend via multi-stage build)
   - Pushes to GHCR: `ghcr.io/hankyungsung/kgolf-backend:latest` and `:sha-xxxxx`
   - Deploys via SSH to DigitalOcean droplet

2. **Backend Dockerfile:** `backend/Dockerfile`
   - Multi-stage build:
     - Stage 1: Build backend (TypeScript → dist/)
     - Stage 2: Build frontend (React → dist/)
     - Stage 3: Combine both in runner image
   - Serves frontend static files from `dist/public`
   - Serves API from port 8080

3. **Docker Compose:** `docker-compose.release.yml`
   - Uses pre-built images from CI
   - Services: `db`, `migrate`, `seed`, `backend`
   - Exposes backend on port 8082 → 8080 (includes frontend)

### ❌ What's Broken / Inconsistent

1. **Obsolete Frontend Dockerfile**
   - File: `frontend/Dockerfile` 
   - Status: **NOT USED** - Creates nginx-based frontend container
   - Problem: Current architecture doesn't use separate frontend container
   - Action needed: Either **delete** or add comment explaining it's obsolete

2. **Disabled Legacy Workflow**
   - File: `.github/workflows/deploy.yml`
   - Status: Commented out (on: triggers disabled)
   - Problem: Tries to build **separate** frontend+backend images
   - References: `IMAGE_FRONTEND` and `IMAGE_BACKEND` as separate images
   - Action needed: **Delete** this file (superseded by docker-deploy.yml)

3. **Secret Name Mismatch**
   - Active workflow uses: `DROPLET_SSH_KEY`, `DROPLET_HOST`, `DROPLET_USER`
   - Disabled workflow uses: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`
   - Problem: Inconsistent secret names (both can't work)
   - Current GitHub Secrets probably use `DROPLET_*` prefix
   - Action needed: Verify which secrets exist in GitHub repo settings

4. **Port Mapping Confusion**
   - Backend serves on port 8080 internally
   - Compose exposes as `8082:8080` (host:container)
   - Documentation sometimes references `8081` (old frontend port?)
   - Action needed: Clarify and document final port structure

5. **Missing Environment Variables in Deployment**
   - Active workflow passes `IMAGE_TAG` but compose file expects `.env.production`
   - SMTP variables passed via SSH command (fragile, hard to maintain)
   - Action needed: Standardize on `.env.production` file on server

---

## Recommended Fixes

### Priority 1: Clean Up Obsolete Files

**Delete these files:**
```bash
# Obsolete - separate frontend container not used
rm frontend/Dockerfile
rm frontend/nginx.conf

# Obsolete - superseded by docker-deploy.yml
rm .github/workflows/deploy.yml
rm .github/workflows/legacy-deploy.yml  # if exists
```

**Or mark as obsolete:**
```dockerfile
# frontend/Dockerfile - ADD AT TOP:
## ⚠️ OBSOLETE: This Dockerfile is not used in current deployment
## Current architecture: Backend Dockerfile includes frontend build (multi-stage)
## The backend container serves both API and static files
## See: backend/Dockerfile for actual build process
```

### Priority 2: Verify GitHub Secrets

Check GitHub repo → Settings → Secrets and variables → Actions:

**Required secrets for docker-deploy.yml:**
- ✅ `GITHUB_TOKEN` (automatic, no action needed)
- ❓ `DROPLET_SSH_KEY` - Private SSH key for deployment
- ❓ `DROPLET_HOST` - Server IP or hostname
- ❓ `DROPLET_USER` - SSH username (probably `root`)
- ❓ `SMTP_HOST` - Email server (optional if not using email)
- ❓ `SMTP_PORT` - Email port (587 or 465)
- ❓ `SMTP_USER` - Email username
- ❓ `SMTP_PASS` - Email password
- ❓ `EMAIL_FROM` - From address for emails

**Action:** Verify these exist, add missing ones

### Priority 3: Fix Environment Variable Management

**Current problem:** SMTP vars passed via SSH command line
```bash
# Current (fragile):
ssh ... SMTP_HOST='...' SMTP_PORT='...' 'docker compose up'
```

**Better approach:** Use `.env.production` file on server

**Steps:**
1. Create `.env.production` on server at `~/k-golf/.env.production`:
   ```bash
   NODE_ENV=production
   PORT=8080
   DATABASE_URL=postgres://kgolf:kgolf_password@db:5432/kgolf_app?schema=public
   CORS_ORIGIN=https://k-golf.inviteyou.ca
   FRONTEND_ORIGIN=https://k-golf.inviteyou.ca
   
   # SMTP (optional - only if email features enabled)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=general@konegolf.ca
   SMTP_PASS=your-app-password
   EMAIL_FROM=general@konegolf.ca
   
   # Future secrets
   # JWT_SECRET=generate-random-string
   # POS_ADMIN_KEY=generate-random-string
   ```

2. Update `docker-compose.release.yml` - already has `env_file: - .env.production` ✅

3. Simplify workflow deploy step - remove SMTP vars from command

### Priority 4: Document Final Architecture

**Create deployment diagram:**
```
GitHub Push to main
    ↓
GitHub Actions (docker-deploy.yml)
    ↓
Build: backend/Dockerfile (multi-stage)
    ├─ Stage 1: Backend build (TypeScript)
    ├─ Stage 2: Frontend build (React)
    └─ Stage 3: Runner (combine both)
    ↓
Push: ghcr.io/hankyungsung/kgolf-backend:latest
    ↓
SSH to DigitalOcean Droplet (147.182.215.135)
    ↓
docker compose -f docker-compose.release.yml up -d
    ├─ db (postgres:16)
    ├─ migrate (prisma migrate deploy)
    ├─ seed (node dist/prisma/seed.js)
    └─ backend (serves API + frontend static files)
        ├─ Port 8080 → API endpoints (/api/*)
        └─ Port 8080 → Static files (/, /dashboard, /admin, etc.)
    ↓
Nginx Reverse Proxy (host)
    ├─ :80/:443 → 127.0.0.1:8082 (SSL termination)
    └─ k-golf.inviteyou.ca → backend container
```

---

## Testing Current Deployment

### Quick Health Check

```bash
# 1. Check if workflow succeeded
# Visit: https://github.com/HanKyungSung/k-golf/actions/workflows/docker-deploy.yml

# 2. Check if image exists in GHCR
# Visit: https://github.com/HanKyungSung?tab=packages
# Should see: kgolf-backend with recent tags

# 3. SSH to server and check containers
ssh your-user@147.182.215.135
docker ps  # Should see: kgolf-postgres, k-golf-backend-1
docker logs k-golf-backend-1 --tail=50

# 4. Test endpoints
curl http://localhost:8082/health  # Should return {"ok":true}
curl http://localhost:8082/api/health  # Should return API health
curl http://localhost:8082/  # Should return frontend HTML

# 5. Test from outside
curl https://k-golf.inviteyou.ca/health  # Should work if Nginx configured
```

### Full Deployment Test (Local)

```bash
# Simulate CI pipeline locally
cd /Users/hankyungsung/Desktop/project/k-golf

# 1. Build image (same as CI)
docker build \
  --tag ghcr.io/hankyungsung/kgolf-backend:test \
  --file backend/Dockerfile \
  .

# 2. Run with compose (simulate deployment)
IMAGE_TAG=test docker compose -f docker-compose.release.yml up -d

# 3. Check health
docker compose -f docker-compose.release.yml ps
docker compose -f docker-compose.release.yml logs backend --tail=50

# 4. Test endpoints
curl http://localhost:8082/health

# 5. Cleanup
docker compose -f docker-compose.release.yml down
```

---

## Common Issues & Solutions

### Issue 1: "Image not found" during deployment
**Symptom:** `docker compose pull` fails with "manifest unknown"
**Cause:** Workflow didn't push image or wrong tag used
**Fix:**
```bash
# Check if image exists in GHCR
docker pull ghcr.io/hankyungsung/kgolf-backend:latest

# If missing, trigger workflow manually:
# GitHub → Actions → Docker Deploy → Run workflow
```

### Issue 2: Frontend shows 404 or blank page
**Symptom:** API works but frontend doesn't load
**Cause:** Frontend build failed or not copied to correct location
**Fix:**
```bash
# Check if frontend files exist in container
docker compose -f docker-compose.release.yml exec backend ls -la dist/public/

# Should see: index.html, assets/, etc.
# If missing, rebuild image with --no-cache
```

### Issue 3: Database migrations fail
**Symptom:** Migrate container exits with error
**Cause:** Schema conflict or DATABASE_URL wrong
**Fix:**
```bash
# Check migration logs
docker compose -f docker-compose.release.yml logs migrate

# Manual migration (inside container)
docker compose -f docker-compose.release.yml exec backend npx prisma migrate deploy

# Reset database (⚠️ DESTRUCTIVE)
docker compose -f docker-compose.release.yml down -v
docker compose -f docker-compose.release.yml up -d
```

### Issue 4: CORS errors in browser
**Symptom:** API calls fail with CORS error in console
**Cause:** CORS_ORIGIN not set or wrong domain
**Fix:**
```bash
# Add to .env.production on server:
CORS_ORIGIN=https://k-golf.inviteyou.ca,http://localhost:3000

# Restart backend
docker compose -f docker-compose.release.yml restart backend
```

---

## Next Steps (Action Items)

- [ ] 1. Delete obsolete files (frontend/Dockerfile, deploy.yml)
- [ ] 2. Verify GitHub Secrets exist (DROPLET_*)
- [ ] 3. Create .env.production on server
- [ ] 4. Test deployment pipeline end-to-end
- [ ] 5. Update DEPLOY_DOCKER.md with simplified instructions
- [ ] 6. Add health monitoring (uptime checker)
- [ ] 7. Set up database backups (cron job)
- [ ] 8. Document rollback procedure

---

**Owner:** Development Team  
**Last Updated:** November 24, 2025  
**Status:** 🟡 Pipeline works but needs cleanup and standardization
