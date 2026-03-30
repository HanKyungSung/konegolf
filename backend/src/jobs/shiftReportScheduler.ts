import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendShiftReportEmail } from '../services/emailService';
import logger from '../lib/logger';

const log = logger.child({ module: 'shift-report-scheduler' });

const TIMEZONE = 'America/Halifax';

/**
 * Get today's date range in Atlantic timezone as UTC Date objects.
 */
function getTodayRangeAtlantic(): { start: Date; end: Date; label: string } {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;

  const todayStr = `${year}-${month}-${day}`;
  const tomorrowStr = offsetDate(todayStr, 1);

  const start = zonedMidnightToUTC(todayStr, TIMEZONE);
  const end = zonedMidnightToUTC(tomorrowStr, TIMEZONE);

  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now);

  return { start, end, label };
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function zonedMidnightToUTC(dateStr: string, tz: string): Date {
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });

  const parts = formatter.formatToParts(noon);
  const tzOffset = parts.find(p => p.type === 'timeZoneName')?.value || '';
  const match = tzOffset.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) {
    log.warn({ dateStr, tzOffset }, 'Could not parse timezone offset, using -04:00');
    return new Date(`${dateStr}T04:00:00Z`);
  }

  const sign = match[1] === '+' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  const offsetMs = sign * (hours * 3600000 + minutes * 60000);

  const midnightLocal = new Date(`${dateStr}T00:00:00Z`);
  return new Date(midnightLocal.getTime() + offsetMs);
}

function formatAtlanticTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Generate and send the daily shift report.
 * Exported for testing.
 */
export async function generateShiftReport() {
  const { start, end, label } = getTodayRangeAtlantic();

  log.info({ start: start.toISOString(), end: end.toISOString() }, `Generating shift report for ${label}`);

  const entries = await prisma.timeEntry.findMany({
    where: {
      clockIn: { gte: start, lt: end },
    },
    include: {
      employee: { select: { id: true, name: true } },
    },
    orderBy: { clockIn: 'asc' },
  });

  if (entries.length === 0) {
    log.info('No time entries today — skipping shift report email.');
    return;
  }

  // Build per-employee summary
  const employeeMap = new Map<string, {
    name: string;
    shifts: Array<{ clockIn: string; clockOut: string | null; hours: number; minutes: number }>;
    totalMinutes: number;
    hasOpenShift: boolean;
  }>();

  for (const entry of entries) {
    const empId = entry.employee.id;
    if (!employeeMap.has(empId)) {
      employeeMap.set(empId, {
        name: entry.employee.name,
        shifts: [],
        totalMinutes: 0,
        hasOpenShift: false,
      });
    }
    const emp = employeeMap.get(empId)!;

    const clockInStr = formatAtlanticTime(entry.clockIn);
    let clockOutStr: string | null = null;
    let durationMinutes = 0;

    if (entry.clockOut) {
      clockOutStr = formatAtlanticTime(entry.clockOut);
      durationMinutes = Math.round((entry.clockOut.getTime() - entry.clockIn.getTime()) / 60000);
    } else {
      emp.hasOpenShift = true;
      // Use current time for duration estimate
      durationMinutes = Math.round((new Date().getTime() - entry.clockIn.getTime()) / 60000);
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    emp.shifts.push({ clockIn: clockInStr, clockOut: clockOutStr, hours, minutes });
    emp.totalMinutes += durationMinutes;
  }

  const reportData = Array.from(employeeMap.values()).map(emp => ({
    name: emp.name,
    shifts: emp.shifts,
    totalHours: Math.floor(emp.totalMinutes / 60),
    totalMinutes: emp.totalMinutes % 60,
    hasOpenShift: emp.hasOpenShift,
  }));

  const recipient = process.env.REPORT_EMAIL || 'general@konegolf.ca';

  log.info({
    to: recipient,
    date: label,
    employeeCount: reportData.length,
    entryCount: entries.length,
  }, 'Sending shift report email');

  await sendShiftReportEmail({
    to: recipient,
    date: label,
    employees: reportData,
  });

  log.info({ to: recipient }, 'Shift report sent');
}

/**
 * Start the daily shift report scheduler.
 * Runs at 11:00 PM Atlantic time every day.
 */
export function startShiftReportScheduler() {
  cron.schedule('0 23 * * *', async () => {
    log.info('Running daily shift report...');
    try {
      await generateShiftReport();
    } catch (err) {
      log.error({ err }, 'Daily shift report failed');
    }
  }, {
    timezone: TIMEZONE,
  });

  log.info('Scheduled daily shift report at 11:00 PM Atlantic');
}
