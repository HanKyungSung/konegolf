import { test, expect } from '@playwright/test';
import { API_BASE, loginAsAdmin, createBookingViaAPI } from './helpers';

const ADMIN_KEY = 'pos-dev-key-change-in-production';
const headers = { 'x-pos-admin-key': ADMIN_KEY };

/**
 * E2E tests for Coupon System — birthday "1 Hour Free (Tax Included)"
 *
 * Covers:
 * - Coupon creation (admin API)
 * - Coupon validation
 * - Coupon redemption with dynamic tax-inclusive discount
 * - Invoice recalculation after redemption
 * - Public coupon page
 * - Double-redeem prevention
 */

test.describe('Coupon System — Birthday Tax Included', () => {
  let couponTypeId: string;
  let adminUserId: string;

  test.beforeAll(async ({ request }) => {
    // Fetch birthday coupon type ID
    const typesRes = await request.get(`${API_BASE}/api/coupons/types`, { headers });
    expect(typesRes.ok()).toBeTruthy();
    const types = await typesRes.json();
    const birthday = types.find((t: any) => t.name === 'BIRTHDAY');
    expect(birthday).toBeTruthy();
    couponTypeId = birthday.id;

    // Get test customer user ID (coupons are issued to customers)
    const usersRes = await request.get(`${API_BASE}/api/customers?page=1&limit=100&search=test@example.com`, { headers });
    expect(usersRes.ok()).toBeTruthy();
    const usersData = await usersRes.json();
    const testUser = usersData.customers.find((u: any) => u.email === 'test@example.com');
    expect(testUser).toBeTruthy();
    adminUserId = testUser.id; // variable name kept for simplicity — it's the coupon recipient
  });

  test('admin can create a birthday coupon via API', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.code).toMatch(/^KGOLF-/);
    expect(data.status).toBe('ACTIVE');
    expect(Number(data.discountAmount)).toBe(35);
    expect(data.couponType.name).toBe('BIRTHDAY');
  });

  test('validate API returns coupon info with isValid=true', async ({ request }) => {
    // Create coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    // Validate
    const valRes = await request.get(`${API_BASE}/api/coupons/validate/${coupon.code}`, { headers });
    expect(valRes.ok()).toBeTruthy();
    const val = await valRes.json();
    expect(val.isValid).toBe(true);
    expect(val.coupon.code).toBe(coupon.code);
    expect(val.coupon.status).toBe('ACTIVE');
  });

  test('redeem creates tax-inclusive discount order', async ({ request }) => {
    // Create coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    // Create booking
    const bookingRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, { headers });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;

    // Add a 1-hour item so there's something to discount against
    const menuRes = await request.get(`${API_BASE}/api/menu/items`, { headers });
    const menuData = await menuRes.json();
    const hourItem = menuData.items.find((m: any) => m.name === '1 Hour');
    await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { menuItemId: hourItem.id, seatIndex: 1, quantity: 1 },
    });

    // Redeem coupon on seat 0
    const redeemRes = await request.post(`${API_BASE}/api/coupons/${coupon.code}/redeem`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { bookingId, seatNumber: 1 },
    });
    expect(redeemRes.ok()).toBeTruthy();
    const redeemData = await redeemRes.json();
    expect(redeemData.success).toBe(true);
    expect(redeemData.coupon.status).toBe('REDEEMED');

    // Verify via invoice — discount order embedded in invoice.orders
    // Tax rate = 14% in test DB, so effective = 35 × 1.14 = 39.90
    const invoiceRes = await request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, { headers });
    expect(invoiceRes.ok()).toBeTruthy();
    const invoiceData = await invoiceRes.json();
    const invoices = invoiceData.invoices;
    const invoice = invoices.find((i: any) => i.seatIndex === 1);
    expect(invoice).toBeTruthy();
    const discountOrder = invoice.orders?.find((o: any) => o.discountType === 'FLAT' && Number(o.totalPrice) < 0);
    expect(discountOrder).toBeTruthy();
    expect(Number(discountOrder.totalPrice)).toBeCloseTo(-39.9, 1);
    expect(discountOrder.taxExempt).toBe(true);
  });

  test('invoice reflects tax-inclusive discount correctly', async ({ request }) => {
    // Create coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    // Create booking
    const bookingRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, { headers });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;

    // Add a 1-hour menu item ($35) to seat 0
    const menuRes = await request.get(`${API_BASE}/api/menu/items`, { headers });
    const menuData = await menuRes.json();
    const hourItem = menuData.items.find((m: any) => m.name === '1 Hour');
    expect(hourItem).toBeTruthy();

    await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { menuItemId: hourItem.id, seatIndex: 1, quantity: 1 },
    });

    // Redeem coupon
    await request.post(`${API_BASE}/api/coupons/${coupon.code}/redeem`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { bookingId, seatNumber: 1 },
    });

    // Recalculate invoice
    const invoiceRes = await request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, { headers });
    expect(invoiceRes.ok()).toBeTruthy();
    const invoiceData = await invoiceRes.json();
    const invoices = invoiceData.invoices;
    const invoice = invoices.find((i: any) => i.seatIndex === 1);
    expect(invoice).toBeTruthy();

    // $35 (1 hour) - $39.90 (coupon) = -$4.90 subtotal
    // Tax on $35 (taxable) + tax on -$39.90 (tax-exempt, no tax) = $35 × 0.14 = $4.90
    // But the discount is tax-exempt, so only the $35 item is taxed
    // subtotal: 35 - 39.90 = -4.90, tax on taxable portion: (35 - 0) × 0.14 = 4.90
    // total: -4.90 + 4.90 = ~$0.00
    // Customer pays $0 for the free hour!
    expect(Number(invoice.totalAmount)).toBeCloseTo(0, 1);
  });

  test('redeeming same coupon twice returns 409 conflict', async ({ request }) => {
    // Create coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    // Create booking
    const bookingRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, { headers });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;

    // First redeem — should succeed
    const firstRedeem = await request.post(`${API_BASE}/api/coupons/${coupon.code}/redeem`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { bookingId, seatNumber: 1 },
    });
    expect(firstRedeem.ok()).toBeTruthy();

    // Second redeem — should fail with 409
    const secondRedeem = await request.post(`${API_BASE}/api/coupons/${coupon.code}/redeem`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { bookingId, seatNumber: 1 },
    });
    expect(secondRedeem.status()).toBe(409);
    const errData = await secondRedeem.json();
    expect(errData.error).toContain('already');
  });

  test('public coupon page API returns correct data', async ({ request }) => {
    // Create coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    // Public API — no auth needed
    const publicRes = await request.get(`${API_BASE}/api/coupons/public/${coupon.code}`);
    expect(publicRes.ok()).toBeTruthy();
    const pub = await publicRes.json();
    expect(pub.code).toBe(coupon.code);
    expect(pub.status).toBe('ACTIVE');
    expect(pub.typeName).toBe('BIRTHDAY');
    expect(Number(pub.discountAmount)).toBe(35);
    // Description should mention tax included
    expect(pub.description).toBeTruthy();
  });

  test('public coupon page shows "1 Hour Free (Tax Included)" for birthday', async ({ page }) => {
    // Create coupon via API
    const createRes = await page.request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    // Navigate to public coupon page
    await page.goto(`/coupon/${coupon.code}`);
    await expect(page.getByText(coupon.code)).toBeVisible({ timeout: 10000 });

    // Should show "1 Hour Free (Tax Included)" instead of "$35.00"
    await expect(page.getByText('1 Hour Free (Tax Included)')).toBeVisible();
    // Should NOT show the raw dollar amount
    expect(await page.getByText('$35.00').count()).toBe(0);
  });

  test('redeemed coupon shows REDEEMED on public page', async ({ page, request }) => {
    // Create and redeem coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId },
    });
    const coupon = await createRes.json();

    const bookingRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, { headers });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;

    const redeemRes = await request.post(`${API_BASE}/api/coupons/${coupon.code}/redeem`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { bookingId, seatNumber: 1 },
    });
    expect(redeemRes.ok()).toBeTruthy();

    // Check public page
    await page.goto(`/coupon/${coupon.code}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('This coupon has already been used')).toBeVisible({ timeout: 15000 });
  });

  test('non-birthday coupon does NOT get tax-inclusive discount', async ({ request }) => {
    // Find CUSTOM coupon type
    const typesRes = await request.get(`${API_BASE}/api/coupons/types`, { headers });
    const types = await typesRes.json();
    const custom = types.find((t: any) => t.name === 'CUSTOM');
    expect(custom).toBeTruthy();

    // Create custom coupon
    const createRes = await request.post(`${API_BASE}/api/coupons`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { userId: adminUserId, couponTypeId: custom.id },
    });
    const coupon = await createRes.json();

    // Create booking, add an item, and redeem
    const bookingRes = await request.post(`${API_BASE}/api/bookings/simple/quick-sale`, { headers });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.booking?.id || bookingData.id;

    const menuRes = await request.get(`${API_BASE}/api/menu/items`, { headers });
    const menuData = await menuRes.json();
    const hourItem = menuData.items.find((m: any) => m.name === '1 Hour');
    await request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { menuItemId: hourItem.id, seatIndex: 1, quantity: 1 },
    });

    await request.post(`${API_BASE}/api/coupons/${coupon.code}/redeem`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { bookingId, seatNumber: 1 },
    });

    // Verify discount is base amount (NOT tax-inclusive) via invoices
    const invoiceRes = await request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, { headers });
    const invoiceData = await invoiceRes.json();
    const invoices = invoiceData.invoices;
    const invoice = invoices.find((i: any) => i.seatIndex === 1);
    expect(invoice).toBeTruthy();
    const discountOrder = invoice.orders?.find((o: any) => o.discountType === 'FLAT' && Number(o.totalPrice) < 0);
    expect(discountOrder).toBeTruthy();
    expect(Number(discountOrder.totalPrice)).toBe(-35);
    expect(discountOrder.taxExempt).toBe(false);
  });
});
