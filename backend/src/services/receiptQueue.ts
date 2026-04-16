/**
 * Receipt Queue Processor — periodically processes PENDING receipts when Pi OCR is available.
 *
 * Runs every 5 minutes via setInterval. Checks Pi health first;
 * if offline, skips the cycle entirely. Processes receipts sequentially
 * to avoid overloading the Pi.
 */

import { PrismaClient } from '@prisma/client';
import { checkOcrHealth } from './ocrService';
import { analyzeReceiptAsync } from './receiptAnalyzer';
import logger from '../lib/logger';

const prisma = new PrismaClient();

const QUEUE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 10; // max receipts per cycle

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let processing = false;

/**
 * Process all PENDING receipts if Pi is online.
 */
async function processQueue(): Promise<void> {
  if (processing) {
    logger.debug('Receipt queue: already processing, skipping cycle');
    return;
  }

  processing = true;
  try {
    // Check Pi health first — skip entirely if offline
    try {
      await checkOcrHealth();
    } catch {
      logger.debug('Receipt queue: Pi OCR offline, skipping cycle');
      return;
    }

    // Find PENDING receipts (has receipt but no analysis, or status = PENDING)
    const pendingPayments = await prisma.payment.findMany({
      where: {
        receiptPath: { not: null },
        OR: [
          { analysis: null },
          { analysis: { matchStatus: 'PENDING' } },
        ],
      },
      select: { id: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (pendingPayments.length === 0) {
      return;
    }

    logger.info(
      { count: pendingPayments.length },
      'Receipt queue: processing pending receipts'
    );

    // Process sequentially to avoid overloading Pi
    for (const payment of pendingPayments) {
      try {
        await analyzeReceiptAsync(payment.id);
      } catch (err) {
        logger.error(
          { err, paymentId: payment.id },
          'Receipt queue: analysis failed for payment'
        );
      }
    }

    logger.info(
      { count: pendingPayments.length },
      'Receipt queue: cycle complete'
    );
  } catch (err) {
    logger.error({ err }, 'Receipt queue: unexpected error');
  } finally {
    processing = false;
  }
}

/**
 * Start the receipt queue processor (call once on server boot).
 */
export function startReceiptQueue(): void {
  if (intervalHandle) {
    logger.warn('Receipt queue already running');
    return;
  }

  logger.info(
    { intervalMs: QUEUE_INTERVAL_MS, batchSize: BATCH_SIZE },
    'Receipt queue started'
  );

  // Run immediately on start, then every interval
  processQueue();
  intervalHandle = setInterval(processQueue, QUEUE_INTERVAL_MS);
}

/**
 * Stop the receipt queue processor.
 */
export function stopReceiptQueue(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Receipt queue stopped');
  }
}
