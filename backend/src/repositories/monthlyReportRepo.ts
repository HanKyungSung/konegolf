import { prisma } from '../lib/prisma';

export interface MonthlyReportData {
  period: { month: number; year: number; startDate: Date; endDate: Date };
  paymentTypes: { method: string; count: number; amount: number }[];
  salesBreakdown: {
    roomRevenue: number;
    menuSales: { category: string; count: number; amount: number }[];
    grossSales: number;
    totalDiscounts: number;
    netSales: number;
  };
  taxSummary: { taxRate: number; totalTax: number };
  tipsSummary: { totalTips: number; averageTip: number; tippedCount: number };
  operationalStats: {
    totalBookings: number;
    totalCustomers: number;
    totalInvoices: number;
    averageBookingValue: number;
    averageCustomerSpend: number;
    settledCount: number;
    settledAmount: number;
    openCount: number;
    openAmount: number;
  };
  discountDetail: { type: string; count: number; amount: number }[];
}

async function getGlobalTaxRate(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'global_tax_rate' },
  });
  return setting ? parseFloat(setting.value) / 100 : 0.13;
}

export async function getMonthlyReport(month: number, year: number): Promise<MonthlyReportData> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const dateFilter = { gte: startDate, lt: endDate };

  // ── 1. PAID INVOICES — single source of truth for revenue ──
  // Use booking startTime (not paidAt) so revenue aligns with the day the booking occurred
  const invoices = await prisma.invoice.findMany({
    where: { status: 'PAID', booking: { startTime: dateFilter } },
    select: {
      paymentMethod: true,
      totalAmount: true,
      subtotal: true,
      tax: true,
      tip: true,
      bookingId: true,
      seatIndex: true,
      payments: { select: { method: true, amount: true } },
    },
  });

  // Payment type breakdown from Payment records (accurate for split payments)
  const paymentMap = new Map<string, { count: number; amount: number }>();
  for (const inv of invoices) {
    if (inv.payments && inv.payments.length > 0) {
      for (const p of inv.payments) {
        const method = p.method || 'OTHER';
        const entry = paymentMap.get(method) || { count: 0, amount: 0 };
        entry.count++;
        entry.amount += Number(p.amount);
        paymentMap.set(method, entry);
      }
    } else {
      const method = inv.paymentMethod || 'OTHER';
      const entry = paymentMap.get(method) || { count: 0, amount: 0 };
      entry.count++;
      entry.amount += Number(inv.totalAmount);
      paymentMap.set(method, entry);
    }
  }
  const paymentTypes = Array.from(paymentMap.entries()).map(([method, data]) => ({
    method,
    ...data,
  }));

  // ── 2. SALES BREAKDOWN — derived from paid invoices → bookings → orders ──
  // Build set of (bookingId:seatIndex) for paid invoices so we only count
  // orders that actually belong to a paid seat
  const paidBookingIds = [
    ...new Set(invoices.map((inv) => inv.bookingId).filter((id): id is string => !!id)),
  ];
  const paidSeatSet = new Set(invoices.map((inv) => `${inv.bookingId}:${inv.seatIndex}`));

  const paidBookings = await prisma.booking.findMany({
    where: { id: { in: paidBookingIds } },
    select: { id: true, price: true, customerPhone: true },
  });

  // Get ALL orders for those bookings, then filter to paid seats only
  const allOrders = await prisma.order.findMany({
    where: { bookingId: { in: paidBookingIds } },
    include: { menuItem: { select: { category: true } } },
  });
  const paidSeatOrders = allOrders.filter((o) =>
    paidSeatSet.has(`${o.bookingId}:${o.seatIndex}`)
  );

  // Separate non-discount and discount orders
  const orders = paidSeatOrders.filter((o) => !o.discountType);
  const discountOrders = paidSeatOrders.filter((o) => !!o.discountType);

  // Separate HOURS (room) orders from menu orders for category breakdown
  const menuOrders = orders.filter(
    (o) => (o.menuItem?.category || '').toUpperCase() !== 'HOURS'
  );

  // Menu item sales by category (excluding HOURS since roomRevenue is separate)
  const categoryMap = new Map<string, { count: number; amount: number }>();
  for (const order of menuOrders) {
    const category = order.menuItem?.category || 'CUSTOM';
    const entry = categoryMap.get(category) || { count: 0, amount: 0 };
    entry.count += order.quantity;
    entry.amount += Number(order.totalPrice);
    categoryMap.set(category, entry);
  }
  const menuSales = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    ...data,
  }));

  const totalDiscounts = Math.abs(
    discountOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0)
  );

  const menuTotal = menuOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0);

  // Use invoice subtotals as authoritative net sales to guarantee
  // Grand Total = Payment Types Total (both derive from the same invoices)
  const netSales = invoices.reduce((sum, inv) => sum + Number(inv.subtotal), 0);

  // Derive room revenue so the breakdown always adds up:
  // roomRevenue = netSales + discounts - menuTotal
  // This captures both tracked HOURS orders AND untracked room charges
  // that went directly into invoices without an order row.
  const roomRevenue = Math.max(0, netSales + totalDiscounts - menuTotal);
  const grossSales = roomRevenue + menuTotal;

  // ── 3. TAX ──
  const taxRate = await getGlobalTaxRate();
  const totalTax = invoices.reduce((sum, inv) => sum + Number(inv.tax), 0);

  // ── 4. TIPS ──
  const tippedInvoices = invoices.filter((inv) => inv.tip && Number(inv.tip) > 0);
  const totalTips = invoices.reduce((sum, inv) => sum + Number(inv.tip || 0), 0);
  const averageTip = tippedInvoices.length > 0 ? totalTips / tippedInvoices.length : 0;

  // ── 5. OPERATIONAL STATS ──
  const uniqueCustomers = new Set(paidBookings.map((b) => b.customerPhone)).size;

  // Open (unpaid) invoices for completed bookings in this month
  const openInvoices = await prisma.invoice.findMany({
    where: {
      status: 'UNPAID',
      booking: { startTime: dateFilter, bookingStatus: 'COMPLETED' },
    },
    select: { totalAmount: true },
  });

  const settledAmount = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const openAmount = openInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // ── 6. DISCOUNT DETAIL ──
  const discountMap = new Map<string, { count: number; amount: number }>();
  for (const d of discountOrders) {
    const type = d.discountType || 'UNKNOWN';
    const entry = discountMap.get(type) || { count: 0, amount: 0 };
    entry.count++;
    entry.amount += Math.abs(Number(d.totalPrice));
    discountMap.set(type, entry);
  }
  const discountDetail = Array.from(discountMap.entries()).map(([type, data]) => ({
    type,
    ...data,
  }));

  return {
    period: { month, year, startDate, endDate },
    paymentTypes,
    salesBreakdown: { roomRevenue, menuSales, grossSales, totalDiscounts, netSales },
    taxSummary: { taxRate, totalTax },
    tipsSummary: { totalTips, averageTip, tippedCount: tippedInvoices.length },
    operationalStats: {
      totalBookings: paidBookings.length,
      totalCustomers: uniqueCustomers,
      totalInvoices: invoices.length,
      averageBookingValue: paidBookings.length > 0 ? netSales / paidBookings.length : 0,
      averageCustomerSpend: uniqueCustomers > 0 ? netSales / uniqueCustomers : 0,
      settledCount: invoices.length,
      settledAmount,
      openCount: openInvoices.length,
      openAmount,
    },
    discountDetail,
  };
}
