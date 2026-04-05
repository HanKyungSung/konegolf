import { test, expect } from '@playwright/test';
import { loginAsAdmin, createAndOpenBooking } from './helpers';

const API_BASE = 'http://localhost:8080';
const POS_HEADER = { 'x-pos-admin-key': 'pos-dev-key-change-in-production' };

/**
 * 11 — Gift Card (Tax-Exempt) Sale Tests
 * Tests gift card sales via Quick Sale bookings with tax-exempt handling.
 */

test.describe('Gift Card Sale — UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('Gift Card button visible on Quick Sale', async ({ page }) => {
    await createAndOpenBooking(page);
    await expect(page.getByRole('button', { name: /Gift Card/ })).toBeVisible({ timeout: 5000 });
  });

  test('Gift Card button NOT visible on regular booking', async ({ page, request }) => {
    // Create a real booking (not Quick Sale) via the booking creation flow
    // For simplicity, use the simple booking API
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const res = await request.post(`${API_BASE}/api/bookings/simple`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        customerName: 'Gift Test Customer',
        customerEmail: 'gifttest@example.com',
        customerPhone: '+19025550099',
        date: dateStr,
        startTime: '10:00',
        endTime: '11:00',
        players: 1,
        roomId: null,
      },
    });
    const data = await res.json();
    const bookingId = data.booking?.id || data.id;

    await page.goto(`/pos/booking/${bookingId}`);
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });

    // Gift Card button should NOT be visible
    await expect(page.getByRole('button', { name: /Gift Card/ })).not.toBeVisible({ timeout: 3000 });
    // +30m button should be visible instead
    await expect(page.getByRole('button', { name: /\+30m/i })).toBeVisible();
  });

  test('Gift Card dialog opens with preset amounts', async ({ page }) => {
    await createAndOpenBooking(page);
    await page.getByRole('button', { name: /Gift Card/ }).click();

    // Dialog should appear
    await expect(page.getByText('Gift Card Sale')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('tax-exempt')).toBeVisible();

    // Preset buttons should be visible
    await expect(page.getByRole('button', { name: '$25' })).toBeVisible();
    await expect(page.getByRole('button', { name: '$50' })).toBeVisible();
    await expect(page.getByRole('button', { name: '$100' })).toBeVisible();
  });

  test('Add $50 gift card to seat via dialog', async ({ page }) => {
    await createAndOpenBooking(page);
    await page.getByRole('button', { name: /Gift Card/ }).click();

    // Click $50 preset
    await page.getByRole('button', { name: '$50' }).click();

    // Seat buttons should appear
    await expect(page.getByRole('button', { name: 'Seat 1' })).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Seat 1' }).click();

    // Wait for dialog to close and order to be added
    await page.waitForTimeout(2000);

    // Verify item appears — "Gift Card ($50.00)" should be in the seat
    await expect(page.getByText(/Gift Card.*\$50\.00/)).toBeVisible({ timeout: 5000 });
  });

  test('Add custom amount gift card', async ({ page }) => {
    await createAndOpenBooking(page);
    await page.getByRole('button', { name: /Gift Card/ }).click();

    // Type custom amount
    await page.getByPlaceholder('Enter amount...').fill('75');

    // Seat buttons should appear
    await expect(page.getByRole('button', { name: 'Seat 1' })).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Seat 1' }).click();

    await page.waitForTimeout(2000);

    // Verify item appears
    await expect(page.getByText(/Gift Card.*\$75\.00/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Gift Card Sale — API & Tax Calculation', () => {
  test('API: gift card order is created with taxExempt=true', async ({ request }) => {
    // Create a quick sale
    const qsRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
      headers: POS_HEADER,
    });
    const qsData = await qsRes.json();
    const bookingId = qsData.booking?.id || qsData.id;

    // Add a gift card order with taxExempt
    const orderRes = await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        customItemName: 'Gift Card ($50.00)',
        customItemPrice: 50,
        seatIndex: 1,
        quantity: 1,
        taxExempt: true,
      },
    });
    expect(orderRes.ok()).toBe(true);
    const orderData = await orderRes.json();
    expect(orderData.order).toBeDefined();
    expect(Number(orderData.order.totalPrice)).toBe(50);

    // Check invoice — tax should be $0 since only exempt item
    if (orderData.updatedInvoice) {
      expect(Number(orderData.updatedInvoice.tax)).toBe(0);
      expect(Number(orderData.updatedInvoice.subtotal)).toBe(50);
      expect(Number(orderData.updatedInvoice.totalAmount)).toBe(50);
    }
  });

  test('API: gift card + taxable item — tax only on taxable item', async ({ request }) => {
    // Create a quick sale
    const qsRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
      headers: POS_HEADER,
    });
    const qsData = await qsRes.json();
    const bookingId = qsData.booking?.id || qsData.id;

    // Add gift card (tax-exempt)
    await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        customItemName: 'Gift Card ($50.00)',
        customItemPrice: 50,
        seatIndex: 1,
        quantity: 1,
        taxExempt: true,
      },
    });

    // Add a regular item (taxable)
    const orderRes = await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        customItemName: 'Snack',
        customItemPrice: 10,
        seatIndex: 1,
        quantity: 1,
      },
    });
    expect(orderRes.ok()).toBe(true);
    const orderData = await orderRes.json();

    // Invoice: subtotal = $60, tax only on $10 = $1.40, total = $61.40
    if (orderData.updatedInvoice) {
      expect(Number(orderData.updatedInvoice.subtotal)).toBe(60);
      expect(Number(orderData.updatedInvoice.tax)).toBeCloseTo(1.40, 2);
      expect(Number(orderData.updatedInvoice.totalAmount)).toBeCloseTo(61.40, 2);
    }
  });

  test('API: regular order without taxExempt still gets taxed', async ({ request }) => {
    // Create a quick sale
    const qsRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
      headers: POS_HEADER,
    });
    const qsData = await qsRes.json();
    const bookingId = qsData.booking?.id || qsData.id;

    // Add a regular custom item (no taxExempt)
    const orderRes = await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        customItemName: 'Regular Item',
        customItemPrice: 100,
        seatIndex: 1,
        quantity: 1,
      },
    });
    expect(orderRes.ok()).toBe(true);
    const orderData = await orderRes.json();

    // Invoice: subtotal = $100, tax = $14.00, total = $114.00
    if (orderData.updatedInvoice) {
      expect(Number(orderData.updatedInvoice.subtotal)).toBe(100);
      expect(Number(orderData.updatedInvoice.tax)).toBeCloseTo(14.00, 2);
      expect(Number(orderData.updatedInvoice.totalAmount)).toBeCloseTo(114.00, 2);
    }
  });
});
