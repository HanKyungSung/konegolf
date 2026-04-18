import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin, requireStaffOrAdmin } from '../middleware/requireRole';
import { uploadFile, downloadFile, deleteFile } from '../services/storageService';
import { analyzeReceiptAsync } from '../services/receiptAnalyzer';
import { emitReceiptUploaded, emitReceiptDeleted } from '../services/wsEvents';
import logger from '../lib/logger';

const prisma = new PrismaClient();
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * POST /api/payments/:paymentId/receipt
 * Upload a receipt photo for a payment.
 */
router.post(
  '/:paymentId/receipt',
  requireAuth,
  requireStaffOrAdmin,
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      logger.info({ paymentId, fileSize: req.file?.size, mimeType: req.file?.mimetype }, 'Receipt upload started');

      if (!req.file) {
        logger.warn({ paymentId }, 'Receipt upload rejected: no file provided');
        return res.status(400).json({ error: 'No image file provided' });
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: { select: { bookingId: true } } },
      });
      if (!payment) {
        logger.warn({ paymentId }, 'Receipt upload rejected: payment not found');
        return res.status(404).json({ error: 'Payment not found' });
      }

      const bookingId = payment.invoice.bookingId;
      const date = new Date().toISOString().slice(0, 10);
      const objectPath = `receipts/${date}/${bookingId}/${paymentId}.jpg`;

      // Delete old file if replacing (Drive allows duplicate names, so always clean up)
      if (payment.receiptPath) {
        logger.info({ paymentId, oldPath: payment.receiptPath, newPath: objectPath }, 'Replacing existing receipt — deleting old file');
        await deleteFile(payment.receiptPath).catch((err) => {
          logger.warn({ err, paymentId, oldPath: payment.receiptPath }, 'Failed to delete old receipt during replace');
        });
      }

      await uploadFile(objectPath, req.file.buffer, 'image/jpeg');

      await prisma.payment.update({
        where: { id: paymentId },
        data: { receiptPath: objectPath },
      });

      logger.info({ paymentId, bookingId, objectPath, fileSize: req.file.size }, 'Receipt uploaded successfully');

      const isNew = !payment.receiptPath;
      if (isNew) {
        emitReceiptUploaded((req as any).user, { paymentId, bookingId });
      }

      // Fire-and-forget: analyze the receipt via Ollama (non-blocking)
      analyzeReceiptAsync(paymentId).catch((err) => {
        logger.error({ err, paymentId }, 'Background receipt analysis failed');
      });

      return res.json({ receiptPath: objectPath });
    } catch (err) {
      logger.error({ err }, 'Failed to upload receipt');
      return res.status(500).json({ error: 'Failed to upload receipt' });
    }
  }
);

/**
 * GET /api/payments/:paymentId/receipt
 * Get the receipt image for a payment (signed URL or local file).
 */
router.get(
  '/:paymentId/receipt',
  requireAuth,
  requireStaffOrAdmin,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      logger.info({ paymentId }, 'Receipt serve requested');

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { receiptPath: true },
      });
      if (!payment?.receiptPath) {
        logger.warn({ paymentId }, 'Receipt serve: no receipt attached');
        return res.status(404).json({ error: 'No receipt attached' });
      }

      logger.info({ paymentId, receiptPath: payment.receiptPath }, 'Downloading receipt from storage');
      const imageBuffer = await downloadFile(payment.receiptPath);
      logger.info({ paymentId, receiptPath: payment.receiptPath, bufferSize: imageBuffer.length }, 'Receipt served successfully');
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(imageBuffer);
    } catch (err) {
      logger.error({ err }, 'Failed to serve receipt');
      return res.status(500).json({ error: 'Failed to serve receipt' });
    }
  }
);

/**
 * DELETE /api/payments/:paymentId/receipt
 * Delete a receipt image. Admin only.
 */
router.delete(
  '/:paymentId/receipt',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.params;
      logger.info({ paymentId }, 'Receipt delete requested');

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { receiptPath: true },
      });
      if (!payment?.receiptPath) {
        logger.warn({ paymentId }, 'Receipt delete: no receipt attached');
        return res.status(404).json({ error: 'No receipt attached' });
      }

      logger.info({ paymentId, receiptPath: payment.receiptPath }, 'Deleting receipt from storage');
      await deleteFile(payment.receiptPath);

      await prisma.payment.update({
        where: { id: paymentId },
        data: { receiptPath: null },
      });

      logger.info({ paymentId, receiptPath: payment.receiptPath }, 'Receipt deleted successfully');
      emitReceiptDeleted((req as any).user, { paymentId });
      return res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Failed to delete receipt');
      return res.status(500).json({ error: 'Failed to delete receipt' });
    }
  }
);

/**
 * GET /api/payments/pending-receipts?date=YYYY-MM-DD
 * Returns CARD/GIFT_CARD payments without a receipt, with booking info.
 */
router.get(
  '/pending-receipts',
  requireAuth,
  requireStaffOrAdmin,
  async (req: Request, res: Response) => {
    try {
      const dateParam = req.query.date as string | undefined;
      logger.info({ dateParam }, 'Pending receipts query');

      // Default to today (Atlantic time)
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

      const payments = await prisma.payment.findMany({
        where: {
          method: { in: ['CARD', 'GIFT_CARD'] },
          receiptPath: null,
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          invoice: {
            include: {
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
        createdAt: p.createdAt,
        booking: {
          id: p.invoice.booking.id,
          customerName: p.invoice.booking.customerName,
          startTime: p.invoice.booking.startTime,
          roomName: p.invoice.booking.room.name,
        },
      }));

      logger.info({ dateParam, count: result.length }, 'Pending receipts returned');
      return res.json(result);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch pending receipts');
      return res.status(500).json({ error: 'Failed to fetch pending receipts' });
    }
  }
);

export default router;
