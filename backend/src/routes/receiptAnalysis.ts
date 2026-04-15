import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireRole';
import { analyzeReceiptAsync } from '../services/receiptAnalyzer';
import { checkOcrHealth } from '../services/ocrService';
import logger from '../lib/logger';

const prisma = new PrismaClient();
const router = Router();

/**
 * GET /api/receipt-analysis?date=YYYY-MM-DD
 * List all receipt analyses for a given date with payment/booking context.
 * Admin only.
 */
router.get('/', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;

    let startDate: Date;
    let endDate: Date;

    if (dateParam) {
      startDate = new Date(`${dateParam}T00:00:00-04:00`);
      endDate = new Date(`${dateParam}T23:59:59-04:00`);
    } else {
      const now = new Date();
      const atlantic = new Date(now.toLocaleString('en-US', { timeZone: 'America/Halifax' }));
      const dateStr = atlantic.toISOString().slice(0, 10);
      startDate = new Date(`${dateStr}T00:00:00-04:00`);
      endDate = new Date(`${dateStr}T23:59:59-04:00`);
    }

    // Fetch all CARD/GIFT_CARD payments for the date range, with analysis data
    const payments = await prisma.payment.findMany({
      where: {
        method: { in: ['CARD', 'GIFT_CARD'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        analysis: true,
        invoice: {
          select: {
            seatIndex: true,
            booking: {
              select: {
                id: true,
                customerName: true,
                startTime: true,
                room: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = payments.map((p) => ({
      paymentId: p.id,
      method: p.method,
      amount: Number(p.amount),
      receiptPath: p.receiptPath,
      createdAt: p.createdAt,
      booking: {
        id: p.invoice.booking.id,
        customerName: p.invoice.booking.customerName,
        startTime: p.invoice.booking.startTime,
        roomName: p.invoice.booking.room.name,
      },
      seatIndex: p.invoice.seatIndex,
      analysis: p.analysis
        ? {
            matchStatus: p.analysis.matchStatus,
            extractedAmount: p.analysis.extractedAmount ? Number(p.analysis.extractedAmount) : null,
            cardLast4: p.analysis.cardLast4,
            cardType: p.analysis.cardType,
            transactionDate: p.analysis.transactionDate,
            transactionTime: p.analysis.transactionTime,
            terminalId: p.analysis.terminalId,
            approvalCode: p.analysis.approvalCode,
            mismatchReason: p.analysis.mismatchReason,
            analyzedAt: p.analysis.analyzedAt,
            modelUsed: p.analysis.modelUsed,
          }
        : null,
    }));

    req.log.info({ date: dateParam, count: result.length }, 'Receipt analysis list returned');
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'Failed to fetch receipt analyses');
    return res.status(500).json({ error: 'Failed to fetch receipt analyses' });
  }
});

/**
 * GET /api/receipt-analysis/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Aggregate counts: matched, mismatch, unreadable, pending, no-receipt.
 * Admin only.
 */
router.get('/summary', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const startParam = req.query.startDate as string | undefined;
    const endParam = req.query.endDate as string | undefined;

    let startDate: Date;
    let endDate: Date;

    if (startParam && endParam) {
      startDate = new Date(`${startParam}T00:00:00-04:00`);
      endDate = new Date(`${endParam}T23:59:59-04:00`);
    } else {
      const now = new Date();
      const atlantic = new Date(now.toLocaleString('en-US', { timeZone: 'America/Halifax' }));
      const dateStr = atlantic.toISOString().slice(0, 10);
      startDate = new Date(`${dateStr}T00:00:00-04:00`);
      endDate = new Date(`${dateStr}T23:59:59-04:00`);
    }

    // Count card/gift card payments in range
    const payments = await prisma.payment.findMany({
      where: {
        method: { in: ['CARD', 'GIFT_CARD'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        amount: true,
        receiptPath: true,
        analysis: { select: { matchStatus: true } },
      },
    });

    let matched = 0;
    let mismatch = 0;
    let unreadable = 0;
    let pending = 0;
    let analyzing = 0;
    let noReceipt = 0;
    let totalAmount = 0;
    let matchedAmount = 0;

    for (const p of payments) {
      const amt = Number(p.amount);
      totalAmount += amt;

      if (!p.receiptPath) {
        noReceipt++;
      } else if (!p.analysis) {
        pending++;
      } else {
        switch (p.analysis.matchStatus) {
          case 'MATCHED':
            matched++;
            matchedAmount += amt;
            break;
          case 'MISMATCH':
            mismatch++;
            break;
          case 'UNREADABLE':
            unreadable++;
            break;
          case 'ANALYZING':
            analyzing++;
            break;
          default:
            pending++;
        }
      }
    }

    return res.json({
      total: payments.length,
      matched,
      mismatch,
      unreadable,
      pending,
      analyzing,
      noReceipt,
      totalAmount: totalAmount.toFixed(2),
      matchedAmount: matchedAmount.toFixed(2),
      startDate: startParam || new Date().toISOString().slice(0, 10),
      endDate: endParam || new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    req.log.error({ err }, 'Failed to fetch receipt analysis summary');
    return res.status(500).json({ error: 'Failed to fetch receipt analysis summary' });
  }
});

/**
 * GET /api/receipt-analysis/health
 * Check OCR service health status. Admin only.
 */
router.get('/health', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const health = await checkOcrHealth();
    return res.json({
      reachable: true,
      ...health,
    });
  } catch (err) {
    return res.json({
      reachable: false,
      error: (err as Error).message,
    });
  }
});

/**
 * POST /api/receipt-analysis/:paymentId/reanalyze
 * Re-trigger analysis for a specific payment. Admin only.
 */
router.post('/:paymentId/reanalyze', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, receiptPath: true },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (!payment.receiptPath) {
      return res.status(400).json({ error: 'No receipt uploaded for this payment' });
    }

    // Mark as pending immediately
    await prisma.receiptAnalysis.upsert({
      where: { paymentId },
      create: { paymentId, matchStatus: 'PENDING' },
      update: { matchStatus: 'PENDING', analyzedAt: new Date() },
    });

    // Fire-and-forget re-analysis
    analyzeReceiptAsync(paymentId).catch((err) => {
      logger.error({ err, paymentId }, 'Re-analysis failed');
    });

    req.log.info({ paymentId }, 'Receipt re-analysis triggered');
    return res.json({ success: true, message: 'Re-analysis started' });
  } catch (err) {
    req.log.error({ err }, 'Failed to trigger re-analysis');
    return res.status(500).json({ error: 'Failed to trigger re-analysis' });
  }
});

export default router;
