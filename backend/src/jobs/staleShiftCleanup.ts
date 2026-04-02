import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

const log = logger.child({ module: 'stale-shift-cleanup' });

const TIMEZONE = 'America/Halifax';
const STALE_HOURS = 16;
const DEFAULT_SHIFT_HOURS = 8;

/**
 * Close time entries that have been open longer than STALE_HOURS.
 * Sets clockOut = clockIn + DEFAULT_SHIFT_HOURS and marks autoClockOut = true.
 */
export async function closeStaleShifts() {
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);

  const staleEntries = await prisma.timeEntry.findMany({
    where: {
      clockOut: null,
      clockIn: { lt: cutoff },
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  if (staleEntries.length === 0) {
    log.info('No stale shifts found');
    return;
  }

  for (const entry of staleEntries) {
    const autoClockOut = new Date(entry.clockIn.getTime() + DEFAULT_SHIFT_HOURS * 3600 * 1000);
    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { clockOut: autoClockOut, autoClockOut: true },
    });
    log.warn({
      entryId: entry.id,
      employeeName: entry.employee.name,
      clockIn: entry.clockIn.toISOString(),
      autoClockOut: autoClockOut.toISOString(),
    }, `Auto-closed stale shift for ${entry.employee.name} (open ${STALE_HOURS}+ hours)`);
  }

  log.info({ count: staleEntries.length }, 'Stale shifts auto-closed');
}

/**
 * Start the stale shift cleanup scheduler.
 * Runs every hour.
 */
export function startStaleShiftCleanup() {
  cron.schedule('0 * * * *', async () => {
    try {
      await closeStaleShifts();
    } catch (err) {
      log.error({ err }, 'Stale shift cleanup failed');
    }
  }, {
    timezone: TIMEZONE,
  });

  log.info('Scheduled stale shift cleanup (hourly)');
}
