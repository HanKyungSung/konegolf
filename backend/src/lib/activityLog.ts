/**
 * Activity Log Helper
 *
 * Logs POS actions (bookings, orders, payments, etc.) with employee attribution.
 * Fire-and-forget: errors are logged but don't affect the request.
 */

import { prisma } from './prisma';
import logger from './logger';

const log = logger.child({ module: 'activity-log' });

interface LogActivityParams {
  req: any; // Express request with optional req.employee
  action: string; // e.g. "CREATE_BOOKING", "COMPLETE_BOOKING"
  entityType: string; // e.g. "BOOKING", "ORDER", "INVOICE"
  entityId?: string | null;
  details?: Record<string, any>;
}

/**
 * Log a POS action. Fire-and-forget — does not throw.
 */
export function logActivity({ req, action, entityType, entityId, details }: LogActivityParams): void {
  const employee = req.employee as { id: string; name: string } | undefined;

  // Fire and forget
  prisma.activityLog.create({
    data: {
      employeeId: employee?.id || null,
      employeeName: employee?.name || req.user?.name || 'Admin',
      action,
      entityType,
      entityId: entityId || null,
      details: details || undefined,
    },
  }).catch(err => {
    log.error({ err, action, entityType, entityId }, 'Failed to write activity log');
  });
}
