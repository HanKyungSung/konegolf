import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsStaff, API_BASE } from './helpers';

/**
 * 16 — Manager Panel E2E Tests
 * Tests: Employee role CRUD, verify-manager PIN endpoint,
 * and manager panel data access.
 */

const ADMIN_KEY = 'pos-dev-key-change-in-production';
const headers = { 'x-pos-admin-key': ADMIN_KEY };

let managerEmployeeId: string;
let staffEmployeeId: string;
const MANAGER_PIN = '9999';
const STAFF_PIN = '8888';

test.describe('Manager Panel', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);

    // Clean up any existing test employees
    const listRes = await page.request.get(`${API_BASE}/api/employees`, {
      headers: { 'x-pos-admin-key': ADMIN_KEY },
    });
    const empData = await listRes.json();
    for (const emp of empData.employees) {
      if (emp.name === 'E2E Manager' || emp.name === 'E2E Staff') {
        await page.request.delete(`${API_BASE}/api/employees/${emp.id}`, {
          headers: { 'x-pos-admin-key': ADMIN_KEY },
        });
      }
    }

    // Create a MANAGER employee
    const createManagerRes = await page.request.post(`${API_BASE}/api/employees`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: 'E2E Manager', pin: MANAGER_PIN, role: 'MANAGER' },
    });
    expect(createManagerRes.ok()).toBeTruthy();
    const managerData = await createManagerRes.json();
    managerEmployeeId = managerData.employee.id;
    expect(managerData.employee.role).toBe('MANAGER');

    // Create a STAFF employee
    const createStaffRes = await page.request.post(`${API_BASE}/api/employees`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: 'E2E Staff', pin: STAFF_PIN, role: 'STAFF' },
    });
    expect(createStaffRes.ok()).toBeTruthy();
    const staffData = await createStaffRes.json();
    staffEmployeeId = staffData.employee.id;
    expect(staffData.employee.role).toBe('STAFF');

    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);

    // Clean up test employees
    if (managerEmployeeId) {
      await page.request.delete(`${API_BASE}/api/employees/${managerEmployeeId}`, { headers });
    }
    if (staffEmployeeId) {
      await page.request.delete(`${API_BASE}/api/employees/${staffEmployeeId}`, { headers });
    }
    await page.close();
  });

  // ── Employee Role CRUD ──

  test('GET /api/employees returns role field', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.get(`${API_BASE}/api/employees`, { headers });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    const manager = data.employees.find((e: any) => e.id === managerEmployeeId);
    const staff = data.employees.find((e: any) => e.id === staffEmployeeId);
    expect(manager.role).toBe('MANAGER');
    expect(staff.role).toBe('STAFF');
  });

  test('PUT /api/employees/:id can change role to MANAGER', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.put(`${API_BASE}/api/employees/${staffEmployeeId}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { role: 'MANAGER' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.employee.role).toBe('MANAGER');

    // Revert back
    await page.request.put(`${API_BASE}/api/employees/${staffEmployeeId}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { role: 'STAFF' },
    });
  });

  test('PUT /api/employees/:id rejects invalid role', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.put(`${API_BASE}/api/employees/${staffEmployeeId}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { role: 'ADMIN' },
    });
    expect(res.ok()).toBeFalsy();
  });

  // ── Verify Manager PIN ──

  test('verify-manager succeeds for MANAGER PIN', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.post(`${API_BASE}/api/employees/verify-manager`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { pin: MANAGER_PIN },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.authorized).toBe(true);
    expect(data.employeeName).toBe('E2E Manager');
  });

  test('verify-manager denied for STAFF PIN', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.post(`${API_BASE}/api/employees/verify-manager`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { pin: STAFF_PIN },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.authorized).toBe(false);
    expect(data.reason).toContain('manager role required');
  });

  test('verify-manager denied for invalid PIN', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.post(`${API_BASE}/api/employees/verify-manager`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { pin: '0000' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.authorized).toBe(false);
    expect(data.reason).toContain('Invalid PIN');
  });

  test('verify-manager rejects short PIN', async ({ page }) => {
    await loginAsAdmin(page);
    const res = await page.request.post(`${API_BASE}/api/employees/verify-manager`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { pin: '12' },
    });
    const data = await res.json();
    expect(data.authorized).toBe(false);
  });

  test('verify-manager works for STAFF login (not just ADMIN)', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.post(`${API_BASE}/api/employees/verify-manager`, {
      headers: { 'Content-Type': 'application/json' },
      data: { pin: MANAGER_PIN },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.authorized).toBe(true);
    expect(data.employeeName).toBe('E2E Manager');
  });

  // ── Dashboard Manager Tab (STAFF role) ──

  test('STAFF user sees Manager tab on dashboard', async ({ page }) => {
    await loginAsStaff(page);
    await expect(page.getByRole('tab', { name: /Manager/ })).toBeVisible({ timeout: 5000 });
  });

  test('Manager tab shows PIN prompt when clicked', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);
    // Should see the PIN lock icon and "Enter Manager PIN" text
    await expect(page.getByText('Enter Manager PIN to unlock')).toBeVisible({ timeout: 3000 });
  });

  test('SALES user does NOT see Manager tab', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.locator('#email').fill('sales@konegolf.ca');
    await page.locator('#password').fill('salesaccount123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    // SALES sees Timeline tab but not Create Booking
    await expect(page.getByRole('tab', { name: 'Timeline' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: /Manager/ })).not.toBeVisible({ timeout: 3000 });
  });

  // ── Unlocked Panel Content ──

  test('Manager panel unlocks and shows Customers/Bookings sub-tabs', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);

    // Enter manager PIN via keypad
    for (const digit of MANAGER_PIN.split('')) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(1000);

    // Should show unlocked panel with sub-tabs
    await expect(page.getByText('Manager Panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tab', { name: 'Customers' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bookings' })).toBeVisible();
  });

  test('Wrong PIN shows error, correct PIN unlocks', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);

    // Enter wrong PIN (STAFF PIN)
    for (const digit of STAFF_PIN.split('')) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(1000);

    // Should show error
    await expect(page.getByText(/manager role required|Access denied/)).toBeVisible({ timeout: 3000 });
  });

  test('Customers sub-tab shows search and table', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);

    // Unlock with manager PIN
    for (const digit of MANAGER_PIN.split('')) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(1500);

    // Customers tab should be default and show search + table headers
    await expect(page.getByPlaceholder('Search by name, email, or phone...')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('columnheader', { name: /Name/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Phone/ })).toBeVisible();
  });

  test('Customer detail modal opens on row click', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);

    for (const digit of MANAGER_PIN.split('')) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(1500);

    // Click first customer row (if any exist)
    const firstRow = page.locator('table tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);
    if (hasRows) {
      await firstRow.click();
      await page.waitForTimeout(1500);

      // Modal should open — check for dialog with Edit button
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: /Edit/ })).toBeVisible({ timeout: 3000 });
    }
  });

  test('Bookings sub-tab shows filters and table', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);

    for (const digit of MANAGER_PIN.split('')) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(1500);

    // Switch to Bookings sub-tab
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.waitForTimeout(500);

    // Should show search, date filters, status/source selects
    await expect(page.getByPlaceholder('Search by phone, name, or booking ref...')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('columnheader', { name: /Customer/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Status/ })).toBeVisible();
  });

  test('Lock button re-locks the panel', async ({ page }) => {
    await loginAsStaff(page);
    await page.getByRole('tab', { name: /Manager/ }).click();
    await page.waitForTimeout(500);

    for (const digit of MANAGER_PIN.split('')) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.waitForTimeout(1500);

    // Should be unlocked
    await expect(page.getByText('Manager Panel')).toBeVisible({ timeout: 3000 });

    // Click Lock button
    await page.getByRole('button', { name: /Lock/ }).click();
    await page.waitForTimeout(500);

    // Should show PIN prompt again
    await expect(page.getByText('Enter Manager PIN to unlock')).toBeVisible({ timeout: 3000 });
  });

  // ── API-level tests for data access ──

  test('verify-manager denied for inactive MANAGER employee', async ({ page }) => {
    await loginAsAdmin(page);

    // Deactivate the manager employee
    await page.request.put(`${API_BASE}/api/employees/${managerEmployeeId}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { active: false },
    });

    const res = await page.request.post(`${API_BASE}/api/employees/verify-manager`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { pin: MANAGER_PIN },
    });
    const data = await res.json();
    expect(data.authorized).toBe(false);

    // Reactivate for cleanup
    await page.request.put(`${API_BASE}/api/employees/${managerEmployeeId}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { active: true },
    });
  });

  test('customers API returns data when accessed by STAFF session', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.get(`${API_BASE}/api/customers?page=1&limit=5`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('customers');
    expect(data).toHaveProperty('pagination');
  });

  test('bookings search API returns data when accessed by STAFF session', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.get(`${API_BASE}/api/customers/bookings/search?page=1&limit=5`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('bookings');
    expect(data).toHaveProperty('pagination');
  });
});
