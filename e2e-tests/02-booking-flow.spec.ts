import { test, expect } from '@playwright/test';
import { loginAsAdmin, createWalkInBooking, createAndOpenBooking } from './helpers';

/**
 * 02 — POS Booking Flow Tests
 * Tests creating, viewing, and managing bookings from the POS dashboard.
 */

test.describe('POS Booking Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('POS dashboard shows rooms and navigation', async ({ page }) => {
    // Should see room headings in room cards
    await expect(page.getByRole('heading', { name: 'Room 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Room 2' })).toBeVisible();

    // Should see Quick Sale button
    await expect(page.getByRole('button', { name: 'Quick Sale' })).toBeVisible();

    // Should see tab navigation
    await expect(page.getByRole('tab', { name: 'Timeline' })).toBeVisible();
  });

  test('create walk-in booking via modal', async ({ page }) => {
    // Use the helper which properly handles TimePicker
    // Use Room 4 and a unique phone to avoid conflicts with previous test runs
    await createWalkInBooking(page, {
      customerPhone: '9025559999',
      customerName: 'E2E Walk-in Customer',
      room: 'Room 4',
    });

    // Verify we're back on the dashboard (use .first() in case modal is briefly visible)
    await expect(page.getByRole('button', { name: 'Create Booking' }).first()).toBeVisible();
  });

  test('booking modal validates required fields', async ({ page }) => {
    // Open Create Booking modal
    await page.getByRole('button', { name: 'Create Booking' }).click();
    await expect(page.getByText('Customer Information')).toBeVisible({ timeout: 5000 });

    // Continue button should be disabled without phone/name
    const continueBtn = page.getByTestId('continue-btn');
    await expect(continueBtn).toBeDisabled();

    // Fill phone
    const phoneInput = page.getByTestId('customer-phone');
    await phoneInput.fill('9025551111');
    await page.waitForTimeout(1500);

    // Fill name to enable continue
    const nameInput = page.getByTestId('customer-name');
    await nameInput.fill('Validation Test');

    // Now Continue should be enabled
    await expect(continueBtn).toBeEnabled({ timeout: 3000 });
  });

  test('can open booking detail and see seats', async ({ page }) => {
    // Use API to create booking, then navigate to its detail page
    await createAndOpenBooking(page);

    // Booking detail should show seat information
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 5000 });
  });

  test('booking detail shows menu panel with categories', async ({ page }) => {
    // Use API to create booking and open detail
    await createAndOpenBooking(page);

    // Should see all menu category tabs
    await expect(page.getByRole('tab', { name: 'Hours' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tab', { name: 'Food' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Drinks' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Appetizers' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Desserts' })).toBeVisible();
  });
});
