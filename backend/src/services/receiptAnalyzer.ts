import { PrismaClient } from '@prisma/client';
import { sendImageForOcr, checkOcrHealth } from './ocrService';
import { parseReceiptText } from './receiptParser';
import { downloadFile } from './storageService';
import { emitReceiptAnalysisComplete } from './wsEvents';
import logger from '../lib/logger';

const prisma = new PrismaClient();

const AMOUNT_TOLERANCE = 0.02; // ±$0.02 for rounding/float differences

/**
 * Analyze a receipt image for a payment and cross-check the amount.
 * Pipeline: check Pi health → download image → OCR (EasyOCR on Pi) → regex parse → compare → save.
 * If Pi is unavailable, marks receipt as UNREADABLE immediately.
 * Designed to be called fire-and-forget (errors are caught internally).
 */
export async function analyzeReceiptAsync(paymentId: string): Promise<void> {
  try {
    logger.info({ paymentId }, 'Receipt analysis started');

    // Fetch payment with receiptPath
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        method: true,
        receiptPath: true,
        invoice: { select: { bookingId: true } },
      },
    });

    if (!payment) {
      logger.warn({ paymentId }, 'Receipt analysis skipped: payment not found');
      return;
    }

    if (!payment.receiptPath) {
      logger.warn({ paymentId }, 'Receipt analysis skipped: no receipt path');
      return;
    }

    // Mark as ANALYZING so the UI shows progress
    await upsertAnalysis(paymentId, {
      matchStatus: 'ANALYZING',
      mismatchReason: null,
    });

    // Download the receipt image from storage
    let imageBuffer: Buffer;
    try {
      imageBuffer = await downloadFile(payment.receiptPath);
    } catch (err) {
      logger.error({ err, paymentId, receiptPath: payment.receiptPath }, 'Failed to download receipt for analysis');
      await upsertAnalysis(paymentId, {
        matchStatus: 'UNREADABLE',
        mismatchReason: 'Failed to download receipt image from storage',
        rawResponse: `Download error: ${(err as Error).message}`,
      });
      return;
    }

    // Check if Pi OCR service is available before proceeding
    try {
      await checkOcrHealth();
    } catch (err) {
      logger.warn({ err, paymentId }, 'Pi OCR service unavailable — skipping analysis');
      await upsertAnalysis(paymentId, {
        matchStatus: 'UNREADABLE',
        mismatchReason: 'Pi OCR service unavailable',
        rawResponse: (err as Error).message,
      });
      return;
    }

    // Send to EasyOCR service on Pi
    let ocrLines;
    try {
      ocrLines = await sendImageForOcr(imageBuffer);
    } catch (err) {
      logger.error({ err, paymentId }, 'OCR service call failed');
      await upsertAnalysis(paymentId, {
        matchStatus: 'UNREADABLE',
        mismatchReason: `OCR service error: ${(err as Error).message}`,
        rawResponse: (err as Error).message,
        modelUsed: 'easyocr',
      });
      return;
    }

    if (!ocrLines || ocrLines.length === 0) {
      logger.warn({ paymentId }, 'OCR returned no text');
      await upsertAnalysis(paymentId, {
        matchStatus: 'UNREADABLE',
        mismatchReason: 'OCR could not detect any text in receipt image',
        rawResponse: JSON.stringify(ocrLines),
        modelUsed: 'easyocr',
      });
      return;
    }

    // Parse structured fields from raw OCR text
    const rawText = ocrLines.map((l) => `[${l.confidence}] ${l.text}`).join('\n');
    const parsed = parseReceiptText(ocrLines);

    // Cross-check amount
    const systemAmount = Number(payment.amount);
    const { matchStatus, mismatchReason } = compareAmounts(systemAmount, parsed.amount);

    // Upsert the analysis record
    await upsertAnalysis(paymentId, {
      extractedAmount: parsed.amount,
      cardLast4: parsed.cardLast4,
      cardType: parsed.cardType,
      transactionDate: parsed.transactionDate,
      transactionTime: parsed.transactionTime,
      terminalId: parsed.terminalId,
      approvalCode: parsed.approvalCode,
      rawResponse: rawText,
      matchStatus,
      mismatchReason,
      modelUsed: 'easyocr',
    });

    logger.info(
      { paymentId, matchStatus, systemAmount, extractedAmount: parsed.amount },
      'Receipt analysis complete'
    );

    emitReceiptAnalysisComplete({ paymentId, bookingId: payment.invoice?.bookingId, matchStatus });
  } catch (err) {
    logger.error({ err, paymentId }, 'Receipt analysis failed unexpectedly');
  }
}

/**
 * Compare system payment amount with extracted receipt amount.
 */
export function compareAmounts(
  systemAmount: number,
  extractedAmount: number | null
): { matchStatus: string; mismatchReason: string | null } {
  if (extractedAmount == null) {
    return {
      matchStatus: 'UNREADABLE',
      mismatchReason: 'Could not extract amount from receipt',
    };
  }

  if (Math.abs(systemAmount - extractedAmount) <= AMOUNT_TOLERANCE) {
    return { matchStatus: 'MATCHED', mismatchReason: null };
  }

  return {
    matchStatus: 'MISMATCH',
    mismatchReason: `Amount: system $${systemAmount.toFixed(2)} vs receipt $${extractedAmount.toFixed(2)}`,
  };
}

/**
 * Upsert a ReceiptAnalysis record for a payment.
 */
async function upsertAnalysis(
  paymentId: string,
  data: {
    extractedAmount?: number | null;
    cardLast4?: string | null;
    cardType?: string | null;
    transactionDate?: string | null;
    transactionTime?: string | null;
    terminalId?: string | null;
    approvalCode?: string | null;
    rawResponse?: string | null;
    matchStatus: string;
    mismatchReason?: string | null;
    modelUsed?: string | null;
  }
): Promise<void> {
  await prisma.receiptAnalysis.upsert({
    where: { paymentId },
    create: {
      paymentId,
      extractedAmount: data.extractedAmount ?? null,
      cardLast4: data.cardLast4 ?? null,
      cardType: data.cardType ?? null,
      transactionDate: data.transactionDate ?? null,
      transactionTime: data.transactionTime ?? null,
      terminalId: data.terminalId ?? null,
      approvalCode: data.approvalCode ?? null,
      rawResponse: data.rawResponse ?? null,
      matchStatus: data.matchStatus,
      mismatchReason: data.mismatchReason ?? null,
      modelUsed: data.modelUsed ?? null,
    },
    update: {
      extractedAmount: data.extractedAmount ?? null,
      cardLast4: data.cardLast4 ?? null,
      cardType: data.cardType ?? null,
      transactionDate: data.transactionDate ?? null,
      transactionTime: data.transactionTime ?? null,
      terminalId: data.terminalId ?? null,
      approvalCode: data.approvalCode ?? null,
      rawResponse: data.rawResponse ?? null,
      matchStatus: data.matchStatus,
      mismatchReason: data.mismatchReason ?? null,
      modelUsed: data.modelUsed ?? null,
      analyzedAt: new Date(),
    },
  });
}
