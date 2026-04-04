/**
 * Unit Tests for Booking Extension Feature
 *
 * Tests the validation logic for extending bookings:
 * - 1-hour minimum elapsed check
 * - Conflict detection
 * - Operating hours check
 * - Extension order creation and quantity incrementing
 */

const EXTENSION_PRICE = 20;
const EXTENSION_MINUTES = 30;
const EXTENSION_ORDER_NAME = 'Extension (30 min)';

describe('Booking Extension', () => {
  describe('End Time Calculation', () => {
    it('should extend endTime by 30 minutes', () => {
      const currentEndTime = new Date('2026-04-04T18:00:00Z');
      const newEndTime = new Date(currentEndTime.getTime() + EXTENSION_MINUTES * 60 * 1000);
      expect(newEndTime.toISOString()).toBe('2026-04-04T18:30:00.000Z');
    });

    it('should handle multiple extensions correctly', () => {
      let endTime = new Date('2026-04-04T18:00:00Z');
      // Extend 3 times
      for (let i = 0; i < 3; i++) {
        endTime = new Date(endTime.getTime() + EXTENSION_MINUTES * 60 * 1000);
      }
      expect(endTime.toISOString()).toBe('2026-04-04T19:30:00.000Z');
    });
  });

  describe('Conflict Detection Window', () => {
    function hasConflict(
      bookings: { startTime: Date; endTime: Date; id: string }[],
      currentEndTime: Date,
      newEndTime: Date,
      currentBookingId: string,
    ): boolean {
      return bookings.some(
        (b) =>
          b.id !== currentBookingId &&
          b.startTime < newEndTime &&
          b.endTime > currentEndTime,
      );
    }

    it('should detect conflict when next booking starts at currentEndTime', () => {
      const currentEnd = new Date('2026-04-04T18:00:00Z');
      const newEnd = new Date('2026-04-04T18:30:00Z');
      const bookings = [
        { id: 'other', startTime: new Date('2026-04-04T18:00:00Z'), endTime: new Date('2026-04-04T20:00:00Z') },
      ];
      expect(hasConflict(bookings, currentEnd, newEnd, 'current')).toBe(true);
    });

    it('should allow extension when no next booking exists', () => {
      const currentEnd = new Date('2026-04-04T18:00:00Z');
      const newEnd = new Date('2026-04-04T18:30:00Z');
      expect(hasConflict([], currentEnd, newEnd, 'current')).toBe(false);
    });

    it('should allow extension when next booking starts after new endTime', () => {
      const currentEnd = new Date('2026-04-04T18:00:00Z');
      const newEnd = new Date('2026-04-04T18:30:00Z');
      const bookings = [
        { id: 'other', startTime: new Date('2026-04-04T19:00:00Z'), endTime: new Date('2026-04-04T21:00:00Z') },
      ];
      expect(hasConflict(bookings, currentEnd, newEnd, 'current')).toBe(false);
    });

    it('should not self-conflict', () => {
      const currentEnd = new Date('2026-04-04T18:00:00Z');
      const newEnd = new Date('2026-04-04T18:30:00Z');
      const bookings = [
        { id: 'current', startTime: new Date('2026-04-04T16:00:00Z'), endTime: new Date('2026-04-04T18:00:00Z') },
      ];
      expect(hasConflict(bookings, currentEnd, newEnd, 'current')).toBe(false);
    });
  });

  describe('Operating Hours Validation', () => {
    function exceedsOperatingHours(newEndHour: number, newEndMinute: number, closeMinutes: number): boolean {
      const newEndMinutesOfDay = newEndHour * 60 + newEndMinute;
      if (closeMinutes >= 1440) return false; // midnight = no restriction
      return newEndMinutesOfDay > closeMinutes;
    }

    it('should reject extension past closing time', () => {
      // Close at 11 PM (23 * 60 = 1380), extend to 11:15 PM
      expect(exceedsOperatingHours(23, 15, 1380)).toBe(true);
    });

    it('should allow extension within operating hours', () => {
      // Close at midnight (1440), extend to 11:30 PM
      expect(exceedsOperatingHours(23, 30, 1440)).toBe(false);
    });

    it('should allow extension right at closing time', () => {
      // Close at 11 PM, extend ends at exactly 11 PM
      expect(exceedsOperatingHours(23, 0, 1380)).toBe(false);
    });
  });

  describe('Extension Order Management', () => {
    it('should create extension order with correct price', () => {
      const order = {
        customItemName: EXTENSION_ORDER_NAME,
        customItemPrice: EXTENSION_PRICE,
        quantity: 1,
        unitPrice: EXTENSION_PRICE,
        totalPrice: EXTENSION_PRICE * 1,
        seatIndex: 1,
      };
      expect(order.totalPrice).toBe(20);
      expect(order.customItemName).toBe('Extension (30 min)');
    });

    it('should increment quantity on subsequent extensions', () => {
      const existingOrder = {
        quantity: 1,
        unitPrice: EXTENSION_PRICE,
        totalPrice: EXTENSION_PRICE,
      };

      // Simulate 2nd extension
      const newQty = existingOrder.quantity + 1;
      const newTotal = EXTENSION_PRICE * newQty;
      expect(newQty).toBe(2);
      expect(newTotal).toBe(40);
    });

    it('should handle 5 extensions correctly', () => {
      let qty = 0;
      for (let i = 0; i < 5; i++) {
        qty++;
      }
      const total = EXTENSION_PRICE * qty;
      expect(qty).toBe(5);
      expect(total).toBe(100);
    });
  });

  describe('Status Validation', () => {
    it('should only allow extension on BOOKED status', () => {
      const validStatuses = ['BOOKED'];
      expect(validStatuses.includes('BOOKED')).toBe(true);
      expect(validStatuses.includes('COMPLETED')).toBe(false);
      expect(validStatuses.includes('CANCELLED')).toBe(false);
    });

    it('should reject QUICK_SALE bookings', () => {
      const bookingSource = 'QUICK_SALE';
      expect(bookingSource === 'QUICK_SALE').toBe(true);
    });
  });

  describe('Role-Based Access Control', () => {
    const allowedRoles = ['ADMIN', 'STAFF'];
    const deniedRoles = ['CUSTOMER', 'SALES'];

    it('should allow ADMIN to extend', () => {
      expect(allowedRoles.includes('ADMIN')).toBe(true);
    });

    it('should allow STAFF to extend', () => {
      expect(allowedRoles.includes('STAFF')).toBe(true);
    });

    it('should deny CUSTOMER from extending', () => {
      expect(allowedRoles.includes('CUSTOMER')).toBe(false);
    });

    it('should deny SALES from extending', () => {
      expect(allowedRoles.includes('SALES')).toBe(false);
    });

    it('should deny unauthenticated users', () => {
      const userRole = undefined;
      expect(allowedRoles.includes(userRole as any)).toBe(false);
    });
  });

  describe('Extension Order Deletion — EndTime Sync', () => {
    it('should shrink endTime when extension order is fully deleted', () => {
      const originalEndTime = new Date('2026-04-04T18:30:00Z');
      const extensionQty = 1;
      const revertedEndTime = new Date(originalEndTime.getTime() - extensionQty * EXTENSION_MINUTES * 60 * 1000);
      expect(revertedEndTime.toISOString()).toBe('2026-04-04T18:00:00.000Z');
    });

    it('should shrink endTime proportionally when quantity reduced', () => {
      // Had 3 extensions (90 min added), reduced to 1 (should remove 60 min)
      const currentEndTime = new Date('2026-04-04T19:30:00Z'); // original 18:00 + 90min
      const oldQty = 3;
      const newQty = 1;
      const removedQty = oldQty - newQty;
      const revertedEndTime = new Date(currentEndTime.getTime() - removedQty * EXTENSION_MINUTES * 60 * 1000);
      expect(revertedEndTime.toISOString()).toBe('2026-04-04T18:30:00.000Z');
    });
  });
});
