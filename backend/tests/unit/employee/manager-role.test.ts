/**
 * Unit tests for Employee role and manager verification
 */
import { z } from 'zod';

// Replicate schemas from employees.ts
const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  pin: z.string().min(4, 'PIN must be at least 4 digits').max(6).regex(/^\d+$/, 'PIN must be digits only'),
  role: z.enum(['STAFF', 'MANAGER']).default('STAFF'),
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be digits only').optional(),
  active: z.boolean().optional(),
  role: z.enum(['STAFF', 'MANAGER']).optional(),
});

const verifyManagerSchema = z.object({
  pin: z.string().min(4).max(6).regex(/^\d+$/),
});

describe('Employee Role Schema Validation', () => {
  describe('createEmployeeSchema', () => {
    it('should default role to STAFF when not provided', () => {
      const result = createEmployeeSchema.parse({ name: 'Test', pin: '1234' });
      expect(result.role).toBe('STAFF');
    });

    it('should accept MANAGER role', () => {
      const result = createEmployeeSchema.parse({ name: 'Test', pin: '1234', role: 'MANAGER' });
      expect(result.role).toBe('MANAGER');
    });

    it('should accept STAFF role', () => {
      const result = createEmployeeSchema.parse({ name: 'Test', pin: '1234', role: 'STAFF' });
      expect(result.role).toBe('STAFF');
    });

    it('should reject invalid role', () => {
      const result = createEmployeeSchema.safeParse({ name: 'Test', pin: '1234', role: 'ADMIN' });
      expect(result.success).toBe(false);
    });

    it('should reject empty role string', () => {
      const result = createEmployeeSchema.safeParse({ name: 'Test', pin: '1234', role: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('updateEmployeeSchema', () => {
    it('should accept role update to MANAGER', () => {
      const result = updateEmployeeSchema.parse({ role: 'MANAGER' });
      expect(result.role).toBe('MANAGER');
    });

    it('should accept role update to STAFF', () => {
      const result = updateEmployeeSchema.parse({ role: 'STAFF' });
      expect(result.role).toBe('STAFF');
    });

    it('should allow update without role', () => {
      const result = updateEmployeeSchema.parse({ name: 'Updated' });
      expect(result.role).toBeUndefined();
      expect(result.name).toBe('Updated');
    });

    it('should reject invalid role on update', () => {
      const result = updateEmployeeSchema.safeParse({ role: 'SUPERVISOR' });
      expect(result.success).toBe(false);
    });

    it('should accept combined update of name and role', () => {
      const result = updateEmployeeSchema.parse({ name: 'New Name', role: 'MANAGER' });
      expect(result.name).toBe('New Name');
      expect(result.role).toBe('MANAGER');
    });
  });

  describe('verifyManagerSchema', () => {
    it('should accept valid 4-digit PIN', () => {
      const result = verifyManagerSchema.safeParse({ pin: '1234' });
      expect(result.success).toBe(true);
    });

    it('should accept valid 6-digit PIN', () => {
      const result = verifyManagerSchema.safeParse({ pin: '123456' });
      expect(result.success).toBe(true);
    });

    it('should reject 3-digit PIN', () => {
      const result = verifyManagerSchema.safeParse({ pin: '123' });
      expect(result.success).toBe(false);
    });

    it('should reject 7-digit PIN', () => {
      const result = verifyManagerSchema.safeParse({ pin: '1234567' });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric PIN', () => {
      const result = verifyManagerSchema.safeParse({ pin: 'abcd' });
      expect(result.success).toBe(false);
    });

    it('should reject empty PIN', () => {
      const result = verifyManagerSchema.safeParse({ pin: '' });
      expect(result.success).toBe(false);
    });
  });
});

describe('Manager Access Logic', () => {
  interface MockEmployee {
    id: string;
    name: string;
    role: string;
    active: boolean;
  }

  function checkManagerAccess(employee: MockEmployee): { authorized: boolean; reason?: string } {
    if (!employee.active) return { authorized: false, reason: 'Employee is inactive' };
    if (employee.role !== 'MANAGER') return { authorized: false, reason: 'Access denied — manager role required' };
    return { authorized: true };
  }

  it('should authorize active MANAGER', () => {
    const result = checkManagerAccess({ id: '1', name: 'Sarah', role: 'MANAGER', active: true });
    expect(result.authorized).toBe(true);
  });

  it('should deny active STAFF', () => {
    const result = checkManagerAccess({ id: '2', name: 'Mike', role: 'STAFF', active: true });
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('manager role required');
  });

  it('should deny inactive MANAGER', () => {
    const result = checkManagerAccess({ id: '3', name: 'Jenny', role: 'MANAGER', active: false });
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain('inactive');
  });

  it('should deny inactive STAFF', () => {
    const result = checkManagerAccess({ id: '4', name: 'Bob', role: 'STAFF', active: false });
    expect(result.authorized).toBe(false);
  });
});
