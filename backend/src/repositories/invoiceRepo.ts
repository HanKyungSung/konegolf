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
  // Delegate to recalculateAllInvoices for consistent tax distribution
  const invoices = await recalculateAllInvoices(bookingId);
  const updated = invoices.find(inv => inv.seatIndex === seatIndex);
  if (!updated) {
    throw new Error(`Invoice not found for booking ${bookingId}, seat ${seatIndex}`);
  }
  return updated;
}

/**
 * Recalculate ALL invoices for a booking with proper tax distribution.
 * Tax is computed once on the total subtotal, then distributed across seats
 * using the largest remainder method to avoid rounding errors.
 */
export async function recalculateAllInvoices(bookingId: string): Promise<Invoice[]> {
  // Get all invoices for this booking
  const existingInvoices = await prisma.invoice.findMany({
    where: { bookingId },
    orderBy: { seatIndex: 'asc' },
  });

  // Also get all orders to find seats that may not have invoices yet
  const allOrders = await prisma.order.findMany({
    where: { bookingId, seatIndex: { not: null } },
  });

  // Determine all seat indices that need invoices (from existing invoices + orders)
  const seatIndicesFromInvoices = existingInvoices.map(inv => inv.seatIndex);
  const seatIndicesFromOrders = [...new Set(allOrders.filter(o => o.seatIndex !== null).map(o => o.seatIndex!))];
  const allSeatIndices = [...new Set([...seatIndicesFromInvoices, ...seatIndicesFromOrders])].sort((a, b) => a - b);

  if (allSeatIndices.length === 0) return [];

  // Get tax rate once
  const taxRate = await getGlobalTaxRate();

  // Calculate subtotal for each seat
  const seatData: { seatIndex: number; subtotal: number; tip: number }[] = [];
  for (const seatIndex of allSeatIndices) {
    const orders = await orderRepo.getOrdersForInvoice(bookingId, seatIndex);
    const subtotal = orders.reduce((sum, order) => sum + Number(order.totalPrice), 0);
    const existingInv = existingInvoices.find(inv => inv.seatIndex === seatIndex);
    seatData.push({
      seatIndex,
      subtotal,
      tip: Number(existingInv?.tip || 0),
    });
  }

  // Calculate total tax on the combined subtotal (single source of truth)
  const totalSubtotal = seatData.reduce((sum, s) => sum + s.subtotal, 0);
  const totalTaxRaw = totalSubtotal * taxRate;
  const totalTaxCents = Math.round(totalTaxRaw * 100); // Round once to cents

  // Distribute tax to each seat using largest remainder method
  const seatTaxRaw = seatData.map(s => s.subtotal * taxRate * 100); // in cents, unrounded
  const seatTaxFloored = seatTaxRaw.map(t => Math.floor(t));
  let remainderCents = totalTaxCents - seatTaxFloored.reduce((sum, t) => sum + t, 0);

  // Sort by largest fractional remainder, give extra cent to those seats
  const indices = seatData.map((_, i) => i);
  indices.sort((a, b) => (seatTaxRaw[b] - seatTaxFloored[b]) - (seatTaxRaw[a] - seatTaxFloored[a]));
  for (const idx of indices) {
    if (remainderCents <= 0) break;
    seatTaxFloored[idx]++;
    remainderCents--;
  }

  // Upsert each invoice (create if new seat, update if existing)
  const updatedInvoices: Invoice[] = [];
  for (let i = 0; i < seatData.length; i++) {
    const { seatIndex, subtotal, tip } = seatData[i];
    const tax = seatTaxFloored[i] / 100; // Convert back to dollars
    const totalAmount = subtotal + tax + tip;

    const updated = await prisma.invoice.upsert({
      where: {
        bookingId_seatIndex: { bookingId, seatIndex },
      },
      create: {
        bookingId,
        seatIndex,
        subtotal,
        tax,
        tip: 0,
        totalAmount,
        status: 'UNPAID',
      },
      update: {
        subtotal,
        tax,
        totalAmount,
      },
    });
    updatedInvoices.push(updated);
  }

  return updatedInvoices;
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
  payments?: PaymentInput[],
  tipMethod?: string
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
  let paymentRecords: { method: string; amount: number }[];
  if (payments && payments.length > 1) {
    paymentRecords = payments; // Split payment: use provided array
  } else if (tip && tip > 0 && tipMethod && tipMethod !== paymentMethod) {
    // Tip method differs from payment method: create two records
    const mainAmount = Math.round((totalAmount - tip) * 100) / 100;
    paymentRecords = [];
    if (mainAmount > 0) {
      paymentRecords.push({ method: paymentMethod, amount: mainAmount });
    }
    paymentRecords.push({ method: tipMethod, amount: tip });
  } else {
    paymentRecords = [{ method: paymentMethod, amount: totalAmount }]; // Single payment
  }

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
      tipMethod: tip && tip > 0 ? (tipMethod || paymentMethod) : null,
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
  tip?: number,
  tipMethod?: string
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

  // If tip method differs from payment method, split into two payment records
  const newPayments: { method: string; amount: number }[] = [];
  if (tip && tip > 0 && tipMethod && tipMethod !== method) {
    // Separate: main payment (amount minus tip) + tip payment
    const mainAmount = Math.round((clampedAmount - tip) * 100) / 100;
    if (mainAmount > 0) {
      newPayments.push({ method, amount: mainAmount });
    }
    newPayments.push({ method: tipMethod, amount: tip });
  } else {
    newPayments.push({ method, amount: clampedAmount });
  }

  // Create payment record(s)
  for (const pay of newPayments) {
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        method: pay.method,
        amount: pay.amount,
      },
    });
  }

  // Check if fully paid now
  const newTotalPaid = existingPaid + clampedAmount;
  const isFullyPaid = newTotalPaid >= invoiceTotal - 0.01;

  // Determine effective payment method
  const allPayments = [...invoice.payments, ...newPayments];
  const uniqueMethods = new Set(allPayments.map(p => p.method));
  const effectiveMethod = uniqueMethods.size > 1 ? 'SPLIT' : method;

  // Determine effective tipMethod:
  // - If tipMethod is explicitly provided, use it
  // - If tip is provided but no tipMethod, default to the payment method
  // - If no new tip, preserve existing tipMethod
  const effectiveTipMethod = tip && tip > 0
    ? (tipMethod || method)
    : invoice.tipMethod || null;

  const updated = await prisma.invoice.update({
    where: { bookingId_seatIndex: { bookingId, seatIndex } },
    data: {
      tip: newTip,
      tipMethod: effectiveTipMethod,
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
