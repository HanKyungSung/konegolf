/**
 * OCR Service Client — sends images to the EasyOCR service on Pi for text extraction.
 */

import { OcrTextLine } from './receiptParser';

const OCR_SERVICE_URL =
  process.env.OCR_SERVICE_URL || 'http://localhost:5050';
const OCR_TIMEOUT = parseInt(process.env.OCR_TIMEOUT || '120000', 10);

interface OcrResponse {
  lines: OcrTextLine[];
  processingTimeMs: number;
  regionCount: number;
}

interface OcrHealthResponse {
  status: string;
  modelLoaded: boolean;
  memoryMB: number;
  uptimeSeconds: number;
}

/**
 * Send an image buffer to the OCR service and get back text lines.
 */
export async function sendImageForOcr(
  imageBuffer: Buffer,
  filename = 'receipt.jpg'
): Promise<OcrTextLine[]> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
  formData.append('image', blob, filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT);

  try {
    const response = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown');
      throw new Error(
        `OCR service returned ${response.status}: ${errorBody}`
      );
    }

    const data = (await response.json()) as OcrResponse;
    console.log(
      `[OCR] Processed ${data.regionCount} text regions in ${data.processingTimeMs}ms`
    );
    return data.lines;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(
        `OCR service timeout after ${OCR_TIMEOUT}ms. The service may be under heavy load or starting up.`
      );
    }
    throw new Error(`OCR service error: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check OCR service health.
 */
export async function checkOcrHealth(): Promise<OcrHealthResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${OCR_SERVICE_URL}/health`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }

    return (await response.json()) as OcrHealthResponse;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('OCR service health check timeout');
    }
    throw new Error(`OCR service unreachable: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Warm up the OCR model (call on server start or before first use).
 */
export async function warmupOcrModel(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${OCR_SERVICE_URL}/warmup`, {
      method: 'POST',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      console.log('[OCR] Model warmed up successfully');
    }
  } catch {
    console.warn('[OCR] Warmup failed — model will load on first request');
  }
}
