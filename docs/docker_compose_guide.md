# Docker Compose Guide for K-Golf

## What is Docker Compose?

Docker Compose is a tool that lets you define and run **multiple Docker containers** together. Think of it as a recipe that tells Docker:
- What containers to start
- How they should connect to each other
- What order to start them in

---

## Your `docker-compose.release.yml` Breakdown

### **Top Comment**
```yaml
# Production release compose using pre-built images from CI (no local builds on server)
```
- This file is for **production** (your live server)
- Uses images that GitHub Actions already built (doesn't rebuild on the server)

---

## **Services Section** - The Containers

```yaml
services:
```
This section defines each container you want to run. You have 4 services:

---

### **1. Database Service (`db`)**

```yaml
db:
  image: postgres:16
```
- **What it does**: Runs PostgreSQL database version 16
- **Think of it as**: Your data storage container

```yaml
  container_name: konegolf-postgres
```
- **What it does**: Names the container `konegolf-postgres` (easier to reference)
- **Why**: Instead of random names like `k-golf_db_1`, you get `konegolf-postgres`

```yaml
  restart: unless-stopped
```
- **What it does**: Auto-restarts if container crashes
- **Exception**: Won't restart if you manually stop it
- **Why**: Keeps database running even after server reboots

```yaml
  environment:
    POSTGRES_USER: kgolf
    POSTGRES_PASSWORD: kgolf_password
    POSTGRES_DB: kgolf_app
```
- **What it does**: Sets up database with:
  - Username: `kgolf`
  - Password: `kgolf_password`
  - Database name: `kgolf_app`
- **Think of it as**: Database credentials

```yaml
  volumes:
    - pg_data:/var/lib/postgresql/data
```
- **What it does**: Saves database data permanently
- **Left side (`pg_data`)**: Named volume (defined at bottom of file)
- **Right side**: Where PostgreSQL stores data inside container
- **Why**: Without this, data is lost when container restarts!

```yaml
  networks:
    - konegolf_net
```
- **What it does**: Connects to `konegolf_net` network
- **Why**: Allows other containers (backend) to talk to database

```yaml
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U kgolf -d kgolf_app"]
    interval: 10s
    timeout: 5s
    retries: 5
```
- **What it does**: Checks if database is ready
- **How**: Runs `pg_isready` command every 10 seconds
- **Why**: Other services wait for this to be "healthy" before starting
- **Retries**: Tries 5 times before giving up

---

### **2. Migration Service (`migrate`)**

```yaml
migrate:
  image: ghcr.io/hankyungsung/kgolf-backend:${IMAGE_TAG:-latest}
```
- **What it does**: Uses your backend image (contains Prisma)
- **`${IMAGE_TAG:-latest}`**: Use specific version or default to `latest`
- **Where from**: GitHub Container Registry (ghcr.io)

```yaml
  depends_on:
    db:
      condition: service_healthy
```
- **What it does**: Waits for database to be healthy first
- **Order**: Database → Migrate
- **Why**: Can't run migrations if database isn't ready

```yaml
  env_file:
    - .env.production
```
- **What it does**: Loads environment variables from `.env.production` file
- **Contains**: DATABASE_URL, NODE_ENV, etc.

```yaml
  command: ["npx", "prisma", "migrate", "deploy"]
```
- **What it does**: Runs database migrations
- **Translation**: "Apply all pending SQL changes to the database"
- **Why**: Updates database schema to match your code

```yaml
  restart: "no"
```
- **What it does**: Runs once and exits (doesn't restart)
- **Why**: Migrations only need to run once per deployment

```yaml
  networks:
    - konegolf_net
```
- **What it does**: Connects to same network as database

---

### **3. Seed Service (`seed`)**

```yaml
seed:
  image: ghcr.io/hankyungsung/kgolf-backend:${IMAGE_TAG:-latest}
  depends_on:
    db:
      condition: service_healthy
    migrate:
      condition: service_completed_successfully
```
- **What it does**: Adds initial data (rooms, menu items, admin user)
- **Order**: Database → Migrate → Seed
- **Why**: Can't seed data until database exists and schema is updated

```yaml
  command: ["node", "dist/prisma/seed.js"]
```
- **What it does**: Runs the compiled seed script
- **Creates**: 4 rooms, ~20 menu items, 1 admin user, settings

```yaml
  restart: "no"
```
- **What it does**: Runs once and exits
- **Why**: Only needs to seed once (script is idempotent = safe to run multiple times)

---

### **4. Backend Service (`backend`)**

```yaml
backend:
  image: ghcr.io/hankyungsung/kgolf-backend:${IMAGE_TAG:-latest}
  depends_on:
    db:
      condition: service_healthy
    migrate:
      condition: service_completed_successfully
    seed:
      condition: service_completed_successfully
```
- **What it does**: Your main Node.js application
- **Order**: Database → Migrate → Seed → Backend
- **Why**: Backend needs database ready, schema updated, and data seeded

```yaml
  ports:
    - "8082:8080"
```
- **What it does**: Maps ports
- **Left (`8082`)**: Port on your server (external)
- **Right (`8080`)**: Port inside container (internal)
- **Translation**: "Requests to server:8082 go to container:8080"

```yaml
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```
- **What it does**: Checks if backend is responding
- **How**: Calls `/health` endpoint every 30 seconds
- **Why**: Docker can detect if app crashes and restart it

```yaml
  restart: unless-stopped
```
- **What it does**: Always restart on crash or reboot
- **Why**: Keeps your app running 24/7

---

## **Networks Section**

```yaml
networks:
  konegolf_net:
    driver: bridge
```
- **What it does**: Creates a private network called `konegolf_net`
- **Bridge driver**: Default, allows containers to talk to each other
- **Think of it as**: A local WiFi network for your containers
- **Result**: Containers can reach each other by name (e.g., `db:5432`)

---

## **Volumes Section**

```yaml
volumes:
  pg_data:
    driver: local
```
- **What it does**: Defines a named volume for persistent data
- **Local driver**: Stores on server's disk
- **Used by**: Database service to save PostgreSQL data
- **Why**: Data survives container restarts/updates

---

## **How it All Works Together**

### Startup Order:
```
1. Database starts → waits to be healthy
2. Migrate runs → applies schema changes → exits
3. Seed runs → adds initial data → exits
4. Backend starts → serves your app
```

### Visual Diagram:
```
┌─────────────────────────────────────┐
│  konegolf_net (Network)                │
│                                     │
│  ┌──────────┐    ┌──────────┐     │
│  │ Database │◄───│ Backend  │     │
│  │  :5432   │    │  :8080   │     │
│  └─────▲────┘    └────▲─────┘     │
│        │              │            │
│        │         Port mapping      │
│        │         8082 → 8080       │
│  ┌─────┴────┐   ┌────┴─────┐     │
│  │ Migrate  │   │  Seed    │     │
│  │ (1x run) │   │ (1x run) │     │
│  └──────────┘   └──────────┘     │
└─────────────────────────────────────┘
```

---

## **Common Commands**

```bash
# Start all services
docker compose -f docker-compose.release.yml up -d

# Stop all services
docker compose -f docker-compose.release.yml down

# View logs for specific service
docker compose -f docker-compose.release.yml logs backend

# View logs for all services
docker compose -f docker-compose.release.yml logs

# Follow logs in real-time
docker compose -f docker-compose.release.yml logs -f backend

# Restart one service
docker compose -f docker-compose.release.yml restart backend

# Check status of all services
docker compose -f docker-compose.release.yml ps

# Pull latest images
docker compose -f docker-compose.release.yml pull

# Rebuild and restart (after code changes)
docker compose -f docker-compose.release.yml up -d --build

# Stop and remove everything (including volumes - DATA LOSS!)
docker compose -f docker-compose.release.yml down -v

# Run a one-time command in a service
docker compose -f docker-compose.release.yml run --rm seed
```

---

## **Key Concepts**

| Term | Meaning | Example |
|------|---------|---------|
| **Image** | Blueprint for a container (like a recipe) | `postgres:16` |
| **Container** | Running instance of an image (like a dish made from recipe) | `konegolf-postgres` |
| **Volume** | Permanent storage that survives container restarts | `pg_data` |
| **Network** | Private connection between containers | `konegolf_net` |
| **Port mapping** | Expose container port to outside world | `8082:8080` |
| **depends_on** | Start order and wait conditions | Migrate waits for db |
| **healthcheck** | Test if container is working properly | `/health` endpoint |
| **env_file** | Load environment variables from file | `.env.production` |
| **restart policy** | What to do when container stops | `unless-stopped` |

---

## **Environment Variables**

Your `.env.production` file should contain:

```env
# Database connection
DATABASE_URL=postgresql://kgolf:kgolf_password@db:5432/kgolf_app

# Application settings
NODE_ENV=production
PORT=8080

# Seed script customization (optional)
SEED_ADMIN_EMAIL=admin@kgolf.com
SEED_ADMIN_PASSWORD=your-secure-password
SEED_ADMIN_PHONE=+14165551000

# Enable test data in production (not recommended)
# SEED_ENABLE_TEST_USER=true
# SEED_ENABLE_MOCK_BOOKINGS=true
```

---

## **Production Seed Behavior**

The seed script is production-safe and only creates essential data:

### ✅ **Always Seeded in Production:**
1. **4 Rooms** (Room 1-4) - Essential for bookings
2. **Default Settings** (global_tax_rate: 8%) - Configuration
3. **~20 Menu Items** (Hours, Food, Drinks, Appetizers, Desserts)
4. **1 Admin User** - For system access

### ❌ **Skipped in Production** (unless explicitly enabled):
1. **Test User** - Only if `SEED_ENABLE_TEST_USER=true`
2. **Mock Bookings** (300+ fake bookings) - Only if `SEED_ENABLE_MOCK_BOOKINGS=true`

The seed script is **idempotent**, meaning it's safe to run multiple times. It will:
- Create items if they don't exist
- Update items if they already exist
- Skip items that are already correct

---

## **Troubleshooting**

### Container won't start
```bash
# Check logs for errors
docker compose -f docker-compose.release.yml logs backend

# Check if database is healthy
docker compose -f docker-compose.release.yml ps

# Check container status
docker ps -a --filter name=k-golf
```

### Database connection errors
```bash
# Verify database is running
docker exec konegolf-postgres psql -U kgolf -d kgolf_app -c "SELECT version();"

# Check DATABASE_URL in .env.production
cat /root/k-golf/.env.production | grep DATABASE_URL
```

### Migrations not running
```bash
# Manually run migrations
docker compose -f docker-compose.release.yml run --rm migrate

# Check migration logs
docker compose -f docker-compose.release.yml logs migrate
```

### Seed not running
```bash
# Manually run seed
docker compose -f docker-compose.release.yml run --rm seed

# Check if data was created
docker exec konegolf-postgres psql -U kgolf -d kgolf_app -c "SELECT COUNT(*) FROM \"Room\";"
```

### Port already in use
```bash
# Check what's using port 8082
lsof -i :8082

# Stop conflicting service or change port in docker-compose.yml
```

---

## **Best Practices**

1. **Always use `.env.production` for secrets** - Never hardcode passwords in docker-compose.yml
2. **Regular backups** - Backup the `pg_data` volume regularly
3. **Monitor logs** - Check logs periodically for errors
4. **Health checks** - Let Docker's health checks detect and restart failed services
5. **Network isolation** - Services on `konegolf_net` are isolated from other Docker networks
6. **Version pinning** - Use specific image tags (`IMAGE_TAG=v1.2.3`) for production deployments
7. **Rolling updates** - Use `docker compose up -d` to update without downtime

---

## **Deployment Workflow**

Your GitHub Actions workflow automatically:

1. **Builds** new Docker image with latest code
2. **Pushes** to GitHub Container Registry (GHCR)
3. **SSH** to production server
4. **Pulls** latest image: `docker compose pull`
5. **Restarts** services: `docker compose up -d`
6. **Runs** migrations automatically (via `migrate` service)
7. **Seeds** database if needed (via `seed` service)
8. **Starts** backend (serves frontend + API)

All of this happens automatically when you push to `main` branch! 🚀

---

## **Architecture Summary**

Your K-Golf application uses a **single-container architecture** for the application layer:

- **Before**: 2 containers (separate frontend + backend)
- **After**: 1 container (backend serves both frontend static files and API)

**Benefits:**
- Simpler deployment
- Smaller total image size (~50-100MB savings)
- Single port to manage (8082)
- Easier troubleshooting
- Same codebase version for frontend and backend

**Infrastructure:**
- **Database**: PostgreSQL 16 (separate container for data isolation)
- **Application**: Node.js 20 (serves frontend assets + API)
- **Proxy**: Nginx (routes k-golf.inviteyou.ca → port 8082)

Your setup is production-ready with automatic database migrations, seeding, and health monitoring! 🎉
