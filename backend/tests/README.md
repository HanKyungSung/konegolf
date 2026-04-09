# Test Organization

This directory contains tests organized by type and feature domain, not by implementation phase.

## Directory Structure

```
tests/
├── unit/           # Pure unit tests (no external dependencies)
│   ├── utils/      # Utility function tests
│   │   └── phone.test.ts
│   ├── coupon/     # Coupon system logic tests
│   │   ├── birthday-tax-included.test.ts
│   │   └── coupon-payment.test.ts
│   └── receipt/    # Receipt storage tests
│       └── receipt-routes.test.ts
├── db/             # Database integration tests (Prisma + DB)
│   └── schema.test.ts
├── e2e/            # End-to-end API tests (HTTP + Auth + DB)
│   └── users.test.ts (currently skipped)
└── setup/          # Shared test setup and utilities
    └── testDbSetup.ts
```

## Test Types

### Unit Tests (`tests/unit/`)
- **Purpose**: Test pure functions and business logic in isolation
- **Dependencies**: None (no database, no HTTP, no external services)
- **Speed**: Very fast (< 1ms per test)
- **Run**: `npm run test:unit`
- **Examples**: Phone utilities, validation functions, formatting helpers

**Organization**:
- `utils/phone.test.ts` - Phone normalization, validation, formatting (59 tests)
- `coupon/birthday-tax-included.test.ts` - Birthday coupon tax-inclusive discount logic (23 tests)
- `coupon/coupon-payment.test.ts` - COUPON payment method validation, invoice math for all scenarios (19 tests)
- `receipt/receipt-routes.test.ts` - Receipt upload/download/delete endpoints, storage service (48 tests)

### Database Tests (`tests/db/`)
- **Purpose**: Test database schema, constraints, and Prisma operations
- **Dependencies**: Test database (kgolf_test)
- **Speed**: Fast (< 10ms per test)
- **Run**: `npm run test:db`
- **Examples**: Schema validation, unique constraints, foreign keys, data integrity

**Organization**:
- `schema.test.ts` - Database schema and constraints (14 tests)

### E2E Tests (`tests/e2e/`)
- **Purpose**: Test full application stack (HTTP → Auth → Routes → DB)
- **Dependencies**: Test server, test database, authentication
- **Speed**: Slower (100-500ms per test)
- **Run**: `npm run test:e2e`
- **Status**: Currently skipped (requires test server auth setup)

**Organization**:
- `users.test.ts` - User lookup and recent customers API (21 tests, skipped)

## Running Tests

```bash
# Run all tests
npm test

# Run specific test type
npm run test:unit       # Unit tests only
npm run test:db         # Database tests only
npm run test:e2e        # E2E tests only (currently skipped)

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Test Results Summary

| Test Type | Tests | Status | Notes |
|-----------|-------|--------|-------|
| Unit      | 59    | ✅ All passing | Phone utilities |
| Unit      | 42    | ✅ All passing | Coupon logic |
| Unit      | 48    | ✅ All passing | Receipt routes |
| Unit      | 20    | ✅ All passing | Manager role (schema validation, access logic) |
| Database  | 14    | ✅ All passing | Schema validation |
| E2E       | 21    | ⏭️ Skipped | Awaiting test server auth setup |
| **Total** | **204** | **183 passing, 21 skipped** | |

### Playwright E2E Tests (separate from Jest)

| Test File | Tests | Status | Notes |
|-----------|-------|--------|-------|
| `15-split-payment-receipts.spec.ts` | 7 | ✅ All passing | Split-payment receipt scenarios |
| `16-manager-panel.spec.ts` | 20 | ✅ All passing | Role CRUD, PIN flow, tab visibility, sub-tab content, lock, inactive manager, STAFF API access |

## Adding New Tests

### When to add unit tests:
- Pure utility functions
- Business logic without external dependencies
- Validation functions
- Formatting/transformation functions

### When to add database tests:
- Schema changes
- Constraint validation
- Prisma query testing
- Data integrity checks

### When to add E2E tests:
- API endpoint behavior
- Authentication/authorization flows
- Full user journeys
- Integration of multiple components

## Test Database

Tests use a persistent test database (`kgolf_test`) separate from the production database (`kgolf_app`).

**Connection**: Configured in `tests/setup/testDbSetup.ts`
**Persistence**: Test data persists between runs for faster execution
**Cleanup**: Use `clearDatabase()` in test setup when needed

See `../README.md` for more details on test database strategy.
