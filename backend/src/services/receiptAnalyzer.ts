import { PrismaClient } from '@prisma/client';
import { analyzeReceipt } from './ollamaService';
import { downloadFile } from './storageService';
import logger from '../lib/logger';

const prisma = new PrismaClient();

const AMOUNT_TOLERANCE = 0.02; // ±$0.02 for rounding/float differences

/**
 * Analyze a receipt image for a payment and cross-check the amount.
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

    // Send to Ollama for analysis
    const extraction = await analyzeReceipt(imageBuffer);

    if (!extraction.success) {
      logger.warn({ paymentId, rawResponse: extraction.rawResponse.slice(0, 200) }, 'Ollama extraction failed');
      await upsertAnalysis(paymentId, {
        matchStatus: 'UNREADABLE',
        mismatchReason: 'Could not extract data from receipt image',
        rawResponse: extraction.rawResponse,
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:e2b',
      });
      return;
    }

    // Cross-check amount
    const systemAmount = Number(payment.amount);
    const { matchStatus, mismatchReason } = compareAmounts(systemAmount, extraction.extractedAmount);

    // Upsert the analysis record
    await upsertAnalysis(paymentId, {
      extractedAmount: extraction.extractedAmount,
      cardLast4: extraction.cardLast4,
      cardType: extraction.cardType,
      transactionDate: extraction.transactionDate,
      transactionTime: extraction.transactionTime,
      terminalId: extraction.terminalId,
      approvalCode: extraction.approvalCode,
      rawResponse: extraction.rawResponse,
      matchStatus,
      mismatchReason,
      modelUsed: process.env.OLLAMA_MODEL || 'gemma4:e2b',
    });

    logger.info(
      { paymentId, matchStatus, systemAmount, extractedAmount: extraction.extractedAmount },
      'Receipt analysis complete'
    );
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
