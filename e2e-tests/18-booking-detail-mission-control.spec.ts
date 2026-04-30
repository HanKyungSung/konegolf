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
    await expect(page.getByText('Settlement', { exact: true })).toBeVisible();
    await expect(page.getByText('Command Stack')).toBeVisible();
    await expect(page.getByText('Attention', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tax' })).toHaveCount(0);

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
});
