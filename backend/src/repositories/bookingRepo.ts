import { Booking } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateBookingInput {
  roomId: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  startTime: Date;
  endTime?: Date; // Optional, will compute from hours if not provided
  players: number;
  hours?: number; // Optional if endTime provided
  price: number | string; // stored as Decimal(10,2) in DB
  bookingSource?: string; // Optional: "ONLINE" | "WALK_IN" | "PHONE"
}

// Compute endTime: independent hours selection
function computeEnd(startTime: Date, hours: number): Date {
  return new Date(startTime.getTime() + hours * 60 * 60 * 1000);
}

const HOURLY_RATE = 35; // $35 per hour (room rate, not per player)

async function getGlobalTaxRate(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'global_tax_rate' },
  });
  return setting ? parseFloat(setting.value) / 100 : 0.13; // Default 13% if not set
}

export async function findConflict(roomId: string, startTime: Date, endTime: Date) {
  return prisma.booking.findFirst({
    where: {
      roomId,
      bookingStatus: { not: 'CANCELLED' },
      bookingSource: { not: 'QUICK_SALE' }, // Quick sales don't reserve rooms
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    orderBy: { startTime: 'asc' },
  });
}

export async function createBooking(data: CreateBookingInput): Promise<Booking> {
  const endTime = data.endTime || (data.hours ? computeEnd(data.startTime, data.hours) : new Date(data.startTime.getTime() + 3600000));
  
  // Calculate price if not provided: hours × $35/hour (room rate)
  let price = data.price;
  if (!price && data.hours) {
    price = data.hours * HOURLY_RATE;
  }
  
  // Create booking with empty invoices (one per seat)
  // Room booking cost will be added as an Order item to seat 1 separately
  return prisma.booking.create({
    data: {
      roomId: data.roomId,
      userId: data.userId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      startTime: data.startTime,
      endTime,
      players: data.players,
      price: price,
      bookingStatus: 'BOOKED',
      paymentStatus: 'UNPAID',
      bookingSource: data.bookingSource || 'ONLINE',
      // Auto-create empty invoices for each seat (orders will be added later)
      invoices: {
        create: Array.from({ length: data.players }, (_, i) => ({
          seatIndex: i + 1,
          subtotal: 0,
          tax: 0,
          totalAmount: 0,
          status: 'UNPAID',
        })),
      },
    },
    include: { invoices: true },
  });
}

/**
 * Add booking duration as an order item to seat 1
 * This is called after creating a booking to add the room rental cost as a menu item order
 */
export async function addBookingOrderToSeat1(bookingId: string, hours: number): Promise<void> {
  // Find the menu item for this duration
  const menuItemId = `hour-${hours}`;
  
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
  });
  
  if (!menuItem) {
    throw new Error(`Menu item not found for ${hours} hour(s): ${menuItemId}`);
  }
  
  // Create order for seat 1
  const order = await prisma.order.create({
    data: {
      bookingId,
      menuItemId: menuItem.id,
      seatIndex: 1,
      quantity: 1,
      unitPrice: menuItem.price,
      totalPrice: menuItem.price,
    },
  });
  
  // Recalculate invoice for seat 1
  const orders = await prisma.order.findMany({
    where: { bookingId, seatIndex: 1 },
  });
  
  const subtotal = orders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
  const taxRate = await getGlobalTaxRate();
  const tax = subtotal * taxRate;
  const totalAmount = subtotal + tax;
  
  await prisma.invoice.update({
    where: {
      bookingId_seatIndex: {
        bookingId,
        seatIndex: 1,
      },
    },
    data: {
      subtotal,
      tax,
      totalAmount,
    },
  });
}

export interface PaginatedBookings {
  bookings: Booking[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListBookingsOptions {
  page?: number;
  limit?: number;
  sortBy?: 'startTime' | 'createdAt';
  order?: 'asc' | 'desc';
  updatedAfter?: string; // ISO timestamp for incremental sync
  startDate?: string; // ISO timestamp for date range filter
  endDate?: string; // ISO timestamp for date range filter
}

export async function listBookings(options?: ListBookingsOptions): Promise<PaginatedBookings> {
  const page = options?.page || 1;
  const limit = options?.limit || 10;
  const sortBy = options?.sortBy || 'startTime';
  const order = options?.order || 'desc';
  const updatedAfter = options?.updatedAfter;
  const startDate = options?.startDate;
  const endDate = options?.endDate;

  const skip = (page - 1) * limit;
  
  // Build where clause
  const where: any = {};
  
  // Incremental sync filter
  if (updatedAfter) {
    where.updatedAt = { gt: new Date(updatedAfter) };
  }
  
  // Date range filter (for POS dashboard)
  if (startDate || endDate) {
    where.startTime = {};
    if (startDate) {
      where.startTime.gte = new Date(startDate);
    }
    if (endDate) {
      where.startTime.lte = new Date(endDate);
    }
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
    }),
    prisma.booking.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    bookings,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function listUserBookings(userId: string): Promise<Booking[]> {
  return prisma.booking.findMany({ where: { userId }, orderBy: { startTime: 'asc' } });
}

// List bookings for a specific room that intersect a given time range
export async function listRoomBookingsBetween(
  roomId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<Booking[]> {
  return prisma.booking.findMany({
    where: {
      roomId,
      // overlap condition: booking.start < rangeEnd AND booking.end > rangeStart
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
      bookingStatus: { not: 'CANCELLED' },
      bookingSource: { not: 'QUICK_SALE' }, // Quick sales don't reserve rooms
    },
    orderBy: { startTime: 'asc' },
  });
}

export async function getBooking(id: string): Promise<Booking | null> {
  return prisma.booking.findUnique({ 
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          dateOfBirth: true,
        }
      }
    }
  }) as any;
}

export async function cancelBooking(id: string): Promise<Booking> {
  // Only allow cancellation from BOOKED state
  return prisma.booking.update({
    where: { id },
    data: { bookingStatus: 'CANCELLED' },
  });
}

export async function completeBooking(id: string): Promise<Booking> {
  return prisma.booking.update({
    where: { id },
    data: {
      bookingStatus: 'COMPLETED',
      completedAt: new Date(),
    },
  });
}

export async function markBookingExpired(id: string): Promise<Booking> {
  return prisma.booking.update({
    where: { id },
    data: {
      bookingStatus: 'EXPIRED',
    },
  });
}

export async function updateBookingStatus(
  id: string,
  bookingStatus: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
): Promise<Booking> {
  return prisma.booking.update({
    where: { id },
    data: { bookingStatus },
  });
}

// Update payment status (marks booking as PAID when all invoices paid)
export interface UpdatePaymentStatusInput {
  paymentStatus: 'UNPAID' | 'PAID';
  paidAt?: Date;
}

export async function updatePaymentStatus(
  id: string,
  data: UpdatePaymentStatusInput
): Promise<Booking> {
  return prisma.booking.update({
    where: { id },
    data: {
      paymentStatus: data.paymentStatus,
      paidAt: data.paidAt,
    },
  });
}
