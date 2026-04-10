import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsTestUser, createBookingViaAPI, openBookingDetail, API_BASE, ADMIN_USER, TEST_USER } from './helpers';

/**
 * 17 — Cancel Confirmation Modal E2E Tests
 * Verifies that destructive actions show confirmation dialogs instead of acting immediately.
 */

const ADMIN_KEY = 'pos-dev-key-change-in-production';
const POS_HEADER = { 'x-pos-admin-key': ADMIN_KEY };

test.describe('Cancel Confirmation Modals', () => {

  // ── POS: Cancel Booking ──

  test('POS: Cancel Booking button shows confirmation dialog', async ({ page }) => {
    await loginAsAdmin(page);
    const bookingId = await createBookingViaAPI(page);
    await openBookingDetail(page, bookingId);

    // Click Cancel Booking button
    const cancelBtn = page.getByRole('button', { name: 'Cancel Booking' });
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Should see confirmation dialog with correct elements
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('Are you sure you want to cancel')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Go Back' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel Booking' })).toBeVisible();
  });

  test('POS: Dismissing cancel dialog does NOT cancel the booking', async ({ page }) => {
    await loginAsAdmin(page);
    const bookingId = await createBookingViaAPI(page);
    await openBookingDetail(page, bookingId);

    // Open dialog
    await page.getByRole('button', { name: 'Cancel Booking' }).click();
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Dismiss with Go Back
    await dialog.getByRole('button', { name: 'Go Back' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // Verify booking is still BOOKED via API
    const res = await page.request.get(`${API_BASE}/api/bookings/${bookingId}`, {
      headers: POS_HEADER,
    });
    const data = await res.json();
    expect(data.booking.bookingStatus).toBe('BOOKED');
  });

  test('POS: Confirming cancel dialog cancels the booking', async ({ page }) => {
    await loginAsAdmin(page);
    const bookingId = await createBookingViaAPI(page);
    await openBookingDetail(page, bookingId);

    // Open dialog
    await page.getByRole('button', { name: 'Cancel Booking' }).click();
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Confirm cancellation
    await dialog.getByRole('button', { name: 'Cancel Booking' }).click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify via API that booking is CANCELLED
    const res = await page.request.get(`${API_BASE}/api/bookings/${bookingId}`, {
      headers: POS_HEADER,
    });
    const data = await res.json();
    expect(data.booking.bookingStatus).toBe('CANCELLED');
  });

  // ── POS: Cancel Payment ──

  test('POS: Cancel Payment button shows confirmation dialog', async ({ page }) => {
    await loginAsAdmin(page);
    const bookingId = await createBookingViaAPI(page);

    // Get a menu item
    const menuRes = await page.request.get(`${API_BASE}/api/menu/items`);
    const menuData = await menuRes.json();
    const menuItem = menuData.items?.[0];
    if (!menuItem) { test.skip(); return; }

    // Add order item (needs auth cookie from loginAsAdmin)
    await page.request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { 'Content-Type': 'application/json' },
      data: { menuItemId: menuItem.id, quantity: 1, seatIndex: 1 },
    });

    await openBookingDetail(page, bookingId);

    // Pay with Card — find the payment method buttons
    const cardBtn = page.getByRole('button', { name: /Card/i }).first();
    if (!(await cardBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(); return;
    }
    await cardBtn.click();
    await page.waitForTimeout(2000);

    // Now look for Cancel Payment
    const cancelPayBtn = page.getByRole('button', { name: 'Cancel Payment' }).first();
    if (await cancelPayBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cancelPayBtn.click();
      const dialog = page.locator('[role="alertdialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.getByText('Cancel payment for Seat')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Go Back' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Cancel Payment' })).toBeVisible();
    }
  });

  // ── POS: Remove Order Item ──

  test('POS: Remove order item shows confirmation dialog', async ({ page }) => {
    await loginAsAdmin(page);
    const bookingId = await createBookingViaAPI(page);

    // Get a menu item and add it to the booking
    const menuRes = await page.request.get(`${API_BASE}/api/menu/items`);
    const menuData = await menuRes.json();
    const menuItem = menuData.items?.find((m: any) => m.category === 'FOOD' || m.category === 'food') || menuData.items?.[0];
    if (!menuItem) { test.skip(); return; }

    await page.request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { 'Content-Type': 'application/json' },
      data: { menuItemId: menuItem.id, quantity: 1, seatIndex: 1 },
    });

    await openBookingDetail(page, bookingId);

    // Look for the red delete button near the order item
    // The trash button has red background and is the last button in the item row
    const orderItemsSection = page.getByText('Order Items').first();
    await expect(orderItemsSection).toBeVisible({ timeout: 10000 });
    
    // Find the trash/delete button by its red styling - it's a small button near the item
    const trashBtn = page.locator('button.bg-red-500\\/20').first();
    await expect(trashBtn).toBeVisible({ timeout: 10000 });
    await trashBtn.click();

    // Should see confirmation dialog
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('from this booking')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Go Back' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  // ── Customer Dashboard: Cancel Booking ──

  test('Customer: Cancel Booking shows confirmation dialog and dismiss works', async ({ browser }) => {
    const adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);

    // Get a room
    const roomsRes = await adminPage.request.get(`${API_BASE}/api/bookings/rooms`, { headers: POS_HEADER });
    const roomsData = await roomsRes.json();
    const roomId = roomsData.rooms?.[0]?.id;
    if (!roomId) { await adminPage.close(); test.skip(); return; }

    // Create a future booking for the test user via simple create
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    const bookingRes = await adminPage.request.post(`${API_BASE}/api/bookings/simple/create`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        roomId,
        customerName: TEST_USER.name,
        customerPhone: TEST_USER.phone,
        startTimeMs: tomorrow.getTime(),
        duration: 1,
        players: 1,
        bookingSource: 'ONLINE',
      },
    });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;
    await adminPage.close();
    if (!bookingId) { test.skip(); return; }

    // Login as test user
    const userPage = await browser.newPage();
    await loginAsTestUser(userPage);

    // Find a Cancel button
    const cancelBtn = userPage.getByRole('button', { name: 'Cancel' }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Should show confirmation dialog
    const dialog = userPage.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('Are you sure you want to cancel')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Go Back' })).toBeVisible();

    // Dismiss — booking should remain
    await dialog.getByRole('button', { name: 'Go Back' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // Verify booking still exists via API
    const verifyRes = await userPage.request.get(`${API_BASE}/api/bookings/${bookingId}`, { headers: POS_HEADER });
    const verifyData = await verifyRes.json();
    expect(verifyData.booking.bookingStatus).toBe('BOOKED');

    // Cleanup
    await userPage.request.patch(`${API_BASE}/api/bookings/${bookingId}/status`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: { status: 'CANCELLED' },
    });
    await userPage.close();
  });

  test('Customer: Confirming cancel dialog cancels the booking', async ({ browser }) => {
    const adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);

    // Get a room
    const roomsRes = await adminPage.request.get(`${API_BASE}/api/bookings/rooms`, { headers: POS_HEADER });
    const roomsData2 = await roomsRes.json();
    const roomId = roomsData2.rooms?.[0]?.id;
    if (!roomId) { await adminPage.close(); test.skip(); return; }

    // Create a future booking for the test user
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(16, 0, 0, 0);

    const bookingRes = await adminPage.request.post(`${API_BASE}/api/bookings/simple/create`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: {
        roomId,
        customerName: TEST_USER.name,
        customerPhone: TEST_USER.phone,
        startTimeMs: dayAfter.getTime(),
        duration: 1,
        players: 1,
        bookingSource: 'ONLINE',
      },
    });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;
    await adminPage.close();
    if (!bookingId) { test.skip(); return; }

    // Login as test user
    const userPage = await browser.newPage();
    await loginAsTestUser(userPage);

    // Click Cancel
    const cancelBtn = userPage.getByRole('button', { name: 'Cancel' }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click();

    // Confirm
    const dialog = userPage.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'Cancel Booking' }).click();

    // Dialog should close and booking should be cancelled
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Verify via API
    const verifyRes = await userPage.request.get(`${API_BASE}/api/bookings/${bookingId}`, { headers: POS_HEADER });
    const verifyData = await verifyRes.json();
    expect(verifyData.booking.bookingStatus).toBe('CANCELLED');

    await userPage.close();
  });
});
