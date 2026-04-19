/**
 * Time Entry (Clock In/Out) API Routes
 *
 * PIN-based clock in/out for kiosk mode (no session auth required).
 * Admin endpoints for viewing and editing time entries.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireRole';
import { prisma } from '../lib/prisma';
import { verifyPassword } from '../services/authService';
import { emitTimeclockEvent } from '../services/wsEvents';
import logger from '../lib/logger';

const router = Router();
const log = logger.child({ module: 'time-entries' });

const pinSchema = z.object({
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only'),
});

const listQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employeeId: z.string().uuid().optional(),
});

const editSchema = z.object({
  clockIn: z.string().datetime().optional(),
  clockOut: z.string().datetime().nullable().optional(),
});

/**
 * Find employee by PIN (checks all active employees)
 */
async function findEmployeeByPin(pin: string) {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, pin: true, pinHash: true },
  });

  for (const emp of employees) {
    const match = await verifyPassword(pin, emp.pinHash);
    if (match) {
      // Backfill plaintext pin for employees created before this field existed
      if (!emp.pin) {
        await prisma.employee.update({ where: { id: emp.id }, data: { pin } });
      }
      return { id: emp.id, name: emp.name };
    }
  }
  return null;
}

// ============= Kiosk endpoints (no session auth) =============

/**
 * POST /api/time-entries/clock-in
 * Clock in with PIN. Rejects if already clocked in.
 */
router.post('/clock-in', async (req, res) => {
  try {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid PIN format' });
    }

    const employee = await findEmployeeByPin(parsed.data.pin);
    if (!employee) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // Check for open time entry
    const openEntry = await prisma.timeEntry.findFirst({
      where: { employeeId: employee.id, clockOut: null },
    });

    if (openEntry) {
      return res.status(409).json({
        error: 'Already clocked in',
        employeeName: employee.name,
        clockIn: openEntry.clockIn,
      });
    }

    const entry = await prisma.timeEntry.create({
      data: {
        employeeId: employee.id,
        clockIn: new Date(),
      },
      select: { id: true, clockIn: true },
    });

    log.info({ employeeId: employee.id, name: employee.name }, 'Employee clocked in');
    emitTimeclockEvent({ id: employee.id, role: 'STAFF' }, { entryId: entry.id, employeeId: employee.id, change: 'clocked_in' });
    res.status(201).json({
      message: 'Clocked in',
      employeeName: employee.name,
      clockIn: entry.clockIn,
      entryId: entry.id,
    });
  } catch (err) {
    log.error({ err }, 'Clock-in failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/time-entries/clock-out
 * Clock out with PIN. Rejects if not clocked in.
 */
router.post('/clock-out', async (req, res) => {
  try {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid PIN format' });
    }

    const employee = await findEmployeeByPin(parsed.data.pin);
    if (!employee) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    // Find open time entry
    const openEntry = await prisma.timeEntry.findFirst({
      where: { employeeId: employee.id, clockOut: null },
    });

    if (!openEntry) {
      return res.status(409).json({
        error: 'Not clocked in',
        employeeName: employee.name,
      });
    }

    const now = new Date();
    const entry = await prisma.timeEntry.update({
      where: { id: openEntry.id },
      data: { clockOut: now },
      select: { id: true, clockIn: true, clockOut: true },
    });

    const durationMs = now.getTime() - openEntry.clockIn.getTime();
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);

    log.info({ employeeId: employee.id, name: employee.name, hours, minutes }, 'Employee clocked out');
    emitTimeclockEvent({ id: employee.id, role: 'STAFF' }, { entryId: entry.id, employeeId: employee.id, change: 'clocked_out' });
    res.json({
      message: 'Clocked out',
      employeeName: employee.name,
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
      duration: { hours, minutes },
    });
  } catch (err) {
    log.error({ err }, 'Clock-out failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/time-entries/status
 * Check clock-in status with PIN (kiosk use).
 */
router.post('/status', async (req, res) => {
  try {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid PIN format' });
    }

    const employee = await findEmployeeByPin(parsed.data.pin);
    if (!employee) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    const openEntry = await prisma.timeEntry.findFirst({
      where: { employeeId: employee.id, clockOut: null },
      select: { id: true, clockIn: true },
    });

    res.json({
      employeeName: employee.name,
      isClockedIn: !!openEntry,
      clockIn: openEntry?.clockIn || null,
    });
  } catch (err) {
    log.error({ err }, 'Status check failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============= Admin endpoints (require auth) =============

/**
 * GET /api/time-entries
 * List time entries with optional filters. Admin only.
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }

    const where: any = {};
    if (parsed.data.employeeId) {
      where.employeeId = parsed.data.employeeId;
    }
    if (parsed.data.startDate || parsed.data.endDate) {
      where.clockIn = {};
      if (parsed.data.startDate) {
        where.clockIn.gte = new Date(parsed.data.startDate + 'T00:00:00Z');
      }
      if (parsed.data.endDate) {
        // End of the end date
        where.clockIn.lt = new Date(parsed.data.endDate + 'T00:00:00Z');
        where.clockIn.lt.setUTCDate(where.clockIn.lt.getUTCDate() + 1);
      }
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: 'desc' },
      take: 500,
    });

    res.json({ entries });
  } catch (err) {
    log.error({ err }, 'Failed to list time entries');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/time-entries/active
 * List currently clocked-in employees. Admin only.
 */
router.get('/active', requireAuth, requireAdmin, async (req, res) => {
  try {
    const entries = await prisma.timeEntry.findMany({
      where: { clockOut: null },
      include: {
        employee: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: 'asc' },
    });

    res.json({ entries });
  } catch (err) {
    log.error({ err }, 'Failed to list active entries');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/time-entries/:id
 * Edit a time entry (admin correction for missed clock-outs, etc.)
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const existing = await prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    const data: any = {};
    if (parsed.data.clockIn !== undefined) data.clockIn = new Date(parsed.data.clockIn);
    if (parsed.data.clockOut !== undefined) {
      data.clockOut = parsed.data.clockOut ? new Date(parsed.data.clockOut) : null;
    }

    const entry = await prisma.timeEntry.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, name: true } } },
    });

    log.info({ entryId: id, updates: Object.keys(data) }, 'Time entry updated by admin');
    emitTimeclockEvent((req as any).user, { entryId: id, employeeId: entry.employeeId, change: 'edited' });
    res.json({ entry });
  } catch (err) {
    log.error({ err }, 'Failed to update time entry');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
