import { Router, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin, requireStaffOrAdmin, requireSalesOrAbove } from '../middleware/requireRole';
import { getMonthlyReport } from '../repositories/monthlyReportRepo';
import { generateMonthlyReportPdf } from '../services/reportPdfService';
import { getDailySummary } from '../repositories/dailyReportRepo';
import { buildAtlanticDate } from '../utils/timezone';

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

export default router;
