/**
 * Employee Management API Routes
 *
 * Admin-only endpoints for managing employee records (clock-in/out system).
 * Employees are separate from User accounts — identified by unique PINs.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireRole';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../services/authService';
import { verifyPassword } from '../services/authService';
import logger from '../lib/logger';

const router = Router();
const log = logger.child({ module: 'employees' });

// Check if a PIN is already used by another active employee
async function isPinTaken(pin: string, excludeId?: string): Promise<boolean> {
  const employees = await prisma.employee.findMany({
    where: { active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, pinHash: true },
  });
  for (const emp of employees) {
    if (await verifyPassword(pin, emp.pinHash)) return true;
  }
  return false;
}

// All routes require admin auth
router.use(requireAuth);
router.use(requireAdmin);

const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  pin: z.string().min(4, 'PIN must be at least 4 digits').max(6).regex(/^\d+$/, 'PIN must be digits only'),
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only').optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/employees
 * List all employees (optionally filter by active status)
 */
router.get('/', async (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    const employees = await prisma.employee.findMany({
      where: activeOnly ? { active: true } : undefined,
      select: {
        id: true,
        name: true,
        pin: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ employees });
  } catch (err) {
    log.error({ err }, 'Failed to list employees');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/employees
 * Create a new employee with a unique PIN
 */
router.post('/', async (req, res) => {
  try {
    const parsed = createEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { name, pin } = parsed.data;

    if (await isPinTaken(pin)) {
      return res.status(409).json({ error: 'This PIN is already in use by another employee' });
    }

    const pinHash = await hashPassword(pin);

    const employee = await prisma.employee.create({
      data: { name, pin, pinHash },
      select: { id: true, name: true, pin: true, active: true, createdAt: true },
    });

    log.info({ employeeId: employee.id, name }, 'Employee created');
    res.status(201).json({ employee });
  } catch (err) {
    log.error({ err }, 'Failed to create employee');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/employees/:id
 * Update employee name, PIN, or active status
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const data: any = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.pin !== undefined) {
      if (await isPinTaken(parsed.data.pin, id)) {
        return res.status(409).json({ error: 'This PIN is already in use by another employee' });
      }
      data.pin = parsed.data.pin;
      data.pinHash = await hashPassword(parsed.data.pin);
    }

    const employee = await prisma.employee.update({
      where: { id },
      data,
      select: { id: true, name: true, pin: true, active: true, createdAt: true, updatedAt: true },
    });

    log.info({ employeeId: id, updates: Object.keys(data) }, 'Employee updated');
    res.json({ employee });
  } catch (err) {
    log.error({ err }, 'Failed to update employee');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/employees/:id
 * Soft-delete: sets active=false
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    await prisma.employee.update({
      where: { id },
      data: { active: false },
    });

    log.info({ employeeId: id }, 'Employee deactivated');
    res.json({ message: 'Employee deactivated' });
  } catch (err) {
    log.error({ err }, 'Failed to deactivate employee');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
