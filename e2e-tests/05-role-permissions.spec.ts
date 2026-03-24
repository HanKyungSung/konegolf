import { test, expect } from '@playwright/test';
import {
  SALES_USER,
  STAFF_USER,
  TEST_USER,
  loginAsSales,
  loginAsStaff,
  loginAsTestUser,
  createBookingViaAPI,
} from './helpers';

// superadmin has guaranteed ADMIN role (admin@konegolf.ca may have been changed)
const SUPERADMIN = { email: 'superadmin@konegolf.ca', password: 'superadmin123' };

async function loginAsSuperAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#email').fill(SUPERADMIN.email);
  await page.locator('#password').fill(SUPERADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 10000 });
}

const API_BASE = 'http://localhost:8080';

/**
 * 05 — Role-Based Permission Tests
 *
 * Verifies that ADMIN, STAFF, SALES, and CUSTOMER roles have the correct
 * access to UI elements and backend API endpoints.
 *
 * Permission matrix:
 *   ADMIN  — full access (read + write everything)
 *   STAFF  — POS operations (bookings, orders, room control); no admin-only (customers CRUD, menu CRUD)
 *   SALES  — read-only access matching admin visibility; no write actions
 *   CUSTOMER — customer dashboard only; no POS or admin access
 */

// ────────────────────────────────────────────────────────────
// 1. Login & Redirect
// ────────────────────────────────────────────────────────────
test.describe('Login & Redirect by Role', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('ADMIN lands on POS dashboard with Create Booking', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 10000 });
  });

  test('STAFF lands on POS dashboard with Create Booking', async ({ page }) => {
    await loginAsStaff(page);
    await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 10000 });
  });

  test('SALES lands on POS dashboard without Create Booking', async ({ page }) => {
    await loginAsSales(page);
    // Should reach dashboard
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
    // Should NOT see write buttons
    await expect(page.getByRole('button', { name: 'Create Booking' })).not.toBeVisible({ timeout: 3000 });
  });

  test('CUSTOMER lands on customer dashboard without POS', async ({ page }) => {
    await loginAsTestUser(page);
    await expect(page.getByRole('button', { name: 'Create Booking' })).not.toBeVisible({ timeout: 3000 });
  });
});

// ────────────────────────────────────────────────────────────
// 2. POS Dashboard — UI Element Visibility
// ────────────────────────────────────────────────────────────
test.describe('POS Dashboard — ADMIN visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSuperAdmin(page);
  });

  test('ADMIN sees Quick Sale button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Quick Sale' })).toBeVisible({ timeout: 5000 });
  });

  test('ADMIN sees Create Booking button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 5000 });
  });

  test('ADMIN sees Room Management tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Room Management' })).toBeVisible({ timeout: 5000 });
  });

  test('ADMIN sees Menu tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Menu' })).toBeVisible({ timeout: 5000 });
  });

  test('ADMIN sees Tax Settings tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Tax Settings' })).toBeVisible({ timeout: 5000 });
  });

  test('ADMIN sees Customers nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('POS Dashboard — STAFF visibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsStaff(page);
  });

  test('STAFF sees Quick Sale button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Quick Sale' })).toBeVisible({ timeout: 5000 });
  });

  test('STAFF sees Create Booking button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 5000 });
  });

  test('STAFF sees Room Management tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Room Management' })).toBeVisible({ timeout: 5000 });
  });

  test('STAFF sees Menu tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Menu' })).toBeVisible({ timeout: 5000 });
  });

  test('STAFF sees Tax Settings tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Tax Settings' })).toBeVisible({ timeout: 5000 });
  });

  test('STAFF does NOT see Customers nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Customers' })).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('POS Dashboard — SALES read-only restrictions', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSales(page);
  });

  test('SALES sees Room Status', async ({ page }) => {
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
  });

  test('SALES does NOT see Quick Sale button', async ({ page }) => {
    // Wait for dashboard to load first
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Quick Sale' })).not.toBeVisible({ timeout: 3000 });
  });

  test('SALES does NOT see Create Booking button', async ({ page }) => {
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Create Booking' })).not.toBeVisible({ timeout: 3000 });
  });

  test('SALES does NOT see Room Management tab', async ({ page }) => {
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: 'Room Management' })).not.toBeVisible({ timeout: 3000 });
  });

  test('SALES does NOT see Menu tab', async ({ page }) => {
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: 'Menu' })).not.toBeVisible({ timeout: 3000 });
  });

  test('SALES does NOT see Tax Settings tab', async ({ page }) => {
    await expect(page.locator('text=Room Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: 'Tax Settings' })).not.toBeVisible({ timeout: 3000 });
  });

  test('SALES sees Customers nav link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Customers' })).toBeVisible({ timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────
// 3. Booking Detail — SALES Read-Only
// ────────────────────────────────────────────────────────────
test.describe('Booking Detail — SALES read-only', () => {
  let bookingId: string;

  test.beforeAll(async ({ browser }) => {
    // Create a booking via API using admin key
    const context = await browser.newContext();
    const page = await context.newPage();
    bookingId = await createBookingViaAPI(page);
    await context.close();
  });

  test('SALES can view booking detail but has no write actions', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSales(page);

    // Navigate to booking detail
    await page.goto(`/pos/booking/${bookingId}`);
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });

    // Read-only checks: Quick Actions card should not be visible
    await expect(page.locator('text=Quick Actions')).not.toBeVisible({ timeout: 3000 });

    // Menu card should not be visible (for ordering items)
    // Look for the "Click items to add to order" description text which is unique to the Menu card
    await expect(page.locator('text=Click items to add to order')).not.toBeVisible({ timeout: 3000 });
  });

  test('ADMIN can view booking detail with full actions', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSuperAdmin(page);

    await page.goto(`/pos/booking/${bookingId}`);
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });

    // Admin should see Quick Actions and Menu
    await expect(page.locator('text=Quick Actions')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Click items to add to order')).toBeVisible({ timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────
// 4. Customers Page — Role Access
// ────────────────────────────────────────────────────────────
test.describe('Customers Page — SALES read-only', () => {
  test('SALES can view customers page but cannot add', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSales(page);

    // Click the Customers nav link (SPA client-side routing)
    await page.getByRole('button', { name: 'Customers' }).click();
    await page.waitForURL('**/admin/customers', { timeout: 10000 });
    // Should load customers list
    await expect(page.locator('text=Total Customers')).toBeVisible({ timeout: 10000 });

    // Should NOT see Add Customer button
    await expect(page.getByRole('button', { name: 'Add Customer' })).not.toBeVisible({ timeout: 3000 });
  });

  test('ADMIN can view customers page with add button', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSuperAdmin(page);

    // Click the Customers nav link (SPA client-side routing)
    await page.getByRole('button', { name: 'Customers' }).click();
    await page.waitForURL('**/admin/customers', { timeout: 10000 });
    await expect(page.locator('text=Total Customers')).toBeVisible({ timeout: 10000 });

    // Admin should see Add Customer button
    await expect(page.getByRole('button', { name: 'Add Customer' })).toBeVisible({ timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────
// 5. Menu Management — Route Protection
// ────────────────────────────────────────────────────────────
test.describe('Menu Management — SALES blocked', () => {
  test('SALES is redirected away from /pos/menu', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSales(page);

    await page.goto('/pos/menu');
    // Should redirect to /pos/dashboard
    await page.waitForURL('**/pos/dashboard', { timeout: 10000 });
  });

  test('ADMIN can access /pos/menu', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsSuperAdmin(page);

    await page.goto('/pos/menu');
    // Should stay on menu page; look for menu management heading
    await expect(page.locator('text=Menu Management').first()).toBeVisible({ timeout: 10000 });
  });
});

// ────────────────────────────────────────────────────────────
// 6. POS Access — CUSTOMER blocked
// ────────────────────────────────────────────────────────────
test.describe('POS Access — CUSTOMER blocked', () => {
  test('CUSTOMER cannot access /pos/dashboard', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsTestUser(page);

    await page.goto('/pos/dashboard');
    // Should show Access Denied or redirect
    await expect(page.locator('text=Access Denied')).toBeVisible({ timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────
// 7. Backend API — Permission Enforcement
// ────────────────────────────────────────────────────────────
test.describe('Backend API — SALES permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    // Login as SALES to get session cookie
    await loginAsSales(page);
  });

  // --- READ endpoints (should be allowed) ---
  test('SALES can GET /api/customers', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/customers`);
    expect(res.status()).toBe(200);
  });

  test('SALES can GET /api/reports/daily-summary', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/reports/daily-summary`);
    expect(res.status()).toBe(200);
  });

  test('SALES can GET /api/reports/monthly-sales', async ({ page }) => {
    const now = new Date();
    const res = await page.request.get(`${API_BASE}/api/reports/monthly-sales?month=${now.getMonth() + 1}&year=${now.getFullYear()}`);
    // 200 = success (PDF stream)
    expect(res.status()).toBe(200);
  });

  test('SALES can GET /api/coupons', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/coupons`);
    expect(res.status()).toBe(200);
  });

  test('SALES can GET /api/scores', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/scores`);
    expect(res.status()).toBe(200);
  });

  // --- WRITE endpoints (should be denied with 403) ---
  test('SALES cannot POST /api/customers', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/customers`, {
      data: { name: 'Blocked', phone: '+19999999999', email: 'blocked@test.com' },
    });
    expect(res.status()).toBe(403);
  });

  test('SALES cannot PUT /api/customers/:id', async ({ page }) => {
    const res = await page.request.put(`${API_BASE}/api/customers/nonexistent-id`, {
      data: { name: 'Blocked' },
    });
    expect(res.status()).toBe(403);
  });

  test('SALES cannot DELETE /api/customers/:id', async ({ page }) => {
    const res = await page.request.delete(`${API_BASE}/api/customers/nonexistent-id`);
    expect(res.status()).toBe(403);
  });

  test('SALES cannot POST /api/bookings/simple/quick-sale', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/bookings/simple/quick-sale`);
    expect(res.status()).toBe(403);
  });

  test('SALES cannot POST /api/bookings/simple/create', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/bookings/simple/create`, {
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test('SALES cannot POST /api/coupons', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/coupons`, {
      data: { code: 'BLOCKED', discount: 10 },
    });
    expect(res.status()).toBe(403);
  });

  test('SALES cannot POST /api/menu/items', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/menu/items`, {
      data: { name: 'Blocked Item', price: 9.99, category: 'FOOD' },
    });
    expect(res.status()).toBe(403);
  });

  test('SALES cannot PATCH /api/menu/items/:id', async ({ page }) => {
    const res = await page.request.patch(`${API_BASE}/api/menu/items/1`, {
      data: { name: 'Blocked' },
    });
    expect(res.status()).toBe(403);
  });

  test('SALES cannot DELETE /api/menu/items/:id', async ({ page }) => {
    const res = await page.request.delete(`${API_BASE}/api/menu/items/1`);
    expect(res.status()).toBe(403);
  });
});

test.describe('Backend API — STAFF permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsStaff(page);
  });

  // STAFF can do POS operations
  test('STAFF can POST /api/bookings/simple/quick-sale', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/bookings/simple/quick-sale`);
    // 201 = Created
    expect(res.status()).toBe(201);
  });

  // STAFF cannot do admin-only operations
  test('STAFF cannot POST /api/customers', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/customers`, {
      data: { name: 'Blocked', phone: '+19999999998', email: 'blocked-staff@test.com' },
    });
    expect(res.status()).toBe(403);
  });

  test('STAFF cannot POST /api/menu/items', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/menu/items`, {
      data: { name: 'Blocked Item', price: 9.99, category: 'FOOD' },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Backend API — CUSTOMER permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsTestUser(page);
  });

  test('CUSTOMER cannot GET /api/customers', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/customers`);
    expect(res.status()).toBe(403);
  });

  test('CUSTOMER cannot GET /api/reports/daily-summary', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/reports/daily-summary`);
    expect(res.status()).toBe(403);
  });

  test('CUSTOMER cannot POST /api/bookings/simple/quick-sale', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/bookings/simple/quick-sale`);
    expect(res.status()).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────
// 8. Backend API — Unauthenticated Access
// ────────────────────────────────────────────────────────────
test.describe('Backend API — Unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('Unauthenticated cannot GET /api/customers', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/customers`);
    expect(res.status()).toBe(401);
  });

  test('Unauthenticated cannot GET /api/reports/daily-summary', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/api/reports/daily-summary`);
    expect(res.status()).toBe(401);
  });

  test('Unauthenticated cannot POST /api/bookings/simple/quick-sale', async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/bookings/simple/quick-sale`);
    expect(res.status()).toBe(401);
  });
});
