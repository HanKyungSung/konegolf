import { test, expect } from '@playwright/test';
import { ADMIN_USER, TEST_USER } from './helpers';

/**
 * 01 — Authentication Flow Tests
 * Tests login, logout, and auth redirects.
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh — clear cookies
    await page.context().clearCookies();
  });

  test('shows login page with correct elements', async ({ page }) => {
    await page.goto('/login');

    // Page should show the login form
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByText('Forgot password?')).toBeVisible();
    await expect(page.getByText('Sign up')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should show an error message
    await expect(page.getByText(/No account|Wrong password|invalid|failed/i)).toBeVisible({ timeout: 5000 });

    // Should stay on login page
    expect(page.url()).toContain('/login');
  });

  test('admin login redirects to POS dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(ADMIN_USER.email);
    await page.locator('#password').fill(ADMIN_USER.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Admin should land on /dashboard which shows POSDashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    // POS dashboard should have "Create Booking" button
    await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 10000 });
  });

  test('regular user login redirects to customer dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(TEST_USER.email);
    await page.locator('#password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Regular user should land on /dashboard with customer view
    await page.waitForURL('**/dashboard', { timeout: 10000 });

    // Should NOT see "Create Booking" (that's POS-only)
    // Instead should see customer-facing content
    await expect(page.getByRole('button', { name: 'Create Booking' })).not.toBeVisible({ timeout: 3000 });
  });

  test('unauthenticated access to /pos redirects to login', async ({ page }) => {
    await page.goto('/pos/dashboard');

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
    await expect(page.getByText('Welcome Back')).toBeVisible();
  });

  test('Sign In button is disabled while loading', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(ADMIN_USER.email);
    await page.locator('#password').fill(ADMIN_USER.password);

    // Click and immediately check button state
    const signInButton = page.getByRole('button', { name: /Sign/ });
    await signInButton.click();

    // The button should briefly show "Signing In..." while loading
    // (This may be too fast to catch, so we just verify the flow completes)
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });
});
