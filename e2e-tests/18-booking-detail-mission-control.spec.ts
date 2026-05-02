import { test, expect } from '@playwright/test';
import { API_BASE } from './helpers';

test.use({ baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173' });

async function proxyBackendApi(page: import('@playwright/test').Page) {
  await page.route(`${API_BASE}/api/**`, async (route) => {
    const request = route.request();
    const headers = { ...request.headers() };
    delete headers.origin;
    delete headers.referer;
    delete headers.host;

    const response = await fetch(request.url(), {
      method: request.method(),
      headers,
      body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
    });

    await route.fulfill({
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'mission-control-e2e-admin',
          name: 'Mission Control E2E Admin',
          email: 'admin@konegolf.ca',
          role: 'ADMIN',
        },
      }),
    });
  });
}

async function createQuickSaleBooking(page: import('@playwright/test').Page): Promise<string> {
  const response = await page.request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
    headers: {
      'x-pos-admin-key': 'pos-dev-key-change-in-production',
    },
  });

  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  const bookingId = data.booking?.id || data.id;
  expect(bookingId).toBeTruthy();

  return bookingId;
}

async function addCustomOrder(page: import('@playwright/test').Page, bookingId: string) {
  const response = await page.request.post(`${API_BASE}/api/bookings/${bookingId}/orders`, {
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production',
    },
    data: {
      customItemName: 'Payment Modal Test Item',
      customItemPrice: 25,
      seatIndex: 1,
      quantity: 1,
    },
  });

  expect(response.ok()).toBeTruthy();
}

test.describe('Mission Control booking detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await proxyBackendApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('kgolf-ui-theme', 'mission-control');
    });
  });

  test('renders the page-first command workspace and menu drawer', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);

    await page.goto(`/pos/booking/${bookingId}`);

    await expect(page.locator('.mc-root')).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByText('Booking Command')).toBeVisible();
    await expect(page.getByText('Session')).toBeVisible();
    await expect(page.getByText('Seat Ledger')).toBeVisible();
    await expect(page.getByText('Seat 1 totals and active workflow.')).toBeVisible();
    await expect(page.getByText('Orders', { exact: true })).toBeVisible();
    await expect(page.getByText('Payment', { exact: true })).toBeVisible();
    await expect(page.getByText('Settlement', { exact: true })).toBeVisible();
    await expect(page.getByText('Command Stack')).toBeVisible();
    await expect(page.getByText('Attention', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tax' })).toHaveCount(0);
    const seatsPanel = page.locator('section').filter({ has: page.getByText('Seats', { exact: true }) });
    const settlementPanel = page.locator('section').filter({ has: page.getByText('Settlement', { exact: true }) });
    const paymentSummary = page.locator('section').filter({ has: page.getByText('Payment', { exact: true }) }).first();
    const receiptsPanel = page.locator('section').filter({ has: page.getByText('Receipts', { exact: true }) });
    const bookingActionsPanel = page.locator('section').filter({ has: page.getByText('Booking Actions', { exact: true }) });
    await expect(seatsPanel.getByRole('button', { name: /^Seat 1\b/ })).toHaveCount(1);
    await expect(settlementPanel.getByRole('button', { name: /^Seat \d+\b/ })).toHaveCount(0);
    await expect(settlementPanel.getByText('Active seat 1')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Print Seat Receipt$/ })).toHaveCount(0);
    await expect(receiptsPanel.getByRole('button', { name: 'Full booking receipt' })).toHaveCount(1);
    await expect(receiptsPanel.getByRole('button', { name: /^Seat 1 receipt$/ })).toHaveClass(/mc-ledger-action-secondary/);
    await expect(settlementPanel.getByRole('button', { name: /^Collect \$.*$/ })).toHaveCount(0);
    await expect(paymentSummary.getByRole('button', { name: /^Collect \$.*$/ })).toHaveClass(/mc-ledger-action-primary/);
    await expect(page.getByRole('button', { name: /^Collect \$.*$/ })).toHaveCount(1);
    await expect(receiptsPanel.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
    await expect(bookingActionsPanel.getByRole('button', { name: 'Cancel booking' })).toHaveCount(1);

    await page.getByRole('button', { name: /Add item/i }).first().click();
    await expect(page.getByText('Menu Command')).toBeVisible();

    await page.getByRole('button', { name: /^Close$/ }).first().click();
    await expect(page.getByText('Menu Command')).toBeHidden();
  });

  test('disables command stack actions for completed bookings', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);

    await page.route(`${API_BASE}/api/bookings/${bookingId}`, async (route) => {
      const request = route.request();
      const headers = { ...request.headers() };
      delete headers.origin;
      delete headers.referer;
      delete headers.host;

      const response = await fetch(request.url(), { method: request.method(), headers });
      const data = await response.json();

      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify({
          ...data,
          booking: {
            ...data.booking,
            status: 'COMPLETED',
            bookingStatus: 'COMPLETED',
          },
        }),
      });
    });

    await page.goto(`/pos/booking/${bookingId}`);

    const commandStack = page.locator('section').filter({ hasText: 'Command Stack' });
    await expect(commandStack.getByText('Reopen booking to use edit commands.')).toBeVisible();
    await expect(commandStack.getByRole('button', { name: 'Item' })).toBeDisabled();
    await expect(commandStack.getByRole('button', { name: 'Custom' })).toBeDisabled();
    await expect(commandStack.getByRole('button', { name: 'Discount' })).toBeDisabled();
    await expect(commandStack.getByRole('button', { name: 'Coupon' })).toBeDisabled();
    await expect(commandStack.getByRole('button', { name: 'Gift Card' })).toBeDisabled();
  });

  test('opens the Mission Control collect payment modal', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);
    await addCustomOrder(page, bookingId);

    await page.goto(`/pos/booking/${bookingId}`);

    await page.getByRole('button', { name: /^Collect \$.*$/ }).click();
    await expect(page.getByRole('heading', { name: 'Collect Payment' })).toBeVisible();
    await expect(page.getByText('Seat 1 balance')).toBeVisible();
    await expect(page.getByText('Payment Method', { exact: true })).toBeVisible();
    await expect(page.getByText('Amount', { exact: true })).toBeVisible();
    await expect(page.getByText('Select a payment method to continue.')).toBeVisible();

    await page.getByRole('button', { name: /^Card$/ }).click();
    await expect(page.getByText('Ready to settle by Card.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pay \$.* by Card/ })).toBeEnabled();

    const tipAmountInput = page.getByLabel('Tip amount');
    await tipAmountInput.fill('12.34');

    const tipPrefixHasRoom = await tipAmountInput.evaluate((input) => {
      const prefix = input.previousElementSibling as HTMLElement | null;
      if (!prefix) return false;

      const inputRect = input.getBoundingClientRect();
      const prefixRect = prefix.getBoundingClientRect();
      const paddingLeft = parseFloat(window.getComputedStyle(input).paddingLeft);

      return inputRect.left + paddingLeft > prefixRect.right + 2;
    });
    expect(tipPrefixHasRoom).toBeTruthy();
  });

  test('keeps receipt upload and cancel payment actions the same size', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);
    await addCustomOrder(page, bookingId);

    await page.goto(`/pos/booking/${bookingId}`);

    await page.getByRole('button', { name: /^Collect \$.*$/ }).click();
    await page.getByRole('button', { name: /^Card$/ }).click();
    await page.getByRole('button', { name: /Pay \$.* by Card/ }).click();
    await expect(page.getByText('Payment Records')).toBeVisible();

    const paymentRecords = page.locator('section').filter({ has: page.getByText('Payment Records', { exact: true }) }).first();
    const uploadReceipt = paymentRecords.getByRole('button', { name: /Upload Receipt|View Receipt/ }).first();
    const cancelPayment = paymentRecords.getByRole('button', { name: 'Cancel Payment' }).first();

    const uploadBox = await uploadReceipt.boundingBox();
    const cancelBox = await cancelPayment.boundingBox();

    expect(uploadBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(Math.abs(uploadBox!.width - cancelBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(uploadBox!.height - cancelBox!.height)).toBeLessThanOrEqual(1);
  });
});
