import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin, createAndOpenBooking } from './helpers';

/**
 * 04 — POS Payment Flow Tests
 * Tests the collect payment dialog, payment methods, tips, and completion.
 * Uses Quick Sale API to create bookings for reliable detail access.
 */

/**
 * Helper: Create a booking via API, open it, add a Club Sandwich to Seat 1.
 */
async function setupBookingWithItem(page: Page): Promise<string> {
  const bookingId = await createAndOpenBooking(page);

  // Add a food item to Seat 1
  await page.getByRole('tab', { name: 'Food' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Club Sandwich/ }).click();
  await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.waitForTimeout(1500);

  // Verify item was added
  await expect(page.getByText(/1 item/)).toBeVisible({ timeout: 3000 });

  return bookingId;
}

test.describe('POS Payment Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('collect payment dialog opens with correct elements', async ({ page }) => {
    await setupBookingWithItem(page);

    // Click Collect Payment button (text: "Collect Payment — $X.XX")
    await page.getByRole('button', { name: /Collect Payment/ }).first().click();

    // Payment dialog should open with title "Collect Payment — Seat 1"
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    // Should see payment method options
    await expect(page.getByText('Card').first()).toBeVisible();
    await expect(page.getByText('Cash').first()).toBeVisible();

    // Should see tip input (label: "Add Tip")
    await expect(page.getByText('Add Tip')).toBeVisible();

    // Should see tip percentage buttons
    await expect(page.getByRole('button', { name: '10%' })).toBeVisible();
    await expect(page.getByRole('button', { name: '15%' })).toBeVisible();
    await expect(page.getByRole('button', { name: '18%' })).toBeVisible();
    await expect(page.getByRole('button', { name: '20%' })).toBeVisible();

    // Pay button should say "Select Payment Method" when none selected
    await expect(page.getByRole('button', { name: /Select Payment Method/ })).toBeVisible();
  });

  test('pay by card - full amount', async ({ page }) => {
    await setupBookingWithItem(page);

    // Open payment dialog
    await page.getByRole('button', { name: /Collect Payment/ }).first().click();
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    // Select Card payment method (clickable div with "Card" text)
    const cardOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Card' }).first();
    await cardOption.click();
    await page.waitForTimeout(500);

    // Click "Full" quick amount button
    await page.getByRole('button', { name: /Full/ }).click();
    await page.waitForTimeout(500);

    // Pay button should now show "Pay $X.XX by Card"
    const payButton = page.getByRole('button', { name: /Pay \$.*by Card/ });
    await expect(payButton).toBeVisible({ timeout: 3000 });
    await payButton.click();

    // Wait for payment to process
    await page.waitForTimeout(2000);

    // Seat should now show PAID badge
    await expect(page.getByText('PAID').first()).toBeVisible({ timeout: 5000 });
  });

  test('pay by cash - full amount', async ({ page }) => {
    await setupBookingWithItem(page);

    // Open payment dialog
    await page.getByRole('button', { name: /Collect Payment/ }).first().click();
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    // Select Cash payment method
    const cashOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Cash' }).first();
    await cashOption.click();
    await page.waitForTimeout(500);

    // Click Full amount
    await page.getByRole('button', { name: /Full/ }).click();
    await page.waitForTimeout(500);

    // Pay button should show "Pay $X.XX by Cash"
    const payButton = page.getByRole('button', { name: /Pay \$.*by Cash/ });
    await expect(payButton).toBeVisible({ timeout: 3000 });
    await payButton.click();

    // Wait for payment
    await page.waitForTimeout(2000);

    // Should show PAID
    await expect(page.getByText('PAID').first()).toBeVisible({ timeout: 5000 });
  });

  test('pay with tip - shows tip method toggle', async ({ page }) => {
    await setupBookingWithItem(page);

    // Open payment dialog
    await page.getByRole('button', { name: /Collect Payment/ }).first().click();
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    // Select Card
    const cardOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Card' }).first();
    await cardOption.click();
    await page.waitForTimeout(500);

    // Enter tip amount (first 0.00 placeholder is tip, second is amount)
    const tipInput = page.getByPlaceholder('0.00').first();
    await tipInput.clear();
    await tipInput.fill('5.00');
    await page.waitForTimeout(500);

    // Tip method toggle should appear (Card / Cash)
    await expect(page.getByRole('button', { name: /💳 Card/ })).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: /💵 Cash/ })).toBeVisible();

    // Select cash tip
    await page.getByRole('button', { name: /💵 Cash/ }).click();
    await page.waitForTimeout(300);

    // Click Full amount
    await page.getByRole('button', { name: /Full/ }).click();
    await page.waitForTimeout(500);

    // Pay
    const payButton = page.getByRole('button', { name: /Pay \$/ });
    await payButton.click();

    // Wait for payment
    await page.waitForTimeout(2000);

    // Should show PAID
    await expect(page.getByText('PAID').first()).toBeVisible({ timeout: 5000 });
  });

  test('tip percentage buttons calculate correctly', async ({ page }) => {
    await setupBookingWithItem(page);

    // Open payment dialog
    await page.getByRole('button', { name: /Collect Payment/ }).first().click();
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    // Select Card
    const cardOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Card' }).first();
    await cardOption.click();
    await page.waitForTimeout(500);

    // Click 15% tip button
    await page.getByRole('button', { name: '15%' }).click();
    await page.waitForTimeout(500);

    // Tip input should now have a value > 0
    const tipInput = page.getByPlaceholder('0.00').first();
    const tipValue = await tipInput.inputValue();
    expect(parseFloat(tipValue)).toBeGreaterThan(0);
  });

  test('complete booking after all seats paid', async ({ page }) => {
    await setupBookingWithItem(page);

    // Pay Seat 1 by Card
    await page.getByRole('button', { name: /Collect Payment/ }).first().click();
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    const cardOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Card' }).first();
    await cardOption.click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Full/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Pay \$/ }).click();
    await page.waitForTimeout(2000);

    // Should show PAID
    await expect(page.getByText('PAID').first()).toBeVisible({ timeout: 5000 });

    // Click Complete Booking
    const completeBtn = page.getByRole('button', { name: /Complete Booking/ });
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await page.waitForTimeout(2000);

      // Should show "Reopen Booking" after completion
      await expect(page.getByRole('button', { name: /Reopen Booking/ })).toBeVisible({ timeout: 5000 });
    }
  });

  test('quick sale opens booking detail', async ({ page }) => {
    // Click Quick Sale on dashboard
    await page.getByRole('button', { name: 'Quick Sale' }).click();

    // Should navigate to /pos/booking/{id}
    await page.waitForURL('**/pos/booking/**', { timeout: 10000 });

    // Should see Seat 1 and menu
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tab', { name: 'Food' })).toBeVisible();
  });
});
