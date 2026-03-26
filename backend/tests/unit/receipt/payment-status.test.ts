/**
 * Tests for receipt/payment status determination logic.
 * 
 * Verifies that empty seats ($0 subtotal, UNPAID) don't cause
 * the overall booking to show as "PARTIALLY PAID" when all
 * charged seats are fully paid.
 */

describe('Receipt Payment Status Logic', () => {
  // Mirror the logic from receiptRepo.getReceiptData()
  function getReceiptPaymentStatus(invoices: { status: string; subtotal: number }[]): 'PAID' | 'PARTIAL' | 'UNPAID' {
    const chargedInvoices = invoices.filter((inv) => Number(inv.subtotal) > 0);
    const allPaid = invoices.length > 0 && (chargedInvoices.length === 0 || chargedInvoices.every((inv) => inv.status === 'PAID'));
    return allPaid ? 'PAID' : invoices.length > 0 ? 'PARTIAL' : 'UNPAID';
  }

  // Mirror the logic from booking.ts GET /payment-status
  function getBookingPaymentStatus(invoices: { status: string; totalAmount: number }[]): { allPaid: boolean; remaining: number } {
    const chargedInvoices = invoices.filter((inv) => Number(inv.totalAmount) > 0);
    const allPaid = chargedInvoices.length === 0 || chargedInvoices.every((inv) => inv.status === 'PAID');
    const remaining = invoices
      .filter((inv) => inv.status === 'UNPAID' && Number(inv.totalAmount) > 0)
      .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    return { allPaid, remaining };
  }

  describe('receiptRepo payment status', () => {
    it('should return PAID when all seats are paid', () => {
      const invoices = [
        { status: 'PAID', subtotal: 35 },
        { status: 'PAID', subtotal: 35 },
      ];
      expect(getReceiptPaymentStatus(invoices)).toBe('PAID');
    });

    it('should return PARTIAL when some seats are unpaid', () => {
      const invoices = [
        { status: 'PAID', subtotal: 35 },
        { status: 'UNPAID', subtotal: 35 },
      ];
      expect(getReceiptPaymentStatus(invoices)).toBe('PARTIAL');
    });

    it('should return UNPAID when no invoices exist', () => {
      expect(getReceiptPaymentStatus([])).toBe('UNPAID');
    });

    it('should return PAID when charged seats are paid and empty seats are unpaid', () => {
      // The original bug: 4 seats, 2 with orders (paid), 2 empty ($0, unpaid)
      const invoices = [
        { status: 'PAID', subtotal: 35 },
        { status: 'PAID', subtotal: 12.99 },
        { status: 'UNPAID', subtotal: 0 },  // empty seat
        { status: 'UNPAID', subtotal: 0 },  // empty seat
      ];
      expect(getReceiptPaymentStatus(invoices)).toBe('PAID');
    });

    it('should return PARTIAL when some charged seats are unpaid even with empty seats', () => {
      const invoices = [
        { status: 'PAID', subtotal: 35 },
        { status: 'UNPAID', subtotal: 12.99 },  // charged but unpaid
        { status: 'UNPAID', subtotal: 0 },       // empty seat
      ];
      expect(getReceiptPaymentStatus(invoices)).toBe('PARTIAL');
    });

    it('should return PAID when all seats are $0 (no orders at all)', () => {
      const invoices = [
        { status: 'UNPAID', subtotal: 0 },
        { status: 'UNPAID', subtotal: 0 },
      ];
      expect(getReceiptPaymentStatus(invoices)).toBe('PAID');
    });

    it('should return PAID with single paid seat and multiple empty seats', () => {
      const invoices = [
        { status: 'PAID', subtotal: 8.99 },
        { status: 'UNPAID', subtotal: 0 },
        { status: 'UNPAID', subtotal: 0 },
        { status: 'UNPAID', subtotal: 0 },
      ];
      expect(getReceiptPaymentStatus(invoices)).toBe('PAID');
    });
  });

  describe('booking payment-status endpoint', () => {
    it('should return allPaid=true when all charged seats are paid', () => {
      const invoices = [
        { status: 'PAID', totalAmount: 39.90 },
        { status: 'PAID', totalAmount: 14.81 },
        { status: 'UNPAID', totalAmount: 0 },
        { status: 'UNPAID', totalAmount: 0 },
      ];
      const result = getBookingPaymentStatus(invoices);
      expect(result.allPaid).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should return allPaid=false with remaining when charged seats are unpaid', () => {
      const invoices = [
        { status: 'PAID', totalAmount: 39.90 },
        { status: 'UNPAID', totalAmount: 14.81 },
        { status: 'UNPAID', totalAmount: 0 },
      ];
      const result = getBookingPaymentStatus(invoices);
      expect(result.allPaid).toBe(false);
      expect(result.remaining).toBe(14.81);
    });

    it('should not count $0 invoices in remaining', () => {
      const invoices = [
        { status: 'UNPAID', totalAmount: 0 },
        { status: 'UNPAID', totalAmount: 0 },
      ];
      const result = getBookingPaymentStatus(invoices);
      expect(result.allPaid).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });
});
