/**
 * Unit Tests for Tax Distribution (Largest Remainder Method)
 * 
 * Tests the algorithm used in invoiceRepo.recalculateAllInvoices()
 * to distribute tax across split seats without rounding errors.
 * 
 * CRA standard: tax is calculated on the total, then distributed
 * using the largest remainder method so seat taxes sum to the exact total.
 */

/**
 * Mirror of the tax distribution algorithm from invoiceRepo.ts.
 * Pure function for testing — no DB dependency.
 */
function distributeTax(seatSubtotals: number[], taxRate: number): {
  seatTaxes: number[];
  totalTax: number;
  totalSubtotal: number;
} {
  const totalSubtotal = seatSubtotals.reduce((sum, s) => sum + s, 0);
  const totalTaxRaw = totalSubtotal * taxRate;
  const totalTaxCents = Math.round(totalTaxRaw * 100);

  const seatTaxRaw = seatSubtotals.map(s => s * taxRate * 100);
  const seatTaxFloored = seatTaxRaw.map(t => Math.floor(t));
  let remainderCents = totalTaxCents - seatTaxFloored.reduce((sum, t) => sum + t, 0);

  const indices = seatSubtotals.map((_, i) => i);
  indices.sort((a, b) => (seatTaxRaw[b] - seatTaxFloored[b]) - (seatTaxRaw[a] - seatTaxFloored[a]));
  for (const idx of indices) {
    if (remainderCents <= 0) break;
    seatTaxFloored[idx]++;
    remainderCents--;
  }

  const seatTaxes = seatTaxFloored.map(t => t / 100);
  const totalTax = totalTaxCents / 100;

  return { seatTaxes, totalTax, totalSubtotal };
}

describe('Tax Distribution (Largest Remainder Method)', () => {
  describe('Basic scenarios', () => {
    it('single seat — tax rounds normally', () => {
      const result = distributeTax([35], 0.14);
      expect(result.totalTax).toBe(4.90);
      expect(result.seatTaxes).toEqual([4.90]);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBe(result.totalTax);
    });

    it('two equal seats — even split', () => {
      const result = distributeTax([50, 50], 0.14);
      expect(result.totalTax).toBe(14.00);
      expect(result.seatTaxes).toEqual([7.00, 7.00]);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBe(result.totalTax);
    });

    it('single seat with 13% tax', () => {
      const result = distributeTax([100], 0.13);
      expect(result.totalTax).toBe(13.00);
      expect(result.seatTaxes).toEqual([13.00]);
    });
  });

  describe('Split payment rounding — the original bug', () => {
    it('$35 split 4 ways at 14% — should total $4.90 not $4.92', () => {
      // This was the real production bug:
      // 4 × $8.75, each taxed at 14% = $1.225 → rounds to $1.23
      // $1.23 × 4 = $4.92 — WRONG (old behavior)
      // Correct: $35 × 14% = $4.90, distributed as [1.23, 1.23, 1.22, 1.22]
      const result = distributeTax([8.75, 8.75, 8.75, 8.75], 0.14);
      expect(result.totalTax).toBe(4.90);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(4.90, 2);
      // Two seats get $1.23, two get $1.22 (largest remainder)
      expect(result.seatTaxes.sort()).toEqual([1.22, 1.22, 1.23, 1.23]);
    });

    it('$70 split 3 ways at 14%', () => {
      // $70/3 = $23.333... per seat
      // Total tax: $70 × 0.14 = $9.80
      const subtotals = [23.34, 23.33, 23.33];
      const result = distributeTax(subtotals, 0.14);
      expect(result.totalTax).toBe(9.80);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(9.80, 2);
    });

    it('$100 split 3 ways at 13%', () => {
      // $100/3 = $33.333... per seat
      // Total tax: $100 × 0.13 = $13.00
      // Per-seat independent: $33.33 × 0.13 = $4.3329 → $4.33 × 3 = $12.99 — WRONG
      const subtotals = [33.34, 33.33, 33.33];
      const result = distributeTax(subtotals, 0.13);
      expect(result.totalTax).toBe(13.00);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(13.00, 2);
    });
  });

  describe('Edge cases', () => {
    it('zero subtotal — no tax', () => {
      const result = distributeTax([0, 0, 0], 0.14);
      expect(result.totalTax).toBe(0);
      expect(result.seatTaxes).toEqual([0, 0, 0]);
    });

    it('one seat has zero, others have values', () => {
      const result = distributeTax([0, 50, 50], 0.14);
      expect(result.totalTax).toBe(14.00);
      expect(result.seatTaxes[0]).toBe(0);
      expect(result.seatTaxes[1] + result.seatTaxes[2]).toBe(14.00);
    });

    it('single seat — no distribution needed', () => {
      const result = distributeTax([12.99], 0.14);
      expect(result.totalTax).toBe(1.82);
      expect(result.seatTaxes).toEqual([1.82]);
    });

    it('many seats (8 way split) — sum still matches', () => {
      const perSeat = 100 / 8; // $12.50 each
      const subtotals = Array(8).fill(perSeat);
      const result = distributeTax(subtotals, 0.14);
      expect(result.totalTax).toBe(14.00);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBe(14.00);
    });

    it('unequal seats — sum still matches total tax', () => {
      // Different items per seat
      const result = distributeTax([12.99, 35.00, 6.99], 0.14);
      const expectedTotalTax = Math.round((12.99 + 35.00 + 6.99) * 0.14 * 100) / 100;
      expect(result.totalTax).toBe(expectedTotalTax);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(expectedTotalTax, 2);
    });

    it('0% tax rate — all zeros', () => {
      const result = distributeTax([50, 50, 50], 0);
      expect(result.totalTax).toBe(0);
      expect(result.seatTaxes).toEqual([0, 0, 0]);
    });
  });

  describe('Largest remainder correctness', () => {
    it('extra cents go to seats with largest fractional remainders', () => {
      // Seat 1: $10 × 0.14 = $1.40 (0 remainder) → $1.40
      // Seat 2: $8.75 × 0.14 = $1.225 (0.5 remainder in cents) → gets extra cent → $1.23
      // Seat 3: $5 × 0.14 = $0.70 (0 remainder) → $0.70
      // Total: $23.75 × 0.14 = $3.325 → rounds to $3.33
      const result = distributeTax([10, 8.75, 5], 0.14);
      expect(result.totalTax).toBe(3.33);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(3.33, 2);
    });

    it('all-identical seats get uniform distribution (difference ≤ 1 cent)', () => {
      const result = distributeTax([8.75, 8.75, 8.75, 8.75], 0.14);
      const minTax = Math.min(...result.seatTaxes);
      const maxTax = Math.max(...result.seatTaxes);
      expect(Math.round((maxTax - minTax) * 100) / 100).toBeLessThanOrEqual(0.01);
    });
  });

  describe('Real-world menu item scenarios', () => {
    it('Club Sandwich ($12.99) split 2 ways at 14%', () => {
      const result = distributeTax([6.50, 6.49], 0.14);
      expect(result.totalTax).toBe(1.82); // $12.99 × 0.14 = $1.8186 → $1.82
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(1.82, 2);
    });

    it('Beer ($6.99) × 3 split across 3 seats at 14%', () => {
      const result = distributeTax([6.99, 6.99, 6.99], 0.14);
      expect(result.totalTax).toBe(2.94); // $20.97 × 0.14 = $2.9358 → $2.94
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(2.94, 2);
    });

    it('mixed items per seat', () => {
      // Seat 1: 1 Hour ($35) + Beer ($6.99) = $41.99
      // Seat 2: Club Sandwich ($12.99) = $12.99
      // Seat 3: French Fries ($5.99) + Soft Drinks ($2.99) = $8.98
      const result = distributeTax([41.99, 12.99, 8.98], 0.14);
      const expectedTotal = Math.round(63.96 * 0.14 * 100) / 100; // $8.95
      expect(result.totalTax).toBe(expectedTotal);
      expect(result.seatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(expectedTotal, 2);
    });
  });
});
