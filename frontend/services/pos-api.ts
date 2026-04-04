/**
 * POS API Service
 * Direct REST API calls to backend (no IPC, no local database)
 */

const API_BASE = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';

// Logged once on module load
if (typeof window !== 'undefined') {
  console.log('[POS API] API_BASE:', API_BASE);
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ============= Bookings API =============

export interface Booking {
  id: string;
  roomId: string;
  roomName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  startTime: string; // ISO string
  endTime: string; // ISO string
  duration: number; // hours
  players: number;
  price: number;
  status: string; // BOOKED | COMPLETED | CANCELLED (uppercase)
  bookingStatus?: string; // BOOKED | COMPLETED | CANCELLED
  paymentStatus?: string; // UNPAID | BILLED | PAID
  source: string;
  bookingSource?: string; // ONLINE | WALK_IN | PHONE | QUICK_SALE
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    dateOfBirth: string;
  } | null;
}

export interface BookingFilters {
  startDate?: string; // ISO string for date range filtering
  endDate?: string; // ISO string for date range filtering
  roomId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listBookings(filters?: BookingFilters): Promise<Booking[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.roomId) params.append('roomId', filters.roomId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());

  const url = `${API_BASE}/api/bookings?${params.toString()}`;

  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Bookings error:', errorText);
    throw new Error(`Failed to fetch bookings: ${res.status} ${errorText}`);
  }
  
  const json = await res.json();
  return json.bookings || [];
}

export async function getBooking(id: string): Promise<Booking> {
  const res = await fetch(`${API_BASE}/api/bookings/${id}`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) throw new Error('Failed to fetch booking');
  
  const json = await res.json();
  const rawBooking = json.booking;
  
  // Transform backend data to frontend format
  const startTime = new Date(rawBooking.startTime);
  const endTime = new Date(rawBooking.endTime);
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
  
  // Extract date in browser's local timezone (browser set to Halifax)
  const year = startTime.getFullYear();
  const month = String(startTime.getMonth() + 1).padStart(2, '0');
  const day = String(startTime.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  
  return {
    ...rawBooking,
    date, // YYYY-MM-DD in browser timezone
    time: startTime.toTimeString().slice(0, 5), // HH:MM
    duration: duration,
    roomName: rawBooking.roomName || `Room ${rawBooking.roomId}`, // Fallback if not provided
  };
}

export async function createBooking(data: {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  roomId: string;
  startTimeMs: number; // milliseconds timestamp (timezone-agnostic)
  players: number;
  duration: number;
  bookingSource: 'WALK_IN' | 'PHONE' | 'ONLINE';
}): Promise<Booking> {
  const res = await fetch(`${API_BASE}/api/bookings/simple/create`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create booking');
  }
  
  const json = await res.json();
  return json.booking;
}

export async function createQuickSale(): Promise<Booking> {
  const res = await fetch(`${API_BASE}/api/bookings/simple/quick-sale`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to create quick sale' }));
    throw new Error(error.error || 'Failed to create quick sale');
  }

  const json = await res.json();
  return json.booking;
}

export async function updateBookingStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${id}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({ status })
  });

  if (!res.ok) throw new Error('Failed to update booking status');
}

export async function updateBookingPlayers(id: string, players: number): Promise<Booking> {
  const res = await fetch(`${API_BASE}/api/bookings/${id}/players`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({ players })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to update players' }));
    throw new Error(error.error || 'Failed to update players');
  }

  const json = await res.json();
  return json.booking;
}

export async function cancelBooking(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/${id}/cancel`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) throw new Error('Failed to cancel booking');
}

// ============= Rooms API =============

export interface Room {
  id: string;
  name: string;
  capacity: number;
  hourlyRate: number;
  status: string; // 'ACTIVE' | 'MAINTENANCE' | 'CLOSED'
  openMinutes?: number;
  closeMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export async function listRooms(): Promise<Room[]> {
  const url = `${API_BASE}/api/bookings/rooms`;

  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Rooms error:', errorText);
    throw new Error(`Failed to fetch rooms: ${res.status} ${errorText}`);
  }
  
  const json = await res.json();
  if (json.rooms && json.rooms.length > 0) {
    console.log('[POS API] Loaded', json.rooms.length, 'rooms');
  }
  return json.rooms || [];
}

export async function updateRoomStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/bookings/rooms/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({ status })
  });

  if (!res.ok) throw new Error('Failed to update room status');
}

// ============= Menu API =============

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listMenuItems(): Promise<MenuItem[]> {
  const res = await fetch(`${API_BASE}/api/menu/items`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) throw new Error('Failed to fetch menu items');
  
  const json = await res.json();
  return json.items || [];
}

export async function createMenuItem(data: {
  name: string;
  category: string;
  price: number;
  description?: string;
  available?: boolean;
}): Promise<MenuItem> {
  const res = await fetch(`${API_BASE}/api/menu/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Failed to create menu item');
  
  const json = await res.json();
  return json.item;
}

export async function updateMenuItem(id: string, data: Partial<MenuItem>): Promise<MenuItem> {
  const res = await fetch(`${API_BASE}/api/menu/items/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Failed to update menu item');
  
  const json = await res.json();
  return json.item;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/menu/items/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) throw new Error('Failed to delete menu item');
}

// ============= Settings API =============

export async function getGlobalTaxRate(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/settings/global_tax_rate`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) return 8; // default fallback
  
  const json = await res.json();
  // Backend returns { taxRate: number, key: string, updatedAt?: string }
  return json.taxRate || 8;
}

export async function updateGlobalTaxRate(rate: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/settings/global_tax_rate`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    // Backend expects { taxRate: number }
    body: JSON.stringify({ taxRate: rate })
  });

  if (!res.ok) throw new Error('Failed to update tax rate');
}

// ============= Invoice & Order APIs =============

export interface Order {
  id: string;
  bookingId: string;
  menuItemId: string | null;
  customItemName?: string | null;
  customItemPrice?: number | null;
  seatIndex: number | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  bookingId: string;
  seatIndex: number;
  subtotal: number;
  tax: number;
  tip: number | null;
  tipMethod: string | null;
  totalAmount: number;
  status: 'UNPAID' | 'PAID';
  paymentMethod: string | null;
  paidAt: string | null;
  orders?: Order[];
  payments?: { id: string; method: string; amount: number }[];
}

export interface PaymentStatus {
  seats: Array<{
    seatIndex: number;
    paid: boolean;
    totalAmount: number;
    paymentMethod: string | null;
    paidAt: string | null;
  }>;
  allPaid: boolean;
  remaining: number;
  totalRevenue: number;
}

/**
 * Get all invoices for a booking (includes orders for each seat)
 */
export async function getInvoices(bookingId: string): Promise<Invoice[]> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/invoices`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Get invoices error:', errorText);
    throw new Error(`Failed to fetch invoices: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json.invoices || [];
}

/**
 * Create a new order for a booking
 */
export async function createOrder(data: {
  bookingId: string;
  menuItemId?: string;
  customItemName?: string;
  customItemPrice?: number;
  seatIndex: number;
  quantity: number;
  discountType?: 'FLAT' | 'PERCENT';
}): Promise<{ order: Order; updatedInvoice?: Invoice }> {
  const body: any = {
    seatIndex: data.seatIndex,
    quantity: data.quantity,
  };
  
  // Add either menuItemId or custom item fields
  if (data.menuItemId) {
    body.menuItemId = data.menuItemId;
  } else {
    body.customItemName = data.customItemName;
    body.customItemPrice = data.customItemPrice;
  }

  // Add discount type if present
  if (data.discountType) {
    body.discountType = data.discountType;
  }
  
  const res = await fetch(`${API_BASE}/api/bookings/${data.bookingId}/orders`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to create order' }));
    throw new Error(error.error || 'Failed to create order');
  }

  const json = await res.json();
  return json;
}

/**
 * Update order quantity
 */
export async function updateOrder(orderId: string, quantity: number): Promise<{ order: Order; updatedInvoice?: Invoice }> {
  const res = await fetch(`${API_BASE}/api/bookings/orders/${orderId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({ quantity })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to update order' }));
    throw new Error(error.error || 'Failed to update order');
  }

  const json = await res.json();
  return json;
}

/**
 * Delete an order
 */
export async function deleteOrder(orderId: string): Promise<{ updatedInvoice?: Invoice }> {
  const res = await fetch(`${API_BASE}/api/bookings/orders/${orderId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to delete order' }));
    throw new Error(error.error || 'Failed to delete order');
  }

  const json = await res.json();
  return json;
}

/**
 * Mark an invoice as paid
 */
export async function payInvoice(data: {
  invoiceId: string;
  bookingId: string;
  seatIndex: number;
  paymentMethod: 'CARD' | 'CASH' | 'GIFT_CARD' | 'SPLIT';
  tip?: number;
  payments?: { method: 'CARD' | 'CASH' | 'GIFT_CARD'; amount: number }[];
}): Promise<{ invoice: Invoice; bookingPaymentStatus: string }> {
  const res = await fetch(`${API_BASE}/api/bookings/invoices/${data.invoiceId}/pay`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({
      bookingId: data.bookingId,
      seatIndex: data.seatIndex,
      paymentMethod: data.paymentMethod,
      tip: data.tip,
      payments: data.payments,
    })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to process payment' }));
    throw new Error(error.error || 'Failed to process payment');
  }

  const json = await res.json();
  return json;
}

/**
 * Add a single partial payment to an invoice (incremental collect)
 */
export async function addPayment(data: {
  invoiceId: string;
  bookingId: string;
  seatIndex: number;
  method: 'CARD' | 'CASH' | 'GIFT_CARD';
  amount: number;
  tip?: number;
  tipMethod?: 'CARD' | 'CASH';
}): Promise<{ invoice: Invoice; remaining: number; bookingPaymentStatus: string }> {
  const res = await fetch(`${API_BASE}/api/bookings/invoices/${data.invoiceId}/add-payment`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({
      bookingId: data.bookingId,
      seatIndex: data.seatIndex,
      method: data.method,
      amount: data.amount,
      tip: data.tip,
      tipMethod: data.tipMethod,
    })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to add payment' }));
    throw new Error(error.error || 'Failed to add payment');
  }

  const json = await res.json();
  return json;
}

/**
 * Cancel payment/refund an invoice
 */
export async function unpayInvoice(data: {
  invoiceId: string;
  bookingId: string;
}): Promise<{ invoice: Invoice; bookingPaymentStatus: string }> {
  const res = await fetch(`${API_BASE}/api/bookings/invoices/${data.invoiceId}/unpay`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({
      bookingId: data.bookingId,
    })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to cancel payment' }));
    throw new Error(error.error || 'Failed to cancel payment');
  }

  const json = await res.json();
  return json;
}

/**
 * Get payment status for a booking
 */
export async function getPaymentStatus(bookingId: string): Promise<PaymentStatus> {
  const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/payment-status`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Get payment status error:', errorText);
    throw new Error(`Failed to fetch payment status: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json;
}

// ============= Receipt API =============

export interface ReceiptData {
  receiptNumber: string;
  bookingId: string;
  customer: {
    name: string;
    phone: string;
    email?: string | null;
  };
  business: {
    name: string;
    address: string;
    phone: string;
    taxId?: string;
  };
  booking: {
    date: string;
    startTime: string;
    endTime: string;
    duration: number;
    room: {
      name: string;
      rate: number;
    };
    players: number;
  };
  items: {
    roomCharge: {
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    };
    seats: Array<{
      seatIndex: number;
      orders: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
      discounts: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
      preDiscountSubtotal: number;
      subtotal: number;
    }>;
  };
  totals: {
    subtotal: string;
    tax: string;
    tip: string;
    grandTotal: string;
    taxRate: number;
  };
  payment: {
    method?: string | null;
    status: string;
    paidAt?: Date | null;
  };
  metadata: {
    generatedAt: Date;
    generatedBy?: string | null;
  };
}

/**
 * Get full receipt for a booking
 */
export async function getReceipt(bookingId: string): Promise<ReceiptData> {
  const res = await fetch(`${API_BASE}/api/receipts/${bookingId}`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Get receipt error:', errorText);
    throw new Error(`Failed to fetch receipt: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json.receipt;
}

/**
 * Get receipt for a specific seat
 */
export async function getSeatReceipt(bookingId: string, seatIndex: number): Promise<ReceiptData> {
  const res = await fetch(`${API_BASE}/api/receipts/${bookingId}/seat/${seatIndex}`, {
    credentials: 'include',
    headers: { 'x-pos-admin-key': 'pos-dev-key-change-in-production' }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Get seat receipt error:', errorText);
    throw new Error(`Failed to fetch seat receipt: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json.receipt;
}

/**
 * Send receipt via email
 */
export async function sendReceiptEmail(
  bookingId: string,
  email: string,
  seatIndex?: number
): Promise<{ success: boolean; receiptNumber: string }> {
  const res = await fetch(`${API_BASE}/api/receipts/${bookingId}/email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-pos-admin-key': 'pos-dev-key-change-in-production'
    },
    body: JSON.stringify({ email, seatIndex })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[POS API] Send receipt email error:', errorText);
    throw new Error(`Failed to send receipt email: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json;
}

// ============= Employee & Time Entry API =============

export interface Employee {
  id: string;
  name: string;
  pin: string | null;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  employee: { id: string; name: string };
  clockIn: string;
  clockOut: string | null;
  createdAt: string;
}

export interface ClockInResponse {
  message: string;
  employeeName: string;
  clockIn: string;
  entryId: string;
}

export interface ClockOutResponse {
  message: string;
  employeeName: string;
  clockIn: string;
  clockOut: string;
  duration: { hours: number; minutes: number };
}

export interface ClockStatusResponse {
  employeeName: string;
  isClockedIn: boolean;
  clockIn: string | null;
}

// ── Kiosk (no auth needed) ──

export async function clockIn(pin: string): Promise<ClockInResponse> {
  const res = await fetch(`${API_BASE}/api/time-entries/clock-in`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Clock-in failed');
  return json;
}

export async function clockOut(pin: string): Promise<ClockOutResponse> {
  const res = await fetch(`${API_BASE}/api/time-entries/clock-out`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Clock-out failed');
  return json;
}

export async function checkClockStatus(pin: string): Promise<ClockStatusResponse> {
  const res = await fetch(`${API_BASE}/api/time-entries/status`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Status check failed');
  return json;
}

// ── Admin endpoints ──

export async function listEmployees(activeOnly = false): Promise<Employee[]> {
  const params = activeOnly ? '?active=true' : '';
  const res = await fetch(`${API_BASE}/api/employees${params}`, {
    credentials: 'include',
  });

  if (!res.ok) throw new Error('Failed to fetch employees');
  const json = await res.json();
  return json.employees;
}

export async function createEmployee(name: string, pin: string): Promise<Employee> {
  const res = await fetch(`${API_BASE}/api/employees`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create employee');
  return json.employee;
}

export async function updateEmployee(id: string, data: { name?: string; pin?: string; active?: boolean }): Promise<Employee> {
  const res = await fetch(`${API_BASE}/api/employees/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update employee');
  return json.employee;
}

export async function deleteEmployee(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/employees/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.error || 'Failed to deactivate employee');
  }
}

export async function listTimeEntries(filters?: { startDate?: string; endDate?: string; employeeId?: string }): Promise<TimeEntry[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.employeeId) params.append('employeeId', filters.employeeId);

  const res = await fetch(`${API_BASE}/api/time-entries?${params.toString()}`, {
    credentials: 'include',
  });

  if (!res.ok) throw new Error('Failed to fetch time entries');
  const json = await res.json();
  return json.entries;
}

export async function listActiveTimeEntries(): Promise<TimeEntry[]> {
  const res = await fetch(`${API_BASE}/api/time-entries/active`, {
    credentials: 'include',
  });

  if (!res.ok) throw new Error('Failed to fetch active entries');
  const json = await res.json();
  return json.entries;
}

export async function updateTimeEntry(id: string, data: { clockIn?: string; clockOut?: string | null }): Promise<TimeEntry> {
  const res = await fetch(`${API_BASE}/api/time-entries/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update time entry');
  return json.entry;
}

// ============= Employee Hours Report API =============

export interface ShiftSummary {
  date: string;
  clockIn: string;
  clockOut: string | null;
  minutes: number;
  isOpen: boolean;
  autoClockOut?: boolean;
}

export interface EmployeeHoursSummary {
  employeeId: string;
  employeeName: string;
  totalMinutes: number;
  shiftCount: number;
  avgShiftMinutes: number;
  longestShiftMinutes: number;
  daysWorked: number;
  shifts: ShiftSummary[];
}

export async function getEmployeeHours(params: {
  startDate: string;
  endDate: string;
  employeeId?: string;
}): Promise<{ summaries: EmployeeHoursSummary[]; startDate: string; endDate: string }> {
  const query = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate });
  if (params.employeeId) query.set('employeeId', params.employeeId);

  const res = await fetch(`${API_BASE}/api/reports/employee-hours?${query.toString()}`, {
    credentials: 'include',
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load employee hours');
  return json;
}

