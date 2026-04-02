import { test, expect } from '@playwright/test';
import { loginAsAdmin, ADMIN_USER } from './helpers';

/**
 * 07 — Clock In/Out E2E Tests
 *
 * Tests the full employee clock-in/out flow via the POS UI:
 *   1. Seed a test employee via API
 *   2. Open clock modal → enter PIN → check status → clock in
 *   3. Reopen modal → enter PIN → see "clocked in" → clock out
 *   4. Invalid PIN shows error
 */

const API_BASE = 'http://localhost:8080';
const TEST_EMPLOYEE_PIN = '7890';
const TEST_EMPLOYEE_NAME = 'E2E Clock Test';

/** Click digit buttons on the PIN keypad */
async function enterPin(page: import('@playwright/test').Page, pin: string) {
  for (const digit of pin) {
    await page.locator(`button:has-text("${digit}")`).first().click();
  }
}

test.describe('Clock In/Out', () => {
  let employeeId: string;

  test.beforeAll(async ({ request }) => {
    // Login as admin to get session cookie
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    expect(loginRes.ok()).toBeTruthy();

    // Create test employee via API
    const createRes = await request.post(`${API_BASE}/api/employees`, {
      data: { name: TEST_EMPLOYEE_NAME, pin: TEST_EMPLOYEE_PIN },
    });
    expect(createRes.ok()).toBeTruthy();
    const body = await createRes.json();
    employeeId = body.employee.id;
  });

  test.afterAll(async ({ request }) => {
    // Login and clean up test employee
    await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    });
    if (employeeId) {
      await request.delete(`${API_BASE}/api/employees/${employeeId}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('opens clock modal and shows PIN pad', async ({ page }) => {
    await page.getByRole('button', { name: 'Clock In/Out' }).click();
    await expect(page.getByText('Enter Your PIN')).toBeVisible();
    // Verify keypad digits are present
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      await expect(page.locator(`button:has-text("${digit}")`).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('invalid PIN shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Clock In/Out' }).click();
    await expect(page.getByText('Enter Your PIN')).toBeVisible();

    // Enter a PIN that doesn't match any employee
    await enterPin(page, '1111');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Should show error message
    await expect(page.getByText(/invalid pin/i)).toBeVisible({ timeout: 5000 });
  });

  test('full clock-in flow', async ({ page }) => {
    await page.getByRole('button', { name: 'Clock In/Out' }).click();
    await expect(page.getByText('Enter Your PIN')).toBeVisible();

    // Enter test employee PIN
    await enterPin(page, TEST_EMPLOYEE_PIN);
    await page.getByRole('button', { name: 'Submit' }).click();

    // Status phase: should show employee name and "Not currently clocked in"
    await expect(page.getByText(TEST_EMPLOYEE_NAME)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Not currently clocked in')).toBeVisible();

    // Click "Clock In"
    await page.getByRole('button', { name: 'Clock In' }).click();

    // Result phase: should show ✅ and "Clocked In"
    await expect(page.getByText('✅')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Clocked In')).toBeVisible();
  });

  test('full clock-out flow', async ({ page }) => {
    // First ensure employee is clocked in via API
    await page.request.post(`${API_BASE}/api/time-entries/clock-in`, {
      data: { pin: TEST_EMPLOYEE_PIN },
    });

    await page.getByRole('button', { name: 'Clock In/Out' }).click();
    await expect(page.getByText('Enter Your PIN')).toBeVisible();

    await enterPin(page, TEST_EMPLOYEE_PIN);
    await page.getByRole('button', { name: 'Submit' }).click();

    // Status phase: should show "Clocked in since ..."
    await expect(page.getByText(TEST_EMPLOYEE_NAME)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/clocked in since/i)).toBeVisible();

    // Click "Clock Out"
    await page.getByRole('button', { name: 'Clock Out' }).click();

    // Result phase: should show 👋 and "Clocked Out"
    await expect(page.getByText('👋')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Clocked Out')).toBeVisible();
  });

  test('cancel button closes modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Clock In/Out' }).click();
    await expect(page.getByText('Enter Your PIN')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Enter Your PIN')).not.toBeVisible();
  });
});
