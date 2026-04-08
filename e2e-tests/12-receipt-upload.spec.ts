import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin, createAndOpenBooking, API_BASE } from './helpers';

/**
 * 12 — Receipt Upload E2E Tests
 * Tests receipt upload, view, replace UI on booking detail page,
 * and the pending receipts page.
 */

async function setupPaidBooking(page: Page): Promise<string> {
  const bookingId = await createAndOpenBooking(page);

  // Add a food item to Seat 1
  await page.getByRole('tab', { name: 'Food' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Club Sandwich/ }).click();
  await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.waitForTimeout(1500);

  // Open payment dialog and pay by card
  await page.getByRole('button', { name: /Collect Payment/ }).first().click();
  await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

  const cardOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Card' }).first();
  await cardOption.click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Full/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Pay \$.*by Card/ }).click();
  await page.waitForTimeout(2000);

  // Verify paid
  await expect(page.getByText('PAID').first()).toBeVisible({ timeout: 5000 });

  return bookingId;
}

test.describe('Receipt Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test('shows Upload Receipt button after card payment', async ({ page }) => {
    await setupPaidBooking(page);

    // Card payment should show "Upload Receipt" button
    await expect(page.getByRole('button', { name: /Upload Receipt/ })).toBeVisible({ timeout: 3000 });
  });

  test('does not show Upload Receipt for cash payment', async ({ page }) => {
    const bookingId = await createAndOpenBooking(page);

    // Add item and pay by cash
    await page.getByRole('tab', { name: 'Food' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Club Sandwich/ }).click();
    await expect(page.getByText('Add to Seat')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Seat 1' }).click();
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: /Collect Payment/ }).first().click();
    await expect(page.getByText('Collect Payment — Seat 1')).toBeVisible({ timeout: 3000 });

    const cashOption = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Cash' }).first();
    await cashOption.click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Full/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Pay \$.*by Cash/ }).click();
    await page.waitForTimeout(2000);

    await expect(page.getByText('PAID').first()).toBeVisible({ timeout: 5000 });

    // Cash payment should NOT show Upload Receipt button
    await expect(page.getByRole('button', { name: /Upload Receipt/ })).not.toBeVisible({ timeout: 2000 });
  });

  test('upload receipt modal opens with file picker', async ({ page }) => {
    await setupPaidBooking(page);

    // Click Upload Receipt
    await page.getByRole('button', { name: /Upload Receipt/ }).click();

    // Modal should open with "Attach Receipt" header
    await expect(page.getByText('Attach Receipt')).toBeVisible({ timeout: 3000 });

    // Should show file picker area
    await expect(page.getByText('Tap to take photo or select file')).toBeVisible();
    await expect(page.getByText('JPEG or PNG, max 5MB')).toBeVisible();
  });

  test('receipt upload API works and returns path with booking folder', async ({ page }) => {
    const bookingId = await setupPaidBooking(page);

    // Get the payment ID from the API
    const invoicesRes = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    const invoicesData = await invoicesRes.json();
    const payment = invoicesData.invoices[0]?.payments?.[0];
    expect(payment).toBeTruthy();
    expect(payment.method).toBe('CARD');

    // Upload a test receipt via API
    const testImage = Buffer.from('fake-jpeg-for-test');

    const uploadRes = await page.request.post(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
      multipart: {
        image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: testImage },
      },
    });

    expect(uploadRes.ok()).toBeTruthy();
    const uploadData = await uploadRes.json();

    // Path should include booking ID folder
    expect(uploadData.receiptPath).toContain(bookingId);
    expect(uploadData.receiptPath).toContain(payment.id);
    expect(uploadData.receiptPath).toMatch(/^receipts\/\d{4}-\d{2}-\d{2}\//);
  });

  test('receipt serve API returns image after upload', async ({ page }) => {
    const bookingId = await setupPaidBooking(page);

    // Get payment ID
    const invoicesRes = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    const invoicesData = await invoicesRes.json();
    const payment = invoicesData.invoices[0]?.payments?.[0];

    // Upload test receipt
    const testImage = Buffer.from('fake-jpeg-content-for-serve-test');
    await page.request.post(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
      multipart: {
        image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: testImage },
      },
    });

    // GET should return image bytes
    const serveRes = await page.request.get(`${API_BASE}/api/payments/${payment.id}/receipt`, { headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' } });
    expect(serveRes.ok()).toBeTruthy();
    expect(serveRes.headers()['content-type']).toBe('image/jpeg');

    const body = await serveRes.body();
    expect(body.length).toBeGreaterThan(0);
  });

  test('receipt replace overwrites previous upload', async ({ page }) => {
    const bookingId = await setupPaidBooking(page);

    // Get payment ID
    const invoicesRes = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    const invoicesData = await invoicesRes.json();
    const payment = invoicesData.invoices[0]?.payments?.[0];

    // First upload
    const image1 = Buffer.from('first-receipt-image');
    await page.request.post(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
      multipart: {
        image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: image1 },
      },
    });

    // Second upload (replace)
    const image2 = Buffer.from('second-receipt-image-replaced');
    const replaceRes = await page.request.post(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
      multipart: {
        image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: image2 },
      },
    });
    expect(replaceRes.ok()).toBeTruthy();

    // Serve should return the second image
    const serveRes = await page.request.get(`${API_BASE}/api/payments/${payment.id}/receipt`, { headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' } });
    const body = await serveRes.body();
    expect(body.toString()).toBe('second-receipt-image-replaced');
  });

  test('invoices API includes receiptPath in payments', async ({ page }) => {
    const bookingId = await setupPaidBooking(page);

    // Get payment and upload receipt
    const invoicesRes = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    const before = await invoicesRes.json();
    const payment = before.invoices[0]?.payments?.[0];

    // Before upload — receiptPath should be null
    expect(payment.receiptPath).toBeNull();

    // Upload receipt
    await page.request.post(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
      multipart: {
        image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('test') },
      },
    });

    // After upload — receiptPath should be set
    const afterRes = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    const after = await afterRes.json();
    const updatedPayment = after.invoices[0]?.payments?.[0];
    expect(updatedPayment.receiptPath).toBeTruthy();
    expect(updatedPayment.receiptPath).toContain(bookingId);
  });

  test('pending receipts page accessible from dashboard', async ({ page }) => {
    // Navigate to pending receipts
    await page.getByRole('button', { name: /Receipts/ }).click();
    await page.waitForTimeout(1000);

    // Should be on pending receipts page
    await expect(page.getByText(/Pending Receipts|No pending/i)).toBeVisible({ timeout: 5000 });
  });

  test('receipt delete API removes receipt', async ({ page }) => {
    const bookingId = await setupPaidBooking(page);

    // Get payment and upload
    const invoicesRes = await page.request.get(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    const data = await invoicesRes.json();
    const payment = data.invoices[0]?.payments?.[0];

    await page.request.post(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
      multipart: {
        image: { name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('test') },
      },
    });

    // Delete receipt (requires admin key)
    const deleteRes = await page.request.delete(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    expect(deleteRes.ok()).toBeTruthy();

    // GET should now return 404
    const serveRes = await page.request.get(`${API_BASE}/api/payments/${payment.id}/receipt`, {
      headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
    });
    expect(serveRes.status()).toBe(404);
  });
});
