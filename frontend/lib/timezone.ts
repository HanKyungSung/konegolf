/**
 * Timezone Utilities for K-Golf
 * 
 * K-Golf operates exclusively in Atlantic Time (America/Halifax).
 * All date display and query boundary calculations should use these helpers
 * instead of raw Date methods, so behavior is correct regardless of the
 * user's browser timezone or the server's system timezone.
 */

export const VENUE_TIMEZONE = 'America/Halifax';

// ─── Display Helpers ──────────────────────────────────────────────

/**
 * Format a date for display in Atlantic Time.
 * @example formatDate('2026-03-20T01:00:00Z') → "Mar 19, 2026"
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
    timeZone: VENUE_TIMEZONE,
  });
}

/**
 * Format a time for display in Atlantic Time.
 * @example formatTime('2026-03-20T01:00:00Z') → "09:00 PM"
 */
export function formatTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
    timeZone: VENUE_TIMEZONE,
  });
}

/**
 * Format a full date-time string in Atlantic Time.
 * @example formatDateTime('2026-03-20T01:00:00Z') → "Mar 19, 2026, 09:00 PM"
 */
export function formatDateTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
    timeZone: VENUE_TIMEZONE,
  });
}

// ─── Query Boundary Helpers ───────────────────────────────────────

/**
 * Get the Atlantic-time date components (year, month, day) for a given instant.
 * Uses Intl.DateTimeFormat which is timezone-aware regardless of browser/server TZ.
 */
function getAtlanticDateParts(date: Date): { year: number; month: number; day: number } {
  // en-CA gives YYYY-MM-DD format
  const formatted = date.toLocaleDateString('en-CA', { timeZone: VENUE_TIMEZONE });
  const [y, m, d] = formatted.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/**
 * Get start and end of "today" in Atlantic Time, returned as ISO strings (UTC).
 * 
 * This is timezone-safe: uses Intl to determine "today" in Atlantic Time,
 * then computes exact UTC boundaries.
 * 
 * @example
 *   // At 11 PM Atlantic on March 19 (= 3 AM UTC March 20):
 *   todayRange() → { start: '2026-03-19T04:00:00.000Z', end: '2026-03-20T03:59:59.999Z' }
 */
export function todayRange(): { start: string; end: string } {
  return dayRange(new Date());
}

/**
 * Get start and end of a specific day in Atlantic Time, returned as ISO strings.
 * @param date - Any Date object; the Atlantic-time day it falls in will be used.
 */
export function dayRange(date: Date): { start: string; end: string } {
  const { year, month, day } = getAtlanticDateParts(date);
  // Build UTC timestamps that correspond to midnight–23:59:59 Atlantic
  // We use a formatter to get the UTC offset for that specific moment (handles DST)
  const startLocal = buildAtlanticDate(year, month, day, 0, 0, 0);
  const endLocal = buildAtlanticDate(year, month, day, 23, 59, 59, 999);
  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

/**
 * Get start and end of a week (7 days starting from `weekStart`) in Atlantic Time.
 * @param weekStart - A Date representing the first day of the week.
 */
export function weekRange(weekStart: Date): { start: string; end: string } {
  const { year, month, day } = getAtlanticDateParts(weekStart);
  const startLocal = buildAtlanticDate(year, month, day, 0, 0, 0);
  // End = 6 days later at 23:59:59
  const endDate = new Date(startLocal.getTime() + 6 * 24 * 60 * 60 * 1000);
  const endParts = getAtlanticDateParts(endDate);
  const endLocal = buildAtlanticDate(endParts.year, endParts.month, endParts.day, 23, 59, 59, 999);
  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

/**
 * Get start and end of a month in Atlantic Time.
 * @param year - Full year (e.g. 2026)
 * @param month - 1-based month (1 = January)
 */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const startLocal = buildAtlanticDate(year, month, 1, 0, 0, 0);
  // Last day of month: day 0 of next month
  const lastDay = new Date(year, month, 0).getDate();
  const endLocal = buildAtlanticDate(year, month, lastDay, 23, 59, 59, 999);
  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

/**
 * Get today's date string (YYYY-MM-DD) in Atlantic Time.
 * Use instead of `new Date().toISOString().split('T')[0]` which gives UTC date.
 * 
 * @example
 *   // At 11 PM Atlantic on March 19 (= 3 AM UTC March 20):
 *   todayDateString() → "2026-03-19"   (correct)
 *   // vs new Date().toISOString().split('T')[0] → "2026-03-20" (WRONG)
 */
export function todayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: VENUE_TIMEZONE });
}

/**
 * Get date string (YYYY-MM-DD) in Atlantic Time for any Date object.
 */
export function toDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-CA', { timeZone: VENUE_TIMEZONE });
}

/**
 * Get date string (YYYY-MM-DD) in a specific timezone.
 */
export function toDateStringInTz(date: Date | string, tz: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * Get time parts (hours, minutes) in a specific timezone.
 * Returns 24h format: { hours: 0-23, minutes: 0-59 }
 */
export function getTimePartsInTz(date: Date | string, tz: string): { hours: number; minutes: number } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  const hour = getPart('hour');
  return { hours: hour === 24 ? 0 : hour, minutes: getPart('minute') };
}

// ─── Internal Helpers ─────────────────────────────────────────────

/**
 * Build a Date object representing a specific wall-clock time in Atlantic timezone.
 * 
 * This works by:
 * 1. Using Intl to find the current UTC offset for the target date
 * 2. Constructing a UTC timestamp adjusted by that offset
 * 
 * This correctly handles DST transitions (AST = UTC-4, ADT = UTC-3).
 */
function getOffsetAtUTC(utcDate: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: VENUE_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  const localHour = getPart('hour') === 24 ? 0 : getPart('hour');
  const localAsUtc = Date.UTC(
    getPart('year'), getPart('month') - 1, getPart('day'),
    localHour, getPart('minute'), getPart('second'),
  );
  return Math.floor(utcDate.getTime() / 1000) * 1000 - localAsUtc;
}

function buildAtlanticDate(
  year: number,
  month: number, // 1-based
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  ms: number = 0,
): Date {
  const target = Date.UTC(year, month - 1, day, hours, minutes, seconds, ms);

  // First pass: use offset at the "rough" UTC point (desired time treated as UTC)
  const rough = new Date(target);
  const offset1 = getOffsetAtUTC(rough);
  const firstGuess = new Date(target + offset1);

  // Second pass: verify offset at computed result (handles DST boundary crossing)
  const offset2 = getOffsetAtUTC(firstGuess);
  if (offset1 !== offset2) {
    return new Date(target + offset2);
  }
  return firstGuess;
}
