/**
 * Unit Tests for Tax-Exempt Orders (Gift Card Sales)
 * 
 * Tests the updated tax distribution algorithm that skips tax
 * on orders marked as taxExempt (e.g., gift cards).
 * 
 * Tax-exempt orders contribute to the subtotal/total but NOT to tax.
 */

interface OrderLike {
  totalPrice: number;
  taxExempt: boolean;
}

/**
 * Mirror of the updated tax distribution from invoiceRepo.ts.
 * Takes per-seat orders (with taxExempt flag) and computes
 * subtotal, taxableSubtotal, and tax per seat.
 */
function distributeTaxWithExemptions(
  seatOrders: OrderLike[][],
  taxRate: number
): {
  seats: { subtotal: number; taxableSubtotal: number; tax: number; total: number }[];
  totalTax: number;
  totalSubtotal: number;
  totalTaxableSubtotal: number;
} {
  const seatData = seatOrders.map((orders) => {
    const subtotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const taxableSubtotal = orders
      .filter((o) => !o.taxExempt)
      .reduce((sum, o) => sum + o.totalPrice, 0);
    return { subtotal, taxableSubtotal };
  });

  const totalTaxableSubtotal = seatData.reduce((sum, s) => sum + s.taxableSubtotal, 0);
  const totalTaxRaw = totalTaxableSubtotal * taxRate;
  const totalTaxCents = Math.round(totalTaxRaw * 100);

  const seatTaxRaw = seatData.map((s) => s.taxableSubtotal * taxRate * 100);
  const seatTaxFloored = seatTaxRaw.map((t) => Math.floor(t));
  let remainderCents = totalTaxCents - seatTaxFloored.reduce((sum, t) => sum + t, 0);

  const indices = seatData.map((_, i) => i);
  indices.sort(
    (a, b) =>
      seatTaxRaw[b] - seatTaxFloored[b] - (seatTaxRaw[a] - seatTaxFloored[a])
  );
  for (const idx of indices) {
    if (remainderCents <= 0) break;
    seatTaxFloored[idx]++;
    remainderCents--;
  }

  const totalSubtotal = seatData.reduce((sum, s) => sum + s.subtotal, 0);
  const totalTax = totalTaxCents / 100;

  const seats = seatData.map((s, i) => {
    const tax = seatTaxFloored[i] / 100;
    return {
      subtotal: s.subtotal,
      taxableSubtotal: s.taxableSubtotal,
      tax,
      total: s.subtotal + tax,
    };
  });

  return { seats, totalTax, totalSubtotal, totalTaxableSubtotal };
}

describe('Tax-Exempt Orders (Gift Card Sales)', () => {
  const TAX_RATE = 0.14;

  describe('Fully tax-exempt seat', () => {
    it('single seat with only a gift card — zero tax', () => {
      const result = distributeTaxWithExemptions(
        [[{ totalPrice: 50, taxExempt: true }]],
        TAX_RATE
      );
      expect(result.totalTax).toBe(0);
      expect(result.seats[0].subtotal).toBe(50);
      expect(result.seats[0].tax).toBe(0);
      expect(result.seats[0].total).toBe(50);
    });

    it('single seat with multiple gift cards — zero tax', () => {
      const result = distributeTaxWithExemptions(
        [[
          { totalPrice: 25, taxExempt: true },
          { totalPrice: 100, taxExempt: true },
        ]],
        TAX_RATE
      );
      expect(result.totalTax).toBe(0);
      expect(result.seats[0].subtotal).toBe(125);
      expect(result.seats[0].tax).toBe(0);
      expect(result.seats[0].total).toBe(125);
    });
  });

  describe('Mixed taxable and exempt on same seat', () => {
    it('gift card + food on same seat — tax only on food', () => {
      const result = distributeTaxWithExemptions(
        [[
          { totalPrice: 50, taxExempt: true },   // Gift card
          { totalPrice: 35, taxExempt: false },   // 1 Hour
        ]],
        TAX_RATE
      );
      expect(result.seats[0].subtotal).toBe(85);
      expect(result.seats[0].taxableSubtotal).toBe(35);
      expect(result.seats[0].tax).toBe(4.90); // $35 × 14%
      expect(result.seats[0].total).toBe(89.90);
      expect(result.totalTax).toBe(4.90);
    });

    it('gift card + multiple regular items — tax on regular only', () => {
      const result = distributeTaxWithExemptions(
        [[
          { totalPrice: 100, taxExempt: true },   // Gift card
          { totalPrice: 12.99, taxExempt: false }, // Club Sandwich
          { totalPrice: 6.99, taxExempt: false },  // Beer
        ]],
        TAX_RATE
      );
      const taxableTotal = 12.99 + 6.99; // $19.98
      const expectedTax = Math.round(taxableTotal * 0.14 * 100) / 100; // $2.80
      expect(result.seats[0].subtotal).toBeCloseTo(119.98, 2);
      expect(result.seats[0].taxableSubtotal).toBeCloseTo(19.98, 2);
      expect(result.seats[0].tax).toBe(expectedTax);
      expect(result.totalTax).toBe(expectedTax);
    });
  });

  describe('Multi-seat with exempt items', () => {
    it('seat 1 has gift card (exempt), seat 2 has food (taxable)', () => {
      const result = distributeTaxWithExemptions(
        [
          [{ totalPrice: 50, taxExempt: true }],
          [{ totalPrice: 35, taxExempt: false }],
        ],
        TAX_RATE
      );
      expect(result.seats[0].tax).toBe(0);
      expect(result.seats[1].tax).toBe(4.90);
      expect(result.totalTax).toBe(4.90);
      expect(result.seats[0].total).toBe(50);
      expect(result.seats[1].total).toBe(39.90);
    });

    it('both seats have mixed exempt and taxable', () => {
      const result = distributeTaxWithExemptions(
        [
          [
            { totalPrice: 25, taxExempt: true },    // Gift card
            { totalPrice: 8.75, taxExempt: false },  // 15min
          ],
          [
            { totalPrice: 50, taxExempt: true },     // Gift card
            { totalPrice: 8.75, taxExempt: false },   // 15min
          ],
        ],
        TAX_RATE
      );
      // Taxable: $8.75 + $8.75 = $17.50
      // Total tax: $17.50 × 14% = $2.45
      expect(result.totalTax).toBe(2.45);
      expect(result.totalTaxableSubtotal).toBe(17.50);
      expect(result.totalSubtotal).toBe(92.50);
      // Equal taxable amounts → equal tax distribution
      const sortedTaxes = [...result.seats.map((s) => s.tax)].sort();
      expect(sortedTaxes[0] + sortedTaxes[1]).toBeCloseTo(2.45, 2);
    });

    it('4-way split with one exempt seat — tax distributed across 3 taxable seats', () => {
      const result = distributeTaxWithExemptions(
        [
          [{ totalPrice: 8.75, taxExempt: false }],
          [{ totalPrice: 8.75, taxExempt: false }],
          [{ totalPrice: 8.75, taxExempt: false }],
          [{ totalPrice: 50, taxExempt: true }],   // Gift card — no tax
        ],
        TAX_RATE
      );
      // Taxable: 3 × $8.75 = $26.25
      // Total tax: $26.25 × 14% = $3.675 → $3.68
      expect(result.totalTax).toBe(3.68);
      expect(result.seats[3].tax).toBe(0); // Gift card seat = no tax
      const taxableSeatTaxes = result.seats.slice(0, 3).map((s) => s.tax);
      expect(taxableSeatTaxes.reduce((a, b) => a + b, 0)).toBeCloseTo(3.68, 2);
    });
  });

  describe('Edge cases', () => {
    it('all orders tax-exempt — zero total tax', () => {
      const result = distributeTaxWithExemptions(
        [
          [{ totalPrice: 25, taxExempt: true }],
          [{ totalPrice: 50, taxExempt: true }],
          [{ totalPrice: 100, taxExempt: true }],
        ],
        TAX_RATE
      );
      expect(result.totalTax).toBe(0);
      expect(result.seats.every((s) => s.tax === 0)).toBe(true);
      expect(result.totalSubtotal).toBe(175);
    });

    it('no orders tax-exempt — behaves like normal', () => {
      const result = distributeTaxWithExemptions(
        [
          [{ totalPrice: 35, taxExempt: false }],
          [{ totalPrice: 12.99, taxExempt: false }],
        ],
        TAX_RATE
      );
      const expectedTax = Math.round((35 + 12.99) * 0.14 * 100) / 100;
      expect(result.totalTax).toBe(expectedTax);
    });

    it('zero-dollar gift card — no impact on tax', () => {
      const result = distributeTaxWithExemptions(
        [[
          { totalPrice: 0, taxExempt: true },
          { totalPrice: 35, taxExempt: false },
        ]],
        TAX_RATE
      );
      expect(result.totalTax).toBe(4.90);
      expect(result.seats[0].subtotal).toBe(35);
    });

    it('0% tax rate with exempt items — all zeros', () => {
      const result = distributeTaxWithExemptions(
        [[
          { totalPrice: 50, taxExempt: true },
          { totalPrice: 35, taxExempt: false },
        ]],
        0
      );
      expect(result.totalTax).toBe(0);
      expect(result.seats[0].tax).toBe(0);
    });
  });

  describe('Real-world Quick Sale scenarios', () => {
    it('Quick Sale: single $50 gift card — no tax added to total', () => {
      const result = distributeTaxWithExemptions(
        [[{ totalPrice: 50, taxExempt: true }]],
        TAX_RATE
      );
      expect(result.seats[0].total).toBe(50); // Not $57
    });

    it('Quick Sale: $100 gift card + $25 gift card on same seat', () => {
      const result = distributeTaxWithExemptions(
        [[
          { totalPrice: 100, taxExempt: true },
          { totalPrice: 25, taxExempt: true },
        ]],
        TAX_RATE
      );
      expect(result.seats[0].total).toBe(125);
      expect(result.seats[0].tax).toBe(0);
    });

    it('Regular booking: hours + food — all taxed as before', () => {
      const result = distributeTaxWithExemptions(
        [
          [
            { totalPrice: 35, taxExempt: false },   // 1 Hour
            { totalPrice: 6.99, taxExempt: false },  // Beer
          ],
          [
            { totalPrice: 35, taxExempt: false },   // 1 Hour
            { totalPrice: 12.99, taxExempt: false }, // Club Sandwich
          ],
        ],
        TAX_RATE
      );
      const total = 35 + 6.99 + 35 + 12.99;
      const expectedTax = Math.round(total * 0.14 * 100) / 100;
      expect(result.totalTax).toBe(expectedTax);
      // No exempt items, so taxableSubtotal = subtotal
      expect(result.totalTaxableSubtotal).toBe(total);
    });
  });
});
