import { Invoice, Payment } from '@prisma/client';
import * as orderRepo from './orderRepo';
import { prisma } from '../lib/prisma';

export interface InvoiceWithItems extends Invoice {
  orders?: any[];
  payments?: Payment[];
}

async function getGlobalTaxRate(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'global_tax_rate' }
  });
  return setting ? parseFloat(setting.value) / 100 : 0.13; // Default 13% if not set
}

export async function getInvoiceBySeat(bookingId: string, seatIndex: number): Promise<InvoiceWithItems | null> {
  const invoice = await prisma.invoice.findUnique({
    where: {
      bookingId_seatIndex: {
        bookingId,
        seatIndex,
      },
    },
    include: { payments: true },
  });

  if (!invoice) return null;

  // Get all orders for this seat
  const orders = await orderRepo.getOrdersForInvoice(bookingId, seatIndex);

  return {
    ...invoice,
    orders,
  };
}

export async function getAllInvoices(bookingId: string): Promise<InvoiceWithItems[]> {
  const invoices = await prisma.invoice.findMany({
    where: { bookingId },
    orderBy: { seatIndex: 'asc' },
    include: { payments: true },
  });

  // Fetch orders for each invoice
  const invoicesWithOrders = await Promise.all(
    invoices.map(async (invoice) => {
      const orders = await orderRepo.getOrdersForInvoice(bookingId, invoice.seatIndex);
      return {
        ...invoice,
        orders,
      };
    })
  );

  return invoicesWithOrders;
}

export async function recalculateInvoice(bookingId: string, seatIndex: number): Promise<Invoice> {
  // Get all orders for this seat
  const orders = await orderRepo.getOrdersForInvoice(bookingId, seatIndex);

  // Calculate totals from orders
  const subtotal = orders.reduce((sum, order) => sum + Number(order.totalPrice), 0);
  
  // Get current tax rate from settings
  const taxRate = await getGlobalTaxRate();
  const tax = subtotal * taxRate;

  // Get current invoice to preserve tip if any
  const currentInvoice = await prisma.invoice.findUnique({
    where: {
      bookingId_seatIndex: {
        bookingId,
        seatIndex,
      },
    },
  });

  const tip = currentInvoice?.tip || 0;
  const totalAmount = subtotal + tax + Number(tip || 0);

  // Upsert invoice (create if doesn't exist, update if it does)
  return prisma.invoice.upsert({
    where: {
      bookingId_seatIndex: {
        bookingId,
        seatIndex,
      },
    },
    create: {
      bookingId,
      seatIndex,
      subtotal: subtotal,
      tax: tax,
      tip: 0,
      totalAmount: totalAmount,
      status: 'UNPAID',
    },
    update: {
      subtotal: subtotal,
      tax: tax,
      totalAmount: totalAmount,
    },
  });
}

export interface PaymentInput {
  method: string; // CARD | CASH | GIFT_CARD
  amount: number;
}

export async function updateInvoicePayment(
  bookingId: string,
  seatIndex: number,
  paymentMethod: string,
  tip?: number,
  payments?: PaymentInput[]
): Promise<Invoice & { payments: Payment[] }> {
  // Get current invoice to calculate total
  const invoice = await prisma.invoice.findUnique({
    where: {
      bookingId_seatIndex: {
        bookingId,
        seatIndex,
      },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice not found for booking ${bookingId}, seat ${seatIndex}`);
  }

  const totalAmount = Number(invoice.subtotal) + Number(invoice.tax) + (tip || 0);

  // Delete any existing payment records for this invoice
  await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });

  // Determine payment records to create
  const paymentRecords = payments && payments.length > 1
    ? payments  // Split payment: use provided array
    : [{ method: paymentMethod, amount: totalAmount }]; // Single payment

  const effectiveMethod = paymentRecords.length > 1 ? 'SPLIT' : paymentMethod;

  const updated = await prisma.invoice.update({
    where: {
      bookingId_seatIndex: {
        bookingId,
        seatIndex,
      },
    },
    data: {
      status: 'PAID',
      paymentMethod: effectiveMethod,
      paidAt: new Date(),
      tip: tip,
      totalAmount: totalAmount,
      payments: {
        create: paymentRecords.map((p) => ({
          method: p.method,
          amount: p.amount,
        })),
      },
    },
    include: { payments: true },
  });

  return updated;
}

/**
 * Add a single partial payment to an invoice.
 * If total payments >= invoice total (subtotal + tax + tip), auto-mark as PAID.
 */
export async function addSinglePayment(
  bookingId: string,
  seatIndex: number,
  method: string,
  amount: number,
  tip?: number
): Promise<Invoice & { payments: Payment[] }> {
  const invoice = await prisma.invoice.findUnique({
    where: { bookingId_seatIndex: { bookingId, seatIndex } },
    include: { payments: true },
  });

  if (!invoice) {
    throw new Error(`Invoice not found for booking ${bookingId}, seat ${seatIndex}`);
  }

  // Update tip if provided (accumulates with any existing tip).
  // The tip is stored on the invoice for reporting, but the payment amount
  // from the frontend already includes the tip in the total.
  const newTip = tip && tip > 0 ? (Number(invoice.tip) || 0) + tip : Number(invoice.tip) || 0;
  const invoiceTotal = Number(invoice.subtotal) + Number(invoice.tax) + newTip;

  // Check existing payments against the new total (which includes tip)
  const existingPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.round((invoiceTotal - existingPaid) * 100) / 100;

  if (amount > remaining + 0.01) {
    throw new Error(`Payment amount ($${amount.toFixed(2)}) exceeds remaining balance ($${remaining.toFixed(2)})`);
  }

  // Clamp to remaining (handle rounding)
  const clampedAmount = Math.min(amount, remaining);

  // Create a single payment record for the full amount (includes tip)
  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      method,
      amount: clampedAmount,
    },
  });

  // Check if fully paid now
  const newTotalPaid = existingPaid + clampedAmount;
  const isFullyPaid = newTotalPaid >= invoiceTotal - 0.01;

  // Determine effective payment method
  const allPayments = [...invoice.payments, { method, amount: clampedAmount }];
  const uniqueMethods = new Set(allPayments.map(p => p.method));
  const effectiveMethod = uniqueMethods.size > 1 ? 'SPLIT' : method;

  const updated = await prisma.invoice.update({
    where: { bookingId_seatIndex: { bookingId, seatIndex } },
    data: {
      tip: newTip,
      totalAmount: invoiceTotal,
      ...(isFullyPaid ? {
        status: 'PAID',
        paymentMethod: effectiveMethod,
        paidAt: new Date(),
      } : {
        paymentMethod: effectiveMethod,
      }),
    },
    include: { payments: true },
  });

  return updated;
}

export async function checkAllInvoicesPaid(bookingId: string): Promise<boolean> {
  // Only count invoices with actual charges — empty seats (subtotal=0) don't need payment
  const unpaidCount = await prisma.invoice.count({
    where: {
      bookingId,
      status: 'UNPAID',
      subtotal: { gt: 0 },
    },
  });

  return unpaidCount === 0;
}

export async function getUnpaidInvoices(bookingId: string): Promise<Invoice[]> {
  return prisma.invoice.findMany({
    where: {
      bookingId,
      status: 'UNPAID',
    },
    orderBy: { seatIndex: 'asc' },
  });
}

export async function getPaidInvoices(bookingId: string): Promise<Invoice[]> {
  return prisma.invoice.findMany({
    where: {
      bookingId,
      status: 'PAID',
    },
    orderBy: { seatIndex: 'asc' },
  });
}

export async function getTotalRevenueForBooking(bookingId: string): Promise<number> {
  const result = await prisma.invoice.aggregate({
    where: {
      bookingId,
      status: 'PAID',
    },
    _sum: {
      totalAmount: true,
    },
  });

  return Number(result._sum.totalAmount || 0);
}
