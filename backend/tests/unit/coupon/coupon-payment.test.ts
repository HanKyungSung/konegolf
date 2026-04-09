/**
 * Unit tests for coupon payment validation logic
 * Tests the Zod schema changes and payment amount rules
 */
import { z } from 'zod';

// Replicate the addPaymentSchema from booking.ts
const addPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  seatIndex: z.number().int().min(1).max(4),
  method: z.enum(['CARD', 'CASH', 'GIFT_CARD', 'COUPON']),
  amount: z.number().nonnegative(),
  tip: z.number().nonnegative().optional(),
  tipMethod: z.enum(['CARD', 'CASH']).optional(),
}).superRefine((data, ctx) => {
  if (data.method !== 'COUPON' && data.amount <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Amount must be positive for non-coupon payments',
      path: ['amount'],
    });
  }
});

describe('addPaymentSchema — COUPON method validation', () => {
  const basePayment = {
    bookingId: '00000000-0000-0000-0000-000000000001',
    seatIndex: 1,
  };

  // COUPON method tests
  test('COUPON method allows $0 amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'COUPON',
      amount: 0,
    });
    expect(result.success).toBe(true);
  });

  test('COUPON method allows positive amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'COUPON',
      amount: 39.90,
    });
    expect(result.success).toBe(true);
  });

  test('COUPON method rejects negative amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'COUPON',
      amount: -5,
    });
    expect(result.success).toBe(false);
  });

  // CARD method tests
  test('CARD method requires positive amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'CARD',
      amount: 10,
    });
    expect(result.success).toBe(true);
  });

  test('CARD method rejects $0 amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'CARD',
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('CARD method rejects negative amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'CARD',
      amount: -5,
    });
    expect(result.success).toBe(false);
  });

  // CASH method tests
  test('CASH method rejects $0 amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'CASH',
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('CASH method allows positive amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'CASH',
      amount: 20,
    });
    expect(result.success).toBe(true);
  });

  // GIFT_CARD method tests
  test('GIFT_CARD method rejects $0 amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'GIFT_CARD',
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('GIFT_CARD method allows positive amount', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'GIFT_CARD',
      amount: 50,
    });
    expect(result.success).toBe(true);
  });

  // Invalid method
  test('rejects invalid payment method', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'BITCOIN',
      amount: 10,
    });
    expect(result.success).toBe(false);
  });

  // Edge cases
  test('COUPON with tip is allowed', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'COUPON',
      amount: 0,
      tip: 5,
      tipMethod: 'CARD',
    });
    expect(result.success).toBe(true);
  });

  test('CARD with $0.01 (minimum positive) is allowed', () => {
    const result = addPaymentSchema.safeParse({
      ...basePayment,
      method: 'CARD',
      amount: 0.01,
    });
    expect(result.success).toBe(true);
  });
});

describe('Coupon tax-inclusive discount math', () => {
  // Replicate the discount calculation from couponService.ts
  function calculateEffectiveDiscount(baseAmount: number, taxRate: number, isTaxInclusive: boolean): number {
    if (isTaxInclusive) {
      return Math.round(baseAmount * (1 + taxRate) * 100) / 100;
    }
    return baseAmount;
  }

  // Replicate invoice recalculation
  function calculateInvoice(orders: Array<{ price: number; taxExempt: boolean }>, taxRate: number) {
    const subtotal = orders.reduce((sum, o) => sum + o.price, 0);
    const taxableSubtotal = orders.filter(o => !o.taxExempt).reduce((sum, o) => sum + o.price, 0);
    const tax = Math.round(taxableSubtotal * taxRate * 100) / 100;
    const total = subtotal + tax;
    return { subtotal, tax, total: Math.round(total * 100) / 100 };
  }

  const TAX_RATE = 0.14; // 14% HST Nova Scotia

  test('Scenario 1: 1hr + birthday coupon → $0 total', () => {
    const discount = calculateEffectiveDiscount(35, TAX_RATE, true);
    expect(discount).toBe(39.90);

    const invoice = calculateInvoice([
      { price: 35, taxExempt: false },    // 1 hour
      { price: -39.90, taxExempt: true },  // coupon discount
    ], TAX_RATE);

    expect(invoice.subtotal).toBeCloseTo(-4.90, 2);
    expect(invoice.tax).toBeCloseTo(4.90, 2);
    expect(invoice.total).toBeCloseTo(0, 2);
  });

  test('Scenario 2: 2hr + birthday coupon → $39.90 total', () => {
    const discount = calculateEffectiveDiscount(35, TAX_RATE, true);
    const invoice = calculateInvoice([
      { price: 70, taxExempt: false },     // 2 hours
      { price: -discount, taxExempt: true }, // coupon
    ], TAX_RATE);

    expect(invoice.subtotal).toBe(30.10);
    expect(invoice.tax).toBe(9.80);
    expect(invoice.total).toBe(39.90);
  });

  test('Scenario 3: 1hr + beer ($6.99) + birthday coupon', () => {
    const discount = calculateEffectiveDiscount(35, TAX_RATE, true);
    const invoice = calculateInvoice([
      { price: 35, taxExempt: false },     // 1 hour
      { price: 6.99, taxExempt: false },   // beer
      { price: -discount, taxExempt: true }, // coupon
    ], TAX_RATE);

    expect(invoice.subtotal).toBeCloseTo(2.09, 2);
    // Tax is on taxable only: (35 + 6.99) × 14% = 5.88
    expect(invoice.tax).toBeCloseTo(5.88, 2);
    expect(invoice.total).toBeCloseTo(7.97, 2);
  });

  test('Non-birthday coupon: $35 off, NOT tax-inclusive', () => {
    const discount = calculateEffectiveDiscount(35, TAX_RATE, false);
    expect(discount).toBe(35); // No tax adjustment

    const invoice = calculateInvoice([
      { price: 35, taxExempt: false },    // 1 hour
      { price: -35, taxExempt: false },   // custom coupon (NOT tax-exempt)
    ], TAX_RATE);

    expect(invoice.subtotal).toBe(0);
    // Tax on taxable: (35 - 35) × 14% = 0
    expect(invoice.tax).toBe(0);
    expect(invoice.total).toBe(0);
  });

  test('Partial coupon: $20 off 1hr', () => {
    const invoice = calculateInvoice([
      { price: 35, taxExempt: false },    // 1 hour
      { price: -20, taxExempt: true },    // partial coupon
    ], TAX_RATE);

    expect(invoice.subtotal).toBe(15);
    // Tax on taxable: $35 × 14% = $4.90
    expect(invoice.tax).toBe(4.90);
    expect(invoice.total).toBe(19.90);
  });

  test('Invoice with $0 total is auto-payable', () => {
    const invoice = calculateInvoice([
      { price: 35, taxExempt: false },
      { price: -39.90, taxExempt: true },
    ], TAX_RATE);

    // Simulates isFullyPaid check: totalPaid >= invoiceTotal - 0.01
    const totalPaid = 0; // $0 COUPON payment
    const isFullyPaid = totalPaid >= invoice.total - 0.01;
    expect(isFullyPaid).toBe(true);
  });
});
