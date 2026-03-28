/**
 * Tests for tip payment splitting logic.
 *
 * When a tip is paid with a different method than the main payment
 * (e.g., CARD payment + CASH tip), the system should create separate
 * Payment records for each method instead of lumping everything into
 * a single payment.
 */

describe('Tip Payment Split Logic', () => {
  /**
   * Mirrors the payment-splitting logic from addSinglePayment() in invoiceRepo.ts.
   * Given a payment method, amount, tip, and tipMethod, returns the payment records to create.
   */
  function buildPaymentRecords(
    method: string,
    amount: number,
    tip?: number,
    tipMethod?: string
  ): { method: string; amount: number }[] {
    const payments: { method: string; amount: number }[] = [];
    if (tip && tip > 0 && tipMethod && tipMethod !== method) {
      const mainAmount = Math.round((amount - tip) * 100) / 100;
      if (mainAmount > 0) {
        payments.push({ method, amount: mainAmount });
      }
      payments.push({ method: tipMethod, amount: tip });
    } else {
      payments.push({ method, amount });
    }
    return payments;
  }

  /**
   * Mirrors the payment-splitting logic from updateInvoicePayment() in invoiceRepo.ts.
   * For full-pay path: given paymentMethod, totalAmount, tip, tipMethod, and optional split payments.
   */
  function buildFullPayRecords(
    paymentMethod: string,
    totalAmount: number,
    tip?: number,
    tipMethod?: string,
    splitPayments?: { method: string; amount: number }[]
  ): { method: string; amount: number }[] {
    if (splitPayments && splitPayments.length > 1) {
      return splitPayments;
    }
    if (tip && tip > 0 && tipMethod && tipMethod !== paymentMethod) {
      const mainAmount = Math.round((totalAmount - tip) * 100) / 100;
      const records: { method: string; amount: number }[] = [];
      if (mainAmount > 0) {
        records.push({ method: paymentMethod, amount: mainAmount });
      }
      records.push({ method: tipMethod, amount: tip });
      return records;
    }
    return [{ method: paymentMethod, amount: totalAmount }];
  }

  function getEffectiveMethod(payments: { method: string }[]): string {
    const unique = new Set(payments.map(p => p.method));
    return unique.size > 1 ? 'SPLIT' : payments[0].method;
  }

  describe('addSinglePayment - tip split', () => {
    it('should create two records when tipMethod differs from payment method', () => {
      // CARD payment $49.90 with $10 CASH tip
      const records = buildPaymentRecords('CARD', 49.90, 10, 'CASH');
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ method: 'CARD', amount: 39.90 });
      expect(records[1]).toEqual({ method: 'CASH', amount: 10 });
    });

    it('should create single record when tipMethod matches payment method', () => {
      // CARD payment $49.90 with $10 CARD tip
      const records = buildPaymentRecords('CARD', 49.90, 10, 'CARD');
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({ method: 'CARD', amount: 49.90 });
    });

    it('should create single record when no tip', () => {
      const records = buildPaymentRecords('CARD', 39.90);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({ method: 'CARD', amount: 39.90 });
    });

    it('should create single record when tip has no tipMethod', () => {
      // tip without explicit tipMethod defaults to payment method
      const records = buildPaymentRecords('CARD', 49.90, 10);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({ method: 'CARD', amount: 49.90 });
    });

    it('should handle CASH payment with CARD tip', () => {
      const records = buildPaymentRecords('CASH', 49.90, 10, 'CARD');
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ method: 'CASH', amount: 39.90 });
      expect(records[1]).toEqual({ method: 'CARD', amount: 10 });
    });

    it('should handle tip equal to full amount (100% tip, $0 subtotal)', () => {
      // Edge case: entire amount is tip (e.g., free item, tip only)
      const records = buildPaymentRecords('CARD', 10, 10, 'CASH');
      expect(records).toHaveLength(1);
      // mainAmount = 0, so only tip record
      expect(records[0]).toEqual({ method: 'CASH', amount: 10 });
    });

    it('should handle rounding correctly', () => {
      // $35 subtotal + $4.90 tax = $39.90, $5.25 tip (CASH) → total $45.15
      const records = buildPaymentRecords('CARD', 45.15, 5.25, 'CASH');
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ method: 'CARD', amount: 39.90 });
      expect(records[1]).toEqual({ method: 'CASH', amount: 5.25 });
    });

    it('should mark as SPLIT when tip creates two different methods', () => {
      const records = buildPaymentRecords('CARD', 49.90, 10, 'CASH');
      expect(getEffectiveMethod(records)).toBe('SPLIT');
    });

    it('should keep original method when tip method matches', () => {
      const records = buildPaymentRecords('CARD', 49.90, 10, 'CARD');
      expect(getEffectiveMethod(records)).toBe('CARD');
    });
  });

  describe('updateInvoicePayment - tip split', () => {
    it('should create two records when tipMethod differs from payment method', () => {
      const records = buildFullPayRecords('CARD', 49.90, 10, 'CASH');
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ method: 'CARD', amount: 39.90 });
      expect(records[1]).toEqual({ method: 'CASH', amount: 10 });
    });

    it('should create single record when tipMethod matches', () => {
      const records = buildFullPayRecords('CARD', 49.90, 10, 'CARD');
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({ method: 'CARD', amount: 49.90 });
    });

    it('should create single record when no tip', () => {
      const records = buildFullPayRecords('CARD', 39.90);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({ method: 'CARD', amount: 39.90 });
    });

    it('should use explicit split payments when provided', () => {
      const split = [
        { method: 'CARD', amount: 20 },
        { method: 'CASH', amount: 19.90 },
      ];
      const records = buildFullPayRecords('SPLIT', 39.90, undefined, undefined, split);
      expect(records).toHaveLength(2);
      expect(records).toEqual(split);
    });

    it('should prefer explicit split over tip split', () => {
      const split = [
        { method: 'CARD', amount: 30 },
        { method: 'CASH', amount: 19.90 },
      ];
      // Even with tip/tipMethod, explicit splits take precedence
      const records = buildFullPayRecords('SPLIT', 49.90, 10, 'CASH', split);
      expect(records).toEqual(split);
    });

    it('should handle CASH payment with CARD tip on full pay', () => {
      const records = buildFullPayRecords('CASH', 49.90, 10, 'CARD');
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ method: 'CASH', amount: 39.90 });
      expect(records[1]).toEqual({ method: 'CARD', amount: 10 });
      expect(getEffectiveMethod(records)).toBe('SPLIT');
    });
  });
});
