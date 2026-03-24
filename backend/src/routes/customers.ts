/**
 * Customer Management API Routes
 * 
 * Admin-only endpoints for customer CRUD operations and metrics.
 * Designed to be extensible for future metrics and filters.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin, requireSalesOrAbove } from '../middleware/requireRole';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { normalizePhone, validatePhone } from '../utils/phoneUtils';
import { todayRange, monthRange, dayRange, getAtlanticComponents, toDateString } from '../utils/timezone';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/customers/metrics
 * 
 * Get customer metrics for dashboard cards.
 * Extensible: Add new metrics by adding to the response object.
 */
router.get('/metrics', requireSalesOrAbove, async (req, res) => {
  try {
    const now = new Date();
    // Use Atlantic timezone for all date boundaries
    const atlanticNow = getAtlanticComponents(now);
    const thisMonth = monthRange(atlanticNow.year, atlanticNow.month);
    const startOfMonth = thisMonth.start;
    const lastMonthNum = atlanticNow.month === 1 ? 12 : atlanticNow.month - 1;
    const lastMonthYear = atlanticNow.month === 1 ? atlanticNow.year - 1 : atlanticNow.year;
    const lastMonth = monthRange(lastMonthYear, lastMonthNum);
    const startOfLastMonth = lastMonth.start;
    const endOfLastMonth = lastMonth.end;
    
    // Total customers
    const totalCustomers = await prisma.user.count({
      where: { role: UserRole.CUSTOMER }
    });
    
    // New customers this month
    const newThisMonth = await prisma.user.count({
      where: {
        role: UserRole.CUSTOMER,
        createdAt: { gte: startOfMonth }
      }
    });
    
    // New customers last month (for comparison)
    const newLastMonth = await prisma.user.count({
      where: {
        role: UserRole.CUSTOMER,
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth
        }
      }
    });
    
    // Upcoming birthdays (next 30 days)
    const upcomingBirthdays = await getUpcomingBirthdays(30);
    
    // Active customers (booked in last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeCustomers = await prisma.user.count({
      where: {
        role: UserRole.CUSTOMER,
        bookings: {
          some: {
            startTime: { gte: thirtyDaysAgo }
          }
        }
      }
    });

    // Today's bookings count (Atlantic timezone)
    const today = todayRange();
    const todayStart = today.start;
    const todayEnd = today.end;
    const todaysBookings = await prisma.booking.count({
      where: {
        startTime: { gte: todayStart, lt: todayEnd },
        bookingStatus: { not: 'CANCELLED' }
      }
    });

    // Monthly revenue (this month)
    const monthlyRevenueData = await prisma.booking.aggregate({
      where: {
        startTime: { gte: startOfMonth },
        bookingStatus: { not: 'CANCELLED' }
      },
      _sum: { price: true }
    });
    const monthlyRevenue = Number(monthlyRevenueData._sum.price || 0);
    
    // Top spender this month
    const topSpenderData = await prisma.booking.groupBy({
      by: ['userId'],
      where: {
        startTime: { gte: startOfMonth },
        userId: { not: null },
        bookingStatus: { not: 'CANCELLED' }
      },
      _sum: { price: true },
      orderBy: { _sum: { price: 'desc' } },
      take: 1
    });
    
    let topSpender = null;
    if (topSpenderData.length > 0 && topSpenderData[0].userId) {
      const user = await prisma.user.findUnique({
        where: { id: topSpenderData[0].userId },
        select: { name: true }
      });
      topSpender = {
        name: user?.name || 'Unknown',
        amount: Number(topSpenderData[0]._sum.price || 0)
      };
    }

    return res.json({
      metrics: {
        totalCustomers,
        newThisMonth,
        newLastMonth,
        monthOverMonthChange: newLastMonth > 0 
          ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
          : newThisMonth > 0 ? 100 : 0,
        upcomingBirthdays: upcomingBirthdays.length,
        activeCustomers,
        topSpender,
        todaysBookings,
        monthlyRevenue
      },
      // Detailed data for expandable sections
      birthdayList: upcomingBirthdays.slice(0, 10) // Top 10 upcoming
    });
  } catch (error) {
    req.log.error({ err: error }, 'Customer metrics failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/customers/revenue-history
 * 
 * Get monthly revenue and booking data for the past 12 months.
 * Used for the revenue trend chart on the admin dashboard.
 */
router.get('/revenue-history', requireSalesOrAbove, async (req, res) => {
  try {
    const now = new Date();
    const atlanticNow = getAtlanticComponents(now);
    const months: Array<{
      month: string;
      year: number;
      monthNum: number;
      revenue: number;
      cashRevenue: number;
      cardRevenue: number;
      giftCardRevenue: number;
      otherRevenue: number;
      bookingCount: number;
      completedCount: number;
      cancelledCount: number;
      averageBookingValue: number;
    }> = [];

    // Calculate data for each of the past 12 months (Atlantic timezone boundaries)
    for (let i = 11; i >= 0; i--) {
      let mMonth = atlanticNow.month - i;
      let mYear = atlanticNow.year;
      while (mMonth <= 0) { mMonth += 12; mYear--; }
      const range = monthRange(mYear, mMonth);
      const monthStart = range.start;
      const monthEnd = range.end;

      // Get revenue, booking counts, and payment method breakdown for this month
      // Revenue = sum of paid invoices from COMPLETED bookings (actual money collected for finished sessions)
      const [revenueData, bookingStats, paymentBreakdown, completedBookingCount] = await Promise.all([
        prisma.invoice.aggregate({
          where: {
            status: 'PAID',
            booking: {
              startTime: { gte: monthStart, lte: monthEnd },
              bookingStatus: 'COMPLETED'
            }
          },
          _sum: { totalAmount: true },
        }),
        prisma.booking.groupBy({
          by: ['bookingStatus'],
          where: {
            startTime: { gte: monthStart, lte: monthEnd }
          },
          _count: true
        }),
        prisma.invoice.groupBy({
          by: ['paymentMethod'],
          where: {
            status: 'PAID',
            booking: {
              startTime: { gte: monthStart, lte: monthEnd },
              bookingStatus: 'COMPLETED'
            }
          },
          _sum: { totalAmount: true }
        }),
        prisma.booking.count({
          where: {
            startTime: { gte: monthStart, lte: monthEnd },
            bookingStatus: 'COMPLETED'
          }
        })
      ]);

      const revenue = Number(revenueData._sum.totalAmount || 0);
      const bookingCount = completedBookingCount;
      const completedCount = bookingStats.find(s => s.bookingStatus === 'COMPLETED')?._count || 0;
      const cancelledCount = bookingStats.find(s => s.bookingStatus === 'CANCELLED')?._count || 0;
      const cashRevenue = Number(paymentBreakdown.find(p => p.paymentMethod === 'CASH')?._sum.totalAmount || 0);
      const cardRevenue = Number(paymentBreakdown.find(p => p.paymentMethod === 'CARD')?._sum.totalAmount || 0);
      const giftCardRevenue = Number(paymentBreakdown.find(p => p.paymentMethod === 'GIFT_CARD')?._sum.totalAmount || 0);
      const otherRevenue = Math.max(0, revenue - cashRevenue - cardRevenue - giftCardRevenue);

      const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.push({
        month: MONTH_NAMES[mMonth - 1],
        year: mYear,
        monthNum: mMonth,
        revenue,
        cashRevenue,
        cardRevenue,
        giftCardRevenue,
        otherRevenue,
        bookingCount,
        completedCount,
        cancelledCount,
        averageBookingValue: bookingCount > 0 ? Math.round(revenue / bookingCount) : 0
      });
    }

    // Calculate summary stats
    const totalRevenue = months.reduce((sum, m) => sum + m.revenue, 0);
    const totalBookings = months.reduce((sum, m) => sum + m.bookingCount, 0);
    const averageMonthlyRevenue = Math.round(totalRevenue / 12);
    
    // Current month vs last month comparison
    const currentMonth = months[months.length - 1];
    const lastMonth = months[months.length - 2];
    const revenueChange = lastMonth.revenue > 0
      ? Math.round(((currentMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100)
      : currentMonth.revenue > 0 ? 100 : 0;
    const bookingChange = lastMonth.bookingCount > 0
      ? Math.round(((currentMonth.bookingCount - lastMonth.bookingCount) / lastMonth.bookingCount) * 100)
      : currentMonth.bookingCount > 0 ? 100 : 0;

    return res.json({
      months,
      summary: {
        totalRevenue,
        totalBookings,
        averageMonthlyRevenue,
        averageBookingValue: totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0,
        revenueChange,
        bookingChange
      }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Revenue history failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper function to get upcoming birthdays
 */
async function getUpcomingBirthdays(days: number) {
  const now = new Date();
  const atlanticNow = getAtlanticComponents(now);
  const currentYear = atlanticNow.year;
  
  // Get all customers with birthdays
  const customers = await prisma.user.findMany({
    where: {
      role: UserRole.CUSTOMER,
      dateOfBirth: { not: null }
    },
    select: {
      id: true,
      name: true,
      phone: true,
      dateOfBirth: true
    }
  });
  
  // Calculate days until birthday for each customer (using Atlantic timezone)
  const withBirthday = customers
    .map(customer => {
      const dob = customer.dateOfBirth!;
      const dobParts = getAtlanticComponents(dob);
      // This year's birthday in Atlantic time
      let birthdayYear = currentYear;
      const birthdayStr = `${currentYear}-${String(dobParts.month).padStart(2, '0')}-${String(dobParts.day).padStart(2, '0')}`;
      
      // If birthday has passed this year, use next year's
      const todayStr = toDateString(now);
      if (birthdayStr < todayStr) {
        birthdayYear = currentYear + 1;
      }
      
      const finalBirthdayStr = `${birthdayYear}-${String(dobParts.month).padStart(2, '0')}-${String(dobParts.day).padStart(2, '0')}`;
      
      // Calculate days difference using date strings (avoids timezone math)
      const todayMs = new Date(todayStr + 'T00:00:00').getTime();
      const birthdayMs = new Date(finalBirthdayStr + 'T00:00:00').getTime();
      const daysUntil = Math.ceil((birthdayMs - todayMs) / (1000 * 60 * 60 * 24));
      
      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        dateOfBirth: dob,
        daysUntilBirthday: daysUntil,
        birthdayDate: finalBirthdayStr
      };
    })
    .filter(c => c.daysUntilBirthday >= 0 && c.daysUntilBirthday <= days)
    .sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);
  
  return withBirthday;
}

/**
 * GET /api/customers
 * 
 * List customers with search, pagination, and sorting.
 */
const listQuerySchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'lastBooking', 'bookingCount', 'totalSpent']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  registrationSource: z.enum(['ONLINE', 'WALK_IN', 'PHONE']).optional(),
});

router.get('/', requireSalesOrAbove, async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: parsed.error.flatten().fieldErrors 
      });
    }

    const { search, sortBy, sortOrder, page, limit, registrationSource } = parsed.data;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { role: UserRole.CUSTOMER };
    
    if (registrationSource) {
      where.registrationSource = registrationSource;
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } }
      ];
    }

    // Get customers with stats
    const customers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        dateOfBirth: true,
        registrationSource: true,
        createdAt: true,
        _count: { select: { bookings: true } },
        bookings: {
          select: { startTime: true, price: true },
          orderBy: { startTime: 'desc' },
        }
      }
    });

    // Calculate stats and prepare response
    const customersWithStats = customers.map(customer => {
      const totalSpent = customer.bookings.reduce((sum, b) => sum + Number(b.price), 0);
      const lastBooking = customer.bookings[0]?.startTime || null;
      
      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        dateOfBirth: customer.dateOfBirth,
        registrationSource: customer.registrationSource,
        createdAt: customer.createdAt,
        bookingCount: customer._count.bookings,
        totalSpent,
        lastBooking
      };
    });

    // Sort
    customersWithStats.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'lastBooking':
          if (!a.lastBooking && !b.lastBooking) comparison = 0;
          else if (!a.lastBooking) comparison = -1;
          else if (!b.lastBooking) comparison = 1;
          else comparison = new Date(a.lastBooking).getTime() - new Date(b.lastBooking).getTime();
          break;
        case 'bookingCount':
          comparison = a.bookingCount - b.bookingCount;
          break;
        case 'totalSpent':
          comparison = a.totalSpent - b.totalSpent;
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const totalCount = customersWithStats.length;
    const paginatedCustomers = customersWithStats.slice(skip, skip + limit);

    return res.json({
      customers: paginatedCustomers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Customer list failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/customers/:id
 * 
 * Get single customer with full details and ALL their bookings.
 * All bookings are linked by userId. Shows booking source and who created it.
 */
router.get('/:id', requireSalesOrAbove, async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        dateOfBirth: true,
        registrationSource: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { bookings: true } }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Fetch ALL bookings for this customer (linked by userId)
    const bookings = await prisma.booking.findMany({
      where: { userId: id },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        price: true,
        bookingStatus: true,
        paymentStatus: true,
        roomId: true,
        customerName: true,
        customerPhone: true,
        bookingSource: true,
        createdBy: true,
        createdAt: true
      },
      orderBy: { startTime: 'desc' }
    });

    // Get room names
    const roomIds = [...new Set(bookings.map(b => b.roomId))];
    const rooms = await prisma.room.findMany({
      where: { id: { in: roomIds } },
      select: { id: true, name: true }
    });
    const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.name]));

    // Get admin names for bookings created by admins
    const adminIds = [...new Set(bookings.filter(b => b.createdBy).map(b => b.createdBy!))];
    const admins = adminIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true }
    }) : [];
    const adminMap = Object.fromEntries(admins.map(a => [a.id, a.name]));

    // Calculate totals by source
    const totalsBySource = {
      ONLINE: { count: 0, spent: 0 },
      WALK_IN: { count: 0, spent: 0 },
      PHONE: { count: 0, spent: 0 }
    };

    const formattedBookings = bookings.map(b => {
      const source = b.bookingSource as keyof typeof totalsBySource;
      if (b.bookingStatus !== 'CANCELLED' && totalsBySource[source]) {
        totalsBySource[source].count++;
        totalsBySource[source].spent += Number(b.price);
      }

      return {
        ...b,
        roomName: roomMap[b.roomId] || 'Unknown',
        createdByName: b.createdBy ? (adminMap[b.createdBy] || 'Admin') : null
      };
    });

    const totalSpent = bookings
      .filter(b => b.bookingStatus !== 'CANCELLED')
      .reduce((sum, b) => sum + Number(b.price), 0);

    return res.json({
      customer: {
        ...customer,
        bookingCount: customer._count.bookings,
        totalSpent,
        bookings: formattedBookings,
        totalsBySource
      }
    });
  } catch (error) {
    req.log.error({ err: error, customerId: req.params.id }, 'Customer get failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/customers
 * 
 * Create a new customer or staff member (walk-in registration).
 */
const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // YYYY-MM-DD
  role: z.enum(['CUSTOMER', 'SALES', 'STAFF']).optional().default('CUSTOMER'),
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors 
      });
    }

    const { name, phone, email, dateOfBirth, role } = parsed.data;

    // Normalize phone
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check for existing user
    const existing = await prisma.user.findUnique({
      where: { phone: normalizedPhone }
    });
    if (existing) {
      return res.status(409).json({ error: 'Customer with this phone already exists' });
    }

    // Create customer/staff
    const customer = await prisma.user.create({
      data: {
        name,
        phone: normalizedPhone,
        email: email || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        role: role === 'STAFF' ? UserRole.STAFF : UserRole.CUSTOMER,
        registrationSource: 'WALK_IN',
        registeredBy: req.user!.id
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        dateOfBirth: true,
        registrationSource: true,
        createdAt: true
      }
    });

    req.log.info({ customerId: customer.id, name: customer.name, phone: customer.phone }, 'Customer created');
    return res.status(201).json({ customer });
  } catch (error) {
    req.log.error({ err: error }, 'Customer create failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/customers/:id
 * 
 * Update customer details.
 */
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // YYYY-MM-DD
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors 
      });
    }

    const { name, phone, email, dateOfBirth } = parsed.data;

    // Check customer exists
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }
    
    // Handle phone change (normalize and check uniqueness)
    if (phone !== undefined) {
      let normalizedPhone: string;
      try {
        normalizedPhone = normalizePhone(phone);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }
      
      if (normalizedPhone !== existing.phone) {
        const phoneExists = await prisma.user.findUnique({
          where: { phone: normalizedPhone }
        });
        if (phoneExists) {
          return res.status(409).json({ error: 'Phone number already in use' });
        }
        updateData.phone = normalizedPhone;
      }
    }

    // Update customer
    const customer = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        dateOfBirth: true,
        registrationSource: true,
        createdAt: true,
        updatedAt: true
      }
    });

    req.log.info({ customerId: id, changes: Object.keys(updateData) }, 'Customer updated');
    return res.json({ customer });
  } catch (error) {
    req.log.error({ err: error, customerId: req.params.id }, 'Customer update failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/customers/:id
 * 
 * Delete a customer (soft delete by role change or hard delete based on policy).
 * For now, we'll prevent deletion if they have bookings.
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customer._count.bookings > 0) {
      return res.status(409).json({ 
        error: 'Cannot delete customer with booking history',
        bookingCount: customer._count.bookings
      });
    }

    await prisma.user.delete({ where: { id } });

    req.log.info({ customerId: id }, 'Customer deleted');
    return res.json({ success: true, message: 'Customer deleted' });
  } catch (error) {
    req.log.error({ err: error, customerId: req.params.id }, 'Customer delete failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/customers/bookings/search
 * 
 * Search bookings by phone, booking reference (ID prefix), or customer name.
 * Supports date range, status, and source filters.
 */
const bookingSearchSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),   // ISO date string
  status: z.enum(['BOOKED', 'COMPLETED', 'CANCELLED']).optional(),
  source: z.enum(['ONLINE', 'WALK_IN', 'PHONE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['startTime', 'createdAt', 'price']).default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

router.get('/bookings/search', requireSalesOrAbove, async (req, res) => {
  try {
    const parsed = bookingSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: parsed.error.flatten().fieldErrors 
      });
    }

    const { search, dateFrom, dateTo, status, source, page, limit, sortBy, sortOrder } = parsed.data;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    // Date range filter
    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) {
        where.startTime.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Add one day to include the entire end date
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        where.startTime.lt = endDate;
      }
    }

    // Status filter
    if (status) {
      where.bookingStatus = status;
    }

    // Source filter
    if (source) {
      where.bookingSource = source;
    }

    // Search filter - phone, booking ID prefix, or customer name
    if (search && search.trim()) {
      const searchTerm = search.trim();
      const normalizedPhone = normalizePhone(searchTerm);
      
      where.OR = [
        // Search by phone (customer's stored phone or booking phone)
        { customerPhone: { contains: normalizedPhone.replace(/^\+1/, ''), mode: 'insensitive' } },
        // Search by booking ID prefix
        { id: { startsWith: searchTerm, mode: 'insensitive' } },
        // Search by customer name
        { customerName: { contains: searchTerm, mode: 'insensitive' } },
        // Search by linked user's name
        { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
        // Search by linked user's phone
        { user: { phone: { contains: normalizedPhone, mode: 'insensitive' } } }
      ];
    }

    // Get bookings with pagination
    const [bookings, totalCount] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          room: { select: { name: true } },
          user: { select: { id: true, name: true, phone: true, email: true } },
          createdByUser: { select: { name: true } }
        }
      }),
      prisma.booking.count({ where })
    ]);

    // Format bookings for response
    const formattedBookings = bookings.map(b => ({
      id: b.id,
      startTime: b.startTime,
      endTime: b.endTime,
      price: Number(b.price || 0),
      bookingStatus: b.bookingStatus,
      paymentStatus: b.paymentStatus,
      bookingSource: b.bookingSource,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail,
      roomId: b.roomId,
      roomName: b.room?.name || 'Unknown',
      createdBy: b.createdBy,
      createdByName: b.createdByUser?.name || null,
      createdAt: b.createdAt,
      // Linked user info (if exists)
      user: b.user ? {
        id: b.user.id,
        name: b.user.name,
        phone: b.user.phone,
        email: b.user.email
      } : null
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return res.json({
      bookings: formattedBookings,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Booking search failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
