/**
 * Unit tests for Weekly/Monthly tab helper functions.
 *
 * Mirrors the helpers from frontend/src/pages/pos/time-management.tsx
 * as pure functions — no React or DOM dependencies.
 */

const TIMEZONE = 'America/Halifax';
const OVERTIME_MINUTES = 40 * 60; // 2400

// ── Helpers mirroring time-management.tsx ───────────────────────────

function getWeekStart(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1; // Shift so Mon=0
  d.setDate(d.getDate() - diff);
  return d;
}

function getWeekDates(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
  });
}

function getMonthRange(
  year: number,
  month: number
): { startDate: string; endDate: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function getMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Weekly/Monthly Helpers', () => {
  describe('getWeekStart', () => {
    it('Monday stays on Monday', () => {
      const result = getWeekStart('2024-06-10'); // Monday
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(10);
    });

    it('Sunday goes to previous Monday', () => {
      const result = getWeekStart('2024-06-16'); // Sunday
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(10);
    });

    it('Wednesday goes to Monday', () => {
      const result = getWeekStart('2024-06-12'); // Wednesday
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(10);
    });

    it('Tuesday goes to Monday', () => {
      const result = getWeekStart('2024-06-11'); // Tuesday
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(10);
    });

    it('Saturday goes to Monday', () => {
      const result = getWeekStart('2024-06-15'); // Saturday
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(10);
    });

    it('Friday goes to Monday', () => {
      const result = getWeekStart('2024-06-14'); // Friday
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(10);
    });

    it('handles month boundary (goes back to previous month)', () => {
      const result = getWeekStart('2024-07-03'); // Wednesday July 3
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getMonth()).toBe(6); // July = 6 (0-based)
      expect(result.getDate()).toBe(1); // July 1 is Monday in 2024
    });
  });

  describe('getWeekDates', () => {
    it('returns 7 consecutive dates', () => {
      const start = getWeekStart('2024-06-10'); // Monday
      const dates = getWeekDates(start);

      expect(dates).toHaveLength(7);
    });

    it('starts on the given day and covers Mon–Sun', () => {
      const start = getWeekStart('2024-06-10');
      const dates = getWeekDates(start);

      // Dates should be consecutive (YYYY-MM-DD format in en-CA locale)
      expect(dates[0]).toMatch(/2024-06-10/);
      expect(dates[6]).toMatch(/2024-06-16/);
    });

    it('dates are sequential day-by-day', () => {
      const start = getWeekStart('2024-06-10');
      const dates = getWeekDates(start);

      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1] + 'T12:00:00');
        const curr = new Date(dates[i] + 'T12:00:00');
        const diffDays = (curr.getTime() - prev.getTime()) / (24 * 3600 * 1000);
        expect(diffDays).toBe(1);
      }
    });

    it('handles month boundary', () => {
      // Week that spans June → July
      const start = getWeekStart('2024-06-26'); // Wednesday → Monday June 24
      const dates = getWeekDates(start);

      expect(dates).toHaveLength(7);
      expect(dates[0]).toMatch(/2024-06-24/);
      expect(dates[6]).toMatch(/2024-06-30/);
    });
  });

  describe('getMonthRange', () => {
    it('January has 31 days', () => {
      const { startDate, endDate } = getMonthRange(2024, 1);
      expect(startDate).toBe('2024-01-01');
      expect(endDate).toBe('2024-01-31');
    });

    it('February leap year has 29 days', () => {
      const { startDate, endDate } = getMonthRange(2024, 2);
      expect(startDate).toBe('2024-02-01');
      expect(endDate).toBe('2024-02-29');
    });

    it('February non-leap year has 28 days', () => {
      const { startDate, endDate } = getMonthRange(2023, 2);
      expect(startDate).toBe('2023-02-01');
      expect(endDate).toBe('2023-02-28');
    });

    it('April has 30 days', () => {
      const { startDate, endDate } = getMonthRange(2024, 4);
      expect(startDate).toBe('2024-04-01');
      expect(endDate).toBe('2024-04-30');
    });

    it('December has 31 days', () => {
      const { startDate, endDate } = getMonthRange(2024, 12);
      expect(startDate).toBe('2024-12-01');
      expect(endDate).toBe('2024-12-31');
    });

    it('pads single-digit months', () => {
      const { startDate, endDate } = getMonthRange(2024, 3);
      expect(startDate).toBe('2024-03-01');
      expect(endDate).toBe('2024-03-31');
    });
  });

  describe('formatMinutes', () => {
    it.each([
      [0, '0h 0m'],
      [30, '0h 30m'],
      [60, '1h 0m'],
      [90, '1h 30m'],
      [480, '8h 0m'],
      [510, '8h 30m'],
      [2400, '40h 0m'],
      [2520, '42h 0m'],
      [1, '0h 1m'],
      [59, '0h 59m'],
      [61, '1h 1m'],
    ])('formatMinutes(%i) → "%s"', (mins, expected) => {
      expect(formatMinutes(mins)).toBe(expected);
    });
  });

  describe('getMonthLabel', () => {
    it('returns full month name and year', () => {
      expect(getMonthLabel(2024, 1)).toBe('January 2024');
      expect(getMonthLabel(2024, 6)).toBe('June 2024');
      expect(getMonthLabel(2024, 12)).toBe('December 2024');
    });
  });

  describe('overtime threshold', () => {
    it('2401 minutes is overtime (> 40h)', () => {
      expect(2401 > OVERTIME_MINUTES).toBe(true);
    });

    it('2400 minutes is exactly 40h — not overtime', () => {
      expect(2400 > OVERTIME_MINUTES).toBe(false);
    });

    it('2399 minutes is under 40h — not overtime', () => {
      expect(2399 > OVERTIME_MINUTES).toBe(false);
    });
  });

  describe('weekly report aggregation logic', () => {
    // Mirrors the aggregation from weeklyHoursReport.ts
    interface WeeklyEmployee {
      name: string;
      totalHours: number;
      totalMinutes: number;
      shiftCount: number;
      daysWorked: number;
      isOvertime: boolean;
    }

    interface TimeEntry {
      employeeId: string;
      employeeName: string;
      clockIn: Date;
      clockOut: Date | null;
    }

    function aggregateWeekly(entries: TimeEntry[], now?: Date): WeeklyEmployee[] {
      const currentTime = now || new Date();
      const empMap = new Map<
        string,
        { name: string; totalMinutes: number; shiftCount: number; days: Set<string> }
      >();

      for (const entry of entries) {
        if (!empMap.has(entry.employeeId)) {
          empMap.set(entry.employeeId, {
            name: entry.employeeName,
            totalMinutes: 0,
            shiftCount: 0,
            days: new Set(),
          });
        }
        const emp = empMap.get(entry.employeeId)!;
        const end = entry.clockOut ? entry.clockOut.getTime() : currentTime.getTime();
        const mins = Math.round((end - entry.clockIn.getTime()) / 60000);
        emp.totalMinutes += mins;
        emp.shiftCount++;
        emp.days.add(
          new Date(entry.clockIn).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
        );
      }

      return Array.from(empMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((emp) => ({
          name: emp.name,
          totalHours: Math.floor(emp.totalMinutes / 60),
          totalMinutes: emp.totalMinutes % 60,
          shiftCount: emp.shiftCount,
          daysWorked: emp.days.size,
          isOvertime: emp.totalMinutes > OVERTIME_MINUTES,
        }));
    }

    it('calculates overtime flag correctly', () => {
      // 6 shifts × 8h = 48h = 2880m > 2400
      const entries: TimeEntry[] = Array.from({ length: 6 }, (_, i) => ({
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date(`2024-06-${10 + i}T13:00:00Z`),
        clockOut: new Date(`2024-06-${10 + i}T21:00:00Z`),
      }));

      const result = aggregateWeekly(entries);
      expect(result[0].isOvertime).toBe(true);
      expect(result[0].totalHours).toBe(48);
      expect(result[0].totalMinutes).toBe(0);
    });

    it('non-overtime employee is not flagged', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T21:00:00Z'), // 8h
        },
      ];

      const result = aggregateWeekly(entries);
      expect(result[0].isOvertime).toBe(false);
      expect(result[0].totalHours).toBe(8);
    });

    it('splits totalMinutes into hours and remaining minutes', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T21:30:00Z'), // 8h 30m = 510m
        },
      ];

      const result = aggregateWeekly(entries);
      expect(result[0].totalHours).toBe(8);
      expect(result[0].totalMinutes).toBe(30);
    });

    it('sorts multiple employees by name', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-2',
          employeeName: 'Charlie',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'),
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'),
        },
      ];

      const result = aggregateWeekly(entries);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Charlie');
    });

    it('counts unique days worked', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // Day 1 shift 1
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T18:00:00Z'),
          clockOut: new Date('2024-06-10T21:00:00Z'), // Day 1 shift 2
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T13:00:00Z'),
          clockOut: new Date('2024-06-11T21:00:00Z'), // Day 2
        },
      ];

      const result = aggregateWeekly(entries);
      expect(result[0].daysWorked).toBe(2);
      expect(result[0].shiftCount).toBe(3);
    });
  });
});
