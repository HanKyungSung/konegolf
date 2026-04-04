/**
 * Unit Tests for Employee PIN Management
 *
 * Tests the PIN duplicate detection, plaintext PIN storage,
 * and backfill logic for employee PINs.
 */

import { hashPassword, verifyPassword } from '../../../src/services/authService';

describe('Employee PIN Management', () => {
  /**
   * Mirrors isPinTaken() from employees.ts
   * Checks if a given PIN matches any existing employee's hash.
   */
  async function isPinTaken(
    pin: string,
    employees: { id: string; pinHash: string }[],
    excludeId?: string,
  ): Promise<boolean> {
    const filtered = excludeId
      ? employees.filter(e => e.id !== excludeId)
      : employees;
    for (const emp of filtered) {
      if (await verifyPassword(pin, emp.pinHash)) return true;
    }
    return false;
  }

  describe('Duplicate PIN Detection', () => {
    let emp1Hash: string;
    let emp2Hash: string;

    beforeAll(async () => {
      emp1Hash = await hashPassword('1234');
      emp2Hash = await hashPassword('5678');
    });

    it('should detect a duplicate PIN', async () => {
      const employees = [
        { id: 'emp-1', pinHash: emp1Hash },
        { id: 'emp-2', pinHash: emp2Hash },
      ];

      const taken = await isPinTaken('1234', employees);
      expect(taken).toBe(true);
    });

    it('should allow a unique PIN', async () => {
      const employees = [
        { id: 'emp-1', pinHash: emp1Hash },
        { id: 'emp-2', pinHash: emp2Hash },
      ];

      const taken = await isPinTaken('9999', employees);
      expect(taken).toBe(false);
    });

    it('should exclude the current employee when updating', async () => {
      const employees = [
        { id: 'emp-1', pinHash: emp1Hash },
        { id: 'emp-2', pinHash: emp2Hash },
      ];

      // emp-1 keeping their own PIN should be allowed
      const taken = await isPinTaken('1234', employees, 'emp-1');
      expect(taken).toBe(false);
    });

    it('should detect duplicate even when excluding a different employee', async () => {
      const employees = [
        { id: 'emp-1', pinHash: emp1Hash },
        { id: 'emp-2', pinHash: emp2Hash },
      ];

      // emp-2 trying to use emp-1's PIN
      const taken = await isPinTaken('1234', employees, 'emp-2');
      expect(taken).toBe(true);
    });

    it('should return false for empty employee list', async () => {
      const taken = await isPinTaken('1234', []);
      expect(taken).toBe(false);
    });
  });

  describe('PIN Backfill Logic', () => {
    /**
     * Mirrors the backfill logic in findEmployeeByPin() from timeEntries.ts.
     * Returns { shouldBackfill, employeeId } when a match is found.
     */
    async function checkBackfill(
      pin: string,
      employees: { id: string; name: string; pin: string | null; pinHash: string }[],
    ): Promise<{ matched: boolean; shouldBackfill: boolean; employeeId?: string }> {
      for (const emp of employees) {
        const match = await verifyPassword(pin, emp.pinHash);
        if (match) {
          return {
            matched: true,
            shouldBackfill: !emp.pin,
            employeeId: emp.id,
          };
        }
      }
      return { matched: false, shouldBackfill: false };
    }

    it('should flag backfill needed when pin field is null', async () => {
      const hash = await hashPassword('4321');
      const employees = [
        { id: 'emp-1', name: 'Alice', pin: null, pinHash: hash },
      ];

      const result = await checkBackfill('4321', employees);
      expect(result.matched).toBe(true);
      expect(result.shouldBackfill).toBe(true);
      expect(result.employeeId).toBe('emp-1');
    });

    it('should not flag backfill when pin field already set', async () => {
      const hash = await hashPassword('4321');
      const employees = [
        { id: 'emp-1', name: 'Alice', pin: '4321', pinHash: hash },
      ];

      const result = await checkBackfill('4321', employees);
      expect(result.matched).toBe(true);
      expect(result.shouldBackfill).toBe(false);
    });

    it('should not match wrong PIN', async () => {
      const hash = await hashPassword('4321');
      const employees = [
        { id: 'emp-1', name: 'Alice', pin: null, pinHash: hash },
      ];

      const result = await checkBackfill('9999', employees);
      expect(result.matched).toBe(false);
      expect(result.shouldBackfill).toBe(false);
    });
  });

  describe('PIN Validation Rules', () => {
    const pinRegex = /^\d{4,6}$/;

    it('should accept 4-digit PIN', () => {
      expect(pinRegex.test('1234')).toBe(true);
    });

    it('should accept 5-digit PIN', () => {
      expect(pinRegex.test('12345')).toBe(true);
    });

    it('should accept 6-digit PIN', () => {
      expect(pinRegex.test('123456')).toBe(true);
    });

    it('should reject 3-digit PIN', () => {
      expect(pinRegex.test('123')).toBe(false);
    });

    it('should reject 7-digit PIN', () => {
      expect(pinRegex.test('1234567')).toBe(false);
    });

    it('should reject non-numeric PIN', () => {
      expect(pinRegex.test('abcd')).toBe(false);
    });

    it('should reject mixed alphanumeric PIN', () => {
      expect(pinRegex.test('12ab')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(pinRegex.test('')).toBe(false);
    });
  });
});
