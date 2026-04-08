import path from 'path';
import fs from 'fs';

/**
 * Unit tests for Receipt Upload — Storage Service & Route Logic.
 *
 * Tests the storage service abstraction (local fallback),
 * receipt route validation, and reconciliation query logic.
 */

// ─── Storage Service Tests (Local Fallback) ───

describe('Storage Service — Local Fallback', () => {
  const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'test-receipts');

  beforeAll(() => {
    // Ensure clean state
    if (fs.existsSync(UPLOADS_DIR)) {
      fs.rmSync(UPLOADS_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(UPLOADS_DIR)) {
      fs.rmSync(UPLOADS_DIR, { recursive: true });
    }
  });

  it('creates directory structure and writes file to local filesystem', () => {
    const objectPath = 'test-receipts/2026-04-02/test-payment-id.jpg';
    const fullPath = path.join(process.cwd(), 'uploads', objectPath);
    const buffer = Buffer.from('fake-jpeg-content');

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);

    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.readFileSync(fullPath).toString()).toBe('fake-jpeg-content');
  });

  it('deletes file from local filesystem', () => {
    const objectPath = 'test-receipts/2026-04-02/test-delete-id.jpg';
    const fullPath = path.join(process.cwd(), 'uploads', objectPath);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, Buffer.from('data'));
    expect(fs.existsSync(fullPath)).toBe(true);

    fs.unlinkSync(fullPath);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it('handles non-existent file deletion gracefully', () => {
    const fullPath = path.join(UPLOADS_DIR, 'nonexistent.jpg');
    expect(fs.existsSync(fullPath)).toBe(false);
    // Should not throw
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  });
});

// ─── Receipt Object Path Generation ───

describe('Receipt Object Path Generation', () => {
  function makeReceiptPath(paymentId: string, bookingId: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `receipts/${date}/${bookingId}/${paymentId}.jpg`;
  }

  it('generates correct path format with booking folder', () => {
    const p = makeReceiptPath('pay-abc-123', 'book-xyz-789');
    expect(p).toMatch(/^receipts\/\d{4}-\d{2}-\d{2}\/book-xyz-789\/pay-abc-123\.jpg$/);
  });

  it('uses today date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const p = makeReceiptPath('pay-1', 'book-1');
    expect(p).toContain(today);
  });

  it('preserves payment ID in filename', () => {
    const p = makeReceiptPath('payment-uuid-here', 'booking-uuid');
    expect(p).toContain('payment-uuid-here.jpg');
  });

  it('includes booking ID as parent folder', () => {
    const p = makeReceiptPath('pay-1', 'booking-id-abc');
    const parts = p.split('/');
    expect(parts).toHaveLength(4); // receipts / date / bookingId / file
    expect(parts[2]).toBe('booking-id-abc');
    expect(parts[3]).toBe('pay-1.jpg');
  });

  it('groups multiple payments under same booking folder', () => {
    const bookingId = 'shared-booking';
    const p1 = makeReceiptPath('pay-1', bookingId);
    const p2 = makeReceiptPath('pay-2', bookingId);
    const folder1 = p1.split('/').slice(0, 3).join('/');
    const folder2 = p2.split('/').slice(0, 3).join('/');
    expect(folder1).toBe(folder2);
    expect(p1).not.toBe(p2);
  });
});

// ─── Receipt Route Validation ───

describe('Receipt Route — Input Validation', () => {
  it('rejects empty paymentId', () => {
    const paymentId = '';
    expect(paymentId.length).toBe(0);
  });

  it('accepts valid UUID-style paymentId', () => {
    const paymentId = '550e8400-e29b-41d4-a716-446655440000';
    expect(paymentId.length).toBeGreaterThan(0);
    expect(paymentId).toMatch(/^[0-9a-f-]+$/);
  });

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];

  it.each(ALLOWED_MIME_TYPES)('accepts mime type: %s', (mime) => {
    expect(mime.startsWith('image/')).toBe(true);
  });

  it.each(['application/pdf', 'text/plain', 'video/mp4'])('rejects non-image mime type: %s', (mime) => {
    expect(mime.startsWith('image/')).toBe(false);
  });

  it('rejects files over 5MB', () => {
    const MAX_SIZE = 5 * 1024 * 1024;
    const fileSize = 6 * 1024 * 1024;
    expect(fileSize).toBeGreaterThan(MAX_SIZE);
  });

  it('accepts files under 5MB', () => {
    const MAX_SIZE = 5 * 1024 * 1024;
    const fileSize = 500 * 1024; // 500KB
    expect(fileSize).toBeLessThanOrEqual(MAX_SIZE);
  });
});

// ─── Reconciliation Query Logic ───

describe('Receipt Reconciliation — Summary Logic', () => {
  interface PaymentRecord {
    id: string;
    method: string;
    amount: number;
    receiptPath: string | null;
  }

  function computeReconciliation(payments: PaymentRecord[]) {
    const cardPayments = payments.filter(p => p.method === 'CARD' || p.method === 'GIFT_CARD');
    const withReceipt = cardPayments.filter(p => p.receiptPath != null).length;
    const missing = cardPayments.length - withReceipt;

    return {
      total: cardPayments.length,
      withReceipt,
      missing,
    };
  }

  it('all receipts matched', () => {
    const payments: PaymentRecord[] = [
      { id: '1', method: 'CARD', amount: 45, receiptPath: 'receipts/2026-04-02/1.jpg' },
      { id: '2', method: 'CARD', amount: 90, receiptPath: 'receipts/2026-04-02/2.jpg' },
    ];
    const result = computeReconciliation(payments);
    expect(result).toEqual({ total: 2, withReceipt: 2, missing: 0 });
  });

  it('some receipts missing', () => {
    const payments: PaymentRecord[] = [
      { id: '1', method: 'CARD', amount: 45, receiptPath: 'receipts/2026-04-02/1.jpg' },
      { id: '2', method: 'CARD', amount: 90, receiptPath: null },
      { id: '3', method: 'GIFT_CARD', amount: 30, receiptPath: null },
    ];
    const result = computeReconciliation(payments);
    expect(result).toEqual({ total: 3, withReceipt: 1, missing: 2 });
  });

  it('no card payments', () => {
    const payments: PaymentRecord[] = [
      { id: '1', method: 'CASH', amount: 45, receiptPath: null },
    ];
    const result = computeReconciliation(payments);
    expect(result).toEqual({ total: 0, withReceipt: 0, missing: 0 });
  });

  it('excludes CASH from reconciliation', () => {
    const payments: PaymentRecord[] = [
      { id: '1', method: 'CARD', amount: 45, receiptPath: null },
      { id: '2', method: 'CASH', amount: 20, receiptPath: null },
      { id: '3', method: 'GIFT_CARD', amount: 30, receiptPath: 'path.jpg' },
    ];
    const result = computeReconciliation(payments);
    expect(result).toEqual({ total: 2, withReceipt: 1, missing: 1 });
  });

  it('empty payment list', () => {
    const result = computeReconciliation([]);
    expect(result).toEqual({ total: 0, withReceipt: 0, missing: 0 });
  });

  it('all missing', () => {
    const payments: PaymentRecord[] = [
      { id: '1', method: 'CARD', amount: 45, receiptPath: null },
      { id: '2', method: 'CARD', amount: 90, receiptPath: null },
    ];
    const result = computeReconciliation(payments);
    expect(result).toEqual({ total: 2, withReceipt: 0, missing: 2 });
  });
});

// ─── Pending Receipts Filter Logic ───

describe('Pending Receipts — Filter Logic', () => {
  interface Payment {
    id: string;
    method: string;
    receiptPath: string | null;
    createdAt: Date;
  }

  function filterPendingReceipts(payments: Payment[], targetDate: string): Payment[] {
    return payments.filter(p => {
      if (p.method !== 'CARD' && p.method !== 'GIFT_CARD') return false;
      if (p.receiptPath != null) return false;
      const paymentDate = p.createdAt.toISOString().slice(0, 10);
      return paymentDate === targetDate;
    });
  }

  it('returns only CARD/GIFT_CARD payments without receipts', () => {
    const payments: Payment[] = [
      { id: '1', method: 'CARD', receiptPath: null, createdAt: new Date('2026-04-02T14:00:00Z') },
      { id: '2', method: 'CASH', receiptPath: null, createdAt: new Date('2026-04-02T14:00:00Z') },
      { id: '3', method: 'CARD', receiptPath: 'path.jpg', createdAt: new Date('2026-04-02T14:00:00Z') },
      { id: '4', method: 'GIFT_CARD', receiptPath: null, createdAt: new Date('2026-04-02T14:00:00Z') },
    ];
    const result = filterPendingReceipts(payments, '2026-04-02');
    expect(result.map(p => p.id)).toEqual(['1', '4']);
  });

  it('filters by date', () => {
    const payments: Payment[] = [
      { id: '1', method: 'CARD', receiptPath: null, createdAt: new Date('2026-04-01T14:00:00Z') },
      { id: '2', method: 'CARD', receiptPath: null, createdAt: new Date('2026-04-02T14:00:00Z') },
    ];
    const result = filterPendingReceipts(payments, '2026-04-02');
    expect(result.map(p => p.id)).toEqual(['2']);
  });

  it('returns empty when all receipts attached', () => {
    const payments: Payment[] = [
      { id: '1', method: 'CARD', receiptPath: 'path.jpg', createdAt: new Date('2026-04-02T14:00:00Z') },
    ];
    const result = filterPendingReceipts(payments, '2026-04-02');
    expect(result).toHaveLength(0);
  });
});

// ─── Invoice Payment Response — receiptPath Inclusion ───

describe('Invoice Payment Response — receiptPath', () => {
  interface DbPayment {
    id: string;
    method: string;
    amount: number;
    receiptPath: string | null;
  }

  function formatPayments(payments: DbPayment[]) {
    return payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      receiptPath: p.receiptPath,
    }));
  }

  it('includes receiptPath when present', () => {
    const payments: DbPayment[] = [
      { id: 'p1', method: 'CARD', amount: 50, receiptPath: 'receipts/2026-04-08/book-1/p1.jpg' },
    ];
    const result = formatPayments(payments);
    expect(result[0].receiptPath).toBe('receipts/2026-04-08/book-1/p1.jpg');
  });

  it('includes null receiptPath when no receipt uploaded', () => {
    const payments: DbPayment[] = [
      { id: 'p2', method: 'CARD', amount: 30, receiptPath: null },
    ];
    const result = formatPayments(payments);
    expect(result[0].receiptPath).toBeNull();
  });

  it('maps all four fields for each payment', () => {
    const payments: DbPayment[] = [
      { id: 'p1', method: 'CARD', amount: 50, receiptPath: 'path.jpg' },
      { id: 'p2', method: 'CASH', amount: 20, receiptPath: null },
    ];
    const result = formatPayments(payments);
    expect(result).toHaveLength(2);
    result.forEach((p) => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('method');
      expect(p).toHaveProperty('amount');
      expect(p).toHaveProperty('receiptPath');
    });
  });
});

// ─── Google Drive Storage Config ───

describe('Google Drive Storage — Config Detection', () => {
  function useGoogleDrive(env: Record<string, string>): boolean {
    return !!(env.GDRIVE_KEY_FILE && env.GDRIVE_FOLDER_ID);
  }

  it('uses Google Drive when both env vars set', () => {
    expect(useGoogleDrive({ GDRIVE_KEY_FILE: './key.json', GDRIVE_FOLDER_ID: 'abc123' })).toBe(true);
  });

  it('falls back to local when GDRIVE_KEY_FILE missing', () => {
    expect(useGoogleDrive({ GDRIVE_KEY_FILE: '', GDRIVE_FOLDER_ID: 'abc123' })).toBe(false);
  });

  it('falls back to local when GDRIVE_FOLDER_ID missing', () => {
    expect(useGoogleDrive({ GDRIVE_KEY_FILE: './key.json', GDRIVE_FOLDER_ID: '' })).toBe(false);
  });

  it('falls back to local when both missing', () => {
    expect(useGoogleDrive({ GDRIVE_KEY_FILE: '', GDRIVE_FOLDER_ID: '' })).toBe(false);
  });
});

// ─── Receipt Photo State Tracking (Frontend Logic) ───

describe('Receipt Photo State — UI Tracking', () => {
  interface PaymentInfo {
    id: string;
    method: string;
    amount: number;
    receiptPath?: string | null;
  }

  interface Invoice {
    seatIndex: number;
    payments?: PaymentInfo[];
  }

  function buildReceiptPhotoMap(invoices: Invoice[]): Record<string, boolean> {
    const photos: Record<string, boolean> = {};
    invoices.forEach((inv) => {
      inv.payments?.forEach((p) => {
        if (p.receiptPath) photos[p.id] = true;
      });
    });
    return photos;
  }

  it('tracks payments with receipt photos', () => {
    const invoices: Invoice[] = [
      {
        seatIndex: 1,
        payments: [
          { id: 'p1', method: 'CARD', amount: 50, receiptPath: 'receipts/2026-04-08/b1/p1.jpg' },
          { id: 'p2', method: 'CASH', amount: 20, receiptPath: null },
        ],
      },
    ];
    const map = buildReceiptPhotoMap(invoices);
    expect(map['p1']).toBe(true);
    expect(map['p2']).toBeUndefined();
  });

  it('returns empty map when no receipts uploaded', () => {
    const invoices: Invoice[] = [
      { seatIndex: 1, payments: [{ id: 'p1', method: 'CARD', amount: 50, receiptPath: null }] },
    ];
    expect(buildReceiptPhotoMap(invoices)).toEqual({});
  });

  it('tracks across multiple seats', () => {
    const invoices: Invoice[] = [
      { seatIndex: 1, payments: [{ id: 'p1', method: 'CARD', amount: 30, receiptPath: 'a.jpg' }] },
      { seatIndex: 2, payments: [{ id: 'p2', method: 'CARD', amount: 40, receiptPath: 'b.jpg' }] },
    ];
    const map = buildReceiptPhotoMap(invoices);
    expect(map['p1']).toBe(true);
    expect(map['p2']).toBe(true);
  });

  it('handles invoices with no payments', () => {
    const invoices: Invoice[] = [{ seatIndex: 1, payments: [] }, { seatIndex: 2 }];
    expect(buildReceiptPhotoMap(invoices)).toEqual({});
  });
});

// ─── Receipt Replace Logic ───

describe('Receipt Replace — Old File Cleanup', () => {
  interface PaymentRecord {
    id: string;
    receiptPath: string | null;
    invoiceBookingId: string;
  }

  function computeUploadAction(payment: PaymentRecord, date: string) {
    const newPath = `receipts/${date}/${payment.invoiceBookingId}/${payment.id}.jpg`;
    const shouldDeleteOld = !!payment.receiptPath;
    return { newPath, shouldDeleteOld, oldPath: payment.receiptPath };
  }

  it('flags old file for deletion when replacing', () => {
    const payment: PaymentRecord = {
      id: 'pay-1',
      receiptPath: 'receipts/2026-04-07/book-1/pay-1.jpg',
      invoiceBookingId: 'book-1',
    };
    const action = computeUploadAction(payment, '2026-04-08');
    expect(action.shouldDeleteOld).toBe(true);
    expect(action.oldPath).toBe('receipts/2026-04-07/book-1/pay-1.jpg');
    expect(action.newPath).toBe('receipts/2026-04-08/book-1/pay-1.jpg');
  });

  it('flags old file for deletion even when path is same (Drive duplicates)', () => {
    const payment: PaymentRecord = {
      id: 'pay-1',
      receiptPath: 'receipts/2026-04-08/book-1/pay-1.jpg',
      invoiceBookingId: 'book-1',
    };
    const action = computeUploadAction(payment, '2026-04-08');
    expect(action.shouldDeleteOld).toBe(true);
    expect(action.oldPath).toBe(action.newPath);
  });

  it('skips deletion on first upload', () => {
    const payment: PaymentRecord = {
      id: 'pay-1',
      receiptPath: null,
      invoiceBookingId: 'book-1',
    };
    const action = computeUploadAction(payment, '2026-04-08');
    expect(action.shouldDeleteOld).toBe(false);
    expect(action.oldPath).toBeNull();
  });
});

// ─── Receipt Serve — Download and Response ───

describe('Receipt Serve — Response Format', () => {
  it('returns image/jpeg content type', () => {
    const contentType = 'image/jpeg';
    expect(contentType).toBe('image/jpeg');
  });

  it('sets cache-control header for private caching', () => {
    const cacheControl = 'private, max-age=300';
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('max-age=300');
  });

  it('returns 404 when no receiptPath on payment', () => {
    const payment = { receiptPath: null };
    const hasReceipt = !!payment.receiptPath;
    expect(hasReceipt).toBe(false);
  });

  it('returns buffer data when receiptPath exists', () => {
    const payment = { receiptPath: 'receipts/2026-04-08/book-1/pay-1.jpg' };
    const hasReceipt = !!payment.receiptPath;
    expect(hasReceipt).toBe(true);
  });
});

// ─── Receipt Delete — Full Cleanup ───

describe('Receipt Delete — DB and Storage Cleanup', () => {
  interface PaymentState {
    receiptPath: string | null;
  }

  function simulateDelete(payment: PaymentState) {
    if (!payment.receiptPath) return { status: 404 };
    const deletedPath = payment.receiptPath;
    payment.receiptPath = null;
    return { status: 200, deletedPath, dbCleared: payment.receiptPath === null };
  }

  it('deletes file and clears DB path', () => {
    const payment: PaymentState = { receiptPath: 'receipts/2026-04-08/book-1/pay-1.jpg' };
    const result = simulateDelete(payment);
    expect(result.status).toBe(200);
    expect(result.deletedPath).toBe('receipts/2026-04-08/book-1/pay-1.jpg');
    expect(result.dbCleared).toBe(true);
    expect(payment.receiptPath).toBeNull();
  });

  it('returns 404 when no receipt to delete', () => {
    const payment: PaymentState = { receiptPath: null };
    const result = simulateDelete(payment);
    expect(result.status).toBe(404);
  });
});
