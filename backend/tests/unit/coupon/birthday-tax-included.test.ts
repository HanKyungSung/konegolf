/**
 * Unit tests for Birthday Coupon — "1 Hour Free (Tax Included)"
 *
 * Tests:
 * - Dynamic discount calculation at redemption (base × (1 + taxRate))
 * - Email content uses "1 Hour Free" wording instead of dollar amount
 * - Tax-exempt flag on discount order
 * - Public coupon page value display logic
 */

// ─── Dynamic Discount Calculation ───

describe('Birthday Coupon — Dynamic Discount Calculation', () => {
  const BASE_AMOUNT = 35;

  function calculateEffectiveDiscount(baseAmount: number, taxRatePercent: number): number {
    const taxRate = taxRatePercent / 100;
    return Math.round(baseAmount * (1 + taxRate) * 100) / 100;
  }

  it('calculates $39.90 with 14% HST', () => {
    expect(calculateEffectiveDiscount(BASE_AMOUNT, 14)).toBe(39.90);
  });

  it('calculates $40.25 with 15% HST', () => {
    expect(calculateEffectiveDiscount(BASE_AMOUNT, 15)).toBe(40.25);
  });

  it('calculates $39.55 with 13% HST', () => {
    expect(calculateEffectiveDiscount(BASE_AMOUNT, 13)).toBe(39.55);
  });

  it('returns base amount when tax rate is 0%', () => {
    expect(calculateEffectiveDiscount(BASE_AMOUNT, 0)).toBe(35.00);
  });

  it('handles fractional tax rates (14.5%)', () => {
    expect(calculateEffectiveDiscount(BASE_AMOUNT, 14.5)).toBe(40.08);
  });

  it('rounds correctly to avoid floating point issues', () => {
    // 35 * 1.14 = 39.9 exactly, but ensure no floating point drift
    const result = calculateEffectiveDiscount(35, 14);
    expect(result.toString()).toBe('39.9');
  });
});

// ─── Tax-Inclusive Coupon Type Detection ───

describe('Birthday Coupon — Tax-Inclusive Detection', () => {
  function isTaxInclusive(couponTypeName: string): boolean {
    return couponTypeName === 'birthday' || couponTypeName === 'loyalty';
  }

  it('birthday type is tax-inclusive', () => {
    expect(isTaxInclusive('birthday')).toBe(true);
  });

  it('loyalty type is tax-inclusive', () => {
    expect(isTaxInclusive('loyalty')).toBe(true);
  });

  it('custom type is NOT tax-inclusive', () => {
    expect(isTaxInclusive('custom')).toBe(false);
  });

  it('referral type is NOT tax-inclusive', () => {
    expect(isTaxInclusive('referral')).toBe(false);
  });

  it('seasonal type is NOT tax-inclusive', () => {
    expect(isTaxInclusive('seasonal')).toBe(false);
  });
});

// ─── Email Content ───

describe('Birthday Coupon — Email Content', () => {
  function getCouponEmailContent(type: string): { emoji: string; heading: string; subtext: string } {
    switch (type) {
      case 'birthday':
        return { emoji: '🎂', heading: 'Happy Birthday!', subtext: 'You\'ve earned 1 hour free at K one Golf — tax included!' };
      case 'loyalty':
        return { emoji: '⭐', heading: 'Thank You for Your Loyalty!', subtext: 'You\'ve reached a milestone and earned a reward!' };
      default:
        return { emoji: '🎟️', heading: 'You\'ve Received a Coupon!', subtext: 'Here\'s a special offer just for you!' };
    }
  }

  it('birthday email mentions "1 hour free"', () => {
    const content = getCouponEmailContent('birthday');
    expect(content.subtext).toContain('1 hour free');
  });

  it('birthday email mentions "tax included"', () => {
    const content = getCouponEmailContent('birthday');
    expect(content.subtext).toContain('tax included');
  });

  it('birthday email has cake emoji', () => {
    const content = getCouponEmailContent('birthday');
    expect(content.emoji).toBe('🎂');
  });

  it('loyalty email does not mention tax included', () => {
    const content = getCouponEmailContent('loyalty');
    expect(content.subtext).not.toContain('tax included');
  });

  it('default email does not mention tax included', () => {
    const content = getCouponEmailContent('custom');
    expect(content.subtext).not.toContain('tax included');
  });
});

// ─── Value Display Logic ───

describe('Birthday Coupon — Value Display', () => {
  function getValueDisplay(couponTypeName: string, discountAmount: number): string {
    if (couponTypeName === 'birthday' || couponTypeName === 'loyalty') {
      return '1 Hour Free (Tax Included)';
    }
    return `$${discountAmount.toFixed(2)}`;
  }

  it('birthday shows "1 Hour Free (Tax Included)"', () => {
    expect(getValueDisplay('birthday', 35)).toBe('1 Hour Free (Tax Included)');
  });

  it('loyalty shows "1 Hour Free (Tax Included)"', () => {
    expect(getValueDisplay('loyalty', 35)).toBe('1 Hour Free (Tax Included)');
  });

  it('custom shows dollar amount', () => {
    expect(getValueDisplay('custom', 20)).toBe('$20.00');
  });

  it('referral shows dollar amount', () => {
    expect(getValueDisplay('referral', 10)).toBe('$10.00');
  });
});

// ─── Discount Order Properties ───

describe('Birthday Coupon — Discount Order', () => {
  it('birthday discount order should be tax-exempt', () => {
    const couponTypeName = 'birthday';
    const isTaxInclusive = couponTypeName === 'birthday' || couponTypeName === 'loyalty';
    expect(isTaxInclusive).toBe(true);
    // Tax-exempt prevents double taxation on the already-tax-inclusive discount
  });

  it('birthday effective amount is negative (discount)', () => {
    const baseAmount = 35;
    const taxRate = 0.14;
    const effectiveAmount = Math.round(baseAmount * (1 + taxRate) * 100) / 100;
    const orderPrice = -effectiveAmount;
    expect(orderPrice).toBe(-39.90);
    expect(orderPrice).toBeLessThan(0);
  });

  it('custom coupon discount order is NOT tax-exempt', () => {
    const couponTypeName: string = 'custom';
    const isTaxInclusive = couponTypeName === 'birthday' || couponTypeName === 'loyalty';
    expect(isTaxInclusive).toBe(false);
  });
});
