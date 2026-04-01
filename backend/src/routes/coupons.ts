import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin, requireStaffOrAdmin, requireSalesOrAbove } from '../middleware/requireRole';
import { createCoupon, validateCoupon, redeemCoupon, getPublicCoupon } from '../services/couponService';
import * as invoiceRepo from '../repositories/invoiceRepo';
import { sendCouponEmail } from '../services/emailService';
import { logActivity } from '../lib/activityLog';

const router = Router();

// ─── Public (no auth) ──────────────────────────────────────────

/**
 * GET /api/coupons/public/:code
 * Public coupon status page — no PII exposed
 */
router.get('/public/:code', async (req: Request, res: Response) => {
  try {
    const coupon = await getPublicCoupon(req.params.code.toUpperCase());
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    res.json(coupon);
  } catch (err) {
    req.log.error({ err, code: req.params.code }, 'Public coupon lookup failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated (staff/admin) ───────────────────────────────

/**
 * GET /api/coupons/validate/:code
 * Full coupon validation for staff — includes user info
 */
router.get('/validate/:code', requireAuth, requireSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const result = await validateCoupon(req.params.code.toUpperCase());
    res.json(result);
  } catch (err) {
    req.log.error({ err, code: req.params.code }, 'Coupon validate failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/coupons/:code/redeem
 * Redeem coupon — creates discount order on booking/seat
 * Body: { bookingId, seatNumber }
 */
router.post('/:code/redeem', requireAuth, requireStaffOrAdmin, async (req: Request, res: Response) => {
  try {
    const { bookingId, seatNumber } = req.body;
    if (!bookingId || seatNumber == null) {
      return res.status(400).json({ error: 'bookingId and seatNumber are required' });
    }

    const coupon = await redeemCoupon({
      code: req.params.code.toUpperCase(),
      bookingId,
      seatNumber: Number(seatNumber),
    });

    // Recalculate invoice totals to reflect the discount order
    const updatedInvoice = await invoiceRepo.recalculateInvoice(bookingId, Number(seatNumber));

    req.log.info({
      code: req.params.code.toUpperCase(),
      bookingId,
      seatNumber,
      couponId: coupon.id,
      discount: Number(coupon.discountAmount),
      invoiceSubtotal: Number(updatedInvoice.subtotal),
      invoiceTotal: Number(updatedInvoice.totalAmount),
    }, 'Coupon redeemed, invoice recalculated');
    logActivity({ req, action: 'REDEEM_COUPON', entityType: 'COUPON', entityId: coupon.id, details: { code: req.params.code.toUpperCase(), bookingId } });
    res.json({ success: true, coupon, updatedInvoice });
  } catch (err: any) {
    req.log.error({ err, code: req.params.code }, 'Coupon redeem failed');
    const message = err.message || 'Internal server error';
    const status = message.includes('not found') ? 404
      : message.includes('already') || message.includes('expired') ? 409
      : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * POST /api/coupons
 * Admin manual coupon creation — generates code, sends email
 * Body: { userId, couponTypeId, description?, discountAmount?, expiresAt? }
 */
router.post('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, couponTypeId, description, discountAmount, expiresAt } = req.body;
    if (!userId || !couponTypeId) {
      return res.status(400).json({ error: 'userId and couponTypeId are required' });
    }

    const coupon = await createCoupon({
      userId,
      couponTypeId,
      description,
      discountAmount: discountAmount ? Number(discountAmount) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Send email if user has email
    if (coupon.user.email) {
      try {
        await sendCouponEmail({
          to: coupon.user.email,
          customerName: coupon.user.name,
          couponCode: coupon.code,
          couponType: coupon.couponType.name,
          description: coupon.description,
          discountAmount: Number(coupon.discountAmount),
          expiresAt: coupon.expiresAt,
        });
      } catch (emailErr) {
        req.log.error({ err: emailErr, couponCode: coupon.code }, 'Coupon email send failed (coupon still created)');
      }
    }

    req.log.info({ couponId: coupon.id, code: coupon.code, userId, couponTypeId, amount: Number(coupon.discountAmount) }, 'Coupon created');
    logActivity({ req, action: 'CREATE_COUPON', entityType: 'COUPON', entityId: coupon.id, details: { code: coupon.code } });
    res.status(201).json(coupon);
  } catch (err: any) {
    req.log.error({ err }, 'Coupon create failed');
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/coupons
 * Admin coupon list with optional filters
 * Query: ?status=ACTIVE&type=BIRTHDAY&search=john&page=1&limit=20
 */
router.get('/', requireAuth, requireSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const { status, type, search, page = '1', limit = '20', userId } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const where: any = {};
    if (status) where.status = String(status);
    if (type) where.couponType = { name: String(type) };
    if (userId) where.userId = String(userId);
    if (search) {
      where.OR = [
        { code: { contains: String(search).toUpperCase() } },
        { user: { name: { contains: String(search), mode: 'insensitive' } } },
        { user: { email: { contains: String(search), mode: 'insensitive' } } },
      ];
    }

    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        include: {
          couponType: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
          redeemedBooking: { select: { id: true, startTime: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.coupon.count({ where }),
    ]);

    res.json({
      coupons,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    req.log.error({ err }, 'Coupon list failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Customer endpoint ─────────────────────────────────────────

/**
 * GET /api/coupons/my
 * Return coupons belonging to the logged-in customer
 */
router.get('/my', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const coupons = await prisma.coupon.findMany({
      where: { userId },
      include: {
        couponType: { select: { name: true, label: true } },
        redeemedBooking: { select: { id: true, startTime: true, roomId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-expire any past-due coupons
    const now = new Date();
    for (const c of coupons) {
      if (c.status === 'ACTIVE' && c.expiresAt && c.expiresAt < now) {
        await prisma.coupon.update({ where: { id: c.id }, data: { status: 'EXPIRED' } });
        (c as any).status = 'EXPIRED';
      }
    }

    res.json({ coupons });
  } catch (err) {
    req.log.error({ err }, 'My coupons failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Revoke ────────────────────────────────────────────────────

/**
 * PATCH /api/coupons/:id/revoke
 * Admin revokes (expires) an active coupon
 */
router.patch('/:id/revoke', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    if (coupon.status !== 'ACTIVE') {
      return res.status(409).json({ error: `Cannot revoke — coupon is already ${coupon.status.toLowerCase()}` });
    }

    const updated = await prisma.coupon.update({
      where: { id: req.params.id },
      data: { status: 'EXPIRED' },
      include: { couponType: true, user: { select: { id: true, name: true, email: true } } },
    });

    req.log.info({ couponId: req.params.id, code: coupon.code }, 'Coupon revoked');
    res.json(updated);
  } catch (err) {
    req.log.error({ err, couponId: req.params.id }, 'Coupon revoke failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/coupons/:id/status
 * Admin changes coupon status (ACTIVE, REDEEMED, EXPIRED)
 * Clearing redeemed fields when reverting to ACTIVE
 */
router.patch('/:id/status', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['ACTIVE', 'REDEEMED', 'EXPIRED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    if (coupon.status === status) {
      return res.status(409).json({ error: `Coupon is already ${status.toLowerCase()}` });
    }

    // Build update data based on target status
    const updateData: any = { status };

    if (status === 'ACTIVE') {
      // Clear redeemed fields when reverting to ACTIVE
      updateData.redeemedAt = null;
      updateData.redeemedBookingId = null;
      updateData.redeemedSeatNumber = null;
    }

    const updated = await prisma.coupon.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        couponType: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
        redeemedBooking: { select: { id: true, startTime: true } },
      },
    });

    req.log.info({ couponId: req.params.id, from: coupon.status, to: status }, 'Coupon status changed');
    res.json(updated);
  } catch (err) {
    req.log.error({ err, couponId: req.params.id }, 'Coupon status change failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Coupon Types ──────────────────────────────────────────────

/**
 * GET /api/coupons/types
 * List all active coupon types (for dropdown)
 */
router.get('/types', requireAuth, requireSalesOrAbove, async (req: Request, res: Response) => {
  try {
    const types = await prisma.couponType.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    res.json(types);
  } catch (err) {
    req.log.error({ err }, 'Coupon types list failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/coupons/types
 * Create a new coupon type (admin only)
 */
router.post('/types', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, label, defaultDescription, defaultAmount } = req.body;
    if (!name || !label || !defaultDescription || defaultAmount == null) {
      return res.status(400).json({ error: 'name, label, defaultDescription, and defaultAmount are required' });
    }

    const existing = await prisma.couponType.findUnique({ where: { name: String(name).toUpperCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Coupon type with this name already exists' });
    }

    const couponType = await prisma.couponType.create({
      data: {
        name: String(name).toUpperCase(),
        label,
        defaultDescription,
        defaultAmount: Number(defaultAmount),
      },
    });
    req.log.info({ typeId: couponType.id, name: couponType.name }, 'Coupon type created');
    res.status(201).json(couponType);
  } catch (err) {
    req.log.error({ err }, 'Coupon type create failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/coupons/types/:id
 * Update a coupon type (admin only)
 */
router.patch('/types/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { label, defaultDescription, defaultAmount, active } = req.body;

    const couponType = await prisma.couponType.update({
      where: { id: req.params.id },
      data: {
        ...(label != null && { label }),
        ...(defaultDescription != null && { defaultDescription }),
        ...(defaultAmount != null && { defaultAmount: Number(defaultAmount) }),
        ...(active != null && { active: Boolean(active) }),
      },
    });
    req.log.info({ typeId: req.params.id, name: couponType.name }, 'Coupon type updated');
    res.json(couponType);
  } catch (err: any) {
    req.log.error({ err, typeId: req.params.id }, 'Coupon type update failed');
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Coupon type not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
