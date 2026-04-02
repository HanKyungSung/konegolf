/**
 * Unit tests for Stale Shift Cleanup logic.
 *
 * Mirrors the detection and auto-close logic from
 * backend/src/jobs/staleShiftCleanup.ts — no DB calls.
 */

const STALE_HOURS = 16;
const DEFAULT_SHIFT_HOURS = 8;

// ── Types ──────────────────────────────────────────────────────────

interface TimeEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: Date;
  clockOut: Date | null;
  autoClockOut: boolean;
}

interface ClosedEntry extends TimeEntry {
  clockOut: Date;
  autoClockOut: true;
}

// ── Helpers mirroring staleShiftCleanup.ts ─────────────────────────

function isStale(entry: TimeEntry, now: Date): boolean {
  if (entry.clockOut !== null) return false;
  const cutoff = new Date(now.getTime() - STALE_HOURS * 3600 * 1000);
  return entry.clockIn < cutoff;
}

function findStaleEntries(entries: TimeEntry[], now: Date): TimeEntry[] {
  return entries.filter((e) => isStale(e, now));
}

function autoClose(entry: TimeEntry): ClosedEntry {
  const autoClockOut = new Date(entry.clockIn.getTime() + DEFAULT_SHIFT_HOURS * 3600 * 1000);
  return { ...entry, clockOut: autoClockOut, autoClockOut: true };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Stale Shift Cleanup', () => {
  const NOW = new Date('2024-06-11T12:00:00Z');

  describe('stale detection', () => {
    it('entry open >16 hours is stale', () => {
      const entry: TimeEntry = {
        id: 'te-1',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date('2024-06-10T10:00:00Z'), // 26 hours ago
        clockOut: null,
        autoClockOut: false,
      };
      expect(isStale(entry, NOW)).toBe(true);
    });

    it('entry open exactly 16 hours is not stale (cutoff is exclusive)', () => {
      const entry: TimeEntry = {
        id: 'te-2',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date('2024-06-10T20:00:00Z'), // exactly 16h ago
        clockOut: null,
        autoClockOut: false,
      };
      // clockIn is NOT < cutoff (it equals cutoff), so not stale
      expect(isStale(entry, NOW)).toBe(false);
    });

    it('entry open <16 hours is not stale', () => {
      const entry: TimeEntry = {
        id: 'te-3',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date('2024-06-11T06:00:00Z'), // 6 hours ago
        clockOut: null,
        autoClockOut: false,
      };
      expect(isStale(entry, NOW)).toBe(false);
    });

    it('entry already clocked out is not stale', () => {
      const entry: TimeEntry = {
        id: 'te-4',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date('2024-06-10T08:00:00Z'), // 28 hours ago
        clockOut: new Date('2024-06-10T16:00:00Z'), // but already closed
        autoClockOut: false,
      };
      expect(isStale(entry, NOW)).toBe(false);
    });

    it('recently opened entry (1 minute ago) is not stale', () => {
      const entry: TimeEntry = {
        id: 'te-5',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn: new Date(NOW.getTime() - 60 * 1000), // 1 minute ago
        clockOut: null,
        autoClockOut: false,
      };
      expect(isStale(entry, NOW)).toBe(false);
    });
  });

  describe('auto clock-out', () => {
    it('sets clockOut = clockIn + 8 hours', () => {
      const clockIn = new Date('2024-06-10T09:00:00Z');
      const entry: TimeEntry = {
        id: 'te-1',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn,
        clockOut: null,
        autoClockOut: false,
      };
      const closed = autoClose(entry);

      const expectedClockOut = new Date('2024-06-10T17:00:00Z'); // 9 AM + 8h
      expect(closed.clockOut).toEqual(expectedClockOut);
      expect(closed.autoClockOut).toBe(true);
    });

    it('preserves original entry fields', () => {
      const entry: TimeEntry = {
        id: 'te-42',
        employeeId: 'emp-7',
        employeeName: 'Bob',
        clockIn: new Date('2024-06-10T14:00:00Z'),
        clockOut: null,
        autoClockOut: false,
      };
      const closed = autoClose(entry);

      expect(closed.id).toBe('te-42');
      expect(closed.employeeId).toBe('emp-7');
      expect(closed.employeeName).toBe('Bob');
      expect(closed.clockIn).toEqual(entry.clockIn);
    });

    it('auto-closed shift duration is always 8 hours', () => {
      const clockIn = new Date('2024-06-09T22:00:00Z'); // late night
      const entry: TimeEntry = {
        id: 'te-1',
        employeeId: 'emp-1',
        employeeName: 'Alice',
        clockIn,
        clockOut: null,
        autoClockOut: false,
      };
      const closed = autoClose(entry);

      const durationMs = closed.clockOut.getTime() - closed.clockIn.getTime();
      expect(durationMs).toBe(8 * 3600 * 1000);
    });
  });

  describe('batch processing', () => {
    it('finds all stale entries from a mixed list', () => {
      const entries: TimeEntry[] = [
        {
          id: 'te-1',
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T08:00:00Z'), // 28h ago — stale
          clockOut: null,
          autoClockOut: false,
        },
        {
          id: 'te-2',
          employeeId: 'emp-2',
          employeeName: 'Bob',
          clockIn: new Date('2024-06-11T10:00:00Z'), // 2h ago — not stale
          clockOut: null,
          autoClockOut: false,
        },
        {
          id: 'te-3',
          employeeId: 'emp-3',
          employeeName: 'Charlie',
          clockIn: new Date('2024-06-10T05:00:00Z'), // 31h ago — stale
          clockOut: null,
          autoClockOut: false,
        },
        {
          id: 'te-4',
          employeeId: 'emp-4',
          employeeName: 'Dana',
          clockIn: new Date('2024-06-10T06:00:00Z'), // old but already closed
          clockOut: new Date('2024-06-10T14:00:00Z'),
          autoClockOut: false,
        },
      ];

      const stale = findStaleEntries(entries, NOW);
      expect(stale).toHaveLength(2);
      expect(stale.map((e) => e.id).sort()).toEqual(['te-1', 'te-3']);
    });

    it('auto-closes all stale entries correctly', () => {
      const entries: TimeEntry[] = [
        {
          id: 'te-1',
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-10T08:00:00Z'),
          clockOut: null,
          autoClockOut: false,
        },
        {
          id: 'te-2',
          employeeId: 'emp-2',
          employeeName: 'Bob',
          clockIn: new Date('2024-06-10T05:00:00Z'),
          clockOut: null,
          autoClockOut: false,
        },
      ];

      const stale = findStaleEntries(entries, NOW);
      const closed = stale.map(autoClose);

      expect(closed).toHaveLength(2);
      for (const entry of closed) {
        expect(entry.autoClockOut).toBe(true);
        expect(entry.clockOut).not.toBeNull();
        const durationMs = entry.clockOut.getTime() - entry.clockIn.getTime();
        expect(durationMs).toBe(8 * 3600 * 1000);
      }
    });

    it('returns empty when no entries are stale', () => {
      const entries: TimeEntry[] = [
        {
          id: 'te-1',
          employeeId: 'emp-1',
          employeeName: 'Alice',
          clockIn: new Date('2024-06-11T10:00:00Z'), // 2h ago
          clockOut: null,
          autoClockOut: false,
        },
        {
          id: 'te-2',
          employeeId: 'emp-2',
          employeeName: 'Bob',
          clockIn: new Date('2024-06-10T14:00:00Z'), // closed
          clockOut: new Date('2024-06-10T22:00:00Z'),
          autoClockOut: false,
        },
      ];

      const stale = findStaleEntries(entries, NOW);
      expect(stale).toHaveLength(0);
    });

    it('returns empty for empty input', () => {
      expect(findStaleEntries([], NOW)).toEqual([]);
    });
  });
});
