/**
 * Receipt Queue Processor — periodically processes PENDING receipts when Pi OCR is available.
 *
 * Runs every 5 minutes via setInterval. Checks Pi health first;
 * if offline, skips the cycle entirely. Processes receipts sequentially
 * to avoid overloading the Pi.
 */

import { PrismaClient } from '@prisma/client';
import { observeOcrHealth } from './ocrService';
import { analyzeReceiptAsync } from './receiptAnalyzer';
import { emitReceiptQueueProgress } from './wsEvents';
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
    // Observe Pi health (emits ws transition events on change); skip cycle if offline
    const health = await observeOcrHealth();
    if (!health.reachable) {
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

    const total = pendingPayments.length;
    const batchId = `batch-${Date.now()}`;
    logger.info(
      { count: total, batchId },
      'Receipt queue: processing pending receipts'
    );
    emitReceiptQueueProgress({ processed: 0, total, batchId });

    // Process sequentially to avoid overloading Pi
    let processed = 0;
    for (const payment of pendingPayments) {
      try {
        await analyzeReceiptAsync(payment.id);
      } catch (err) {
        logger.error(
          { err, paymentId: payment.id },
          'Receipt queue: analysis failed for payment'
        );
      }
      processed += 1;
      emitReceiptQueueProgress({ processed, total, batchId });
    }

    logger.info(
      { count: total, batchId },
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
