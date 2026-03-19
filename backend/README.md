# K-Golf Backend API

Express + TypeScript + PostgreSQL + Prisma backend for the K-Golf booking platform.

## Tech Stack

- **Runtime**: Node.js 22+
- **Framework**: Express 4
- **Language**: TypeScript 5
- **Database**: PostgreSQL 15+ (via Prisma ORM 5)
- **Authentication**: Session-based (HttpOnly cookies)
- **Validation**: Zod
- **Testing**: Jest + Supertest
- **Logging**: Pino

## Project Structure

```
backend/
├── src/
│   ├── middleware/
│   │   └── requireAuth.ts         # Authentication middleware
│   ├── repositories/
│   │   └── bookingRepo.ts         # Database access layer
│   ├── routes/
│   │   ├── auth.ts                # Login, logout, verification
│   │   └── booking.ts             # Booking CRUD + rooms API
│   ├── services/
│   │   ├── authService.ts         # Password hashing, tokens
│   │   └── emailService.ts        # Email sending (nodemailer)
│   ├── types/
│   │   └── express.d.ts           # Express type extensions
│   └── server.ts                  # App entry point
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Database seeding
│   └── migrations/                # Migration history
├── tests/                         # Test suite (see Testing section)
├── scripts/
│   └── provision_native_db.sh     # Local DB setup script
├── .env                           # Local environment variables
├── .env.example                   # Environment template
├── package.json
└── tsconfig.json
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/kgolf"
TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/kgolf_test"
SESSION_SECRET="your-secret-key-here"
CORS_ORIGIN="http://localhost:5173"
EMAIL_FROM="general@konegolf.ca"
```

### 3. Database Setup

We use **two separate databases** for different purposes:

| Database | Purpose | Seeding |
|----------|---------|---------|
| `kgolf_app` | Local development, manual testing | Mock data (133 bookings) |
| `k_golf_test` | Automated unit/E2E tests | Mock data (isolated) |

**Why separate databases?**
- ✅ **Isolation**: Tests don't interfere with dev data
- ✅ **Safety**: Can reset test DB anytime without losing dev work
- ✅ **Speed**: Tests run against optimized test fixtures
- ✅ **Realism**: Dev DB has realistic volume of data for UX testing

#### Initial Setup

```bash
# Start PostgreSQL (Docker)
docker-compose up -d db

# Or use local PostgreSQL
# brew install postgresql@15
# brew services start postgresql@15

# Create databases (one-time)
createdb kgolf_app     # Development database
createdb k_golf_test   # Test database

# Run migrations on BOTH databases
DATABASE_URL=postgresql://kgolf:kgolf_password@localhost:5432/kgolf_app npm run prisma:migrate
DATABASE_URL=postgresql://kgolf:kgolf_password@localhost:5432/k_golf_test npm run prisma:migrate

# Seed both databases with mock data
npm run db:seed:dev    # Seeds kgolf_app (development)
npm run db:seed:test   # Seeds k_golf_test (testing)
```

#### Daily Development Workflow

```bash
# Start dev server (uses kgolf_app by default)
npm run dev

# Or run with test database (for test scenario debugging)
npm run dev:test
```

#### Resetting Databases

```bash
# Reset dev database (when you want fresh data)
npm run db:seed:dev

# Reset test database (before running tests)
npm run db:seed:test

# Or reset schema + data (destructive!)
DATABASE_URL=postgresql://kgolf:kgolf_password@localhost:5432/kgolf_app npx prisma migrate reset
```

### 4. Run Development Server

```bash
npm run dev
```

Server runs at `http://localhost:8080`

## NPM Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled production build

# Database
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run migrations (dev)
npm run prisma:studio    # Open Prisma Studio GUI
npm run db:seed          # Seed using DATABASE_URL from .env
npm run db:seed:dev      # Seed kgolf_app (development database)
npm run db:seed:test     # Seed k_golf_test (test database)

# Testing (see Testing section below)
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage    # Generate coverage report
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout current session
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/verify-email` - Verify email with token
- `POST /api/auth/resend-verification` - Resend verification email

### Bookings

- `GET /api/bookings` - List all bookings (admin/dev)
- `GET /api/bookings/mine` - Current user's bookings
- `POST /api/bookings` - Create new booking
- `PATCH /api/bookings/:id/cancel` - Cancel booking
- `GET /api/bookings/availability` - Check available time slots
- `GET /api/bookings/rooms` - List active rooms

### Admin (Phase 1 - In Progress)

- `GET /api/users/lookup?phone={phone}` - Lookup user by phone (Phase 1.3)
- `GET /api/users/recent?limit={10}` - Recent customers (Phase 1.3)
- `POST /api/bookings/admin/create` - Manual booking creation (Phase 1.4)
- `PATCH /api/bookings/rooms/:id` - Update room hours/status

### Settings

- `GET /api/settings` - List all settings
- `GET /api/settings/:key` - Get specific setting
- `PUT /api/settings/:key` - Update setting (admin)

## Database Schema

Key models:
- **User**: email (nullable), phone (unique), name, role, password
- **Booking**: roomId, userId (nullable for guests), startTime, endTime, status
- **Room**: name, capacity, hourlyRate, status, openMinutes, closeMinutes
- **Session**: userId, expiresAt
- **Setting**: key-value store for global config (e.g., tax rate)

See `prisma/schema.prisma` for full schema definition.

## Testing

### Backend Testing Stack

**Framework:** Jest + Supertest + Prisma Test Environment

**Why this stack?**
- **Jest**: Industry standard, excellent TypeScript support, built-in mocking and coverage
- **Supertest**: Perfect for Express API integration testing (HTTP requests)
- **Prisma Test Environment**: Isolated database per test suite for data integrity
- **ts-jest**: Seamless TypeScript execution in tests

### Test Structure

```
backend/
├── src/                           # Application code
├── tests/
│   ├── setup/
│   │   ├── globalSetup.ts         # Create test database
│   │   ├── globalTeardown.ts      # Cleanup test database
│   │   └── testDbSetup.ts         # Prisma test client + DB helpers
│   ├── unit/
│   │   ├── services/
│   │   │   └── authService.test.ts
│   │   └── utils/
│   │       └── phoneUtils.test.ts  # Phone normalization/validation
│   ├── integration/
│   │   ├── auth.test.ts            # Login, session, verification
│   │   ├── booking.test.ts         # Booking CRUD operations
│   │   ├── users.test.ts           # User lookup API (Phase 1.3)
│   │   └── adminBooking.test.ts    # Admin manual booking (Phase 1.4)
│   └── fixtures/
│       ├── users.ts                # Test user data
│       ├── rooms.ts                # Test room data
│       └── bookings.ts             # Test booking data
├── jest.config.js
├── jest.setup.ts
└── package.json
```

### Test Categories

**Unit Tests** (`tests/unit/`)
- Pure function testing (no database, no HTTP)
- Fast execution (< 1ms per test)
- Examples: phone utilities, price calculators, date helpers
- Run independently with mocked dependencies

**Integration Tests** (`tests/integration/`)
- Full HTTP request/response cycle via Supertest
- Real database operations (test database)
- Complete API flow: auth → validation → business logic → DB → response
- Examples: booking creation, user authentication, admin operations

**Fixtures** (`tests/fixtures/`)
- Reusable test data builders
- Consistent test scenarios across suites
- Factory functions for users, rooms, bookings

### Test Database Strategy

**Separate Test Database:**
- Uses `TEST_DATABASE_URL` environment variable
- Isolated from development database (`kgolf_test` vs `kgolf_app`)
- Fresh migration state for each test run
- Cleaned between test suites to prevent cross-contamination

**Database Persistence Approach:**

We use a **persistent test database** that remains between test runs:

1. **Before tests:** Database `kgolf_test` exists with all tables/schema from migrations
2. **Before each test file:** `clearDatabase()` wipes all data (but keeps tables/schema)
3. **During tests:** Tests create and manipulate data
4. **After each test:** Cleanup hooks delete test data
5. **After tests complete:** Database and tables remain for next run

**Why keep the database persistent?**
- ✅ **Fast enough:** Tests run quickly (1-2s for typical suite)
- ✅ **Easier debugging:** Can inspect database after failed tests
- ✅ **Simpler setup:** Database already exists from initial setup
- ✅ **Matches workflow:** Mirrors development database behavior

**Alternative approaches we considered but didn't implement:**
- **Transaction rollback:** Each test in a transaction that rolls back (faster, perfect isolation, but harder to debug)
- **Full teardown:** Drop database after each run (complete isolation, but slower and more complex setup)

**Database Helpers** (in `testDbSetup.ts`):
- `clearDatabase()` - Wipe all tables (respecting FK order)
- `seedTestData()` - Create baseline test fixtures
- `prisma` - Test-specific Prisma client instance

### NPM Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run only unit tests (fast feedback)
npm run test:unit

# Run only integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

### Coverage Goals

- **Unit Tests**: 80%+ line coverage for utilities and services
- **Integration Tests**: All API endpoints covered with happy path + error cases
- **Critical Paths**: 100% coverage for booking overlap, auth, payment logic

### Example: Unit Test (Phone Utilities)

```typescript
// tests/unit/utils/phoneUtils.test.ts
describe('normalizePhone', () => {
  it('normalizes Canadian phone without country code', () => {
    expect(normalizePhone('416-555-1234')).toBe('+14165551234');
  });

  it('is idempotent', () => {
    expect(normalizePhone('+14165551234')).toBe('+14165551234');
  });
});
```

### Example: Integration Test (Admin Booking)

```typescript
// tests/integration/adminBooking.test.ts
describe('POST /api/bookings/admin/create', () => {
  it('creates guest booking without user account', async () => {
    const res = await request(app)
      .post('/api/bookings/admin/create')
      .set('Cookie', adminCookie)
      .send({
        customerMode: 'guest',
        guest: { name: 'Guest', phone: '+14165551234' },
        roomId: testRoomId,
        startTimeIso: '2025-10-15T14:00:00Z',
        hours: 2,
        players: 2,
        bookingSource: 'WALK_IN',
      });

    expect(res.status).toBe(200);
    expect(res.body.booking.isGuestBooking).toBe(true);
    expect(res.body.booking.userId).toBeNull();
  });
});
```

### Running Tests Locally

1. **Set up test database:**
   ```bash
   # Create test database (one-time)
   createdb kgolf_test
   
   # Or add to .env
   TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/kgolf_test"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run tests:**
   ```bash
   npm test                    # All tests
   npm run test:unit          # Fast unit tests only
   npm run test:integration   # API integration tests
   npm run test:coverage      # With coverage report
   ```

### CI/CD Integration

Tests run automatically on:
- Every pull request
- Before merging to main branch
- Before production deployment

**Failure Policy:** All tests must pass before merge/deploy.

### Test Coverage Report

After running `npm run test:coverage`, view the report:
```bash
open coverage/lcov-report/index.html
```

Coverage thresholds (enforced in CI):
- **Statements**: 70%
- **Branches**: 65%
- **Functions**: 70%
- **Lines**: 70%

### Writing New Tests

**Checklist for New Features:**
1. ✅ Unit tests for utilities/helpers (if any pure functions)
2. ✅ Integration tests for API endpoints (happy path + errors)
3. ✅ Database cleanup in `afterEach` or `afterAll` hooks
4. ✅ Use fixtures for consistent test data
5. ✅ Test authentication/authorization where applicable
6. ✅ Verify error messages match API contract

**Test Naming Convention:**
- `describe('Function/Endpoint Name')`
- `it('should [expected behavior] when [condition]')`
- Example: `it('should return 409 when phone number already exists')`

## Architecture Patterns

### Repository Pattern

Database access is abstracted through repository modules (e.g., `bookingRepo.ts`):

```typescript
// repositories/bookingRepo.ts
export async function createBooking(data: BookingCreateInput) {
  return prisma.booking.create({ data });
}

export async function findBookingById(id: string) {
  return prisma.booking.findUnique({ where: { id } });
}
```

**Benefits:**
- Route handlers stay thin (validate → call → respond)
- Database logic centralized and testable
- Easy to mock in tests
- Future ORM changes isolated

### Request Validation (Zod)

All request bodies validated with Zod schemas:

```typescript
const createBookingSchema = z.object({
  roomId: z.string().uuid(),
  startTimeIso: z.string().datetime(),
  players: z.number().int().min(1).max(4),
  hours: z.number().int().min(1).max(4),
});

// In route handler
const parsed = createBookingSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ error: parsed.error.flatten() });
}
```

**Benefits:**
- Runtime type safety
- Automatic TypeScript type inference
- Clear validation error messages
- Single source of truth for request shape

## Environment Variables

See `.env.example` for full list. Key variables:

```env
# Database
DATABASE_URL="postgresql://..."
TEST_DATABASE_URL="postgresql://..."  # Separate test DB

# Authentication
SESSION_SECRET="random-secret-key"
JWT_SECRET="another-secret"  # If using JWT (future)

# CORS
CORS_ORIGIN="http://localhost:5173"  # Frontend origin

# Email (Production)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="general@konegolf.ca"
SMTP_PASS="app-password"
EMAIL_FROM="general@konegolf.ca"

# Frontend URL (for email links)
FRONTEND_ORIGIN="https://k-golf.inviteyou.ca"

# Application
PORT="8080"
NODE_ENV="development"  # production | test
```

## Migration Guide

### Adding New Migrations

```bash
# 1. Update prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name descriptive_migration_name

# 3. Verify migration applied
npx prisma migrate status

# 4. Update seed if needed
npm run db:seed
```

### Production Deployments

```bash
# Never use migrate dev in production!
npx prisma migrate deploy

# This runs pending migrations without prompting
```

### Migration Best Practices

- ✅ **Append-only**: Never delete or modify existing migrations
- ✅ **Descriptive names**: `add_phone_to_users`, `create_booking_indexes`
- ✅ **Test locally**: Run `migrate dev` and verify app works
- ✅ **Data safety**: Use SQL transactions for data migrations
- ❌ **Never**: Delete migrations after they're applied
- ❌ **Never**: Use `migrate reset` in production

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps db

# Or for local PostgreSQL
brew services list | grep postgresql

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Prisma Client Out of Sync

```bash
# Regenerate Prisma Client
npm run prisma:generate

# If schema and DB diverge
npm run prisma:migrate dev  # Dev only!
```

### TypeScript Errors in Tests

```bash
# Clear Jest cache
npx jest --clearCache

# Rebuild TypeScript
npm run build
```

### Port Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill process
kill -9 <PID>

# Or change PORT in .env
PORT=3001
```

## Production Deployment

See root `README.md` for full deployment guide.

**Key Points:**
- Use `npx prisma migrate deploy` (never `migrate dev`)
- Set `NODE_ENV=production`
- Use strong `SESSION_SECRET` and `JWT_SECRET`
- Configure CORS for production frontend URL
- Enable HTTPS (TLS termination at Nginx)
- Set up database backups
- Monitor error logs (Pino + log aggregation)

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow existing patterns (repository, Zod validation)
- Write tests for new features
- Run linter before committing (when enabled)

### Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] New endpoints have integration tests
- [ ] New utilities have unit tests
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Database migrations tested locally
- [ ] Environment variables documented in `.env.example`
- [ ] API endpoints documented in this README

## Related Documentation

- [Root README](../README.md) - Project overview and architecture
- [Frontend README](../frontend/README.md) - Frontend documentation
- [POS TASKS](../pos/TASKS.md) - POS implementation checklist
- [Admin Booking Feature Spec](../docs/admin_manual_booking_feature.md) - Phase 1 details
- [Phone Number Architecture](../docs/phone_number_country_code_handling.md) - Phone handling design

## License

Private - K-Golf Platform
