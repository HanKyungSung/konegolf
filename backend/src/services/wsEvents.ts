/**
 * Typed WS event helpers.
 *
 * Keeps route handlers clean — each mutation site calls a single-line helper
 * instead of constructing an event envelope by hand. Every helper calls
 * `eventBus.emit(...)` under the hood; the WS manager fans out to staff/admin
 * clients.
 *
 * All calls are fire-and-forget (non-blocking). Emission failures are caught
 * internally so they never break the HTTP response.
 */

import { eventBus } from './eventBus';
import logger from '../lib/logger';

// ---------------------------------------------------------------------------
// Event payload shapes
// ---------------------------------------------------------------------------

export type BookingEventPayload = {
  bookingId: string;
  roomId?: string;
  fromStatus?: string;
  toStatus?: string;
  /** Free-form marker: 'created' | 'updated' | 'cancelled' | 'completed' | 'players' | 'extend' */
  change?: string;
};

export type PaymentEventPayload = {
  bookingId: string;
  paymentId?: string;
  invoiceId?: string;
  status?: string;
};

export type OrderEventPayload = {
  bookingId: string;
  orderId: string;
  change: 'created' | 'updated' | 'deleted';
};

export type ReceiptEventPayload = {
  paymentId: string;
  bookingId?: string;
  /** Used by FE to adjust rail badge count without refetch. */
  countDelta?: 1 | -1;
  matchStatus?: string;
};

export type TimeclockEventPayload = {
  entryId?: string;
  employeeId?: string;
  change: 'clocked_in' | 'clocked_out' | 'edited';
};

export type RoomEventPayload = {
  roomId: string;
  change: 'updated';
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

interface Actor { id?: string; role?: string }

function actor(user: any): { userId: string; role: string } | undefined {
  if (!user?.id) return undefined;
  return { userId: user.id, role: String(user.role ?? '') };
}

function safeEmit(fn: () => void, type: string): void {
  try {
    fn();
  } catch (err) {
    logger.error({ err, type }, 'wsEvents: emit failed (non-fatal)');
  }
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export function emitBookingCreated(user: Actor | any, payload: BookingEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'booking.created',
      payload: { ...payload, change: 'created' },
      actor: actor(user),
      scope: { bookingId: payload.bookingId, roomId: payload.roomId },
      audience: 'staff',
    }),
  'booking.created');
}

export function emitBookingStatusChanged(user: Actor | any, payload: BookingEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'booking.status_changed',
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId, roomId: payload.roomId },
      audience: 'staff',
    }),
  'booking.status_changed');
}

export function emitBookingCancelled(user: Actor | any, payload: BookingEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'booking.cancelled',
      payload: { ...payload, change: 'cancelled' },
      actor: actor(user),
      scope: { bookingId: payload.bookingId, roomId: payload.roomId },
      audience: 'staff',
    }),
  'booking.cancelled');
}

export function emitBookingCompleted(user: Actor | any, payload: BookingEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'booking.completed',
      payload: { ...payload, change: 'completed' },
      actor: actor(user),
      scope: { bookingId: payload.bookingId, roomId: payload.roomId },
      audience: 'staff',
    }),
  'booking.completed');
}

export function emitBookingUpdated(user: Actor | any, payload: BookingEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'booking.updated',
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId, roomId: payload.roomId },
      audience: 'staff',
    }),
  'booking.updated');
}

// ---------------------------------------------------------------------------
// Payment / Invoice
// ---------------------------------------------------------------------------

export function emitPaymentStatusChanged(user: Actor | any, payload: PaymentEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'payment.status_changed',
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'payment.status_changed');
}

export function emitInvoicePaid(user: Actor | any, payload: PaymentEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'invoice.paid',
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'invoice.paid');
}

export function emitInvoiceUnpaid(user: Actor | any, payload: PaymentEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'invoice.unpaid',
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'invoice.unpaid');
}

export function emitInvoicePaymentAdded(user: Actor | any, payload: PaymentEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'invoice.payment_added',
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'invoice.payment_added');
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export function emitOrderChanged(user: Actor | any, payload: OrderEventPayload): void {
  const type = `order.${payload.change}`;
  safeEmit(() =>
    eventBus.emit({
      type,
      payload,
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  type);
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export function emitReceiptUploaded(user: Actor | any, payload: ReceiptEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'receipt.uploaded',
      payload: { ...payload, countDelta: 1 },
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'receipt.uploaded');
}

export function emitReceiptDeleted(user: Actor | any, payload: ReceiptEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'receipt.deleted',
      payload: { ...payload, countDelta: -1 },
      actor: actor(user),
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'receipt.deleted');
}

export function emitReceiptAnalysisComplete(payload: ReceiptEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'receipt.analysis_complete',
      payload,
      scope: { bookingId: payload.bookingId },
      audience: 'staff',
    }),
  'receipt.analysis_complete');
}

// ---------------------------------------------------------------------------
// Timeclock
// ---------------------------------------------------------------------------

export function emitTimeclockEvent(user: Actor | any, payload: TimeclockEventPayload): void {
  const type = `timeclock.${payload.change}`;
  safeEmit(() =>
    eventBus.emit({
      type,
      payload,
      actor: actor(user),
      audience: 'staff',
    }),
  type);
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export function emitRoomUpdated(user: Actor | any, payload: RoomEventPayload): void {
  safeEmit(() =>
    eventBus.emit({
      type: 'room.updated',
      payload,
      actor: actor(user),
      scope: { roomId: payload.roomId },
      audience: 'staff',
    }),
  'room.updated');
}
