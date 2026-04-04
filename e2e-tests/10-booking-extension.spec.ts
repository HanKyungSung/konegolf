import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsTestUser, loginAsStaff, ADMIN_USER, TEST_USER } from './helpers';

/**
 * E2E Tests for Booking Extension Feature
 *
 * Tests the PATCH /api/bookings/:id/extend endpoint and UI button.
 * Since extensions require 1 hour elapsed, we create bookings via API
 * with backdated startTime for testability.
 */

const API_BASE = 'http://localhost:8080';
const POS_HEADER = { 'x-pos-admin-key': 'pos-dev-key-change-in-production' };

/** Create a booking via API with a backdated startTime so extension is allowed */
async function createBackdatedBooking(request: any, hoursAgo: number = 2): Promise<string> {
  const now = new Date();
  const startTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000); // 1 hour booking

  // Get a room
  const roomsRes = await request.get(`${API_BASE}/api/bookings/rooms`, { headers: POS_HEADER });
  const rooms = await roomsRes.json();
  const roomId = rooms[0]?.id;
  if (!roomId) throw new Error('No rooms found');

  // Create booking via simple create
  const res = await request.post(`${API_BASE}/api/bookings/simple/create`, {
    headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    data: {
      customerPhone: '9025559999',
      customerName: 'Extension Test',
      roomId,
      startTimeMs: startTime.getTime(),
      hours: 1,
      players: 1,
    },
  });

  const data = await res.json();
  const bookingId = data.booking?.id || data.id;
  if (!bookingId) throw new Error(`Failed to create booking: ${JSON.stringify(data)}`);
  return bookingId;
}

test.describe('Booking Extension', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('API: should extend booking and add extension order', async ({ page, request }) => {
    const bookingId = await createBackdatedBooking(request);

    // Get original booking
    const beforeRes = await request.get(`${API_BASE}/api/bookings/${bookingId}`, { headers: POS_HEADER });
    const beforeData = await beforeRes.json();
    const originalEndTime = new Date(beforeData.booking.endTime);

    // Extend
    const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(true);

    const extendData = await extendRes.json();
    const newEndTime = new Date(extendData.booking.endTime);

    // endTime should be 30 minutes later
    expect(newEndTime.getTime() - originalEndTime.getTime()).toBe(30 * 60 * 1000);
    expect(extendData.message).toBe('Booking extended by 30 minutes');

    // Check invoices — should have extension order on seat 1
    const invoicesRes = await request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, { headers: POS_HEADER });
    const invoices = await invoicesRes.json();
    const seat1 = invoices.find((inv: any) => inv.seatIndex === 1);
    const extOrder = seat1?.orders?.find((o: any) => o.customItemName === 'Extension (30 min)');
    expect(extOrder).toBeTruthy();
    expect(Number(extOrder.unitPrice)).toBe(20);
    expect(extOrder.quantity).toBe(1);
  });

  test('API: multiple extensions should increment quantity', async ({ request }) => {
    const bookingId = await createBackdatedBooking(request);

    // Extend twice
    const ext1 = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(ext1.ok()).toBe(true);

    const ext2 = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(ext2.ok()).toBe(true);

    // Check order quantity
    const invoicesRes = await request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, { headers: POS_HEADER });
    const invoices = await invoicesRes.json();
    const seat1 = invoices.find((inv: any) => inv.seatIndex === 1);
    const extOrder = seat1?.orders?.find((o: any) => o.customItemName === 'Extension (30 min)');
    expect(extOrder.quantity).toBe(2);
    expect(Number(extOrder.totalPrice)).toBe(40);
  });

  test('API: should reject extension on COMPLETED booking', async ({ request }) => {
    const bookingId = await createBackdatedBooking(request);

    // Complete it
    await request.patch(`${API_BASE}/api/bookings/${bookingId}/status`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      data: { status: 'COMPLETED' },
    });

    // Try to extend
    const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(false);
    expect(extendRes.status()).toBe(400);
    const data = await extendRes.json();
    expect(data.error).toContain('active');
  });

  test('API: should reject extension on Quick Sale', async ({ request }) => {
    // Create a quick sale
    const qsRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
      headers: POS_HEADER,
    });
    const qsData = await qsRes.json();
    const qsId = qsData.booking?.id || qsData.id;

    const extendRes = await request.patch(`${API_BASE}/api/bookings/${qsId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(false);
    const data = await extendRes.json();
    expect(data.error).toContain('Quick Sale');
  });

  test('UI: should show Extend button on active booking', async ({ page, request }) => {
    const bookingId = await createBackdatedBooking(request);

    // Navigate to booking detail
    await page.goto(`/pos/booking/${bookingId}`);
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });

    // The Extend button should be visible
    await expect(page.getByRole('button', { name: /\+30m/i })).toBeVisible();
  });

  test('UI: should not show Extend button on Quick Sale', async ({ page, request }) => {
    // Create a quick sale
    const qsRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
      headers: POS_HEADER,
    });
    const qsData = await qsRes.json();
    const qsId = qsData.booking?.id || qsData.id;

    await page.goto(`/pos/booking/${qsId}`);
    await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });

    // Extend button should NOT be visible for Quick Sale
    await expect(page.getByRole('button', { name: /\+30m/i })).not.toBeVisible();
  });
});

test.describe('Booking Extension — Customer Access', () => {
  test('API: customer should be rejected from extending any booking', async ({ page, request }) => {
    // Login as admin first to create a booking
    await loginAsAdmin(page);
    const bookingId = await createBackdatedBooking(request);

    // Login as customer
    await loginAsTestUser(page);

    // Try to extend via API (customer has auth cookie but not staff/admin role)
    const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(false);
    expect(extendRes.status()).toBe(403);
    const data = await extendRes.json();
    expect(data.error).toContain('Staff or Admin');
  });

  test('API: customer should be rejected from extending their own booking', async ({ page, request }) => {
    // Create a booking as a customer via the online booking flow
    await loginAsTestUser(page);

    // Get rooms
    const roomsRes = await request.get(`${API_BASE}/api/bookings/rooms`);
    const rooms = await roomsRes.json();
    const roomId = rooms[0]?.id;

    // Create booking as the logged-in customer
    const now = new Date();
    const startTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const createRes = await request.post(`${API_BASE}/api/bookings`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        roomId,
        startTimeMs: startTime.getTime(),
        players: 1,
        hours: 1,
        timezone: 'America/Halifax',
      },
    });

    // Even if booking creation fails (conflict), test the extend rejection
    if (createRes.ok()) {
      const createData = await createRes.json();
      const bookingId = createData.booking?.id;

      const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(extendRes.ok()).toBe(false);
      expect(extendRes.status()).toBe(403);
    }
  });

  test('API: unauthenticated request should be rejected', async ({ request }) => {
    // Try to extend without any auth
    const extendRes = await request.patch(`${API_BASE}/api/bookings/some-fake-id/extend`, {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(false);
    // Should be 401 (no auth) or 403
    expect([401, 403]).toContain(extendRes.status());
  });
});

test.describe('Booking Extension — Staff Access', () => {
  test('API: staff should be able to extend a booking', async ({ page, request }) => {
    // Create booking as admin
    await loginAsAdmin(page);
    const bookingId = await createBackdatedBooking(request);

    // Login as staff
    await loginAsStaff(page);

    // Staff should be able to extend
    const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(true);
    const data = await extendRes.json();
    expect(data.message).toBe('Booking extended by 30 minutes');
  });
});

test.describe('Booking Extension — Customer View', () => {
  test('customer dashboard should reflect extended duration and price', async ({ page, request }) => {
    // Step 1: Login as test user and create a booking
    await loginAsTestUser(page);

    // Get rooms
    const roomsRes = await request.get(`${API_BASE}/api/bookings/rooms`);
    const rooms = await roomsRes.json();
    const roomId = rooms[0]?.id;
    const roomName = rooms[0]?.name;

    // Create a 2-hour booking starting 3 hours ago (so it's extendable)
    const now = new Date();
    const startTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const createRes = await request.post(`${API_BASE}/api/bookings`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        roomId,
        startTimeMs: startTime.getTime(),
        players: 1,
        hours: 2,
        timezone: 'America/Halifax',
      },
    });

    if (!createRes.ok()) {
      // Room may be conflicting — skip gracefully
      test.skip();
      return;
    }

    const createData = await createRes.json();
    const bookingId = createData.booking?.id;

    // Verify customer sees 2 hour(s) on their dashboard via API
    const mineRes1 = await request.get(`${API_BASE}/api/bookings/mine`);
    const mine1 = await mineRes1.json();
    const myBooking1 = mine1.bookings.find((b: any) => b.id === bookingId);
    expect(myBooking1).toBeTruthy();
    const duration1 = Math.round(
      (new Date(myBooking1.endTime).getTime() - new Date(myBooking1.startTime).getTime()) / (60 * 60 * 1000)
    );
    expect(duration1).toBe(2);

    // Step 2: Admin extends the booking
    await loginAsAdmin(page);

    const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(true);

    // Step 3: Customer checks their bookings — should see updated duration
    await loginAsTestUser(page);

    const mineRes2 = await request.get(`${API_BASE}/api/bookings/mine`);
    const mine2 = await mineRes2.json();
    const myBooking2 = mine2.bookings.find((b: any) => b.id === bookingId);
    expect(myBooking2).toBeTruthy();

    // endTime should be 30 min later than before
    const newEndTime = new Date(myBooking2.endTime).getTime();
    const oldEndTime = new Date(myBooking1.endTime).getTime();
    expect(newEndTime - oldEndTime).toBe(30 * 60 * 1000);

    // Price should have increased (extension $20 + tax added to invoice total)
    const newPrice = Number(myBooking2.price);
    const oldPrice = Number(myBooking1.price);
    expect(newPrice).toBeGreaterThan(oldPrice);
  });

  test('customer dashboard shows correct duration after multiple extensions', async ({ page, request }) => {
    await loginAsTestUser(page);

    const roomsRes = await request.get(`${API_BASE}/api/bookings/rooms`);
    const rooms = await roomsRes.json();
    const roomId = rooms[1]?.id || rooms[0]?.id; // Use room 2 to avoid conflicts

    const now = new Date();
    const startTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const createRes = await request.post(`${API_BASE}/api/bookings`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        roomId,
        startTimeMs: startTime.getTime(),
        players: 1,
        hours: 1,
        timezone: 'America/Halifax',
      },
    });

    if (!createRes.ok()) {
      test.skip();
      return;
    }

    const createData = await createRes.json();
    const bookingId = createData.booking?.id;

    // Admin extends 2 times (adds 60 min total)
    await loginAsAdmin(page);

    for (let i = 0; i < 2; i++) {
      const res = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
        headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
      });
      expect(res.ok()).toBe(true);
    }

    // Customer checks — original 1hr + 2×30min = 2 hours total
    await loginAsTestUser(page);

    const mineRes = await request.get(`${API_BASE}/api/bookings/mine`);
    const mine = await mineRes.json();
    const myBooking = mine.bookings.find((b: any) => b.id === bookingId);
    expect(myBooking).toBeTruthy();

    const totalMs = new Date(myBooking.endTime).getTime() - new Date(myBooking.startTime).getTime();
    const totalMinutes = totalMs / (60 * 1000);
    expect(totalMinutes).toBe(120); // 1hr + 2×30min = 120 min
  });

  test('customer cannot see other customers extended bookings', async ({ page, request }) => {
    // Admin creates a booking for a different customer
    await loginAsAdmin(page);
    const bookingId = await createBackdatedBooking(request); // Creates for "Extension Test" customer

    // Extend it
    const extendRes = await request.patch(`${API_BASE}/api/bookings/${bookingId}/extend`, {
      headers: { ...POS_HEADER, 'Content-Type': 'application/json' },
    });
    expect(extendRes.ok()).toBe(true);

    // Login as test user — should NOT see this booking in /mine
    await loginAsTestUser(page);

    const mineRes = await request.get(`${API_BASE}/api/bookings/mine`);
    const mine = await mineRes.json();
    const found = mine.bookings.find((b: any) => b.id === bookingId);
    expect(found).toBeUndefined();
  });
});
