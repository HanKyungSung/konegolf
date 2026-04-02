import { Router, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin, requireStaffOrAdmin, requireSalesOrAbove } from '../middleware/requireRole';
import { getMonthlyReport } from '../repositories/monthlyReportRepo';
import { generateMonthlyReportPdf } from '../services/reportPdfService';
import { getDailySummary } from '../repositories/dailyReportRepo';
import { buildAtlanticDate } from '../utils/timezone';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/reports/daily-summary?date=YYYY-MM-DD
 * Returns JSON daily summary (payment breakdown, tips, tax, bookings).
 * Defaults to today if no date param provided.
 * Staff + Admin.
 */
router.get('/daily-summary', requireAuth, requireSalesOrAbove, async (req: any, res: Response) => {
  try {
    let target: Date | undefined;
    if (req.query.date) {
      const parts = (req.query.date as string).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!parts) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      // Build noon in Atlantic so dayRange() resolves to the correct day
      target = buildAtlanticDate(Number(parts[1]), Number(parts[2]), Number(parts[3]), 12, 0, 0);
    }

    const data = await getDailySummary(target);
    req.log.info({ date: data.date }, 'Daily summary generated');
    return res.json(data);
  } catch (error) {
    req.log.error({ err: error, date: req.query.date }, 'Daily summary failed');
    return res.status(500).json({ error: 'Failed to generate daily summary' });
  }
});

/**
 * GET /api/reports/monthly-sales?month=MM&year=YYYY
 * Generates and streams a monthly sales report PDF.
 * Admin only.
 */
router.get('/monthly-sales', requireAuth, requireSalesOrAbove, async (req: any, res: Response) => {
  try {
    const month = parseInt(req.query.month as string, 10);
    const year = parseInt(req.query.year as string, 10);

    if (!month || !year || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Valid month (1-12) and year (2000-2100) are required' });
    }

    const data = await getMonthlyReport(month, year);
    const doc = generateMonthlyReportPdf(data);

    const filename = `K-Golf_Monthly_Report_${year}-${String(month).padStart(2, '0')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);
  } catch (error) {
    req.log.error({ err: error, month: req.query.month, year: req.query.year }, 'Monthly report generation failed');
    return res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /api/reports/employee-hours?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&employeeId=UUID
 * Returns per-employee hours aggregation for a date range.
 * Admin only.
 */
router.get('/employee-hours', requireAuth, requireAdmin, async (req: any, res: Response) => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const startParts = (startDate as string).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endParts = (endDate as string).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startParts || !endParts) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const rangeStart = buildAtlanticDate(+startParts[1], +startParts[2], +startParts[3], 0, 0, 0);
    const rangeEnd = buildAtlanticDate(+endParts[1], +endParts[2], +endParts[3], 23, 59, 59, 999);

    const where: any = {
      clockIn: { gte: rangeStart, lte: rangeEnd },
    };
    if (employeeId && typeof employeeId === 'string') {
      where.employeeId = employeeId;
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { clockIn: 'asc' },
    });

    // Group by employee
    const byEmployee = new Map<string, { name: string; shifts: ShiftSummary[] }>();
    const TIMEZONE = 'America/Halifax';

    for (const entry of entries) {
      if (!byEmployee.has(entry.employeeId)) {
        byEmployee.set(entry.employeeId, { name: entry.employee.name, shifts: [] });
      }
      const isOpen = !entry.clockOut;
      const end = entry.clockOut ? new Date(entry.clockOut).getTime() : Date.now();
      const minutes = Math.round((end - new Date(entry.clockIn).getTime()) / 60000);
      const dateStr = new Date(entry.clockIn).toLocaleDateString('en-CA', { timeZone: TIMEZONE });

      byEmployee.get(entry.employeeId)!.shifts.push({
        date: dateStr,
        clockIn: entry.clockIn.toISOString(),
        clockOut: entry.clockOut?.toISOString() || null,
        minutes,
        isOpen,
        autoClockOut: (entry as any).autoClockOut || false,
      });
    }

    const summaries: EmployeeHoursSummary[] = [];
    for (const [empId, data] of byEmployee) {
      const totalMinutes = data.shifts.reduce((sum, s) => sum + s.minutes, 0);
      const longestShiftMinutes = data.shifts.length > 0
        ? Math.max(...data.shifts.map(s => s.minutes))
        : 0;
      const uniqueDays = new Set(data.shifts.map(s => s.date));

      summaries.push({
        employeeId: empId,
        employeeName: data.name,
        totalMinutes,
        shiftCount: data.shifts.length,
        avgShiftMinutes: data.shifts.length > 0 ? Math.round(totalMinutes / data.shifts.length) : 0,
        longestShiftMinutes,
        daysWorked: uniqueDays.size,
        shifts: data.shifts,
      });
    }

    // Sort by name
    summaries.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    req.log.info({ startDate, endDate, employeeCount: summaries.length }, 'Employee hours report generated');
    return res.json({ summaries, startDate, endDate });
  } catch (error) {
    req.log.error({ err: error }, 'Employee hours report failed');
    return res.status(500).json({ error: 'Failed to generate employee hours report' });
  }
});

export default router;

// ─── Shared helper for employee hours aggregation ───

export interface ShiftSummary {
  date: string; // YYYY-MM-DD in Atlantic
  clockIn: string;
  clockOut: string | null;
  minutes: number;
  isOpen: boolean;
  autoClockOut?: boolean;
}

export interface EmployeeHoursSummary {
  employeeId: string;
  employeeName: string;
  totalMinutes: number;
  shiftCount: number;
  avgShiftMinutes: number;
  longestShiftMinutes: number;
  daysWorked: number;
  shifts: ShiftSummary[];
}
