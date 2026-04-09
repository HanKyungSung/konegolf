import { test, expect } from '@playwright/test';
import { loginAsAdmin, createBookingViaAPI, API_BASE } from './helpers';

/**
 * 15 — Split-Payment Receipt E2E Tests
 * Tests that each Payment in a split-payment booking can have its own receipt,
 * and that pending-receipts API correctly lists them.
 */

const ADMIN_KEY = 'pos-dev-key-change-in-production';
const headers = { 'x-pos-admin-key': ADMIN_KEY };

let clubSandwichId: string;
let beerId: string;

/** Fetch menu item IDs once */
async function ensureMenuItems(page: any) {
  if (clubSandwichId) return;
  const res = await page.request.get(`${API_BASE}/api/menu/items`, { headers });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  clubSandwichId = data.items.find((m: any) => m.name === 'Club Sandwich').id;
  beerId = data.items.find((m: any) => m.name === 'Beer').id;
}

/** Create a booking with two items so the total is big enough for a split */
async function createBookingWithItems(page: any): Promise<string> {
  await ensureMenuItems(page);
  const bookingId = await createBookingViaAPI(page);

  const addRes = await page.request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
    headers,
    data: { menuItemId: clubSandwichId, quantity: 1, seatIndex: 1 },
  });
  expect(addRes.ok()).toBeTruthy();

  const addRes2 = await page.request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
    headers,
    data: { menuItemId: beerId, quantity: 1, seatIndex: 1 },
  });
  expect(addRes2.ok()).toBeTruthy();

  return bookingId;
}

/** Get invoices for a booking */
async function getInvoices(page: any, bookingId: string) {
  const res = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, { headers });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).invoices;
}

/** Add a payment to an invoice */
async function addPayment(
  page: any,
  invoiceId: string,
  bookingId: string,
  method: string,
  amount: number
) {
  const res = await page.request.post(`${API_BASE}/api/bookings/invoices/${invoiceId}/add-payment`, {
    headers,
    data: { bookingId, seatIndex: 1, method, amount },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Upload a fake receipt to a payment */
async function uploadReceipt(page: any, paymentId: string, content: string) {
  const res = await page.request.post(`${API_BASE}/api/payments/${paymentId}/receipt`, {
    headers,
    multipart: {
      image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(content) },
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe('Split-Payment Receipts', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('Card + Gift Card split: each payment gets its own receipt', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    // Split payment: Card for half, Gift Card for the rest
    const cardAmount = Math.round((total / 2) * 100) / 100;
    const giftCardAmount = Math.round((total - cardAmount) * 100) / 100;

    const pay1 = await addPayment(page, invoice.id, bookingId, 'CARD', cardAmount);
    const pay2 = await addPayment(page, invoice.id, bookingId, 'GIFT_CARD', giftCardAmount);

    const cardPaymentId = pay1.invoice.payments.find((p: any) => p.method === 'CARD').id;
    const giftPaymentId = pay2.invoice.payments.find((p: any) => p.method === 'GIFT_CARD').id;

    // Upload different receipts to each
    const upload1 = await uploadReceipt(page, cardPaymentId, 'card-receipt-image');
    const upload2 = await uploadReceipt(page, giftPaymentId, 'giftcard-receipt-image');

    // Each receipt path should be different
    expect(upload1.receiptPath).not.toBe(upload2.receiptPath);
    expect(upload1.receiptPath).toContain(cardPaymentId);
    expect(upload2.receiptPath).toContain(giftPaymentId);

    // Verify each receipt serves its own content
    const serve1 = await page.request.get(`${API_BASE}/api/payments/${cardPaymentId}/receipt`, { headers });
    const serve2 = await page.request.get(`${API_BASE}/api/payments/${giftPaymentId}/receipt`, { headers });
    expect((await serve1.body()).toString()).toBe('card-receipt-image');
    expect((await serve2.body()).toString()).toBe('giftcard-receipt-image');
  });

  test('split payment: both appear in pending-receipts before upload', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    const cardAmount = Math.round((total / 2) * 100) / 100;
    const giftCardAmount = Math.round((total - cardAmount) * 100) / 100;

    await addPayment(page, invoice.id, bookingId, 'CARD', cardAmount);
    await addPayment(page, invoice.id, bookingId, 'GIFT_CARD', giftCardAmount);

    // Both should be in pending receipts
    const today = new Date().toISOString().slice(0, 10);
    const pendingRes = await page.request.get(
      `${API_BASE}/api/payments/pending-receipts?date=${today}`,
      { headers }
    );
    expect(pendingRes.ok()).toBeTruthy();
    const pending = await pendingRes.json();

    // Filter to our booking
    const ours = pending.filter((p: any) => p.booking.id === bookingId);
    expect(ours.length).toBe(2);

    const methods = ours.map((p: any) => p.method).sort();
    expect(methods).toEqual(['CARD', 'GIFT_CARD']);
  });

  test('split payment: uploading one receipt removes only that from pending', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    const cardAmount = Math.round((total / 2) * 100) / 100;
    const giftCardAmount = Math.round((total - cardAmount) * 100) / 100;

    const pay1 = await addPayment(page, invoice.id, bookingId, 'CARD', cardAmount);
    await addPayment(page, invoice.id, bookingId, 'GIFT_CARD', giftCardAmount);

    const cardPaymentId = pay1.invoice.payments.find((p: any) => p.method === 'CARD').id;

    // Upload receipt for CARD only
    await uploadReceipt(page, cardPaymentId, 'card-receipt');

    // Only GIFT_CARD should remain in pending
    const today = new Date().toISOString().slice(0, 10);
    const pendingRes = await page.request.get(
      `${API_BASE}/api/payments/pending-receipts?date=${today}`,
      { headers }
    );
    const pending = await pendingRes.json();
    const ours = pending.filter((p: any) => p.booking.id === bookingId);
    expect(ours.length).toBe(1);
    expect(ours[0].method).toBe('GIFT_CARD');
  });

  test('Cash + Card split: only Card appears in pending receipts', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    const cashAmount = Math.round((total / 2) * 100) / 100;
    const cardAmount = Math.round((total - cashAmount) * 100) / 100;

    await addPayment(page, invoice.id, bookingId, 'CASH', cashAmount);
    await addPayment(page, invoice.id, bookingId, 'CARD', cardAmount);

    // Only CARD should appear in pending receipts (CASH doesn't need receipt)
    const today = new Date().toISOString().slice(0, 10);
    const pendingRes = await page.request.get(
      `${API_BASE}/api/payments/pending-receipts?date=${today}`,
      { headers }
    );
    const pending = await pendingRes.json();
    const ours = pending.filter((p: any) => p.booking.id === bookingId);
    expect(ours.length).toBe(1);
    expect(ours[0].method).toBe('CARD');
  });

  test('COUPON + Card split: only Card needs receipt', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    // Simulate: COUPON covers $0 (auto-added), Card pays the full amount
    await addPayment(page, invoice.id, bookingId, 'COUPON', 0);
    await addPayment(page, invoice.id, bookingId, 'CARD', total);

    // Only CARD should appear in pending receipts
    const today = new Date().toISOString().slice(0, 10);
    const pendingRes = await page.request.get(
      `${API_BASE}/api/payments/pending-receipts?date=${today}`,
      { headers }
    );
    const pending = await pendingRes.json();
    const ours = pending.filter((p: any) => p.booking.id === bookingId);
    expect(ours.length).toBe(1);
    expect(ours[0].method).toBe('CARD');
  });

  test('invoices API shows receiptPath per payment after split upload', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    const half = Math.round((total / 2) * 100) / 100;
    const rest = Math.round((total - half) * 100) / 100;

    const pay1 = await addPayment(page, invoice.id, bookingId, 'CARD', half);
    const pay2 = await addPayment(page, invoice.id, bookingId, 'GIFT_CARD', rest);

    const cardPaymentId = pay1.invoice.payments.find((p: any) => p.method === 'CARD').id;
    const giftPaymentId = pay2.invoice.payments.find((p: any) => p.method === 'GIFT_CARD').id;

    // Upload only the Card receipt
    await uploadReceipt(page, cardPaymentId, 'card-only-receipt');

    // Re-fetch invoices — Card should have receiptPath, Gift Card should not
    const updated = await getInvoices(page, bookingId);
    const payments = updated[0].payments;
    const cardPayment = payments.find((p: any) => p.id === cardPaymentId);
    const giftPayment = payments.find((p: any) => p.id === giftPaymentId);

    expect(cardPayment.receiptPath).toBeTruthy();
    expect(cardPayment.receiptPath).toContain(bookingId);
    expect(giftPayment.receiptPath).toBeNull();
  });

  test('three-way split: Card + Gift Card + Cash, two need receipts', async ({ page }) => {
    const bookingId = await createBookingWithItems(page);
    const invoices = await getInvoices(page, bookingId);
    const invoice = invoices[0];
    const total = Number(invoice.subtotal) + Number(invoice.tax);

    const third = Math.round((total / 3) * 100) / 100;
    const remainder = Math.round((total - third * 2) * 100) / 100;

    await addPayment(page, invoice.id, bookingId, 'CARD', third);
    await addPayment(page, invoice.id, bookingId, 'GIFT_CARD', third);
    await addPayment(page, invoice.id, bookingId, 'CASH', remainder);

    // Pending receipts: CARD + GIFT_CARD (not CASH)
    const today = new Date().toISOString().slice(0, 10);
    const pendingRes = await page.request.get(
      `${API_BASE}/api/payments/pending-receipts?date=${today}`,
      { headers }
    );
    const pending = await pendingRes.json();
    const ours = pending.filter((p: any) => p.booking.id === bookingId);
    expect(ours.length).toBe(2);

    const methods = ours.map((p: any) => p.method).sort();
    expect(methods).toEqual(['CARD', 'GIFT_CARD']);
  });
});
