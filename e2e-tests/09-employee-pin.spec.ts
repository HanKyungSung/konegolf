import { test, expect } from '@playwright/test';
import { loginAsAdmin, ADMIN_USER } from './helpers';

/**
 * 09 — Employee PIN Management E2E Tests
 *
 * Tests the employee CRUD flow with PIN visibility:
 *   1. Create employee → PIN visible in list
 *   2. Duplicate PIN rejected with error message
 *   3. Reset PIN → new PIN visible
 *   4. Reset PIN to duplicate → rejected with error
 */

const API_BASE = 'http://localhost:8080';
const EMP_NAME_1 = 'E2E Pin Test A';
const EMP_PIN_1 = '4411';
const EMP_NAME_2 = 'E2E Pin Test B';
const EMP_PIN_2 = '4422';

test.describe('Employee PIN Management', () => {
  const createdIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    for (const id of createdIds) {
      await request.delete(`${API_BASE}/api/employees/${id}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('create employee shows PIN in list', async ({ page }) => {
    // Navigate to Time Management → Employees tab
    await page.goto('/pos/time-management');
    await page.getByRole('tab', { name: /employees/i }).click();
    await page.waitForTimeout(1000);

    // Click Add Employee
    await page.getByRole('button', { name: '+ Add Employee' }).click();

    // Fill name and PIN
    await page.getByPlaceholder('Employee name').fill(EMP_NAME_1);
    await page.getByPlaceholder('PIN (4–6 digits)').fill(EMP_PIN_1);
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(1500);

    // Verify PIN is visible in the employee list
    await expect(page.getByText(`PIN: ${EMP_PIN_1}`)).toBeVisible();
    await expect(page.getByText(EMP_NAME_1)).toBeVisible();

    // Capture ID for cleanup via API
    const response = await page.request.get(`${API_BASE}/api/employees`);
    const data = await response.json();
    const emp = data.employees.find((e: any) => e.name === EMP_NAME_1);
    if (emp) createdIds.push(emp.id);
  });

  test('duplicate PIN rejected on create', async ({ page }) => {
    // First create an employee via API
    const createRes = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: EMP_NAME_2, pin: EMP_PIN_2 },
    });
    expect(createRes.ok()).toBeTruthy();
    const body = await createRes.json();
    createdIds.push(body.employee.id);

    // Navigate to Employees tab
    await page.goto('/pos/time-management');
    await page.getByRole('tab', { name: /employees/i }).click();
    await page.waitForTimeout(1000);

    // Try to create another employee with the same PIN
    await page.getByRole('button', { name: '+ Add Employee' }).click();
    await page.getByPlaceholder('Employee name').fill('Duplicate Test');
    await page.getByPlaceholder('PIN (4–6 digits)').fill(EMP_PIN_2);
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(1500);

    // Should show error
    await expect(page.getByText(/PIN is already in use/i)).toBeVisible({ timeout: 5000 });
  });

  test('reset PIN updates visible PIN', async ({ page }) => {
    // Create employee via API
    const createRes = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: 'Reset Pin Test', pin: '5511' },
    });
    expect(createRes.ok()).toBeTruthy();
    const body = await createRes.json();
    createdIds.push(body.employee.id);

    // Navigate to Employees tab
    await page.goto('/pos/time-management');
    await page.getByRole('tab', { name: /employees/i }).click();
    await page.waitForTimeout(1000);

    // Verify original PIN shown
    await expect(page.getByText('PIN: 5511')).toBeVisible();

    // Click Reset PIN for this employee
    const empRow = page.locator('div').filter({ hasText: 'Reset Pin Test' }).filter({ hasText: 'Reset PIN' }).first();
    await empRow.getByRole('button', { name: 'Reset PIN' }).click();

    // Enter new PIN and save
    await page.getByPlaceholder('New PIN (4–6 digits)').fill('5522');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);

    // Verify new PIN shown
    await expect(page.getByText('PIN: 5522')).toBeVisible();
    await expect(page.getByText('PIN: 5511')).not.toBeVisible();
  });

  test('reset PIN to duplicate shows error', async ({ page }) => {
    // Create two employees via API
    const res1 = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: 'Dup Reset A', pin: '6611' },
    });
    const body1 = await res1.json();
    createdIds.push(body1.employee.id);

    const res2 = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: 'Dup Reset B', pin: '6622' },
    });
    const body2 = await res2.json();
    createdIds.push(body2.employee.id);

    // Navigate to Employees tab
    await page.goto('/pos/time-management');
    await page.getByRole('tab', { name: /employees/i }).click();
    await page.waitForTimeout(1000);

    // Try to reset Dup Reset B's PIN to Dup Reset A's PIN
    const empRow = page.locator('div').filter({ hasText: 'Dup Reset B' }).filter({ hasText: 'Reset PIN' }).first();
    await empRow.getByRole('button', { name: 'Reset PIN' }).click();

    await page.getByPlaceholder('New PIN (4–6 digits)').fill('6611');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);

    // Should show duplicate error
    await expect(page.getByText(/PIN is already in use/i)).toBeVisible({ timeout: 5000 });
  });

  test('PIN stored and returned in API response', async ({ page }) => {
    // Create via API and verify PIN comes back
    const createRes = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: 'API Pin Test', pin: '7711' },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();
    createdIds.push(createBody.employee.id);
    expect(createBody.employee.pin).toBe('7711');

    // List via API and verify PIN present
    const listRes = await page.request.get(`${API_BASE}/api/employees`);
    const listBody = await listRes.json();
    const emp = listBody.employees.find((e: any) => e.name === 'API Pin Test');
    expect(emp).toBeTruthy();
    expect(emp.pin).toBe('7711');

    // Update PIN via API
    const updateRes = await page.request.put(`${API_BASE}/api/employees/${createBody.employee.id}`, {
      data: { pin: '7722' },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updateBody = await updateRes.json();
    expect(updateBody.employee.pin).toBe('7722');
  });

  test('duplicate PIN rejected via API returns 409', async ({ page }) => {
    // Create first employee
    const res1 = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: 'API Dup A', pin: '8811' },
    });
    expect(res1.ok()).toBeTruthy();
    createdIds.push((await res1.json()).employee.id);

    // Try to create second with same PIN
    const res2 = await page.request.post(`${API_BASE}/api/employees`, {
      data: { name: 'API Dup B', pin: '8811' },
    });
    expect(res2.status()).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toContain('already in use');
  });
});
