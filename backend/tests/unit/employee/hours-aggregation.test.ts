/**
 * Unit tests for Employee Hours Aggregation logic.
 *
 * Mirrors the aggregation from backend/src/routes/reports.ts
 * (GET /api/reports/employee-hours) as pure functions — no DB calls.
 */

const TIMEZONE = 'America/Halifax';
const OVERTIME_MINUTES = 40 * 60; // 2400

// ── Types matching reports.ts ──────────────────────────────────────

interface ShiftSummary {
  date: string;
  clockIn: string;
  clockOut: string | null;
  minutes: number;
  isOpen: boolean;
  autoClockOut?: boolean;
}

interface EmployeeHoursSummary {
  employeeId: string;
  employeeName: string;
  totalMinutes: number;
  shiftCount: number;
  avgShiftMinutes: number;
  longestShiftMinutes: number;
  daysWorked: number;
  shifts: ShiftSummary[];
}

interface TimeEntry {
  employeeId: string;
  employeeName: string;
  clockIn: Date;
  clockOut: Date | null;
  autoClockOut?: boolean;
}

// ── Helper that mirrors the reports.ts aggregation ─────────────────

function aggregateShifts(entries: TimeEntry[], now?: Date): EmployeeHoursSummary[] {
  const currentTime = now || new Date();
  const byEmployee = new Map<string, { name: string; shifts: ShiftSummary[] }>();

  for (const entry of entries) {
    if (!byEmployee.has(entry.employeeId)) {
      byEmployee.set(entry.employeeId, { name: entry.employeeName, shifts: [] });
    }
    const isOpen = !entry.clockOut;
    const end = entry.clockOut ? entry.clockOut.getTime() : currentTime.getTime();
    const minutes = Math.round((end - entry.clockIn.getTime()) / 60000);
    const dateStr = entry.clockIn.toLocaleDateString('en-CA', { timeZone: TIMEZONE });

    byEmployee.get(entry.employeeId)!.shifts.push({
      date: dateStr,
      clockIn: entry.clockIn.toISOString(),
      clockOut: entry.clockOut?.toISOString() || null,
      minutes,
      isOpen,
      autoClockOut: entry.autoClockOut || false,
    });
  }

  const summaries: EmployeeHoursSummary[] = [];
  for (const [empId, data] of byEmployee) {
    const totalMinutes = data.shifts.reduce((sum, s) => sum + s.minutes, 0);
    const longestShiftMinutes =
      data.shifts.length > 0 ? Math.max(...data.shifts.map((s) => s.minutes)) : 0;
    const uniqueDays = new Set(data.shifts.map((s) => s.date));

    summaries.push({
      employeeId: empId,
      employeeName: data.name,
      totalMinutes,
      shiftCount: data.shifts.length,
      avgShiftMinutes: data.shifts.length > 0 ? Math.round(totalMinutes / data.shifts.length) : 0,
      longestShiftMinutes,
      daysWorked: uniqueDays.size,
      shifts: data.shifts,
    });
  }

  summaries.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return summaries;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Employee Hours Aggregation', () => {
  describe('single employee, single shift', () => {
    it('calculates totalMinutes and shiftCount correctly', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'), // 9 AM Atlantic
          clockOut: new Date('2024-06-10T21:30:00Z'), // 5:30 PM Atlantic
        },
      ];
      const result = aggregateShifts(entries);
      expect(result).toHaveLength(1);
      expect(result[0].totalMinutes).toBe(510); // 8h 30m
      expect(result[0].shiftCount).toBe(1);
      expect(result[0].daysWorked).toBe(1);
      expect(result[0].avgShiftMinutes).toBe(510);
      expect(result[0].longestShiftMinutes).toBe(510);
    });
  });

  describe('single employee, multiple shifts same day', () => {
    it('counts daysWorked=1 and shiftCount=2', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // 4 hours
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T18:00:00Z'),
          clockOut: new Date('2024-06-10T21:00:00Z'), // 3 hours
        },
      ];
      const result = aggregateShifts(entries);
      expect(result).toHaveLength(1);
      expect(result[0].shiftCount).toBe(2);
      expect(result[0].daysWorked).toBe(1);
      expect(result[0].totalMinutes).toBe(420); // 7 hours
    });
  });

  describe('single employee, shifts across multiple days', () => {
    it('counts correct daysWorked', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T21:00:00Z'), // Day 1
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T13:00:00Z'),
          clockOut: new Date('2024-06-11T21:00:00Z'), // Day 2
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-12T13:00:00Z'),
          clockOut: new Date('2024-06-12T21:00:00Z'), // Day 3
        },
      ];
      const result = aggregateShifts(entries);
      expect(result).toHaveLength(1);
      expect(result[0].daysWorked).toBe(3);
      expect(result[0].shiftCount).toBe(3);
      expect(result[0].totalMinutes).toBe(1440); // 3 × 8h = 24h
    });
  });

  describe('multiple employees', () => {
    it('returns sorted by name with independent totals', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-2',
          employeeName: 'Charlie',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // 4h
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T14:00:00Z'),
          clockOut: new Date('2024-06-10T20:00:00Z'), // 6h
        },
        {
          employeeId: 'emp-3',
          employeeName: 'Bob',
          clockIn: new Date('2024-06-10T15:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // 2h
        },
      ];
      const result = aggregateShifts(entries);

      expect(result).toHaveLength(3);
      // Sorted alphabetically: Alice, Bob, Charlie
      expect(result[0].employeeName).toBe('Alice');
      expect(result[1].employeeName).toBe('Bob');
      expect(result[2].employeeName).toBe('Charlie');

      expect(result[0].totalMinutes).toBe(360); // 6h
      expect(result[1].totalMinutes).toBe(120); // 2h
      expect(result[2].totalMinutes).toBe(240); // 4h
    });
  });

  describe('open shift (clockOut=null)', () => {
    it('uses provided "now" for duration and marks isOpen=true', () => {
      const clockIn = new Date('2024-06-10T13:00:00Z');
      const now = new Date('2024-06-10T16:00:00Z'); // 3 hours later

      const entries: TimeEntry[] = [
        { employeeId: 'emp-1', employeeName: 'Alice', clockIn, clockOut: null },
      ];
      const result = aggregateShifts(entries, now);

      expect(result).toHaveLength(1);
      expect(result[0].totalMinutes).toBe(180); // 3h
      expect(result[0].shifts[0].isOpen).toBe(true);
      expect(result[0].shifts[0].clockOut).toBeNull();
    });
  });

  describe('empty entries', () => {
    it('returns empty array', () => {
      const result = aggregateShifts([]);
      expect(result).toEqual([]);
    });
  });

  describe('overtime detection', () => {
    it('totalMinutes > 2400 indicates overtime', () => {
      // 5 shifts of 9 hours each = 2700 minutes > 2400 (40h)
      const entries: TimeEntry[] = Array.from({ length: 5 }, (_, i) => ({
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date(`2024-06-${10 + i}T13:00:00Z`),
        clockOut: new Date(`2024-06-${10 + i}T22:00:00Z`), // 9h each
      }));
      const result = aggregateShifts(entries);

      expect(result[0].totalMinutes).toBe(2700);
      expect(result[0].totalMinutes > OVERTIME_MINUTES).toBe(true);
    });

    it('totalMinutes <= 2400 is not overtime', () => {
      // 5 shifts of 8 hours each = 2400 minutes = exactly 40h
      const entries: TimeEntry[] = Array.from({ length: 5 }, (_, i) => ({
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date(`2024-06-${10 + i}T13:00:00Z`),
        clockOut: new Date(`2024-06-${10 + i}T21:00:00Z`), // 8h each
      }));
      const result = aggregateShifts(entries);

      expect(result[0].totalMinutes).toBe(2400);
      expect(result[0].totalMinutes > OVERTIME_MINUTES).toBe(false);
    });
  });

  describe('longest shift calculation', () => {
    it('picks the longest shift from multiple', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // 4h = 240m
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T10:00:00Z'),
          clockOut: new Date('2024-06-11T22:00:00Z'), // 12h = 720m
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-12T13:00:00Z'),
          clockOut: new Date('2024-06-12T19:00:00Z'), // 6h = 360m
        },
      ];
      const result = aggregateShifts(entries);

      expect(result[0].longestShiftMinutes).toBe(720);
    });
  });

  describe('average shift calculation', () => {
    it('calculates totalMinutes / shiftCount rounded', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // 240m
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T13:00:00Z'),
          clockOut: new Date('2024-06-11T18:00:00Z'), // 300m
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-12T13:00:00Z'),
          clockOut: new Date('2024-06-12T19:00:00Z'), // 360m
        },
      ];
      const result = aggregateShifts(entries);

      // (240 + 300 + 360) / 3 = 300
      expect(result[0].avgShiftMinutes).toBe(300);
    });

    it('rounds non-integer averages', () => {
      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T17:00:00Z'), // 240m
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T13:00:00Z'),
          clockOut: new Date('2024-06-11T18:10:00Z'), // 310m
        },
      ];
      const result = aggregateShifts(entries);

      // (240 + 310) / 2 = 275
      expect(result[0].avgShiftMinutes).toBe(275);
    });
  });

  describe('autoClockOut flag passthrough', () => {
    it('preserves autoClockOut when set on entry', () => {
      const clockIn = new Date('2024-06-10T13:00:00Z');
      const clockOut = new Date('2024-06-10T21:00:00Z');

      const entries: TimeEntry[] = [
        { employeeId: 'emp-1', employeeName: 'Alice', clockIn, clockOut, autoClockOut: true },
      ];
      const result = aggregateShifts(entries);

      expect(result[0].shifts[0].autoClockOut).toBe(true);
    });
  });

  describe('mixed open and closed shifts', () => {
    it('handles both open and closed shifts for same employee', () => {
      const now = new Date('2024-06-11T15:00:00Z');

      const entries: TimeEntry[] = [
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T13:00:00Z'),
          clockOut: new Date('2024-06-10T21:00:00Z'), // 480m closed
        },
        {
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T13:00:00Z'),
          clockOut: null, // open — 2h from now
        },
      ];
      const result = aggregateShifts(entries, now);

      expect(result[0].shiftCount).toBe(2);
      expect(result[0].totalMinutes).toBe(600); // 480 + 120
      expect(result[0].shifts[0].isOpen).toBe(false);
      expect(result[0].shifts[1].isOpen).toBe(true);
    });
  });
});
