import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin, createAndOpenBooking, MENU_ITEMS } from './helpers';

const API_BASE = 'http://localhost:8080';

/**
 * 06 — Split Payment Tax Distribution Tests
 * Verifies that tax is calculated once on the total and distributed
 * across seats using the largest remainder method (CRA standard).
 * Prevents rounding errors where per-seat tax × seats ≠ total tax.
 */

/**
 * Helper: Add a menu item to a specific seat.
 */
async function addItemToSeat(page: Page, itemName: string, tabName: string, seat: number) {
  await page.getByRole('tab', { name: tabName }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp(itemName) }).click();
  await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: `Seat ${seat}` }).click();
  await page.waitForTimeout(1500);
}

/**
 * Helper: Fetch invoices for a booking via API.
 */
async function getInvoicesViaAPI(page: Page, bookingId: string) {
  const response = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
  });
  const data = await response.json();
  return data.invoices || data;
}

/**
 * Helper: Set number of seats/players via API (requires auth session).
 */
async function setSeatsViaAPI(page: Page, bookingId: string, players: number) {
  await page.request.patch(`${API_BASE}/api/bookings/${bookingId}/players`, {
    data: { players },
  });
  // Reload page to reflect new seat count
  await page.reload();
  await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });
}

test.describe('Split Payment Tax Distribution', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('single seat — tax matches simple calculation', async ({ page }) => {
    const bookingId = await createAndOpenBooking(page);

    // Add 1 Hour ($35) to Seat 1
    await addItemToSeat(page, '1 Hour', 'Hours', 1);

    // Verify tax on UI: $35 × 14% = $4.90
    await expect(page.getByText('$4.90')).toBeVisible({ timeout: 3000 });

    // Verify via API
    const invoices = await getInvoicesViaAPI(page, bookingId);
    const seat1 = invoices.find((inv: any) => inv.seatIndex === 1);
    expect(Number(seat1.subtotal)).toBe(35);
    expect(Number(seat1.tax)).toBe(4.90);
    expect(Number(seat1.totalAmount)).toBe(39.90);
  });

  test('two seats with same item — taxes sum to total', async ({ page }) => {
    const bookingId = await createAndOpenBooking(page);

    // Add seats: need 2 seats
    await setSeatsViaAPI(page, bookingId, 2);

    // Add 1 Hour ($35) to Seat 1
    await addItemToSeat(page, '1 Hour', 'Hours', 1);

    // Add 1 Hour ($35) to Seat 2
    await addItemToSeat(page, '1 Hour', 'Hours', 2);

    // Verify via API: total tax should be $70 × 14% = $9.80
    const invoices = await getInvoicesViaAPI(page, bookingId);
    const totalTax = invoices.reduce((sum: number, inv: any) => sum + Number(inv.tax), 0);
    expect(totalTax).toBe(9.80);

    // Each seat should get $4.90
    for (const inv of invoices) {
      if (Number(inv.subtotal) > 0) {
        expect(Number(inv.tax)).toBe(4.90);
      }
    }
  });

  test('four equal seats — no rounding error (the original bug)', async ({ page }) => {
    const bookingId = await createAndOpenBooking(page);

    // Set to 4 seats
    await setSeatsViaAPI(page, bookingId, 4);

    // Add Club Sandwich ($12.99) to each seat
    for (let seat = 1; seat <= 4; seat++) {
      await addItemToSeat(page, 'Club Sandwich', 'Food', seat);
    }

    // Verify via API
    const invoices = await getInvoicesViaAPI(page, bookingId);
    const totalTax = invoices.reduce((sum: number, inv: any) => sum + Number(inv.tax), 0);
    const totalSubtotal = invoices.reduce((sum: number, inv: any) => sum + Number(inv.subtotal), 0);
    const expectedTotalTax = Math.round(totalSubtotal * 0.14 * 100) / 100;

    // Sum of per-seat taxes must equal total tax (no rounding drift)
    expect(totalTax).toBe(expectedTotalTax);

    // Max difference between any two seat taxes should be ≤ $0.01
    const taxes = invoices.map((inv: any) => Number(inv.tax)).filter((t: number) => t > 0);
    if (taxes.length > 1) {
      const minTax = Math.min(...taxes);
      const maxTax = Math.max(...taxes);
      expect(Math.round((maxTax - minTax) * 100) / 100).toBeLessThanOrEqual(0.01);
    }
  });

  test('mixed items across seats — tax sum is correct', async ({ page }) => {
    const bookingId = await createAndOpenBooking(page);

    // Add a second seat
    await setSeatsViaAPI(page, bookingId, 2);

    // Seat 1: 1 Hour ($35)
    await addItemToSeat(page, '1 Hour', 'Hours', 1);

    // Seat 2: Club Sandwich ($12.99)
    await addItemToSeat(page, 'Club Sandwich', 'Food', 2);

    // Verify via API
    const invoices = await getInvoicesViaAPI(page, bookingId);
    const totalSubtotal = invoices.reduce((sum: number, inv: any) => sum + Number(inv.subtotal), 0);
    const totalTax = invoices.reduce((sum: number, inv: any) => sum + Number(inv.tax), 0);
    const expectedTotalTax = Math.round(totalSubtotal * 0.14 * 100) / 100;

    expect(Math.round(totalTax * 100) / 100).toBe(expectedTotalTax);
    expect(totalSubtotal).toBeCloseTo(47.99, 2); // $35 + $12.99
  });

  test('adding item recalculates all seat taxes', async ({ page }) => {
    const bookingId = await createAndOpenBooking(page);

    // Add second seat
    await setSeatsViaAPI(page, bookingId, 2);

    // Add item to seat 1
    await addItemToSeat(page, 'Beer', 'Drinks', 1);

    // Get initial invoices
    let invoices = await getInvoicesViaAPI(page, bookingId);
    const seat1TaxBefore = Number(invoices.find((inv: any) => inv.seatIndex === 1)?.tax || 0);

    // Add item to seat 2 — this should recalculate ALL seat taxes
    await addItemToSeat(page, 'Beer', 'Drinks', 2);

    invoices = await getInvoicesViaAPI(page, bookingId);
    const totalSubtotal = invoices.reduce((sum: number, inv: any) => sum + Number(inv.subtotal), 0);
    const totalTax = invoices.reduce((sum: number, inv: any) => sum + Number(inv.tax), 0);
    const expectedTotalTax = Math.round(totalSubtotal * 0.14 * 100) / 100;

    // Tax total must match regardless of order items were added
    expect(totalTax).toBe(expectedTotalTax);
  });
});
