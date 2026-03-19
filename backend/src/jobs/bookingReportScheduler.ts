import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendUncompletedBookingsEmail } from '../services/emailService';
import logger from '../lib/logger';

const log = logger.child({ module: 'booking-report-scheduler' });

const TIMEZONE = 'America/Halifax';

/**
 * Get start and end of "yesterday" in Atlantic time as UTC Date objects.
 * Handles DST transitions correctly via Intl.DateTimeFormat.
 */
function getYesterdayRangeAtlantic(): { start: Date; end: Date } {
  const now = new Date();

  // Get today's date string in Atlantic time (e.g. "2026-03-17")
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;

  // Build "today midnight Atlantic" in UTC
  // We use a trick: create a date string and resolve it via the timezone offset
  const todayMidnightAtlantic = new Date(
    new Date(`${year}-${month}-${day}T00:00:00`).toLocaleString('en-US', { timeZone: TIMEZONE })
  );

  // Actually, the reliable way: compute UTC offset for Atlantic at midnight
  // Use a formatter that gives us the offset
  const todayStr = `${year}-${month}-${day}`;
  const todayUTC = zonedMidnightToUTC(todayStr, TIMEZONE);
  const yesterdayUTC = zonedMidnightToUTC(
    offsetDate(todayStr, -1),
    TIMEZONE
  );

  return { start: yesterdayUTC, end: todayUTC };
}

/** Subtract days from a YYYY-MM-DD string */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC to avoid DST edge cases
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Convert "YYYY-MM-DD 00:00:00" in a given timezone to a UTC Date.
 * Works correctly across DST boundaries.
 */
function zonedMidnightToUTC(dateStr: string, tz: string): Date {
  // Create a date at noon UTC on that day (safe from DST)
  const noon = new Date(`${dateStr}T12:00:00Z`);

  // Format noon in the target timezone to get the UTC offset
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
  // tzOffset looks like "GMT-03:00" or "GMT-04:00"
  const match = tzOffset.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) {
    // Fallback: assume AST (UTC-4)
    log.warn({ dateStr, tzOffset }, 'Could not parse timezone offset, using -04:00');
    return new Date(`${dateStr}T04:00:00Z`);
  }

  const sign = match[1] === '+' ? -1 : 1; // Invert: UTC = local - offset
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  const offsetMs = sign * (hours * 3600000 + minutes * 60000);

  // Midnight in that timezone = midnight + offset to get UTC
  const midnightLocal = new Date(`${dateStr}T00:00:00Z`);
  return new Date(midnightLocal.getTime() + offsetMs);
}

/** Format a UTC Date to Atlantic time display string */
export function formatAtlanticTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatAtlanticDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Query uncompleted bookings from yesterday and send report email.
 * Exported for testing.
 */
export async function checkUncompletedBookings() {
  const { start, end } = getYesterdayRangeAtlantic();
  const yesterdayLabel = formatAtlanticDate(start);

  log.info({ start: start.toISOString(), end: end.toISOString() }, `Checking uncompleted bookings for ${yesterdayLabel}`);

  const bookings = await prisma.booking.findMany({
    where: {
      bookingStatus: 'BOOKED',
      startTime: { gte: start, lt: end },
    },
    include: {
      room: { select: { name: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  if (bookings.length === 0) {
    log.info('No uncompleted bookings from yesterday — skipping email.');
    return;
  }

  log.info({ count: bookings.length }, `Found ${bookings.length} uncompleted bookings from ${yesterdayLabel}`);

  const reportData = bookings.map((b) => {
    const isQuickSale = b.bookingSource === 'QUICK_SALE';
    return {
      customerName: b.customerName || 'N/A',
      customerPhone: b.customerPhone || '',
      roomName: b.room?.name || 'Unknown',
      startTime: isQuickSale ? `${formatAtlanticTime(b.startTime)} (created)` : formatAtlanticTime(b.startTime),
      endTime: isQuickSale ? '' : formatAtlanticTime(b.endTime),
      paymentStatus: b.paymentStatus,
      bookingSource: b.bookingSource || 'UNKNOWN',
      bookingId: b.id,
    };
  });

  const recipient = process.env.REPORT_EMAIL || 'general@konegolf.ca';

  // Log email content before sending for audit trail
  log.info({
    to: recipient,
    date: yesterdayLabel,
    count: bookings.length,
    bookings: reportData.map(b => ({
      bookingId: b.bookingId,
      customer: b.customerName,
      room: b.roomName,
      time: `${b.startTime}${b.endTime ? ` – ${b.endTime}` : ''}`,
      payment: b.paymentStatus,
      source: b.bookingSource,
    })),
  }, 'Sending uncompleted bookings report email');

  await sendUncompletedBookingsEmail({
    to: recipient,
    date: yesterdayLabel,
    bookings: reportData,
  });

  log.info({ to: recipient, count: bookings.length }, 'Uncompleted bookings report sent');
}

/**
 * Start the daily booking report scheduler.
 * Runs at 8:00 AM Atlantic time every day.
 */
export function startBookingReportScheduler() {
  cron.schedule('0 7 * * *', async () => {
    log.info('Running daily uncompleted bookings check...');
    try {
      await checkUncompletedBookings();
    } catch (err) {
      log.error({ err }, 'Daily booking report failed');
    }
  }, {
    timezone: TIMEZONE,
  });

  log.info('Scheduled daily booking report at 7:00 AM Atlantic');
}
