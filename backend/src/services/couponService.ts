import { prisma } from '../lib/prisma';
import { CouponStatus } from '@prisma/client';
import crypto from 'crypto';

/**
 * Generate a unique coupon code like "KGOLF-A3X9"
 * 4 alphanumeric chars (no ambiguous characters: 0/O, 1/I/L)
 */
export function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No 0,O,1,I,L
  let suffix = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `KGOLF-${suffix}`;
}

/**
 * Generate a unique code that doesn't exist in DB yet
 */
export async function generateUniqueCouponCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCouponCode();
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (!existing) return code;
  }
  // Fallback: longer code
  return `KGOLF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Create a coupon for a user
 */
export async function createCoupon(params: {
  userId: string;
  couponTypeId: string;
  description?: string;
  discountAmount?: number;
  expiresAt?: Date | null;
  milestone?: number;
}) {
  const couponType = await prisma.couponType.findUnique({
    where: { id: params.couponTypeId },
  });
  if (!couponType) throw new Error('Coupon type not found');

  const code = await generateUniqueCouponCode();
  return prisma.coupon.create({
    data: {
      code,
      userId: params.userId,
      couponTypeId: params.couponTypeId,
      description: params.description || couponType.defaultDescription,
      discountAmount: params.discountAmount ?? Number(couponType.defaultAmount),
      expiresAt: params.expiresAt ?? null,
      milestone: params.milestone ?? null,
    },
    include: {
      couponType: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
}

/**
 * Validate a coupon by code — returns full info for staff
 */
export async function validateCoupon(code: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { code },
    include: {
      couponType: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  if (!coupon) return { isValid: false, error: 'Coupon not found', coupon: null };

  // Check expiry
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    // Auto-expire
    if (coupon.status === CouponStatus.ACTIVE) {
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { status: CouponStatus.EXPIRED },
      });
    }
    return { isValid: false, error: 'Coupon has expired', coupon };
  }

  if (coupon.status !== CouponStatus.ACTIVE) {
    return { isValid: false, error: `Coupon is ${coupon.status.toLowerCase()}`, coupon };
  }

  return { isValid: true, error: null, coupon };
}

/**
 * Redeem a coupon — marks it used and creates a discount order
 */
export async function redeemCoupon(params: {
  code: string;
  bookingId: string;
  seatNumber: number;
}) {
  const { code, bookingId, seatNumber } = params;

  return prisma.$transaction(async (tx) => {
    // Lock the coupon row
    const coupon = await tx.coupon.findUnique({
      where: { code },
      include: { couponType: true },
    });

    if (!coupon) throw new Error('Coupon not found');
    if (coupon.status !== CouponStatus.ACTIVE) {
      throw new Error(`Coupon is already ${coupon.status.toLowerCase()}`);
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { status: CouponStatus.EXPIRED },
      });
      throw new Error('Coupon has expired');
    }

    // Verify booking exists
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');

    // Mark coupon as redeemed
    const updatedCoupon = await tx.coupon.update({
      where: { id: coupon.id },
      data: {
        status: CouponStatus.REDEEMED,
        redeemedAt: new Date(),
        redeemedBookingId: bookingId,
        redeemedSeatNumber: seatNumber,
      },
      include: { couponType: true, user: { select: { id: true, name: true } } },
    });

    // Calculate effective discount amount
    // For birthday/loyalty coupons: include tax so customer pays $0 for the free hour
    const baseAmount = Number(coupon.discountAmount);
    const isTaxInclusive = coupon.couponType.name.toLowerCase() === 'birthday' || coupon.couponType.name.toLowerCase() === 'loyalty';
    let effectiveAmount = baseAmount;
    let taxExempt = false;

    if (isTaxInclusive) {
      const taxRateSetting = await tx.setting.findUnique({ where: { key: 'global_tax_rate' } });
      const taxRate = taxRateSetting ? parseFloat(taxRateSetting.value) / 100 : 0.14;
      effectiveAmount = Math.round(baseAmount * (1 + taxRate) * 100) / 100;
      taxExempt = true;
    }

    // Create discount order (negative price)
    await tx.order.create({
      data: {
        bookingId,
        seatIndex: seatNumber,
        customItemName: `🎟️ ${coupon.description}`,
        customItemPrice: -effectiveAmount,
        discountType: 'FLAT',
        quantity: 1,
        unitPrice: -effectiveAmount,
        totalPrice: -effectiveAmount,
        taxExempt,
      },
    });

    return updatedCoupon;
  });
}

/**
 * Get coupon by code for public display (no PII)
 */
export async function getPublicCoupon(code: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { code },
    include: { couponType: { select: { label: true, name: true } } },
  });

  if (!coupon) return null;

  // Auto-expire if needed
  if (coupon.expiresAt && coupon.expiresAt < new Date() && coupon.status === CouponStatus.ACTIVE) {
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { status: CouponStatus.EXPIRED },
    });
    coupon.status = CouponStatus.EXPIRED;
  }

  return {
    code: coupon.code,
    type: coupon.couponType.label,
    typeName: coupon.couponType.name,
    status: coupon.status,
    description: coupon.description,
    discountAmount: Number(coupon.discountAmount),
    expiresAt: coupon.expiresAt,
    redeemedAt: coupon.redeemedAt,
    createdAt: coupon.createdAt,
  };
}
