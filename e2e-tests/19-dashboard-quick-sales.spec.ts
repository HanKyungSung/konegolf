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
          id: 'mission-control-e2e-staff',
          name: 'Mission Control E2E Staff',
          email: 'staff@konegolf.ca',
          role: 'STAFF',
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

test.describe('Mission Control dashboard quick sales', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await proxyBackendApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('kgolf-ui-theme', 'mission-control');
    });
  });

  test('shows quick sales to staff in a dedicated dashboard list', async ({ page }) => {
    const bookingId = await createQuickSaleBooking(page);

    await page.goto('/pos/dashboard');

    const quickSalesPanel = page.locator('section[aria-labelledby="dashboard-quick-sales-heading"]');
    await expect(quickSalesPanel.getByText('Quick Sales', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(quickSalesPanel.getByText(/\d+ open/)).toBeVisible();

    const attentionPanel = page.getByLabel('Attention panel');
    await expect(attentionPanel).toBeVisible();
    const quickSalesBox = await quickSalesPanel.boundingBox();
    const attentionBox = await attentionPanel.boundingBox();
    expect(quickSalesBox).not.toBeNull();
    expect(attentionBox).not.toBeNull();
    expect(Math.abs((quickSalesBox?.height ?? 0) - (attentionBox?.height ?? 0) * (2 / 3))).toBeLessThanOrEqual(3);

    const quickSaleRow = quickSalesPanel.locator(`button[aria-label="Open quick sale ${bookingId}"]`);
    await expect(quickSaleRow).toBeVisible({ timeout: 10000 });
    await expect(quickSaleRow).toContainText('Quick Sale');

    await quickSaleRow.click();
    await expect(page).toHaveURL(new RegExp(`/pos/booking/${bookingId}$`));
  });
});
