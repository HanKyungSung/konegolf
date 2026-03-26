import { Booking } from '@prisma/client';
import * as bookingRepo from './bookingRepo';
import * as invoiceRepo from './invoiceRepo';
import * as orderRepo from './orderRepo';
import { prisma } from '../lib/prisma';
import { toDateString, formatTime } from '../utils/timezone';

export interface ReceiptData {
  receiptNumber: string;
  bookingId: string;
  customer: {
    name: string;
    phone: string;
    email?: string | null;
  };
  business: {
    name: string;
    address: string;
    phone: string;
    taxId?: string;
  };
  booking: {
    date: string;
    startTime: string;
    endTime: string;
    duration: number;
    room: {
      name: string;
      rate: number;
    };
    players: number;
  };
  items: {
    roomCharge: {
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    };
    seats: Array<{
      seatIndex: number;
      orders: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
      discounts: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>;
      preDiscountSubtotal: number;
      subtotal: number;
    }>;
  };
  totals: {
    subtotal: string;
    tax: string;
    tip: string;
    grandTotal: string;
    taxRate: number;
  };
  payment: {
    method?: string | null;
    status: string;
    paidAt?: Date | null;
  };
  metadata: {
    generatedAt: Date;
    generatedBy?: string | null;
  };
}

/**
 * Generate a receipt number using the invoice or booking ID
 * This allows tracking receipts back to their source records
 */
function generateReceiptNumber(invoiceId?: string, bookingId?: string): string {
  // Use invoice ID for seat receipts, booking ID for full receipts
  return invoiceId || bookingId || 'UNKNOWN';
}

/**
 * Get comprehensive receipt data for a booking
 */
export async function getReceiptData(bookingId: string): Promise<ReceiptData> {
  // Get booking with related data
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: {
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },
      room: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  // Get all invoices for this booking
  const invoices = await invoiceRepo.getAllInvoices(bookingId);

  // Get all orders for this booking (with menu items)
  const allOrders = await prisma.order.findMany({
    where: { bookingId },
    include: { menuItem: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group orders by seat
  const seatOrders = new Map<number, typeof allOrders>();
  for (const order of allOrders) {
    if (order.seatIndex !== null) {
      const existing = seatOrders.get(order.seatIndex) || [];
      seatOrders.set(order.seatIndex, [...existing, order]);
    }
  }

  // Build seat data from orders
  const seats = Array.from(seatOrders.entries()).map(([seatIndex, orders]) => {
    const allItems = orders.map((order: any) => ({
      name: order.menuItem?.name || order.customItemName || 'Unknown Item',
      quantity: order.quantity,
      unitPrice: Number(order.unitPrice),
      total: Number(order.totalPrice),
    }));

    const regularItems = allItems.filter(item => item.total >= 0);
    const discountItems = allItems.filter(item => item.total < 0);
    const preDiscountSubtotal = regularItems.reduce((sum, item) => sum + item.total, 0);
    const subtotal = allItems.reduce((sum, item) => sum + item.total, 0);

    return {
      seatIndex,
      orders: regularItems,
      discounts: discountItems,
      preDiscountSubtotal,
      subtotal,
    };
  });

  // Calculate totals from invoices (which are already calculated and stored)
  const totalSubtotal = invoices.reduce((sum, inv) => sum + Number(inv.subtotal), 0);
  const totalTax = invoices.reduce((sum, inv) => sum + Number(inv.tax), 0);
  const totalTip = invoices.reduce((sum, inv) => sum + Number(inv.tip || 0), 0);
  const grandTotal = totalSubtotal + totalTax + totalTip;

  // Get tax rate from first invoice (they should all have same rate)
  const taxRateSetting = await prisma.setting.findUnique({
    where: { key: 'global_tax_rate' }
  });
  const taxRate = taxRateSetting ? parseFloat(taxRateSetting.value) : 13;

  // Determine payment status and method
  // Empty seats ($0 subtotal) don't need payment — treat them as effectively paid
  const paidInvoices = invoices.filter((inv) => inv.status === 'PAID');
  const chargedInvoices = invoices.filter((inv) => Number(inv.subtotal) > 0);
  const allPaid = invoices.length > 0 && (chargedInvoices.length === 0 || chargedInvoices.every((inv) => inv.status === 'PAID'));
  const paymentMethod = paidInvoices.length > 0 ? paidInvoices[0].paymentMethod : null;
  const paidAt = paidInvoices.length > 0 ? paidInvoices[0].paidAt : null;

  // Calculate booking duration in hours
  const startTime = new Date(booking.startTime);
  const endTime = new Date(booking.endTime);
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationHours = Math.round(durationMs / (1000 * 60 * 60));

  const receiptData: ReceiptData = {
    receiptNumber: generateReceiptNumber(undefined, booking.id),
    bookingId: booking.id,
    customer: {
      name: booking.customerName || booking.user?.name || 'Guest',
      phone: booking.customerPhone || booking.user?.phone || '',
      email: booking.customerEmail || booking.user?.email || null,
    },
    business: {
      name: 'K one Golf',
      address: '45 Keltic Dr, Unit 6, Sydney, NS B1S 1P4',
      phone: '(902) 270-2259',
      taxId: 'HST: 820374569 RT0001',
    },
    booking: {
      date: toDateString(startTime),
      startTime: formatTime(startTime),
      endTime: formatTime(endTime),
      duration: durationHours,
      room: {
        name: booking.room?.name || 'Unknown Room',
        rate: 35, // Keep for display but not used in calculation
      },
      players: booking.players,
    },
    items: {
      roomCharge: {
        description: '',
        quantity: 0,
        unitPrice: 0,
        total: 0,
      },
      seats,
    },
    totals: {
      subtotal: totalSubtotal.toFixed(2),
      tax: totalTax.toFixed(2),
      tip: totalTip.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
      taxRate,
    },
    payment: {
      method: paymentMethod,
      status: allPaid ? 'PAID' : invoices.length > 0 ? 'PARTIAL' : 'UNPAID',
      paidAt,
    },
    metadata: {
      generatedAt: new Date(),
      generatedBy: booking.createdBy,
    },
  };

  return receiptData;
}

/**
 * Get receipt data for a specific seat only
 */
export async function getSeatReceiptData(bookingId: string, seatIndex: number): Promise<ReceiptData> {
  const fullReceipt = await getReceiptData(bookingId);
  
  // Filter to only include the specified seat
  const seatData = fullReceipt.items.seats.find((s) => s.seatIndex === seatIndex);
  
  if (!seatData) {
    throw new Error(`Seat ${seatIndex} not found in booking`);
  }

  // Recalculate totals for just this seat
  const seatSubtotal = seatData.subtotal;
  const seatTax = (seatSubtotal * fullReceipt.totals.taxRate) / 100;
  
  // Get tip for this seat from invoice
  const invoice = await invoiceRepo.getInvoiceBySeat(bookingId, seatIndex);
  const seatTip = invoice ? Number(invoice.tip || 0) : 0;
  
  const seatTotal = seatSubtotal + seatTax + seatTip;

  return {
    ...fullReceipt,
    receiptNumber: invoice ? invoice.id : generateReceiptNumber(undefined, bookingId),
    items: {
      roomCharge: {
        description: '',
        quantity: 0,
        unitPrice: 0,
        total: 0,
      },
      seats: [seatData],
    },
    totals: {
      subtotal: seatSubtotal.toFixed(2),
      tax: seatTax.toFixed(2),
      tip: seatTip.toFixed(2),
      grandTotal: seatTotal.toFixed(2),
      taxRate: fullReceipt.totals.taxRate,
    },
  };
}
