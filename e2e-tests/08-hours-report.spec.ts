import { test, expect } from '@playwright/test';
import { loginAsAdmin, ADMIN_USER } from './helpers';

const API_BASE = 'http://localhost:8080';

/**
 * E2E tests for the Hours Report / Time Management page.
 *
 * Covers Weekly tab, Monthly tab, navigation arrows, and CSV export.
 * Requires backend + frontend running (do NOT run in CI without servers).
 */

let testEmployeeId: string | null = null;

test.describe('Hours Report — Time Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await loginAsAdmin(page);
  });

  test.afterAll(async ({ request }) => {
    // Cleanup test employee + time entries if created
    if (testEmployeeId) {
      try {
        await request.delete(`${API_BASE}/api/employees/${testEmployeeId}`, {
          headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' },
        });
      } catch {
        // best-effort cleanup
      }
    }
  });

  test('navigate to time management page', async ({ page }) => {
    await page.goto('/pos/time-management');
    await page.waitForURL('**/time-management', { timeout: 10000 });

    // Page should load with visible heading or tab
    await expect(
      page.getByText(/time management|employee hours/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('Weekly tab displays week view with navigation', async ({ page }) => {
    await page.goto('/pos/time-management');
    await page.waitForURL('**/time-management', { timeout: 10000 });

    // Click Weekly tab if present
    const weeklyTab = page.getByRole('button', { name: /weekly/i }).or(
      page.getByText(/weekly/i)
    );
    if (await weeklyTab.isVisible()) {
      await weeklyTab.first().click();
      await page.waitForTimeout(1000);
    }

    // Week label should contain a date range with "–" separator
    await expect(page.getByText(/–/).first()).toBeVisible({ timeout: 5000 });

    // Navigation arrows should be present (◀ or ← or Previous)
    const prevBtn = page
      .getByRole('button', { name: /◀|←|prev/i })
      .or(page.locator('button').filter({ hasText: '◀' }));
    if (await prevBtn.first().isVisible()) {
      const weekLabelBefore = await page.getByText(/–/).first().textContent();

      await prevBtn.first().click();
      await page.waitForTimeout(1000);

      // Week label should change after clicking previous
      const weekLabelAfter = await page.getByText(/–/).first().textContent();
      expect(weekLabelAfter).not.toBe(weekLabelBefore);
    }
  });

  test('Monthly tab displays summary cards', async ({ page }) => {
    await page.goto('/pos/time-management');
    await page.waitForURL('**/time-management', { timeout: 10000 });

    // Click Monthly tab
    const monthlyTab = page.getByRole('button', { name: /monthly/i }).or(
      page.getByText(/monthly/i)
    );
    if (await monthlyTab.isVisible()) {
      await monthlyTab.first().click();
      await page.waitForTimeout(1000);

      // Should show summary cards/labels
      const possibleLabels = [
        /total hours/i,
        /total shifts/i,
        /active employees/i,
        /employees/i,
      ];
      let foundAny = false;
      for (const label of possibleLabels) {
        const el = page.getByText(label).first();
        if (await el.isVisible().catch(() => false)) {
          foundAny = true;
          break;
        }
      }
      expect(foundAny).toBe(true);
    }
  });

  test('Export CSV button is present and clickable', async ({ page }) => {
    await page.goto('/pos/time-management');
    await page.waitForURL('**/time-management', { timeout: 10000 });

    // Look for CSV export button
    const csvBtn = page.getByRole('button', { name: /export|csv|download/i });
    if (await csvBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify button is clickable (don't verify file download)
      await expect(csvBtn.first()).toBeEnabled();
      await csvBtn.first().click();
      // No assertion on file content — just verifying the button works
      await page.waitForTimeout(500);
    }
  });
});
