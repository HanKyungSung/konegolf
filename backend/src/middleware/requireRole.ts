import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Middleware to require ADMIN role only.
 * Use for sensitive operations like customer management, settings, etc.
 */
export function requireAdmin(req: any, res: Response, next: NextFunction) {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Middleware to require STAFF or ADMIN role.
 * Use for POS operations like bookings, room control, invoices, etc.
 */
export function requireStaffOrAdmin(req: any, res: Response, next: NextFunction) {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.STAFF) {
    return res.status(403).json({ error: 'Staff or Admin access required' });
  }
  next();
}

/**
 * Middleware to require SALES, STAFF, or ADMIN role.
 * Use for read-only access to dashboards, metrics, reports, and customer data.
 */
export function requireSalesOrAbove(req: any, res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (role !== UserRole.ADMIN && role !== UserRole.STAFF && role !== UserRole.SALES) {
    return res.status(403).json({ error: 'Sales, Staff, or Admin access required' });
  }
  next();
}
