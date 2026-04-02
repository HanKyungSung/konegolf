import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendWeeklyHoursEmail } from '../services/emailService';
import logger from '../lib/logger';

const log = logger.child({ module: 'weekly-hours-report' });

const TIMEZONE = 'America/Halifax';
const OVERTIME_MINUTES = 40 * 60;

/**
 * Generate and send last week's employee hours summary.
 */
export async function generateWeeklyHoursReport() {
  // Calculate last week Mon–Sun in Atlantic time
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE });

  // Go back to last Monday
  const today = new Date(formatter.format(now) + 'T12:00:00Z');
  const dayOfWeek = today.getUTCDay(); // 0=Sun
  const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMon = new Date(today);
  lastMon.setUTCDate(lastMon.getUTCDate() - daysToLastMon - 7);
  const lastSun = new Date(lastMon);
  lastSun.setUTCDate(lastSun.getUTCDate() + 6);

  const startDate = formatter.format(lastMon);
  const endDate = formatter.format(lastSun);

  const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TIMEZONE });
  const weekLabel = `${fmtShort(lastMon)} – ${fmtShort(lastSun)}, ${lastMon.toLocaleDateString('en-US', { year: 'numeric', timeZone: TIMEZONE })}`;

  log.info({ startDate, endDate, weekLabel }, 'Generating weekly hours report');

  // Query time entries for the week
  const { buildAtlanticDate } = require('../utils/timezone');
  const [sY, sM, sD] = startDate.split('-').map(Number);
  const [eY, eM, eD] = endDate.split('-').map(Number);
  const rangeStart = buildAtlanticDate(sY, sM, sD, 0, 0, 0);
  const rangeEnd = buildAtlanticDate(eY, eM, eD, 23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: { clockIn: { gte: rangeStart, lte: rangeEnd } },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { clockIn: 'asc' },
  });

  if (entries.length === 0) {
    log.info('No time entries last week — skipping weekly hours email.');
    return;
  }

  // Aggregate by employee
  const empMap = new Map<string, { name: string; totalMinutes: number; shiftCount: number; days: Set<string> }>();
  for (const entry of entries) {
    if (!empMap.has(entry.employeeId)) {
      empMap.set(entry.employeeId, { name: entry.employee.name, totalMinutes: 0, shiftCount: 0, days: new Set() });
    }
    const emp = empMap.get(entry.employeeId)!;
    const end = entry.clockOut ? entry.clockOut.getTime() : Date.now();
    const mins = Math.round((end - entry.clockIn.getTime()) / 60000);
    emp.totalMinutes += mins;
    emp.shiftCount++;
    emp.days.add(new Date(entry.clockIn).toLocaleDateString('en-CA', { timeZone: TIMEZONE }));
  }

  const employees = Array.from(empMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(emp => ({
      name: emp.name,
      totalHours: Math.floor(emp.totalMinutes / 60),
      totalMinutes: emp.totalMinutes % 60,
      shiftCount: emp.shiftCount,
      daysWorked: emp.days.size,
      isOvertime: emp.totalMinutes > OVERTIME_MINUTES,
    }));

  const recipient = process.env.REPORT_EMAIL || 'general@konegolf.ca';

  log.info({ to: recipient, weekLabel, employeeCount: employees.length }, 'Sending weekly hours report');

  await sendWeeklyHoursEmail({ to: recipient, weekLabel, employees });

  log.info({ to: recipient }, 'Weekly hours report sent');
}

/**
 * Start the weekly hours report scheduler.
 * Runs Monday at 8:00 AM Atlantic.
 */
export function startWeeklyHoursReportScheduler() {
  cron.schedule('0 8 * * 1', async () => {
    log.info('Running weekly hours report...');
    try {
      await generateWeeklyHoursReport();
    } catch (err) {
      log.error({ err }, 'Weekly hours report failed');
    }
  }, {
    timezone: TIMEZONE,
  });

  log.info('Scheduled weekly hours report at 8:00 AM Atlantic (Mondays)');
}
