import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../../src/services/authService';

/**
 * Unit tests for Employee Clock In/Out — PIN validation & business logic.
 *
 * Tests the Zod PIN schema and scrypt-based PIN verification
 * used by the kiosk clock-in/out endpoints.
 */

const pinSchema = z.object({
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only'),
});

describe('Clock In/Out — PIN Validation', () => {
  describe('pinSchema accepts valid PINs', () => {
    it.each([
      ['1234', '4-digit PIN'],
      ['12345', '5-digit PIN'],
      ['123456', '6-digit PIN'],
      ['0000', 'all zeros'],
      ['9999', 'all nines'],
    ])('%s (%s)', (pin) => {
      const result = pinSchema.safeParse({ pin });
      expect(result.success).toBe(true);
    });
  });

  describe('pinSchema rejects invalid PINs', () => {
    it('rejects PIN shorter than 4 digits', () => {
      const result = pinSchema.safeParse({ pin: '123' });
      expect(result.success).toBe(false);
    });

    it('rejects PIN longer than 6 digits', () => {
      const result = pinSchema.safeParse({ pin: '1234567' });
      expect(result.success).toBe(false);
    });

    it('rejects non-digit characters', () => {
      const result = pinSchema.safeParse({ pin: '12ab' });
      expect(result.success).toBe(false);
    });

    it('rejects PIN with spaces', () => {
      const result = pinSchema.safeParse({ pin: '12 34' });
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = pinSchema.safeParse({ pin: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing pin field', () => {
      const result = pinSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects numeric type (must be string)', () => {
      const result = pinSchema.safeParse({ pin: 1234 });
      expect(result.success).toBe(false);
    });

    it('rejects special characters', () => {
      const result = pinSchema.safeParse({ pin: '12#4' });
      expect(result.success).toBe(false);
    });
  });
});

describe('Clock In/Out — PIN Hashing & Verification', () => {
  it('hashPassword produces scrypt-prefixed string', async () => {
    const hash = await hashPassword('1234');
    expect(hash).toMatch(/^scrypt:N=\d+,r=\d+,p=\d+:/);
  });

  it('verifyPassword returns true for correct PIN', async () => {
    const pin = '5678';
    const hash = await hashPassword(pin);
    const match = await verifyPassword(pin, hash);
    expect(match).toBe(true);
  });

  it('verifyPassword returns false for wrong PIN', async () => {
    const hash = await hashPassword('1234');
    const match = await verifyPassword('9999', hash);
    expect(match).toBe(false);
  });

  it('verifyPassword returns false for empty stored hash', async () => {
    const match = await verifyPassword('1234', '');
    expect(match).toBe(false);
  });

  it('verifyPassword returns false for malformed stored hash', async () => {
    const match = await verifyPassword('1234', 'not-a-valid-hash');
    expect(match).toBe(false);
  });

  it('different PINs produce different hashes', async () => {
    const hash1 = await hashPassword('1234');
    const hash2 = await hashPassword('5678');
    expect(hash1).not.toEqual(hash2);
  });

  it('same PIN hashed twice produces different hashes (random salt)', async () => {
    const hash1 = await hashPassword('1234');
    const hash2 = await hashPassword('1234');
    expect(hash1).not.toEqual(hash2);
    // Both should still verify
    expect(await verifyPassword('1234', hash1)).toBe(true);
    expect(await verifyPassword('1234', hash2)).toBe(true);
  });
});

describe('Clock In/Out — findEmployeeByPin logic', () => {
  /**
   * Mirrors the findEmployeeByPin function from timeEntries.ts.
   * Given a list of employees with hashed PINs, finds the one matching the input.
   */
  async function findEmployeeByPin(
    pin: string,
    employees: Array<{ id: string; name: string; pinHash: string }>
  ) {
    for (const emp of employees) {
      const match = await verifyPassword(pin, emp.pinHash);
      if (match) return { id: emp.id, name: emp.name };
    }
    return null;
  }

  let employees: Array<{ id: string; name: string; pinHash: string }>;

  beforeAll(async () => {
    employees = [
      { id: 'emp-1', name: 'Alice', pinHash: await hashPassword('1234') },
      { id: 'emp-2', name: 'Bob', pinHash: await hashPassword('5678') },
      { id: 'emp-3', name: 'Charlie', pinHash: await hashPassword('0000') },
    ];
  });

  it('returns correct employee for matching PIN', async () => {
    const result = await findEmployeeByPin('5678', employees);
    expect(result).toEqual({ id: 'emp-2', name: 'Bob' });
  });

  it('returns first employee for their PIN', async () => {
    const result = await findEmployeeByPin('1234', employees);
    expect(result).toEqual({ id: 'emp-1', name: 'Alice' });
  });

  it('returns null when no PIN matches', async () => {
    const result = await findEmployeeByPin('9999', employees);
    expect(result).toBeNull();
  });

  it('returns null for empty employee list', async () => {
    const result = await findEmployeeByPin('1234', []);
    expect(result).toBeNull();
  });
});

describe('Clock In/Out — Business Rules', () => {
  /**
   * Validates clock-in precondition: employee must NOT have an open entry.
   */
  function canClockIn(openEntry: { clockOut: null | Date } | null): boolean {
    return openEntry === null;
  }

  /**
   * Validates clock-out precondition: employee MUST have an open entry.
   */
  function canClockOut(openEntry: { clockOut: null | Date } | null): boolean {
    return openEntry !== null && openEntry.clockOut === null;
  }

  describe('canClockIn', () => {
    it('allows clock-in when no open entry exists', () => {
      expect(canClockIn(null)).toBe(true);
    });

    it('rejects clock-in when already clocked in (409 scenario)', () => {
      expect(canClockIn({ clockOut: null })).toBe(false);
    });
  });

  describe('canClockOut', () => {
    it('allows clock-out when open entry exists', () => {
      expect(canClockOut({ clockOut: null })).toBe(true);
    });

    it('rejects clock-out when not clocked in (409 scenario)', () => {
      expect(canClockOut(null)).toBe(false);
    });

    it('rejects clock-out when entry already closed', () => {
      expect(canClockOut({ clockOut: new Date() })).toBe(false);
    });
  });

  describe('duration calculation', () => {
    it('calculates hours and minutes correctly', () => {
      const clockIn = new Date('2024-01-15T09:00:00Z');
      const clockOut = new Date('2024-01-15T17:30:00Z');
      const durationMs = clockOut.getTime() - clockIn.getTime();
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.floor((durationMs % 3600000) / 60000);
      expect(hours).toBe(8);
      expect(minutes).toBe(30);
    });

    it('handles sub-hour duration', () => {
      const clockIn = new Date('2024-01-15T09:00:00Z');
      const clockOut = new Date('2024-01-15T09:45:00Z');
      const durationMs = clockOut.getTime() - clockIn.getTime();
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.floor((durationMs % 3600000) / 60000);
      expect(hours).toBe(0);
      expect(minutes).toBe(45);
    });
  });
});
