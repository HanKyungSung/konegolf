import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import logger from '../lib/logger';
import { normalizePhone } from '../utils/phoneUtils';
import { requireAuth } from '../middleware/requireAuth';
import { addBookingOrderToSeat1 } from '../repositories/bookingRepo';
import { requireStaffOrAdmin } from '../middleware/requireRole';

const router = Router();

// Admin-only account used for quick sales (no real customer)
const QUICK_SALE_EMAIL = 'admin@konegolf.ca';
const QUICK_SALE_PHONE = '+11111111111';

// Admin check middleware
function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Simplified booking creation endpoint
 * - Admin only
 * - Phone-based customer lookup
 * - Auto-links to existing user or creates guest booking
 */

const createBookingSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  customerPhone: z.string().min(10, 'Phone number is required'),
  customerEmail: z.string().email().optional().or(z.literal('')),
  roomId: z.string().uuid('Invalid room ID'),
  startTimeMs: z.number().int().positive('Invalid start time'), // milliseconds timestamp
  duration: z.number().int().min(1).max(4, 'Duration must be 1-4 hours'),
  players: z.number().int().min(1).max(4, 'Players must be 1-4'),
  bookingSource: z.enum(['ONLINE', 'WALK_IN', 'PHONE']),
  price: z.number().optional(),
  internalNotes: z.string().optional(),
});

router.post('/create', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Validate input
    const data = createBookingSchema.parse(req.body);
    
    // Normalize phone number
    const normalizedPhone = normalizePhone(data.customerPhone);
    
    // Look up existing user by phone
    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    
    // Check if room exists and is active
    const room = await prisma.room.findUnique({
      where: { id: data.roomId },
    });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (room.status !== 'ACTIVE') {
      return res.status(400).json({ 
        error: 'Room is not available',
        details: `Room status: ${room.status}`,
      });
    }
    
    // Calculate end time from milliseconds timestamp
    const startTime = new Date(data.startTimeMs); // Convert milliseconds to Date
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + data.duration);
    
    // Check for booking conflicts (exclude quick sales — they don't reserve rooms)
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        roomId: data.roomId,
        bookingStatus: { not: 'CANCELLED' },
        bookingSource: { not: 'QUICK_SALE' },
        OR: [
          {
            // New booking starts during existing booking
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } },
            ],
          },
          {
            // New booking ends during existing booking
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } },
            ],
          },
          {
            // New booking encompasses existing booking
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } },
            ],
          },
        ],
      },
    });
    
    if (conflictingBooking) {
      // Format conflict times in Atlantic Time for error message
      const conflictStart = new Date(conflictingBooking.startTime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Halifax'
      });
      const conflictEnd = new Date(conflictingBooking.endTime).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Halifax'
      });
      return res.status(409).json({
        error: 'Time slot conflict',
        details: `This room is already booked from ${conflictStart} to ${conflictEnd} AST`,
        conflictingBooking: {
          id: conflictingBooking.id,
          startTime: conflictingBooking.startTime,
          endTime: conflictingBooking.endTime,
        },
      });
    }
    
    // Calculate price (if not provided)
    const price = data.price ?? (35 * data.duration); // $35/hour default
    
    // Get admin user ID from request
    const adminId = (req as any).user?.id;
    
    // Create booking
    const booking = await prisma.booking.create({
      data: {
        userId: existingUser?.id ?? undefined, // Link to user if found, undefined for guest
        customerName: data.customerName,
        customerPhone: normalizedPhone,
        customerEmail: data.customerEmail || null,
        roomId: data.roomId,
        startTime,
        endTime,
        players: data.players,
        price,
        bookingStatus: 'BOOKED',
        paymentStatus: 'UNPAID',
        bookingSource: data.bookingSource,
        createdBy: adminId,
        internalNotes: data.internalNotes || null,
      },
      include: {
        room: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    
    // Auto-create empty invoices for each seat (1 per player)
    // Start at 0, orders will be added later
    const invoicePromises = [];
    for (let seatIndex = 1; seatIndex <= data.players; seatIndex++) {
      invoicePromises.push(
        prisma.invoice.create({
          data: {
            bookingId: booking.id,
            seatIndex,
            subtotal: 0,
            tax: 0,
            tip: null,
            totalAmount: 0,
            status: 'UNPAID',
            paymentMethod: null,
            paidAt: null,
          },
        })
      );
    }
    
    await Promise.all(invoicePromises);
    
    // Auto-add booking duration as order to seat 1
    await addBookingOrderToSeat1(booking.id, data.duration);
    
    req.log.info({ bookingId: booking.id, customerName: data.customerName, roomId: data.roomId, players: data.players, source: data.bookingSource }, 'Simple booking created');
    return res.status(201).json({
      success: true,
      booking,
      isNewCustomer: !existingUser,
      linkedToUser: !!existingUser,
      invoicesCreated: data.players,
    });
    
  } catch (error: any) {
    req.log.error({ err: error }, 'Booking create failed');
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    
    return res.status(500).json({
      error: 'Failed to create booking',
      details: error.message,
    });
  }
});

/**
 * POST /api/bookings/simple/quick-sale
 * Creates a quick-sale booking (no room time charge).
 * Auto-assigns admin account, first available room, current time, 1 hour, $0 price.
 * Skips conflict check. Creates 1 empty invoice (seat 1).
 * Staff + Admin.
 */
router.post('/quick-sale', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const staffUser = (req as any).user;
    const staffId = staffUser?.id;
    const staffName = staffUser?.name || 'Staff';

    // Pick the first active room (placeholder — quick sales don't actually reserve rooms)
    const room = await prisma.room.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });

    if (!room) {
      return res.status(500).json({ error: 'No active rooms found' });
    }

    // Current time → +1 hour (placeholder, no real time significance)
    const now = new Date();
    const endTime = new Date(now);
    endTime.setHours(endTime.getHours() + 1);

    // Create booking — no conflict check, $0 price, bookingSource = QUICK_SALE
    // Link to the staff/admin who created it (not a dummy admin account)
    const booking = await prisma.booking.create({
      data: {
        userId: staffId,
        customerName: 'Quick Sale',
        customerPhone: staffUser?.phone || QUICK_SALE_PHONE,
        customerEmail: staffUser?.email || null,
        roomId: room.id,
        startTime: now,
        endTime,
        players: 1,
        price: 0,
        bookingStatus: 'BOOKED',
        paymentStatus: 'UNPAID',
        bookingSource: 'QUICK_SALE',
        createdBy: staffId,
        internalNotes: 'Quick sale — items only, no room time.',
      },
      include: {
        room: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // Create 1 empty invoice (seat 1) — no hourly charge
    await prisma.invoice.create({
      data: {
        bookingId: booking.id,
        seatIndex: 1,
        subtotal: 0,
        tax: 0,
        tip: null,
        totalAmount: 0,
        status: 'UNPAID',
        paymentMethod: null,
        paidAt: null,
      },
    });

    req.log.info({ bookingId: booking.id, staffId }, 'Quick sale booking created');
    return res.status(201).json({
      success: true,
      booking,
    });
  } catch (error: any) {
    req.log.error({ err: error }, 'Quick sale create failed');
    return res.status(500).json({
      error: 'Failed to create quick sale',
      details: error.message,
    });
  }
});

export default router;
