import { Page, expect } from '@playwright/test';

/**
 * Shared test helpers and constants for E2E tests
 */

// Backend API base URL
const API_BASE = 'http://localhost:8080';

// Test credentials (from seed.ts)
export const ADMIN_USER = {
  email: 'admin@konegolf.ca',
  password: 'admin123',
  name: 'Admin User',
  phone: '+11111111111',
};

export const TEST_USER = {
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  phone: '+14165552000',
};

export const SALES_USER = {
  email: 'sales@konegolf.ca',
  password: 'salesaccount123',
  name: 'Sales',
  phone: '+19025551001',
};

export const STAFF_USER = {
  email: 'staff@konegolf.ca',
  password: 'staffaccount123',
  name: 'Staff',
  phone: '+19025551002',
};

// Known menu items (from seed.ts)
export const MENU_ITEMS = {
  HOUR_1: { name: '1 Hour', price: 35.00, category: 'Hours' },
  HOUR_2: { name: '2 Hours', price: 70.00, category: 'Hours' },
  CLUB_SANDWICH: { name: 'Club Sandwich', price: 12.99, category: 'Food' },
  KOREAN_FRIED_CHICKEN: { name: 'Korean Fried Chicken', price: 15.99, category: 'Food' },
  BEER: { name: 'Beer', price: 6.99, category: 'Drinks' },
  SOFT_DRINKS: { name: 'Soft Drinks', price: 2.99, category: 'Drinks' },
  FRENCH_FRIES: { name: 'French Fries', price: 5.99, category: 'Appetizers' },
  ICE_CREAM: { name: 'Ice Cream', price: 5.99, category: 'Desserts' },
};

/**
 * Login as admin user and navigate to POS dashboard
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(ADMIN_USER.email);
  await page.locator('#password').fill(ADMIN_USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // After login, admin should land on /dashboard which renders POSDashboard
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  
  // Wait for the POS dashboard to render (has "Create Booking" button)
  await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 10000 });
}

/**
 * Login as regular test user
 */
export async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(TEST_USER.email);
  await page.locator('#password').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

/**
 * Login as sales user (read-only access to POS)
 */
export async function loginAsSales(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(SALES_USER.email);
  await page.locator('#password').fill(SALES_USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

/**
 * Login as staff user
 */
export async function loginAsStaff(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(STAFF_USER.email);
  await page.locator('#password').fill(STAFF_USER.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Create Booking' })).toBeVisible({ timeout: 10000 });
}

/**
 * Create a walk-in booking via the POS modal.
 * Assumes already on POS dashboard.
 * Returns the booking's room name for later reference.
 */
export async function createWalkInBooking(page: Page, options?: {
  customerPhone?: string;
  customerName?: string;
  room?: string;
  hours?: number;
  players?: number;
}) {
  const phone = options?.customerPhone || '9025551234';
  const name = options?.customerName || 'E2E Test Customer';
  const room = options?.room || 'Room 1';
  const hours = options?.hours || 1;
  const players = options?.players || 1;

  // Click Create Booking
  await page.getByRole('button', { name: 'Create Booking' }).click();

  // Wait for booking modal
  await expect(page.getByText('Customer Information')).toBeVisible({ timeout: 5000 });

  // Walk-in is default, fill phone using pressSequentially for proper input handling
  const phoneInput = page.getByTestId('customer-phone');
  await phoneInput.click();
  await phoneInput.pressSequentially(phone, { delay: 50 });

  // Wait for auto-search to complete (500ms debounce + API call)
  await page.waitForTimeout(2000);

  // Fill name (may need to clear if auto-filled from lookup)
  const nameInput = page.getByTestId('customer-name');
  await nameInput.clear();
  await nameInput.fill(name);

  // Click Continue
  const continueBtn = page.getByTestId('continue-btn');
  await expect(continueBtn).toBeEnabled({ timeout: 5000 });
  await continueBtn.click();

  // Step 2: Booking Details
  await expect(page.getByText('Booking Details')).toBeVisible({ timeout: 5000 });

  // Select room — the <select> uses room.id as value, but we need to match by label
  const roomSelect = page.getByTestId('booking-room');
  await roomSelect.selectOption({ label: room });

  // Select time via TimePicker custom component:
  // 1. Click the time picker button to open the dropdown
  const timePickerBtn = page.getByTestId('booking-time');
  await timePickerBtn.click();
  await page.waitForTimeout(500);

  // 2. Just click "Apply" to accept the default time (10:00 AM)
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(500);

  // Set duration
  const hoursInput = page.getByTestId('booking-hours');
  await hoursInput.clear();
  await hoursInput.fill(String(hours));

  // Set players
  const playersInput = page.getByTestId('booking-players');
  await playersInput.clear();
  await playersInput.fill(String(players));

  // Click Create Booking
  const createBtn = page.getByTestId('create-booking-btn');
  await expect(createBtn).toBeEnabled({ timeout: 5000 });
  await createBtn.click();

  // Wait for the modal to close and dashboard to refresh
  await page.waitForTimeout(3000);

  return { room, phone, name };
}

/**
 * Create a booking via API and navigate to its detail page.
 * This is more reliable for tests that need booking detail access,
 * since the "Manage" button only appears for currently-active bookings.
 * 
 * Returns the booking ID.
 */
export async function createBookingViaAPI(page: Page): Promise<string> {
  // Create booking using Quick Sale API (creates a minimal booking with no room conflict)
  const response = await page.request.post(`${API_BASE}/api/bookings/simple/quick-sale`, {
    headers: {
      'x-pos-admin-key': 'pos-dev-key-change-in-production',
    },
  });

  const data = await response.json();
  const bookingId = data.booking?.id || data.id;
  
  if (!bookingId) {
    throw new Error(`Failed to create booking via API: ${JSON.stringify(data)}`);
  }

  return bookingId;
}

/**
 * Navigate to a booking detail page directly.
 * Waits for the page to load with seat and menu elements.
 */
export async function openBookingDetail(page: Page, bookingId: string) {
  await page.goto(`/pos/booking/${bookingId}`);
  
  // Wait for booking detail to load — should show seats
  // Use .first() since "Seat 1" text may appear in multiple elements (accordion trigger + label)
  await expect(page.getByText('Seat 1').first()).toBeVisible({ timeout: 10000 });
}

/**
 * Create a booking via API and navigate to its detail page.
 * Combines createBookingViaAPI and openBookingDetail.
 */
export async function createAndOpenBooking(page: Page): Promise<string> {
  const bookingId = await createBookingViaAPI(page);
  await openBookingDetail(page, bookingId);
  return bookingId;
}

/**
 * Format price for display matching (e.g., 12.99 → "$12.99")
 */
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}
