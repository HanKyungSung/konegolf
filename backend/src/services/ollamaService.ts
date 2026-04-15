import logger from '../lib/logger';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://100.83.253.110:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b';
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT || '420000', 10);

export interface OllamaExtractionResult {
  extractedAmount: number | null;
  cardLast4: string | null;
  cardType: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  terminalId: string | null;
  approvalCode: string | null;
  rawResponse: string;
  success: boolean;
}

const EXTRACTION_PROMPT = `Analyze this payment terminal receipt image. Extract the following fields and return ONLY a JSON object with no other text:

{
  "amount": <number or null — the TOTAL or PURCHASE amount charged to the card. Look for labels like "TOTAL", "PURCHASE", "AMOUNT", or "SALE". This is typically a dollar amount like 45.99 or 119.70. Do NOT confuse with terminal ID, sequence number, or other large numbers>,
  "cardLast4": <string or null — last 4 digits of the card number, often shown as ****1234 or XXXX1234>,
  "cardType": <string or null — card brand like "Visa", "Mastercard", "Amex", "Debit", "Interac">,
  "transactionDate": <string or null — date on the receipt, format as "YYYY-MM-DD" if possible>,
  "transactionTime": <string or null — time on the receipt, format as "HH:MM" if possible>,
  "terminalId": <string or null — terminal ID or TID>,
  "approvalCode": <string or null — authorization or approval code, often labeled "AUTH" or "APPR">
}

Important:
- Return ONLY the JSON object, no explanation or markdown
- Use null for any field you cannot read or find
- The amount should be a decimal number (e.g. 45.99), not a string. Most amounts have cents (two decimal places)
- For cardLast4, return exactly 4 digits as a string
- Do NOT confuse the amount with terminal IDs, sequence numbers, or reference numbers which are typically large integers without decimals`;

/**
 * Send a receipt image to the Ollama vision model for analysis.
 * Returns extracted fields or a failed result if the Pi is unreachable.
 */
export async function analyzeReceipt(imageBuffer: Buffer): Promise<OllamaExtractionResult> {
  const emptyResult: OllamaExtractionResult = {
    extractedAmount: null,
    cardLast4: null,
    cardType: null,
    transactionDate: null,
    transactionTime: null,
    terminalId: null,
    approvalCode: null,
    rawResponse: '',
    success: false,
  };

  try {
    const base64Image = imageBuffer.toString('base64');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    logger.info(
      { host: OLLAMA_HOST, model: OLLAMA_MODEL, imageSize: imageBuffer.length },
      'Sending receipt to Ollama for analysis'
    );

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: EXTRACTION_PROMPT,
        images: [base64Image],
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for factual extraction
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, body: errorText }, 'Ollama API error');
      return { ...emptyResult, rawResponse: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const rawText: string = data.response || '';

    logger.info(
      { model: OLLAMA_MODEL, responseLength: rawText.length, totalDuration: data.total_duration },
      'Ollama analysis complete'
    );

    return parseOllamaResponse(rawText);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn({ timeout: OLLAMA_TIMEOUT }, 'Ollama request timed out');
      return { ...emptyResult, rawResponse: `Timeout after ${OLLAMA_TIMEOUT}ms` };
    }

    logger.error({ err }, 'Ollama service unreachable');
    return { ...emptyResult, rawResponse: `Error: ${err.message}` };
  }
}

/**
 * Parse the Ollama text response into structured extraction fields.
 * Tries JSON.parse first, then falls back to regex extraction.
 */
export function parseOllamaResponse(rawText: string): OllamaExtractionResult {
  const base: OllamaExtractionResult = {
    extractedAmount: null,
    cardLast4: null,
    cardType: null,
    transactionDate: null,
    transactionTime: null,
    terminalId: null,
    approvalCode: null,
    rawResponse: rawText,
    success: false,
  };

  // Try to extract JSON from the response (may have surrounding text)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn({ rawText: rawText.slice(0, 200) }, 'No JSON found in Ollama response');
    return base;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const amount = parsed.amount != null ? Number(parsed.amount) : null;
    const cardLast4 = sanitizeCardLast4(parsed.cardLast4);

    return {
      extractedAmount: amount != null && !isNaN(amount) ? amount : null,
      cardLast4,
      cardType: typeof parsed.cardType === 'string' ? parsed.cardType.trim() : null,
      transactionDate: typeof parsed.transactionDate === 'string' ? parsed.transactionDate.trim() : null,
      transactionTime: typeof parsed.transactionTime === 'string' ? parsed.transactionTime.trim() : null,
      terminalId: typeof parsed.terminalId === 'string' ? parsed.terminalId.trim() : null,
      approvalCode: typeof parsed.approvalCode === 'string' ? parsed.approvalCode.trim() : null,
      rawResponse: rawText,
      success: true,
    };
  } catch {
    logger.warn({ jsonSnippet: jsonMatch[0].slice(0, 200) }, 'Failed to parse Ollama JSON — trying regex fallback');
    return regexFallback(rawText, base);
  }
}

/**
 * Fallback: extract fields with regex when JSON parsing fails.
 */
function regexFallback(rawText: string, base: OllamaExtractionResult): OllamaExtractionResult {
  const result = { ...base };

  // Amount: look for dollar amounts
  const amountMatch = rawText.match(/\$?\s*(\d+\.\d{2})/);
  if (amountMatch) {
    result.extractedAmount = Number(amountMatch[1]);
  }

  // Card last 4: look for 4-digit sequences near card context
  const cardMatch = rawText.match(/(?:last\s*4|card|ending|x{4,})\D*(\d{4})/i)
    || rawText.match(/\*{4,}\s*(\d{4})/);
  if (cardMatch) {
    result.cardLast4 = cardMatch[1];
  }

  // Card type
  const typeMatch = rawText.match(/\b(Visa|Mastercard|MasterCard|Amex|American Express|Debit|Interac)\b/i);
  if (typeMatch) {
    result.cardType = typeMatch[1];
  }

  result.success = result.extractedAmount != null;
  return result;
}

/**
 * Ensure cardLast4 is exactly 4 digits or null.
 */
function sanitizeCardLast4(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 4) return digits;
  // If longer, take last 4
  if (digits.length > 4) return digits.slice(-4);
  return null;
}
