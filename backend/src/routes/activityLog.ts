import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireRole';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/activity-log — list activity log entries (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { employeeId, entityType, startDate, endDate, limit = '50', offset = '0' } = req.query;

  const where: any = {};

  if (employeeId && typeof employeeId === 'string') {
    where.employeeId = employeeId;
  }
  if (entityType && typeof entityType === 'string') {
    where.entityType = entityType;
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (typeof startDate === 'string') {
      where.createdAt.gte = new Date(startDate + 'T00:00:00');
    }
    if (typeof endDate === 'string') {
      where.createdAt.lte = new Date(endDate + 'T23:59:59.999');
    }
  }

  const [entries, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
      skip: Number(offset) || 0,
    }),
    prisma.activityLog.count({ where }),
  ]);

  res.json({ entries, total });
});

export default router;
