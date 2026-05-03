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

  test('renders the themed original booking detail layout', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);
    await addCustomOrder(page, bookingId);

    await page.goto(`/pos/booking/${bookingId}`);

    await expect(page.locator('.mc-root')).toHaveCount(1, { timeout: 10000 });
    const originalLayout = page.locator('.mc-original-layout');
    await expect(originalLayout).toBeVisible();
    await expect(originalLayout.getByRole('heading', { name: 'Booking Details' })).toBeVisible();
    await expect(originalLayout.getByText('Seat Management', { exact: true })).toBeVisible();
    await expect(originalLayout.getByText('Number of Seats')).toBeVisible();
    await expect(originalLayout.getByText('Seat 1', { exact: true }).first()).toBeVisible();
    await expect(originalLayout.getByText('Seat Status', { exact: true }).first()).toBeVisible();
    await expect(originalLayout.getByText('Payment Summary', { exact: true })).toBeVisible();
    await expect(originalLayout.getByText('Quick Actions', { exact: true })).toBeVisible();
    await expect(originalLayout.getByText('Menu', { exact: true })).toBeVisible();
    await expect(originalLayout.getByText(/\$\d+\.\d{2} due/).first()).toBeVisible();
    await expect(originalLayout.getByRole('button', { name: 'Tax' })).toHaveCount(0);
    await expect(originalLayout.getByRole('button', { name: 'Print Seat 1 receipt' })).toBeVisible();
    await expect(originalLayout.getByRole('button', { name: 'Seat 1 status' })).toHaveAttribute('aria-pressed', 'true');
    await expect(originalLayout.locator('[data-testid="active-seat-detail"]')).toHaveCount(1);

    await originalLayout.getByRole('button', { name: 'Add seat' }).click();
    await expect(originalLayout.getByRole('button', { name: 'Seat 2 status' })).toHaveAttribute('aria-pressed', 'true');
    await expect(originalLayout.locator('[data-testid="active-seat-detail"]')).toHaveCount(1);
    await expect(originalLayout.locator('[data-testid="active-seat-detail"]').getByText('No items ordered yet')).toBeVisible();

    await originalLayout.getByRole('button', { name: 'Seat 1 status' }).click();
    await expect(originalLayout.getByRole('button', { name: 'Seat 1 status' })).toHaveAttribute('aria-pressed', 'true');
    await expect(originalLayout.locator('[data-testid="active-seat-detail"]').getByText('Payment Modal Test Item')).toBeVisible();

    const paymentSummaryBox = await originalLayout.getByText('Payment Summary', { exact: true }).boundingBox();
    const quickActionsBox = await originalLayout.getByText('Quick Actions', { exact: true }).boundingBox();
    const menuBox = await originalLayout.getByText('Menu', { exact: true }).boundingBox();
    expect(paymentSummaryBox).not.toBeNull();
    expect(quickActionsBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(paymentSummaryBox!.x).toBeLessThan(quickActionsBox!.x);
    expect(Math.abs(paymentSummaryBox!.y - quickActionsBox!.y)).toBeLessThanOrEqual(80);
    expect(menuBox!.y).toBeGreaterThan(quickActionsBox!.y);
    expect(Math.abs(menuBox!.x - quickActionsBox!.x)).toBeLessThanOrEqual(24);
    const activeSeatBox = await originalLayout.locator('[data-testid="active-seat-detail"]').boundingBox();
    expect(activeSeatBox).not.toBeNull();
    expect(activeSeatBox!.y).toBeLessThan(page.viewportSize()?.height ?? 720);

    await originalLayout.locator('.mc-menu-item').first().click();
    const addToSeatDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add to Seat' }) });
    await expect(addToSeatDialog.locator('.mc-dialog-frame')).toBeVisible();
    await expect(addToSeatDialog.getByRole('button', { name: 'Add to Seat 1' })).toBeVisible();
    const activeSeatMarker = originalLayout.locator('[data-testid="active-seat-detail"] .mc-seat-marker.mc-seat-tone-1');
    const addToSeatOneIndex = addToSeatDialog.locator('.mc-seat-choice-index.mc-seat-tone-1');
    const addToSeatTwoIndex = addToSeatDialog.locator('.mc-seat-choice-index.mc-seat-tone-2');
    await expect(activeSeatMarker).toBeVisible();
    await expect(activeSeatMarker).toHaveCSS('background-color', 'rgb(29, 224, 197)');
    await expect(addToSeatOneIndex).toHaveText('1');
    await expect(addToSeatOneIndex).toHaveCSS('background-color', 'rgb(29, 224, 197)');
    await expect(addToSeatTwoIndex).toHaveText('2');
    await expect(addToSeatTwoIndex).toHaveCSS('background-color', 'rgb(244, 122, 165)');
    const cancelButton = addToSeatDialog.getByRole('button', { name: 'Cancel' });
    const dialogBox = await addToSeatDialog.boundingBox();
    const cancelBox = await cancelButton.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(cancelBox!.x + cancelBox!.width / 2).toBeGreaterThan(dialogBox!.x + dialogBox!.width / 2);
    await addToSeatDialog.getByRole('button', { name: 'Close add to seat' }).click();
    await expect(page.getByRole('heading', { name: 'Add to Seat' })).toBeHidden();

    await originalLayout.locator('[data-testid="active-seat-detail"]').getByRole('button', { name: 'Move' }).click();
    const moveItemDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Move Item' }) });
    await expect(moveItemDialog.locator('.mc-dialog-frame')).toBeVisible();
    await expect(moveItemDialog.locator('.mc-subpanel').getByText('Payment Modal Test Item', { exact: true })).toBeVisible();
    await expect(moveItemDialog.getByRole('button', { name: 'Move to Seat 2' })).toBeVisible();
    await expect(moveItemDialog.locator('.mc-seat-choice-index.mc-seat-tone-2')).toHaveText('2');
    await expect(moveItemDialog.locator('.mc-seat-choice-index.mc-seat-tone-2')).toHaveCSS('background-color', 'rgb(244, 122, 165)');
    await moveItemDialog.getByRole('button', { name: 'Close move item' }).click();
    await expect(page.getByRole('heading', { name: 'Move Item' })).toBeHidden();

    await originalLayout.locator('[data-testid="active-seat-detail"]').getByRole('button', { name: 'Split' }).click();
    const splitItemDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Split Item Cost' }) });
    await expect(splitItemDialog.locator('.mc-dialog-frame')).toBeVisible();
    await expect(splitItemDialog.locator('.mc-subpanel').getByText('Payment Modal Test Item', { exact: true })).toBeVisible();
    await expect(splitItemDialog.getByRole('button', { name: 'Split to Seat 1' })).toBeVisible();
    await splitItemDialog.getByRole('button', { name: 'Split to Seat 1' }).click();
    await splitItemDialog.getByRole('button', { name: 'Split to Seat 2' }).click();
    await expect(splitItemDialog.locator('.mc-seat-choice-selected')).toHaveCount(2);
    await expect(splitItemDialog.locator('.mc-split-preview').getByText('$12.50')).toBeVisible();
    await expect(splitItemDialog.getByRole('button', { name: 'Split to 2 Seats' })).toBeEnabled();
    await splitItemDialog.getByRole('button', { name: 'Close split item' }).click();
    await expect(page.getByRole('heading', { name: 'Split Item Cost' })).toBeHidden();

    await originalLayout.getByRole('button', { name: 'Custom' }).first().click();
    const customItemDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Custom Item' }) });
    await expect(customItemDialog.locator('.mc-dialog-frame')).toBeVisible();
    await expect(customItemDialog.getByRole('button', { name: 'Add custom item to Seat 2' })).toBeDisabled();
    await customItemDialog.getByLabel('Item name').fill('Custom Modal Test Item');
    await customItemDialog.getByLabel('Price').fill('18.75');
    await expect(customItemDialog.locator('.mc-subpanel').getByText('Custom Modal Test Item', { exact: true })).toBeVisible();
    await expect(customItemDialog.locator('.mc-subpanel').getByText('$18.75')).toBeVisible();
    await expect(customItemDialog.getByRole('button', { name: 'Add custom item to Seat 2' })).toBeEnabled();
    await customItemDialog.getByRole('button', { name: 'Add custom item to Seat 2' }).click();
    await expect(page.getByRole('heading', { name: 'Add Custom Item' })).toBeHidden();
    await originalLayout.getByRole('button', { name: 'Seat 2 status' }).click();
    await expect(originalLayout.locator('[data-testid="active-seat-detail"]').getByText('Custom Modal Test Item')).toBeVisible();

    await originalLayout.getByRole('button', { name: 'Discount' }).first().click();
    const discountDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Discount' }) });
    await expect(discountDialog.locator('.mc-dialog-frame')).toBeVisible();
    await expect(discountDialog.getByRole('button', { name: 'Apply discount to Seat 2' })).toBeDisabled();
    await discountDialog.getByLabel('Discount name').fill('Modal Discount');
    await discountDialog.getByLabel('Amount').fill('5');
    await expect(discountDialog.getByRole('button', { name: '$ Flat' })).toHaveAttribute('aria-pressed', 'true');
    await expect(discountDialog.locator('.mc-subpanel').getByText('Modal Discount', { exact: true })).toBeVisible();
    await expect(discountDialog.locator('.mc-subpanel').getByText('-$5.00')).toBeVisible();
    await expect(discountDialog.getByRole('button', { name: 'Apply discount to Seat 2' })).toBeEnabled();
    await discountDialog.getByRole('button', { name: 'Apply discount to Seat 2' }).click();
    await expect(page.getByRole('heading', { name: 'Add Discount' })).toBeHidden();
    await expect(originalLayout.locator('[data-testid="active-seat-detail"]').getByText('Modal Discount')).toBeVisible();
  });

  test('hides edit menu actions for completed bookings', async ({ page }) => {
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

    const originalLayout = page.locator('.mc-original-layout');
    await expect(originalLayout.getByRole('button', { name: 'Reopen Booking' })).toBeVisible();
    await expect(originalLayout.getByText('Reopen booking to use edit commands.')).toBeVisible();
    await expect(originalLayout.getByRole('button', { name: 'Custom' })).toHaveCount(0);
    await expect(originalLayout.getByRole('button', { name: 'Discount' })).toHaveCount(0);
    await expect(originalLayout.getByRole('button', { name: 'Coupon' })).toHaveCount(0);
    await expect(originalLayout.getByRole('button', { name: 'Gift Card' })).toHaveCount(0);
  });

  test('opens the Mission Control collect payment modal', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);
    await addCustomOrder(page, bookingId);

    await page.goto(`/pos/booking/${bookingId}`);

    await page.getByRole('button', { name: /Collect Payment|Add Payment/ }).first().click();
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

    await page.getByRole('button', { name: /Collect Payment|Add Payment/ }).first().click();
    await page.getByRole('button', { name: /^Card$/ }).click();
    await page.getByRole('button', { name: /Pay \$.* by Card/ }).click();
    const originalLayout = page.locator('.mc-original-layout');
    await expect(originalLayout.getByText('PAID').first()).toBeVisible();

    const uploadReceipt = originalLayout.getByRole('button', { name: /Upload Receipt|View Receipt/ }).first();
    const cancelPayment = originalLayout.getByRole('button', { name: 'Cancel Payment' }).first();
    await expect(uploadReceipt).toBeVisible();
    await expect(cancelPayment).toBeVisible();

    const uploadBox = await uploadReceipt.boundingBox();
    const cancelBox = await cancelPayment.boundingBox();

    expect(uploadBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(Math.abs(uploadBox!.width - cancelBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(uploadBox!.height - cancelBox!.height)).toBeLessThanOrEqual(1);
  });
});
