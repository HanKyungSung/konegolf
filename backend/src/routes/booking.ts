import { Router } from 'express';
import { z } from 'zod';
import logger from '../lib/logger';
import { createBooking, addBookingOrderToSeat1, findConflict, listBookings, listUserBookings, listRoomBookingsBetween } from '../repositories/bookingRepo';
import { getBooking, cancelBooking, updatePaymentStatus, completeBooking, updateBookingStatus } from '../repositories/bookingRepo';
import * as orderRepo from '../repositories/orderRepo';
import * as invoiceRepo from '../repositories/invoiceRepo';
import { requireAuth } from '../middleware/requireAuth';
import { requireStaffOrAdmin } from '../middleware/requireRole';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sendBookingConfirmation } from '../services/emailService';
import { buildAtlanticDate, getAtlanticHourMinute } from '../utils/timezone';

const router = Router();

// Helper function to fetch operating hours from Settings table
async function getOperatingHours(): Promise<{ openMinutes: number; closeMinutes: number }> {
  const [openSetting, closeSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'operating_hours_open' } }),
    prisma.setting.findUnique({ where: { key: 'operating_hours_close' } }),
  ]);

  // Default to 10:00 AM - 12:00 AM if settings not found
  const openMinutes = openSetting ? parseInt(openSetting.value, 10) : 600;
  const closeMinutes = closeSetting ? parseInt(closeSetting.value, 10) : 1440;

  return { openMinutes, closeMinutes };
}

// Sync booking.price to the sum of all invoice totalAmounts (what the customer actually pays)
async function syncBookingPriceFromInvoices(bookingId: string) {
  const invoices = await prisma.invoice.findMany({ where: { bookingId } });
  const total = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  await prisma.booking.update({ where: { id: bookingId }, data: { price: total } });
}

function presentBooking(b: any) {
  return {
    id: b.id,
    roomId: b.roomId,
    userId: b.userId,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    customerEmail: b.customerEmail,
    startTime: b.startTime,
    endTime: b.endTime,
    players: b.players,
    price: b.price ? parseFloat(b.price.toString()) : 0,
    status: b.bookingStatus, // Keep uppercase: BOOKED, CANCELLED, COMPLETED
    bookingStatus: b.bookingStatus,
    bookingSource: b.bookingSource,
    internalNotes: b.internalNotes,
    paymentStatus: b.paymentStatus,
    billedAt: b.billedAt,
    paidAt: b.paidAt,
    paymentMethod: b.paymentMethod,
    tipAmount: b.tipAmount ? parseFloat(b.tipAmount.toString()) : 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    user: b.user ? {
      id: b.user.id,
      name: b.user.name,
      email: b.user.email,
      phone: b.user.phone,
      dateOfBirth: b.user.dateOfBirth ? new Date(b.user.dateOfBirth).toISOString().split('T')[0] : null,
    } : null,
  };
}

// Auth enforced for mutating and user-specific endpoints.

const createBookingSchema = z.object({
  roomId: z.string().uuid().or(z.string()),
  startTimeMs: z.number().int().positive('Invalid start time'), // milliseconds timestamp
  players: z.number().int().min(1).max(4),
  hours: z.number().int().min(1).max(4),
  timezone: z.string().optional(), // IANA timezone (e.g., "America/Halifax")
});

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const sortBy = (req.query.sortBy as 'startTime' | 'createdAt') || 'startTime';
  const order = (req.query.order as 'asc' | 'desc') || 'desc';
  const updatedAfter = req.query.updatedAfter as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  const result = await listBookings({ page, limit, sortBy, order, updatedAfter, startDate, endDate });
  
  res.json({
    bookings: result.bookings.map(presentBooking),
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

// Optional helper to fetch rooms (basic list)
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    res.json({ rooms });
  } catch (e) {
    req.log.error({ err: e }, 'Failed to load rooms');
    res.status(500).json({ error: 'Failed to load rooms' });
  }
});

// Get operating hours (from business settings)
router.get('/operating-hours', async (req, res) => {
  try {
    const [openSetting, closeSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'operating_hours_open' } }),
      prisma.setting.findUnique({ where: { key: 'operating_hours_close' } }),
    ]);

    if (!openSetting || !closeSetting) {
      return res.status(404).json({ error: 'Operating hours not configured' });
    }

    res.json({
      openMinutes: parseInt(openSetting.value, 10),
      closeMinutes: parseInt(closeSetting.value, 10),
    });
  } catch (e) {
    req.log.error({ err: e }, 'Failed to load operating hours');
    res.status(500).json({ error: 'Failed to load operating hours' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  const bookings = await listUserBookings(req.user!.id);
  res.json({ bookings: bookings.map(presentBooking) });
});

// Get bookings by room and date for timeline visualization
router.get('/by-room-date', async (req, res) => {
  const { roomId, date, startTime, endTime } = req.query as { roomId?: string; date?: string; startTime?: string; endTime?: string };
  
  if (!roomId) {
    return res.status(400).json({ error: 'roomId required' });
  }
  
  // Support both old format (date) and new format (startTime/endTime)
  if (!date && (!startTime || !endTime)) {
    return res.status(400).json({ error: 'Either date or startTime+endTime required' });
  }

  try {
    let dayStartUTC: Date;
    let dayEndUTC: Date;
    
    if (startTime && endTime) {
      // New format: Frontend sends UTC timestamps for day boundaries in browser timezone
      dayStartUTC = new Date(startTime);
      dayEndUTC = new Date(endTime);
    } else {
      // Old format: Date string (YYYY-MM-DD) - interpret as Atlantic timezone day
      const [y, m, d] = date!.split('-').map(Number);
      if (!y || !m || !d) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      dayStartUTC = buildAtlanticDate(y, m, d, 0, 0, 0);
      dayEndUTC = buildAtlanticDate(y, m, d, 23, 59, 59, 999);
    }

    // Fetch all bookings for this room (not cancelled, not quick sales)
    const allBookings = await prisma.booking.findMany({
      where: {
        roomId,
        bookingStatus: { not: 'CANCELLED' },
        bookingSource: { not: 'QUICK_SALE' },
      },
      orderBy: { startTime: 'asc' },
    });

    // Filter bookings where startTime falls within the requested time range
    const bookingsOnDate = allBookings.filter((b) => {
      return b.startTime >= dayStartUTC && b.startTime <= dayEndUTC;
    });

    // Return ISO strings - let frontend format in user's timezone
    const formattedBookings = bookingsOnDate.map((b) => ({
      id: b.id,
      roomId: b.roomId,
      date: date || startTime!.split('T')[0], // Use date if provided, otherwise extract from startTime
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      customerName: b.customerName || 'Guest',
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    req.log.error({ err: error }, 'Get by-room-date failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single booking by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const booking = await getBooking(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Include invoices with orders if requested
    let responseData: any = presentBooking(booking);
    
    if (req.query.includeInvoices === 'true') {
      const invoices = await invoiceRepo.getAllInvoices(id);
      responseData.invoices = invoices.map((inv) => ({
        id: inv.id,
        seatIndex: inv.seatIndex,
        subtotal: inv.subtotal,
        tax: inv.tax,
        tip: inv.tip,
        tipMethod: inv.tipMethod,
        totalAmount: inv.totalAmount,
        status: inv.status,
        paymentMethod: inv.paymentMethod,
        paidAt: inv.paidAt,
        orders: inv.orders || [],
      }));
    }

    res.json({ booking: responseData });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.id }, 'Get booking failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update booking status (staff or admin)
const updateStatusSchema = z.object({
  status: z.enum(['BOOKED', 'COMPLETED', 'CANCELLED']),
});

router.patch('/:id/status', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.flatten() 
      });
    }

    const { status } = parsed.data;

    const booking = await getBooking(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Business rules for status transitions
    if (status === 'CANCELLED') {
      // Cannot cancel completed bookings
      if (booking.bookingStatus === 'COMPLETED') {
        return res.status(400).json({ error: 'Cannot cancel completed bookings' });
      }
    }

    if (status === 'COMPLETED') {
      // Cannot complete cancelled bookings
      if (booking.bookingStatus === 'CANCELLED') {
        return res.status(400).json({ error: 'Cannot complete cancelled bookings' });
      }
    }

    // Update booking status
    const updated = await prisma.booking.update({
      where: { id },
      data: { 
        bookingStatus: status,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    req.log.info({ bookingId: id, from: booking.bookingStatus, to: status }, 'Booking status changed');

    return res.json({ 
      booking: presentBooking(updated),
      message: `Booking ${status.toLowerCase()} successfully` 
    });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.id }, 'Update booking status failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/bookings/:id/players - Update number of players
router.patch('/:id/players', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { id } = req.params;
  const { players } = req.body;

  try {
    if (!players || players < 1 || players > 10) {
      return res.status(400).json({ error: 'Players must be between 1 and 10' });
    }

    const booking = await getBooking(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update booking players
    const updated = await prisma.booking.update({
      where: { id },
      data: { 
        players,
        updatedAt: new Date(),
      },
    });

    return res.json({ 
      booking: presentBooking(updated),
      message: `Booking players updated to ${players}` 
    });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.id }, 'Update booking players failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel a booking (own bookings only for now)
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const booking = await getBooking(id);
    if (!booking) return res.status(404).json({ error: 'Not found' });
    if (booking.userId !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });
    // Rule: cannot cancel past or already canceled
    if (booking.bookingStatus === 'CANCELLED') return res.status(400).json({ error: 'Already canceled' });
    if (booking.startTime <= new Date()) return res.status(400).json({ error: 'Cannot cancel past bookings' });

    const updated = await cancelBooking(id);
    req.log.info({ bookingId: id, userId: req.user!.id }, 'Booking cancelled by customer');
    return res.json({ booking: presentBooking(updated) });
  } catch (e) {
    req.log.error({ err: e, bookingId: id }, 'Cancel booking failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { roomId, startTimeMs, players, hours, timezone } = parsed.data;

  // Fetch room for status/hours validation
  const room: any = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status && room.status !== 'ACTIVE') {
    return res.status(409).json({ error: 'Room not bookable (status)', status: room.status });
  }

  let start: Date;
  try {
    start = new Date(startTimeMs); // Convert milliseconds to Date
    if (isNaN(start.getTime())) throw new Error('Invalid date');
  } catch {
    return res.status(400).json({ error: 'Invalid startTimeMs' });
  }

  // Compute endTime for conflict detection
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);

  // Use timezone from FE or default to Atlantic Time
  const bookingTimezone = timezone || 'America/Halifax';

  // Convert timestamps to the specified timezone and extract hour components
  const getHourInTimezone = (date: Date, tz: string): number => {
    const timeStr = date.toLocaleString('en-US', { 
      timeZone: tz, 
      hour: 'numeric',
      hour12: false 
    });
    return parseInt(timeStr, 10);
  };

  const getDateComponents = (date: Date, tz: string) => {
    const parts = date.toLocaleString('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).split('/');
    return { month: parseInt(parts[0]), day: parseInt(parts[1]), year: parseInt(parts[2]) };
  };

  const startHour = getHourInTimezone(start, bookingTimezone);
  const endHour = getHourInTimezone(end, bookingTimezone);
  
  const startDate = getDateComponents(start, bookingTimezone);
  const endDate = getDateComponents(end, bookingTimezone);

  // Fetch operating hours from Settings
  const operatingHours = await getOperatingHours();
  const openHour = operatingHours.openMinutes / 60;
  const closeHour = operatingHours.closeMinutes / 60;
  
  // Check operating hours first (more fundamental constraint)
  if (startHour < openHour || endHour > closeHour) {
    return res.status(400).json({ error: 'Booking outside operating hours' });
  }

  // Check cross-day booking (compare end date with start date)
  if (endDate.year !== startDate.year || endDate.month !== startDate.month || endDate.day !== startDate.day) {
    return res.status(400).json({ error: 'Booking outside operating hours' });
  }

  // Rule: cannot book a past time slot
  const now = new Date();
  if (start.getTime() <= now.getTime()) {
    return res.status(400).json({ error: 'Cannot book a past time slot' });
  }

  // Conflict: overlap with any existing non-canceled booking in the same room
  const conflict = await findConflict(roomId, start, end);
  if (conflict) {
    return res.status(409).json({ error: 'Time slot overlaps an existing booking' });
  }

  const HOURLY_RATE = 35; // $35/hour (room rate)
  const price = hours * HOURLY_RATE; // decimal dollars

  try {
    const booking = await createBooking({
      roomId,
      userId: req.user!.id,
      customerName: (req.user as any).name || 'Guest',
      customerPhone: (req.user as any).phone || '111-111-1111',
      startTime: start,
      players,
      hours,
      price,
      bookingSource: 'ONLINE', // Web frontend bookings are always ONLINE
    });
    
    // Auto-add booking duration as order to seat 1
    await addBookingOrderToSeat1(booking.id, hours);
    
    // Send confirmation email with calendar attachment
    const userEmail = (req.user as any).email;
    if (userEmail) {
      try {
        // Extract date in customer's timezone, not UTC
        const dateInCustomerTz = start.toLocaleDateString('en-CA', { 
          timeZone: bookingTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }); // Returns YYYY-MM-DD format
        
        await sendBookingConfirmation({
          to: userEmail,
          customerName: (req.user as any).name || 'Guest',
          bookingId: booking.id,
          roomName: room.name,
          date: dateInCustomerTz,
          startTime: start,
          endTime: end,
          hours,
          price: price.toFixed(2),
          customerTimezone: bookingTimezone,
        });
        req.log.info({ email: userEmail }, 'Confirmation email sent');
      } catch (emailError) {
        // Log but don't fail the booking if email fails
        req.log.error({ err: emailError, email: userEmail }, 'Failed to send confirmation email');
      }
    }
    
    req.log.info({ bookingId: booking.id, userId: req.user!.id, roomId, hours, price }, 'Online booking created');
    res.status(201).json({ booking: presentBooking(booking) });
  } catch (e: any) {
    if (e.code === 'P2002') { // unique constraint
      return res.status(409).json({ error: 'Time slot already booked' });
    }
    req.log.error({ err: e }, 'Create booking failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Compute availability without a new table. Query params:
// roomId (string), date (YYYY-MM-DD, local), slotMinutes (default 30), openStart (e.g., "09:00"), openEnd (e.g., "23:00"), hours (desired continuous hours, 1-4)
router.get('/availability', async (req, res) => {
  const { roomId } = req.query as { roomId?: string };
  const dateStr = (req.query.date as string) || undefined;
  const slotMinutes = parseInt((req.query.slotMinutes as string) || '30', 10);
  const hours = Math.min(Math.max(parseInt((req.query.hours as string) || '1', 10) || 1, 1), 4);

  if (!roomId) return res.status(400).json({ error: 'roomId required' });
  if (!dateStr) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  if (!(slotMinutes > 0 && slotMinutes <= 120)) return res.status(400).json({ error: 'slotMinutes must be 1-120' });

  // Fetch room (hours + status)
  const room: any = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status && room.status !== 'ACTIVE') {
    return res.json({ meta: { roomId, date: dateStr, status: room.status, slots: 0 }, slots: [] });
  }

  // Build day window using Atlantic timezone for the provided date string.
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return res.status(400).json({ error: 'invalid date format' });

  function makeTime(hours24: number, minutes: number) {
    // Create a Date representing the specified wall-clock time in Atlantic timezone
    return buildAtlanticDate(y, m, d, hours24, minutes, 0);
  }

  // Fetch operating hours from Settings instead of room
  const operatingHours = await getOperatingHours();
  const minutesToHM = (mins: number) => ({ h: Math.floor(mins / 60), m: mins % 60 });
  const { h: openH, m: openM } = minutesToHM(operatingHours.openMinutes);
  const { h: closeH, m: closeM } = minutesToHM(operatingHours.closeMinutes);
  const dayOpen = makeTime(openH, openM);
  
  // Handle close time: if closeMinutes is 1440 (24:00), it means end of day (next day at 00:00)
  // Create the close time by adding minutes from dayOpen to handle wrap-around correctly
  const dayClose = new Date(dayOpen.getTime() + (operatingHours.closeMinutes - operatingHours.openMinutes) * 60 * 1000);
  
  if (!(dayClose.getTime() > dayOpen.getTime())) return res.status(500).json({ error: 'Invalid operating window' });

  // Fetch existing bookings that intersect the day window
  const existing = await listRoomBookingsBetween(roomId, dayOpen, dayClose);

  // Walk slots from open to close-slotWindow, mark available if the continuous window fits with no overlap
  const desiredMs = hours * 60 * 60 * 1000;
  const stepMs = slotMinutes * 60 * 1000;
  const lastStartAllowed = new Date(dayClose.getTime() - desiredMs);

  const slots: { startIso: string; endIso: string; available: boolean }[] = [];
  const now = new Date();
  for (let t = dayOpen.getTime(); t <= lastStartAllowed.getTime(); t += stepMs) {
    const s = new Date(t);
    const e = new Date(t + desiredMs);
    const overlaps = existing.some((b) => b.startTime < e && b.endTime > s);
    const futureStart = s.getTime() > now.getTime();
    slots.push({ startIso: s.toISOString(), endIso: e.toISOString(), available: futureStart && !overlaps });
  }

  res.json({
    meta: {
      roomId,
      openMinutes: operatingHours.openMinutes,
      closeMinutes: operatingHours.closeMinutes,
      status: room.status ?? 'ACTIVE',
      slotMinutes,
      hours,
    },
    slots,
  });
});

// Admin-only endpoint to update room status (operating hours moved to Settings)
const updateRoomSchema = z.object({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'CLOSED']).optional(),
});

router.patch('/rooms/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const parsed = updateRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { id } = req.params as { id: string };
  const data = parsed.data;
  
  try {
    const updated = await prisma.room.update({ where: { id }, data });
    req.log.info({ roomId: id, ...data }, 'Room updated');
    res.json({ room: updated });
  } catch (e) {
    req.log.error({ err: e, roomId: id, data }, 'Room update failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DEPRECATED: Old admin create endpoint - kept for reference but disabled
// Use the new /admin/create endpoint below that supports customerMode (existing/new/guest)
/*
const adminCreateBookingSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email('Valid email is required'),
  customerPhone: z.string().min(1, 'Customer phone is required'),
  roomId: z.string().uuid().or(z.string()),
  startTimeIso: z.string().datetime(),
  players: z.number().int().min(1).max(4),
  hours: z.number().int().min(1).max(4),
});

router.post('/admin/create-OLD', requireAuth, async (req, res) => {
  // Check if user is admin
  if ((req.user as any).role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const parsed = adminCreateBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { customerName, customerEmail, customerPhone, roomId, startTimeIso, players, hours } = parsed.data;

  // Fetch room for validation
  const room: any = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status && room.status !== 'ACTIVE') {
    return res.status(409).json({ error: 'Room not bookable (status)', status: room.status });
  }

  let start: Date;
  try {
    start = new Date(startTimeIso);
    if (isNaN(start.getTime())) throw new Error('Invalid date');
  } catch (e) {
    return res.status(400).json({ error: 'Invalid startTimeIso' });
  }

  const end = new Date(start.getTime() + hours * 3600 * 1000);

  // Check room hours against business operating hours (use Atlantic timezone)
  const operatingHours = await getOperatingHours();
  const startAtlantic = getAtlanticHourMinute(start);
  const endAtlantic = getAtlanticHourMinute(end);
  const startMinutes = startAtlantic.hour * 60 + startAtlantic.minute;
  const endMinutes = endAtlantic.hour * 60 + endAtlantic.minute;

  if (startMinutes < operatingHours.openMinutes || endMinutes > operatingHours.closeMinutes) {
    return res.status(400).json({
      error: 'Booking outside operating hours',
      operatingHours: { open: operatingHours.openMinutes, close: operatingHours.closeMinutes },
      bookingHours: { start: startMinutes, end: endMinutes },
    });
  }

  // Check for conflicts
  const conflict = await findConflict(roomId, start, end);
  if (conflict) {
    return res.status(409).json({ error: 'Time slot already booked', conflictingBooking: conflict.id });
  }

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email: customerEmail.toLowerCase() } });
  if (!user) {
    // Create a customer account for this walk-in/phone booking
    user = await (prisma.user as any).create({
      data: {
        email: customerEmail.toLowerCase(),
        name: customerName,
        phone: customerPhone,
        role: UserRole.CUSTOMER,
        emailVerifiedAt: new Date(), // Auto-verify for admin-created accounts
      },
    });
  }

  // Calculate price (basic: hourlyRate * hours, if available)
  const hourlyRate = 35; // TODO: Get from room or pricing config
  const price = hourlyRate * hours;

  try {
    const booking = await createBooking({
      roomId,
      userId: user!.id,
      customerName,
      customerPhone,
      startTime: start,
      endTime: end,
      players,
      price,
    });

    res.status(201).json({ booking: presentBooking(booking) });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Time slot already booked' });
    }
    console.error('[ADMIN CREATE BOOKING] Error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});
*/

/**
 * Phase 1.4: Admin Manual Booking Creation
 * POST /api/bookings/admin/create
 * 
 * Supports two customer modes:
 * 1. existing - Lookup existing customer by phone (returns customer profile)
 * 2. new - Create new customer profile + booking in transaction
 * 
 * NOTE: All bookings now require a User (customer profile). "Guest" bookings
 * are now customer profiles without login credentials (passwordHash: null).
 * This allows tracking customer history while maintaining flexibility.
 */

// Zod schemas for admin booking creation
const customerDataSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(1, 'Customer phone is required'),
  email: z.string().email().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
  password: z.string().min(1, 'Password is required'),
});

const guestDataSchema = z.object({
  name: z.string().min(1, 'Guest name is required'),
  phone: z.string().min(1, 'Guest phone is required'),
  email: z.string().email().optional().or(z.literal('')).transform(val => val === '' ? undefined : val),
});

const adminBookingSchema = z.object({
  // Customer mode
  customerMode: z.enum(['existing', 'new', 'guest']),
  customerPhone: z.string().optional(), // For existing mode
  newCustomer: customerDataSchema.optional(), // For new mode
  guest: guestDataSchema.optional(), // For guest mode
  
  // Booking details
  roomId: z.string().uuid().or(z.string()), // Accept UUID or simple string for mock rooms
  startTimeIso: z.string().datetime(),
  hours: z.number().int().min(1).max(8),
  players: z.number().int().min(1).max(4),
  
  // Booking source
  bookingSource: z.enum(['WALK_IN', 'PHONE']),
  
  // Optional overrides
  customPrice: z.number().positive().optional(),
  customTaxRate: z.number().min(0).max(1).optional(), // 0.13 = 13%
  internalNotes: z.string().optional(),
});

// Helper: Get global tax rate from settings
async function getGlobalTaxRate(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'global_tax_rate' },
  });
  return setting ? parseFloat(setting.value) / 100 : 0.13; // Default 13%
}

// Helper: Calculate price with tax
function calculatePricing(basePrice: number, taxRate: number) {
  const tax = basePrice * taxRate;
  const totalPrice = basePrice + tax;
  return {
    basePrice,
    taxRate,
    tax,
    totalPrice,
  };
}

// Note: Using requireStaffOrAdmin from middleware/requireRole.ts for admin booking operations

router.post('/admin/create', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    // Validate request body
    const parsed = adminBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.flatten() 
      });
    }

    const {
      customerMode,
      customerPhone,
      newCustomer,
      guest,
      roomId,
      startTimeIso,
      hours,
      players,
      bookingSource,
      customPrice,
      customTaxRate,
      internalNotes,
    } = parsed.data;

    // Validate mode-specific data
    if (customerMode === 'existing' && !customerPhone) {
      return res.status(400).json({ error: 'customerPhone required for existing mode' });
    }
    if (customerMode === 'new' && !newCustomer) {
      return res.status(400).json({ error: 'newCustomer data required for new mode' });
    }
    if (customerMode === 'guest' && !guest) {
      return res.status(400).json({ error: 'guest data required for guest mode' });
    }

    // Validate room exists and is active
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.status !== 'ACTIVE') {
      return res.status(400).json({ 
        error: 'Room not available for booking', 
        roomStatus: room.status 
      });
    }

    // Parse and validate times
    const startTime = new Date(startTimeIso);
    const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);

    // Check for time slot conflicts
    const conflict = await findConflict(roomId, startTime, endTime);
    if (conflict) {
      return res.status(409).json({
        error: 'Time slot conflict',
        conflictingBooking: {
          id: conflict.id,
          startTime: conflict.startTime,
          endTime: conflict.endTime,
        },
      });
    }

    // Calculate pricing
    const defaultHourlyRate = 35; // TODO: Get from room pricing config
    const basePrice = customPrice || (defaultHourlyRate * hours);
    const taxRate = customTaxRate !== undefined ? customTaxRate : await getGlobalTaxRate();
    const pricing = calculatePricing(basePrice, taxRate);

    // Import phone utilities
    const { normalizePhone } = await import('../utils/phoneUtils');

    let userId: string;
    let customerName: string;
    let customerPhoneNormalized: string;
    let customerEmail: string | undefined;
    let userCreated = false;

    // Handle customer modes
    if (customerMode === 'existing') {
      // Lookup existing customer profile
      const normalizedPhone = normalizePhone(customerPhone!);
      const user = await prisma.user.findUnique({
        where: { phone: normalizedPhone },
      });

      if (!user) {
        return res.status(404).json({ 
          error: 'Customer not found', 
          phone: normalizedPhone 
        });
      }

      // Take snapshot of current user data for this booking
      userId = user.id;
      customerName = user.name;
      customerPhoneNormalized = user.phone;
      customerEmail = user.email || undefined;

    } else if (customerMode === 'new') {
      // Create new customer account
      const normalizedPhone = normalizePhone(newCustomer!.phone);

      // Check for duplicate phone
      const existingUserByPhone = await prisma.user.findUnique({
        where: { phone: normalizedPhone },
      });

      if (existingUserByPhone) {
        return res.status(409).json({
          error: 'Phone number already registered',
          phone: normalizedPhone,
          userId: existingUserByPhone.id,
        });
      }

      // Check for duplicate email (if email is provided)
      if (newCustomer!.email) {
        const existingUserByEmail = await prisma.user.findUnique({
          where: { email: newCustomer!.email.toLowerCase() },
        });

        if (existingUserByEmail) {
          return res.status(409).json({
            error: 'Email already registered',
            email: newCustomer!.email,
            userId: existingUserByEmail.id,
          });
        }
      }

      // Create user + booking in transaction
      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name: newCustomer!.name,
            phone: normalizedPhone,
            email: newCustomer!.email || null,
            role: UserRole.CUSTOMER,
            registrationSource: bookingSource,
            registeredBy: req.user!.id,
            passwordHash: null, // No password initially
          },
        });

        const booking = await tx.booking.create({
          data: {
            roomId,
            userId: newUser.id,
            customerName: newUser.name,     // Snapshot at booking time
            customerPhone: newUser.phone,   // Snapshot at booking time
            customerEmail: newUser.email,   // Snapshot at booking time
            startTime,
            endTime,
            players,
            price: pricing.totalPrice,
            bookingStatus: 'BOOKED',
            paymentStatus: 'UNPAID',
            bookingSource,
            createdBy: req.user!.id,
            internalNotes,
          },
        });

        return { user: newUser, booking };
      });

      req.log.info({ bookingId: result.booking.id, userId: result.user.id, customerMode: 'new', bookingSource, total: pricing.totalPrice }, 'Admin booking created (new customer)');

      return res.status(201).json({
        booking: presentBooking(result.booking),
        userCreated: true,
        user: {
          id: result.user.id,
          name: result.user.name,
          phone: result.user.phone,
          email: result.user.email,
        },
        pricing: {
          basePrice: pricing.basePrice,
          taxRate: pricing.taxRate,
          tax: pricing.tax,
          totalPrice: pricing.totalPrice,
        },
        emailSent: false, // Placeholder for future feature
      });
    } else if (customerMode === 'guest') {
      // Create guest profile (no password, walk-in only)
      const normalizedPhone = normalizePhone(guest!.phone);

      // Check if user with this phone already exists
      const existingUser = await prisma.user.findUnique({
        where: { phone: normalizedPhone },
      });

      if (existingUser) {
        // Use existing profile for the booking
        userId = existingUser.id;
        customerName = existingUser.name;
        customerPhoneNormalized = existingUser.phone;
        customerEmail = existingUser.email || undefined;
      } else {
        // Create guest profile + booking in transaction
        const result = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              name: guest!.name,
              phone: normalizedPhone,
              email: guest!.email || null,
              role: UserRole.CUSTOMER,
              registrationSource: bookingSource,
              registeredBy: req.user!.id,
              passwordHash: null, // Guest - no login
            },
          });

          const booking = await tx.booking.create({
            data: {
              roomId,
              userId: newUser.id,
              customerName: newUser.name,
              customerPhone: newUser.phone,
              customerEmail: newUser.email,
              startTime,
              endTime,
              players,
              price: pricing.totalPrice,
              bookingStatus: 'BOOKED',
              paymentStatus: 'UNPAID',
              bookingSource,
              createdBy: req.user!.id,
              internalNotes,
            },
          });

          return { user: newUser, booking };
        });

        req.log.info({ bookingId: result.booking.id, userId: result.user.id, customerMode: 'guest', bookingSource, total: pricing.totalPrice }, 'Admin booking created (guest)');

        return res.status(201).json({
          booking: presentBooking(result.booking),
          userCreated: true,
          user: {
            id: result.user.id,
            name: result.user.name,
            phone: result.user.phone,
            email: result.user.email,
          },
          pricing: {
            basePrice: pricing.basePrice,
            taxRate: pricing.taxRate,
            tax: pricing.tax,
            totalPrice: pricing.totalPrice,
          },
          emailSent: false,
        });
      }
    } else {
      // This should never happen due to Zod validation, but TypeScript needs this
      return res.status(400).json({ error: 'Invalid customer mode' });
    }

    // Create booking for existing customer (customerMode === 'existing')
    const booking = await prisma.booking.create({
      data: {
        roomId,
        userId,
        customerName,                      // Snapshot from current User data
        customerPhone: customerPhoneNormalized,  // Snapshot from current User data
        customerEmail,                     // Snapshot from current User data
        startTime,
        endTime,
        players,
        price: pricing.totalPrice,
        bookingStatus: 'BOOKED',
        paymentStatus: 'UNPAID',
        bookingSource,
        createdBy: req.user!.id,
        internalNotes,
      },
    });

    req.log.info({ bookingId: booking.id, userId, customerMode: 'existing', bookingSource, total: pricing.totalPrice }, 'Admin booking created (existing customer)');

    res.status(201).json({
      booking: presentBooking(booking),
      userCreated: false,
      pricing: {
        basePrice: pricing.basePrice,
        taxRate: pricing.taxRate,
        tax: pricing.tax,
        totalPrice: pricing.totalPrice,
      },
      emailSent: false, // Placeholder for future feature
    });

  } catch (error: any) {
    req.log.error({ err: error }, 'Admin create booking failed');
    
    // Handle Prisma errors
    if (error.code === 'P2002') {
      // Log detailed information about which field caused the duplicate
      req.log.error({ target: error.meta?.target, payload: req.body }, 'P2002 Duplicate constraint violation');
      
      return res.status(409).json({ 
        error: 'Duplicate constraint violation',
        field: error.meta?.target,
        details: `A record with this ${error.meta?.target?.join(', ')} already exists`
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Update payment status endpoint (admin only)
const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PAID']),
  paymentMethod: z.enum(['CARD', 'CASH', 'GIFT_CARD']).optional(),
  tipAmount: z.number().optional(),
});

router.patch('/:id/payment-status', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { id } = req.params as { id: string };
  
  try {
    const parsed = updatePaymentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.flatten() 
      });
    }

    const { paymentStatus, paymentMethod, tipAmount } = parsed.data;

    const booking = await getBooking(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Set timestamps based on payment status
    const now = new Date();
    const paidAt = paymentStatus === 'PAID' ? now : null;

    const updated = await updatePaymentStatus(id, {
      paymentStatus,
      paidAt: paidAt ?? undefined,
    });

    req.log.info({ bookingId: id, paymentStatus, paymentMethod }, 'Booking payment status updated');

    return res.json({ booking: presentBooking(updated) });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.id }, 'Update payment status failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Phase 1.3.4: New Invoice & Order Endpoints
// ============================================

// POST /api/bookings/:bookingId/orders - Add order to booking
const createOrderSchema = z.object({
  menuItemId: z.string().min(1).optional(), // Optional for custom items
  customItemName: z.string().min(1).optional(), // Required when menuItemId is null
  customItemPrice: z.number().optional(), // Required when menuItemId is null (negative for discounts)
  seatIndex: z.number().int().min(1).max(4).optional(), // null for shared orders
  quantity: z.number().int().min(1),
  discountType: z.enum(['FLAT', 'PERCENT']).optional(), // Non-null = discount order
}).refine(
  (data) => {
    // Discount orders use customItemName + negative customItemPrice + discountType
    if (data.discountType) {
      return !!data.customItemName && data.customItemPrice !== undefined && data.customItemPrice < 0;
    }
    // Either menuItemId OR (customItemName + customItemPrice) must be provided
    const hasMenuItem = !!data.menuItemId;
    const hasCustomItem = !!data.customItemName && data.customItemPrice !== undefined;
    return hasMenuItem !== hasCustomItem; // XOR: exactly one must be true
  },
  {
    message: 'Either menuItemId OR (customItemName + customItemPrice) must be provided. Discounts require discountType and negative price.',
  }
);

router.post('/:bookingId/orders', requireAuth, async (req, res) => {
  const { bookingId } = req.params;
  
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { menuItemId, customItemName, customItemPrice, seatIndex, quantity, discountType } = parsed.data;

    // Verify booking exists
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify seatIndex is valid (1 to players count)
    if (seatIndex && (seatIndex < 1 || seatIndex > booking.players)) {
      return res.status(400).json({
        error: `Invalid seat index. Must be between 1 and ${booking.players}`,
      });
    }

    let unitPrice: number;
    
    // Handle custom item or regular menu item
    if (menuItemId) {
      // Regular menu item
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: menuItemId },
      });

      if (!menuItem) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      
      unitPrice = Number(menuItem.price);
    } else {
      // Custom item
      unitPrice = customItemPrice!;
    }

    // Create order
    const order = await orderRepo.createOrder({
      bookingId,
      menuItemId,
      customItemName,
      customItemPrice,
      seatIndex: seatIndex || undefined,
      quantity,
      unitPrice,
      discountType: discountType || undefined,
    });

    req.log.info({ orderId: order.id, bookingId, seatIndex, menuItemId, customItemName, quantity, unitPrice, total: Number(order.totalPrice) }, 'Order added');

    // Recalculate invoice if seat-specific
    if (seatIndex) {
      const updatedInvoice = await invoiceRepo.recalculateInvoice(bookingId, seatIndex);
      await syncBookingPriceFromInvoices(bookingId);
      return res.status(201).json({
        order: {
          id: order.id,
          bookingId: order.bookingId,
          menuItemId: order.menuItemId,
          seatIndex: order.seatIndex,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          totalPrice: order.totalPrice,
          createdAt: order.createdAt,
        },
        updatedInvoice: {
          id: updatedInvoice.id,
          seatIndex: updatedInvoice.seatIndex,
          subtotal: updatedInvoice.subtotal,
          tax: updatedInvoice.tax,
          tip: updatedInvoice.tip,
          totalAmount: updatedInvoice.totalAmount,
          status: updatedInvoice.status,
          paymentMethod: updatedInvoice.paymentMethod,
        },
      });
    }

    return res.status(201).json({
      order: {
        id: order.id,
        bookingId: order.bookingId,
        menuItemId: order.menuItemId,
        seatIndex: order.seatIndex,
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.bookingId }, 'Create order failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/bookings/orders/:orderId - Update order quantity
router.patch('/orders/:orderId', requireAuth, async (req, res) => {
  const { orderId } = req.params;
  const { quantity } = req.body;

  try {
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    // Get order to know booking and seat for recalc
    const order = await orderRepo.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { bookingId, seatIndex } = order;

    // Update order
    const updatedOrder = await orderRepo.updateOrder(orderId, quantity);
    req.log.info({ orderId, bookingId, seatIndex, quantity }, 'Order updated');

    // Recalculate invoice if seat-specific
    if (seatIndex) {
      const updatedInvoice = await invoiceRepo.recalculateInvoice(bookingId, seatIndex);
      await syncBookingPriceFromInvoices(bookingId);
      return res.json({
        order: updatedOrder,
        updatedInvoice: {
          id: updatedInvoice.id,
          seatIndex: updatedInvoice.seatIndex,
          subtotal: updatedInvoice.subtotal,
          tax: updatedInvoice.tax,
          tip: updatedInvoice.tip,
          totalAmount: updatedInvoice.totalAmount,
          status: updatedInvoice.status,
          paymentMethod: updatedInvoice.paymentMethod,
        },
      });
    }

    return res.json({ order: updatedOrder });
  } catch (error) {
    req.log.error({ err: error, orderId: req.params.orderId }, 'Update order failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/bookings/orders/:orderId - Delete order
router.delete('/orders/:orderId', requireAuth, async (req, res) => {
  const { orderId } = req.params;

  try {
    // Get order to know booking and seat for recalc
    const order = await orderRepo.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { bookingId, seatIndex } = order;

    // If this is a coupon discount order, revert the coupon back to ACTIVE
    if (order.customItemName && order.customItemName.startsWith('🎟️') && order.discountType === 'FLAT' && Number(order.unitPrice) < 0) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          redeemedBookingId: bookingId,
          redeemedSeatNumber: seatIndex,
          status: 'REDEEMED',
        },
      });
      if (coupon) {
        await prisma.coupon.update({
          where: { id: coupon.id },
          data: {
            status: 'ACTIVE',
            redeemedAt: null,
            redeemedBookingId: null,
            redeemedSeatNumber: null,
          },
        });
        req.log.info({ couponCode: coupon.code, couponId: coupon.id }, 'Reverted coupon back to ACTIVE');
      }
    }

    // Delete order
    await orderRepo.deleteOrder(orderId);
    req.log.info({ orderId, bookingId, seatIndex, unitPrice: Number(order.unitPrice), customItemName: order.customItemName }, 'Order deleted');

    // Recalculate invoice if seat-specific
    if (seatIndex) {
      const updatedInvoice = await invoiceRepo.recalculateInvoice(bookingId, seatIndex);
      await syncBookingPriceFromInvoices(bookingId);
      return res.json({
        success: true,
        updatedInvoice: {
          id: updatedInvoice.id,
          seatIndex: updatedInvoice.seatIndex,
          subtotal: updatedInvoice.subtotal,
          tax: updatedInvoice.tax,
          tip: updatedInvoice.tip,
          totalAmount: updatedInvoice.totalAmount,
          status: updatedInvoice.status,
          paymentMethod: updatedInvoice.paymentMethod,
        },
      });
    }

    return res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error, orderId: req.params.orderId }, 'Delete order failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bookings/:bookingId/invoices - Get all invoices for booking
router.get('/:bookingId/invoices', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const invoices = await invoiceRepo.getAllInvoices(bookingId);

    const formatted = invoices.map((inv) => ({
      id: inv.id,
      bookingId: inv.bookingId,
      seatIndex: inv.seatIndex,
      subtotal: inv.subtotal,
      tax: inv.tax,
      tip: inv.tip,
      tipMethod: inv.tipMethod,
      totalAmount: inv.totalAmount,
      status: inv.status,
      paymentMethod: inv.paymentMethod,
      paidAt: inv.paidAt,
      orders: inv.orders || [],
      payments: (inv.payments || []).map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
      })),
    }));

    return res.json({ invoices: formatted });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.bookingId }, 'Get invoices failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/invoices/:invoiceId/pay - Mark invoice as paid
const payInvoiceSchema = z.object({
  bookingId: z.string().uuid(),
  seatIndex: z.number().int().min(1).max(4),
  paymentMethod: z.enum(['CARD', 'CASH', 'GIFT_CARD', 'SPLIT']),
  tip: z.number().nonnegative().optional(),
  payments: z.array(z.object({
    method: z.enum(['CARD', 'CASH', 'GIFT_CARD']),
    amount: z.number().positive(),
  })).optional(),
});

router.patch('/invoices/:invoiceId/pay', requireAuth, async (req, res) => {
  const { invoiceId } = req.params;

  try {
    const parsed = payInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { bookingId, seatIndex, paymentMethod, tip, payments } = parsed.data;

    // Validate split payments sum matches total
    if (paymentMethod === 'SPLIT' && payments && payments.length > 1) {
      // Get the invoice to verify amounts
      const invoice = await prisma.invoice.findUnique({
        where: { bookingId_seatIndex: { bookingId, seatIndex } },
      });
      if (invoice) {
        const expectedTotal = Number(invoice.subtotal) + Number(invoice.tax) + (tip || 0);
        const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
        // Allow small rounding tolerance (1 cent)
        if (Math.abs(paymentsTotal - expectedTotal) > 0.01) {
          return res.status(400).json({
            error: `Split payments total ($${paymentsTotal.toFixed(2)}) does not match invoice total ($${expectedTotal.toFixed(2)})`,
          });
        }
      }
    }

    // Verify booking exists
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update invoice payment
    const updatedInvoice = await invoiceRepo.updateInvoicePayment(
      bookingId,
      seatIndex,
      paymentMethod,
      tip,
      payments
    );

    // Check if all invoices are now paid
    const allPaid = await invoiceRepo.checkAllInvoicesPaid(bookingId);

    if (allPaid) {
      // Update booking payment status
      await updatePaymentStatus(bookingId, {
        paymentStatus: 'PAID',
        paidAt: new Date(),
      });
    }

    req.log.info({ invoiceId, bookingId, seatIndex, paymentMethod, tip: tip || 0, total: Number(updatedInvoice.totalAmount), allPaid, paymentsCount: updatedInvoice.payments.length }, 'Invoice paid');

    return res.json({
      invoice: {
        id: updatedInvoice.id,
        seatIndex: updatedInvoice.seatIndex,
        subtotal: updatedInvoice.subtotal,
        tax: updatedInvoice.tax,
        tip: updatedInvoice.tip,
        totalAmount: updatedInvoice.totalAmount,
        status: updatedInvoice.status,
        paymentMethod: updatedInvoice.paymentMethod,
        paidAt: updatedInvoice.paidAt,
        payments: updatedInvoice.payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
        })),
      },
      bookingPaymentStatus: allPaid ? 'PAID' : 'UNPAID',
    });
  } catch (error) {
    req.log.error({ err: error, invoiceId: req.params.invoiceId }, 'Pay invoice failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bookings/invoices/:invoiceId/add-payment - Add a single partial payment
const addPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  seatIndex: z.number().int().min(1).max(4),
  method: z.enum(['CARD', 'CASH', 'GIFT_CARD']),
  amount: z.number().positive(),
  tip: z.number().nonnegative().optional(),
  tipMethod: z.enum(['CARD', 'CASH']).optional(),
});

router.post('/invoices/:invoiceId/add-payment', requireAuth, async (req, res) => {
  const { invoiceId } = req.params;

  try {
    const parsed = addPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { bookingId, seatIndex, method, amount, tip, tipMethod } = parsed.data;

    // Verify booking exists
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Add the payment
    const updatedInvoice = await invoiceRepo.addSinglePayment(
      bookingId,
      seatIndex,
      method,
      amount,
      tip,
      tipMethod
    );

    // Check if all invoices are now paid
    const allPaid = await invoiceRepo.checkAllInvoicesPaid(bookingId);

    if (allPaid) {
      await updatePaymentStatus(bookingId, {
        paymentStatus: 'PAID',
        paidAt: new Date(),
      });
    }

    const totalPaid = updatedInvoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const invoiceTotal = Number(updatedInvoice.subtotal) + Number(updatedInvoice.tax) + Number(updatedInvoice.tip || 0);
    const remaining = Math.max(0, Math.round((invoiceTotal - totalPaid) * 100) / 100);

    req.log.info({ invoiceId, bookingId, seatIndex, method, amount, remaining, status: updatedInvoice.status }, 'Payment added');

    return res.json({
      invoice: {
        id: updatedInvoice.id,
        seatIndex: updatedInvoice.seatIndex,
        subtotal: updatedInvoice.subtotal,
        tax: updatedInvoice.tax,
        tip: updatedInvoice.tip,
        totalAmount: updatedInvoice.totalAmount,
        status: updatedInvoice.status,
        paymentMethod: updatedInvoice.paymentMethod,
        paidAt: updatedInvoice.paidAt,
        payments: updatedInvoice.payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
        })),
      },
      remaining,
      bookingPaymentStatus: allPaid ? 'PAID' : 'UNPAID',
    });
  } catch (error) {
    req.log.error({ err: error, invoiceId: req.params.invoiceId }, 'Add payment failed');
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// PATCH /api/bookings/invoices/:invoiceId/unpay - Cancel payment/refund invoice
const unpayInvoiceSchema = z.object({
  bookingId: z.string().uuid(),
});

router.patch('/invoices/:invoiceId/unpay', requireAuth, async (req, res) => {
  const { invoiceId } = req.params;

  try {
    const parsed = unpayInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { bookingId } = parsed.data;

    // Verify booking exists
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'PAID') {
      return res.status(400).json({ error: 'Invoice is not paid' });
    }

    // Reset invoice to unpaid and delete payment records
    await prisma.payment.deleteMany({ where: { invoiceId } });
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'UNPAID',
        paymentMethod: null,
        paidAt: null,
        tip: null,
      },
    });

    // Recalculate totals without tip
    const recalculated = await invoiceRepo.recalculateInvoice(bookingId, updatedInvoice.seatIndex);

    // Update booking payment status to UNPAID since at least one invoice is now unpaid
    await updatePaymentStatus(bookingId, {
      paymentStatus: 'UNPAID',
      paidAt: undefined,
    });

    req.log.info({ invoiceId, bookingId, seatIndex: invoice.seatIndex, previousMethod: invoice.paymentMethod }, 'Invoice payment cancelled');

    return res.json({
      invoice: {
        id: recalculated.id,
        seatIndex: recalculated.seatIndex,
        subtotal: recalculated.subtotal,
        tax: recalculated.tax,
        tip: recalculated.tip,
        totalAmount: recalculated.totalAmount,
        status: recalculated.status,
        paymentMethod: recalculated.paymentMethod,
        paidAt: recalculated.paidAt,
        payments: [],
      },
      bookingPaymentStatus: 'UNPAID',
    });
  } catch (error) {
    req.log.error({ err: error, invoiceId: req.params.invoiceId }, 'Unpay invoice failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/bookings/:bookingId/payment-status - Get payment status for booking
router.get('/:bookingId/payment-status', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const invoices = await invoiceRepo.getAllInvoices(bookingId);
    const totalRevenue = await invoiceRepo.getTotalRevenueForBooking(bookingId);

    const seats = invoices.map((inv) => ({
      seatIndex: inv.seatIndex,
      paid: inv.status === 'PAID',
      totalAmount: inv.totalAmount,
      paymentMethod: inv.paymentMethod,
      paidAt: inv.paidAt,
    }));

    const allPaid = invoices.every((inv) => inv.status === 'PAID');
    const remaining = invoices
      .filter((inv) => inv.status === 'UNPAID')
      .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

    return res.json({
      seats,
      allPaid,
      remaining: remaining,
      totalRevenue: totalRevenue,
    });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.bookingId }, 'Get payment status failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/bookings/:bookingId/complete - Mark booking as complete
router.post('/:bookingId/complete', requireAuth, async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check all invoices are paid
    const allPaid = await invoiceRepo.checkAllInvoicesPaid(bookingId);
    if (!allPaid) {
      return res.status(400).json({
        error: 'Cannot complete booking. Not all invoices are paid.',
      });
    }

    // Mark booking as completed
    const completed = await completeBooking(bookingId);
    req.log.info({ bookingId }, 'Booking completed');

    return res.json({
      booking: presentBooking(completed),
      message: 'Booking marked as completed',
    });
  } catch (error) {
    req.log.error({ err: error, bookingId: req.params.bookingId }, 'Complete booking failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as bookingRouter };
