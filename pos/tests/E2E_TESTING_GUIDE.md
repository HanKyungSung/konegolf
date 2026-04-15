# E2E Testing Guide

Complete guide for Playwright-based end-to-end testing of the K-Golf POS Electron application.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Setup Details](#setup-details)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Database Management](#database-management)
6. [How It Works](#how-it-works)
7. [Troubleshooting](#troubleshooting)
8. [CI/CD Integration](#cicd-integration)

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL running
- Backend dependencies installed

### 5-Minute Setup

```bash
# 1. Create test database (run from backend directory)
cd backend
chmod +x scripts/setup_test_db.sh
./scripts/setup_test_db.sh

# 2. Install Playwright
cd ../pos
npm install
npx playwright install

# 3. Start backend in TEST mode (⚠️ IMPORTANT - uses test database)
cd ../backend
npm run dev:test

# 4. Run tests (in new terminal)
cd ../pos
npm run test:e2e:ui
```

**That's it!** No environment configuration needed - everything is hardcoded.

---

## ⚠️ IMPORTANT: Running Backend in Test Mode

**Always use `npm run dev:test` when running E2E tests!**

```bash
# ✅ CORRECT - Backend uses TEST database (k_golf_test)
npm run dev:test

# ❌ WRONG - Backend uses PRODUCTION database (kgolf_app)
npm run dev
```

**Why this matters:**
- `npm run dev` connects to `kgolf_app` (production database)
- `npm run dev:test` connects to `k_golf_test` (test database)
- Tests reset the database before each run
- Using production DB would **delete your production data!** 🚨

**Quick check - which database is backend using?**

Backend logs will show on startup:
```bash
# Test mode ✅
DATABASE_URL=postgresql://kgolf:kgolf_password@localhost:5432/k_golf_test

# Production mode ❌ (don't use for tests!)
DATABASE_URL=postgresql://kgolf:kgolf_password@localhost:5432/kgolf_app
```

---

## Setup Details

### 1. Test Database Setup

**Automated Setup (Recommended):**

```bash
cd backend
./scripts/setup_test_db.sh
```

This script:
- ✅ Creates `k_golf_test` database
- ✅ Runs Prisma migrations
- ✅ Shows success message

**Manual Setup:**

```bash
# Create database
createdb k_golf_test

# Run migrations
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/k_golf_test" \
  npx prisma migrate deploy
```

### 2. Environment Configuration

**No .env files needed!** ✅

**Backend has two modes:**

```bash
# Development mode - Production database (kgolf_app)
cd backend
npm run dev

# Test mode - Test database (k_golf_test)  
cd backend
npm run dev:test  # ← Use this for E2E tests!
```

**What's the difference?**

| Command | Database | Use For |
|---------|----------|---------|
| `npm run dev` | `kgolf_app` (production) | Normal development, manual testing |
| `npm run dev:test` | `k_golf_test` (test DB) | **E2E tests only!** |

The `dev:test` script overrides `DATABASE_URL` to point to the test database:
```bash
DATABASE_URL=postgresql://kgolf:kgolf_password@localhost:5432/k_golf_test
```

**Test configuration is hardcoded in:**
- **Backend (test mode)**: `k_golf_test` database  
- **Backend API**: `http://localhost:8080`
- **Test helpers**: Hardcoded connection string

These match your `docker-compose.yml` settings, so everything works out of the box.

### 3. Install Dependencies

```bash
cd pos
npm install
npx playwright install
```

This installs:
- `@playwright/test` - Test framework
- `@prisma/client` - Database access
- `bcrypt` - Password hashing for test data
- Browser binaries (Chromium, Firefox, WebKit)

---

## Running Tests

### Available Commands

```bash
# Interactive UI mode (recommended for development)
npm run test:e2e:ui

# Headless mode (for CI/CD)
npm run test:e2e

# See Electron window while testing
npm run test:e2e:headed

# Debug mode (step through tests)
npm run test:e2e:debug

# View last test report
npm run test:e2e:report
```

### Running Specific Tests

```bash
# Run single test file
npx playwright test create-booking.spec.ts

# Run tests matching pattern
npx playwright test booking

# Run single test by name
npx playwright test -g "should create walk-in booking"
```

---

## Writing Tests

### Project Structure

```
pos/tests/
├── e2e/                          # Test specifications
│   ├── booking/
│   │   └── create-booking.spec.ts
│   └── dashboard/
│       └── dashboard.spec.ts
├── fixtures/                      # Test data (JSON)
│   ├── customers.json
│   └── bookings.json
├── helpers/
│   ├── electron.ts               # Electron test fixture
│   └── database.ts               # Database reset/seed helpers
└── tsconfig.json
```

### Basic Test Structure

```typescript
import { test, expect } from '../../helpers/electron';
import { initializeTestDatabase, cleanupDatabase, getTestPrisma } from '../../helpers/database';

test.describe('Feature Name', () => {
  // IMPORTANT: Reset database BEFORE EACH test for complete isolation
  test.beforeEach(async () => {
    const { admin, rooms } = await initializeTestDatabase();
    // Database now has: 1 admin, 4 rooms, 0 bookings
  });
  
  // Cleanup Prisma connection after all tests
  test.afterAll(async () => {
    await cleanupDatabase();
  });

  test('should do something', async ({ page }) => {
    // 1. Interact with UI
    await page.click('[data-testid="button"]');
    
    // 2. Verify UI changes
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
    
    // 3. Verify database changes
    const prisma = getTestPrisma();
    const record = await prisma.booking.findFirst({ where: { ... } });
    expect(record).not.toBeNull();
  });
});
```

**Why `beforeEach` instead of `beforeAll`?**
- ✅ **Complete isolation** - Each test starts with clean database
- ✅ **No data pollution** - Test 1 doesn't affect Test 2
- ✅ **Predictable** - Always know exact database state
- ⚠️ **Slower** - Resets DB for every test (worth it for reliability)

### Using Fixtures

```typescript
import bookings from '../../fixtures/bookings.json';
import customers from '../../fixtures/customers.json';

test('create booking with fixture', async ({ page }) => {
  const booking = bookings.bookings[0];
  
  await page.fill('[data-testid="customer-name"]', booking.customerName);
  await page.fill('[data-testid="booking-date"]', booking.date);
  // ...
});
```

### Adding data-testid Attributes

In your React components:

```tsx
// DashboardPage.tsx
<div data-testid="dashboard">
  <Button data-testid="create-booking-btn" onClick={openModal}>
    Create Booking
  </Button>
</div>

// BookingModal.tsx
<div data-testid="booking-modal">
  {/* Source selection */}
  <div onClick={() => setSource('WALK_IN')} data-testid="source-walk-in">
    <Card>Walk-in</Card>
  </div>
  
  {/* Customer details */}
  <Input data-testid="customer-name" />
  <Input data-testid="customer-phone" />
  
  {/* Actions */}
  <Button data-testid="continue-btn">Continue</Button>
  <Button data-testid="create-booking-btn">Create Booking</Button>
</div>
```

### Best Practices

1. **Use data-testid selectors** - More stable than CSS classes or text
2. **Wait for elements** - Playwright auto-waits, but be explicit when needed
3. **Keep tests independent** - Each test should work in isolation
4. **Use descriptive names** - "should create booking when all fields are valid"
5. **Verify in database** - Don't just check UI, check actual data persistence

---

## Database Management

### How Database Helper Works

**`initializeTestDatabase()`**
- Deletes all test data (bookings, customer users)
- Creates admin user (admin@kgolf.com)
- Creates 4 test rooms
- Returns `{ admin, rooms }` for use in tests

**`getTestPrisma()`**
- Returns Prisma client connected to test database
- Use for direct database queries in tests

**`createTestCustomer()`**
- Helper to create test customer accounts
- Useful for testing "existing customer" flows

### Test Database Flow

```
1. test.beforeAll()
   ├── resetDatabase()        # Delete all data
   ├── seedTestData()         # Create admin + rooms
   └── Return { admin, rooms }

2. test('create booking')
   ├── User interacts with UI
   ├── Backend saves to TEST database
   └── Test queries DB to verify

3. test.afterAll()
   └── cleanupDatabase()      # Disconnect Prisma
```

### Manual Database Operations

**Connect to test database:**
```bash
psql -U postgres -d k_golf_test
```

**View tables:**
```sql
\dt
```

**Check bookings:**
```sql
SELECT * FROM "Booking";
```

**Check users:**
```sql
SELECT * FROM "User" WHERE role='CUSTOMER';
```

**Reset manually (if needed):**
```sql
TRUNCATE TABLE "Booking" CASCADE;
DELETE FROM "User" WHERE role='CUSTOMER';
```

---

## How It Works

### Architecture

```
E2E Test → Electron App → Backend API → Test PostgreSQL Database
```

### Test Flow Example

**Test: "should create walk-in booking with new customer"**

1. **Setup Phase (BEFORE EACH test):**
   ```typescript
   test.beforeEach(async () => {
     await initializeTestDatabase();
     // Deletes ALL bookings, customers, rooms, settings
     // Creates fresh admin + 4 rooms
     // DB now has: 1 admin, 4 rooms, 0 bookings, 0 customers
   });
   ```

2. **UI Interaction:**
   - Click "Create Booking"
   - Select "Walk-in" source
   - Select "New Customer" mode
   - Fill customer details
   - Select room
   - Fill booking details
   - Click "Create Booking"

3. **Backend Processing:**
   - Creates user account in TEST database
   - Creates booking in TEST database
   - Links booking to user and admin

4. **Verification:**
   ```typescript
   const booking = await prisma.booking.findFirst({
     where: { customerName: 'Test Customer' },
     include: { user: true }
   });
   
   expect(booking.status).toBe('CONFIRMED');
   expect(booking.user.role).toBe('CUSTOMER');
   expect(booking.createdBy).toBe(adminId);
   ```

5. **Next Test Starts:**
   ```typescript
   test.beforeEach() // ← Runs again!
     // Database reset → clean slate
     // This test has no data from previous test
   ```

### Database Reset Behavior

**What Gets Reset:**
- ✅ All bookings deleted
- ✅ All customer users deleted (admin preserved)
- ✅ All rooms deleted and recreated
- ✅ All settings deleted and recreated

**What Persists:**
- ✅ Database schema (tables, columns)
- ✅ Migrations (not re-run)

**Frequency:**
- 🔄 **Before EACH test** - Complete isolation
- 🧹 **After ALL tests** - Prisma disconnects

### Key Features

✅ **Isolated** - Each test starts with clean database (no data pollution)  
✅ **Predictable** - Always know exact database state  
✅ **Real** - Tests actual database operations, not mocks  
✅ **Fixtures** - Reusable test data in JSON files  
✅ **Verifiable** - Tests check database state after UI interactions
✅ **Clean** - Separate test database, won't affect dev data

---

## Troubleshooting

### "Cannot connect to database"

**Problem:** Test can't connect to PostgreSQL

**Solution:**
1. Check if PostgreSQL is running:
   ```bash
   docker ps | grep konegolf-postgres
   ```
2. Start if needed:
   ```bash
   docker-compose up -d db
   ```
3. Test connection:
   ```bash
   psql -h localhost -U kgolf -d k_golf_test
   # Password: kgolf_password
   ```

### "Relation does not exist"

**Problem:** Database tables not created

**Solution:**
Run migrations on test database:
```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/k_golf_test" \
  npx prisma migrate deploy
```

Or re-run setup script:
```bash
./scripts/setup_test_db.sh
```

### "Admin user not found"

**Problem:** Test database not seeded

**Solution:**
The `initializeTestDatabase()` function in `beforeAll` creates the admin. Check:
1. Test logs show "Seeding test database..."
2. Manually verify:
   ```sql
   psql -U postgres -d k_golf_test -c "SELECT * FROM \"User\" WHERE role='ADMIN';"
   ```

### "Backend connection refused"

**Problem:** Backend not running

**Solution:**
1. Start backend in **TEST mode**:
   ```bash
   cd backend
   npm run dev:test  # ← Uses test database, not production!
   ```
2. Verify health:
   ```bash
   curl http://localhost:8080/health
   ```
3. Verify backend is connected to TEST database (check logs on startup)

### "Email/Phone already exists" errors

**Problem:** Backend is connected to production database instead of test database

**Solution:**
1. **Stop backend** (Ctrl+C)
2. **Restart with test mode:**
   ```bash
   cd backend
   npm run dev:test  # ← This is crucial!
   ```
3. Verify logs show:
   ```
   DATABASE_URL=postgresql://...@localhost:5432/k_golf_test
   ```
4. **NOT** `kgolf_app` - that's the production database!

**Why this happens:**
- Production database has seed data (test@example.com, etc.)
- Tests try to create users with same emails → conflict!
- Test mode connects to separate `k_golf_test` database

### "Tests are slow"

**Solutions:**
- Use UI mode during development: `npm run test:e2e:ui`
- Run specific test: `npx playwright test create-booking.spec.ts`
- Comment out `beforeAll` database reset for rapid iteration

### TypeScript errors in test files

**Problem:** `Cannot find module '@playwright/test'`

**Solution:**
```bash
cd pos
npm install
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install backend dependencies
        run: cd backend && npm install
      
      - name: Install POS dependencies
        run: cd pos && npm install
      
      - name: Setup test database
        run: cd backend && ./scripts/setup_test_db.sh
        env:
          POSTGRES_PASSWORD: postgres
      
      - name: Install Playwright browsers
        run: cd pos && npx playwright install --with-deps
      
      - name: Start backend
        run: cd backend && npm run dev &
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/kgolf_app
      
      - name: Wait for backend
        run: npx wait-on http://localhost:8080/health
      
      - name: Run E2E tests
        run: cd pos && npm run test:e2e
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: pos/playwright-report/
          
      - name: Upload test videos
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-videos
          path: pos/test-results/
```

---

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright for Electron](https://playwright.dev/docs/api/class-electron)
- [Test Fixtures Guide](https://playwright.dev/docs/test-fixtures)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)

---

## Current Test Coverage

### Implemented Tests

✅ **Create walk-in booking with new customer**
- Steps through 5-step wizard
- Verifies booking in database
- Checks user creation
- Validates foreign keys

✅ **Validate phone number (10 digits)**
- Tests input validation

✅ **Guest mode disabled for phone bookings**
- Tests business logic constraints

### Tests To Add (Future)

- [ ] Search and select existing customer
- [ ] Guest booking flow (walk-in only)
- [ ] Phone booking flow
- [ ] Error handling (invalid dates, room conflicts)
- [ ] Form validation for all fields
- [ ] Multiple bookings in sequence
- [ ] Edit/cancel booking flows

---

## Tips & Tricks

### Interactive Development

Use UI mode for best development experience:
```bash
npm run test:e2e:ui
```

Features:
- See Electron window live
- Step through tests line-by-line
- Inspect elements with picker
- View network requests
- Time-travel debugging

### Debug Failed Tests

When a test fails, Playwright captures:
- Screenshots
- Videos
- Trace files (timeline of all actions)

View trace:
```bash
npx playwright show-trace test-results/[...]/trace.zip
```

### Speed Up Development

Skip database reset during rapid iteration:
```typescript
test.beforeAll(async () => {
  // await initializeTestDatabase(); // Comment out temporarily
});
```

Remember to uncomment before committing!

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review Playwright docs: https://playwright.dev
3. Check test logs and error messages
4. Use debug mode: `npm run test:e2e:debug`
