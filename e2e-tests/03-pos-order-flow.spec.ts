import { test, expect } from '@playwright/test';
import { loginAsAdmin, createAndOpenBooking, MENU_ITEMS } from './helpers';

/**
 * 03 — POS Order & Menu Flow Tests
 * Tests adding items to seats, menu navigation, and order management.
 * Uses Quick Sale API to create bookings for reliable access to booking detail.
 */

test.describe('POS Order Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('add food item to seat via menu', async ({ page }) => {
    await createAndOpenBooking(page);

    // Click on the "Food" tab in the menu panel
    await page.getByRole('tab', { name: 'Food' }).click();
    await page.waitForTimeout(500);

    // Click "Club Sandwich" menu item button
    await page.getByRole('button', { name: /Club Sandwich/ }).click();

    // "Add to Seat" dialog should appear
    await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });

    // Click "Seat 1" to add item to seat 1
    await page.getByRole('button', { name: 'Seat 1' }).click();

    // Wait for item to be added
    await page.waitForTimeout(1500);

    // Verify item appears in the seat (not in the menu panel)
    // The seat accordion shows items as <p> tags, the menu shows items as <h4> tags
    // Check that "1 item" count appears in Seat 1 trigger
    await expect(page.getByText(/1 item/)).toBeVisible({ timeout: 3000 });
  });

  test('add drink item from Drinks tab', async ({ page }) => {
    await createAndOpenBooking(page);

    // Switch to Drinks tab
    await page.getByRole('tab', { name: 'Drinks' }).click();
    await page.waitForTimeout(500);

    // Click Beer
    await page.getByRole('button', { name: /Beer/ }).click();

    // Select Seat 1
    await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Seat 1' }).click();
    await page.waitForTimeout(1500);

    // Verify item count increased
    await expect(page.getByText(/1 item/)).toBeVisible({ timeout: 3000 });
  });

  test('add multiple items to same seat', async ({ page }) => {
    await createAndOpenBooking(page);

    // Add a food item
    await page.getByRole('tab', { name: 'Food' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Korean Fried Chicken/ }).click();
    await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Seat 1' }).click();
    await page.waitForTimeout(1500);

    // Add a drink
    await page.getByRole('tab', { name: 'Drinks' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Soft Drinks/ }).click();
    await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Seat 1' }).click();
    await page.waitForTimeout(1500);

    // Verify 2 items added
    await expect(page.getByText(/2 items/)).toBeVisible({ timeout: 3000 });
  });

  test('menu shows correct categories with items', async ({ page }) => {
    await createAndOpenBooking(page);

    // Check Hours tab
    await page.getByRole('tab', { name: 'Hours' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /1 Hour/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /2 Hours/ })).toBeVisible();

    // Check Food tab
    await page.getByRole('tab', { name: 'Food' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /Club Sandwich/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bulgogi Burger/ })).toBeVisible();

    // Check Appetizers tab
    await page.getByRole('tab', { name: 'Appetizers' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /French Fries/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chicken Wings/ })).toBeVisible();

    // Check Desserts tab
    await page.getByRole('tab', { name: 'Desserts' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /Ice Cream/ })).toBeVisible();
  });

  test('shows Custom Item and Discount buttons', async ({ page }) => {
    await createAndOpenBooking(page);

    // Should see Custom Item and Discount buttons
    await expect(page.getByRole('button', { name: /Custom Item/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Discount/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Apply Coupon/ })).toBeVisible();
  });
});
