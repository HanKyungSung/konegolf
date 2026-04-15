/**
 * Receipt Text Parser — extracts structured fields from raw OCR text lines.
 *
 * Takes an array of {text, confidence} lines from EasyOCR and returns
 * structured receipt fields using regex patterns.
 */

export interface OcrTextLine {
  text: string;
  confidence: number;
}

export interface ParsedReceipt {
  amount: number | null;
  cardLast4: string | null;
  cardType: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  approvalCode: string | null;
  terminalId: string | null;
}

/**
 * Parse raw OCR text lines into structured receipt fields.
 */
export function parseReceiptText(lines: OcrTextLine[]): ParsedReceipt {
  const allText = lines.map((l) => l.text).join('\n');
  const highConfLines = lines.filter((l) => l.confidence >= 0.3);
  const highConfText = highConfLines.map((l) => l.text).join('\n');

  return {
    amount: extractAmount(lines, allText),
    cardLast4: extractCardLast4(lines, allText),
    cardType: extractCardType(allText),
    transactionDate: extractDate(allText),
    transactionTime: extractTime(allText),
    approvalCode: extractApprovalCode(allText),
    terminalId: extractTerminalId(allText),
  };
}

/**
 * Extract the transaction amount.
 * Looks for AMOUNT label near a dollar value, or standalone $XX.XX patterns.
 */
export function extractAmount(
  lines: OcrTextLine[],
  allText: string
): number | null {
  // Strategy 1: Look for AMOUNT followed by a dollar value on same or next line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text.toUpperCase();
    if (line.includes('AMOUNT') || line.includes('TOTAL') || line.includes('PURCHASE') || line.includes('SALE AMT')) {
      // Check current line for dollar amount
      const inlineMatch = lines[i].text.match(/\$?\s*(\d+\.\d{2})\b/);
      if (inlineMatch) {
        return parseFloat(inlineMatch[1]);
      }
      // Check next line
      if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].text.match(/\$?\s*(\d+\.\d{2})\b/);
        if (nextMatch) {
          return parseFloat(nextMatch[1]);
        }
      }
    }
  }

  // Strategy 2: Look for $XX.XX pattern anywhere (prefer higher amounts)
  const dollarAmounts: number[] = [];
  for (const line of lines) {
    const matches = line.text.matchAll(/\$\s*(\d+\.\d{2})\b/g);
    for (const m of matches) {
      dollarAmounts.push(parseFloat(m[1]));
    }
  }
  if (dollarAmounts.length > 0) {
    // Return the largest dollar amount (most likely the total)
    return Math.max(...dollarAmounts);
  }

  // Strategy 3: Look for standalone decimal number near AMOUNT/APPROVED keywords
  const amountPattern = /(\d{1,6}\.\d{2})\b/g;
  const allAmounts: number[] = [];
  for (const line of lines) {
    const matches = line.text.matchAll(amountPattern);
    for (const m of matches) {
      const val = parseFloat(m[1]);
      // Filter out unlikely amounts (timestamps like 19.12, very small or very large)
      if (val >= 1.0 && val <= 99999.99) {
        allAmounts.push(val);
      }
    }
  }

  // If we found amounts, pick the one closest to AMOUNT/APPROVED/TOTAL keywords
  if (allAmounts.length > 0) {
    // Heuristic: return the largest reasonable amount
    return Math.max(...allAmounts);
  }

  return null;
}

/**
 * Extract last 4 digits of card number.
 * Looks for patterns like ****6058, XXXX6058, or standalone 4-digit near card context.
 */
export function extractCardLast4(
  lines: OcrTextLine[],
  allText: string
): string | null {
  // Pattern 1: ****XXXX or XXXX1234 patterns
  const starPattern = /[\*xX#]{3,}\s*(\d{4})\b/;
  const match1 = allText.match(starPattern);
  if (match1) return match1[1];

  // Pattern 2: High-confidence standalone 4-digit number near card context
  const cardKeywords = ['MASTERCARD', 'VISA', 'AMEX', 'DEBIT', 'INTERAC', 'CREDIT'];
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase();
    if (cardKeywords.some((k) => upper.includes(k))) {
      // Check surrounding lines for 4-digit numbers
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) {
        const digitMatch = lines[j].text.match(/\b(\d{4})\b/);
        if (digitMatch && lines[j].confidence >= 0.5) {
          return digitMatch[1];
        }
      }
    }
  }

  return null;
}

/**
 * Extract card type (Visa, Mastercard, etc.)
 */
export function extractCardType(allText: string): string | null {
  const upper = allText.toUpperCase();
  if (upper.includes('MASTERCARD') || upper.includes('MASTER CARD')) return 'Mastercard';
  if (upper.includes('VISA')) return 'Visa';
  if (upper.includes('AMEX') || upper.includes('AMERICAN EXPRESS')) return 'Amex';
  if (upper.includes('INTERAC')) return 'Interac';
  if (upper.includes('DEBIT')) return 'Debit';
  return null;
}

/**
 * Extract transaction date (returns as-is from receipt, YYYY-MM-DD if possible).
 */
export function extractDate(allText: string): string | null {
  // MM/DD/YY or DD/MM/YY
  const slashDate = allText.match(/\b(\d{2}\/\d{2}\/\d{2,4})\b/);
  if (slashDate) {
    const parts = slashDate[1].split('/');
    if (parts.length === 3) {
      const [a, b, c] = parts;
      const year = c.length === 2 ? `20${c}` : c;
      // Assume MM/DD/YY for North American receipts
      return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
    }
    return slashDate[1];
  }

  // YYYY-MM-DD
  const isoDate = allText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoDate) return isoDate[1];

  return null;
}

/**
 * Extract transaction time (HH:MM or HH:MM:SS).
 */
export function extractTime(allText: string): string | null {
  // Look for time patterns near date
  const timeMatch = allText.match(/\b(\d{2}[:.]\d{2}(?:[:.]\d{2})?)\b/);
  if (timeMatch) {
    // Normalize separators to ':'
    return timeMatch[1].replace(/\./g, ':');
  }
  return null;
}

/**
 * Extract approval/authorization code.
 */
export function extractApprovalCode(allText: string): string | null {
  // APPR CODE: XXXXX or AUTH: XXXXX or APPROVAL: XXXXX
  const patterns = [
    /(?:APPR|AUTH|APPROVAL)\s+CODE:?\s*([A-Z0-9]{4,10})/i,
    /\bCODE:?\s+([A-Z0-9]{4,10})/i,
  ];
  for (const pat of patterns) {
    const match = allText.match(pat);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract terminal/merchant ID.
 */
export function extractTerminalId(allText: string): string | null {
  // MID: XXXXXXX
  const midMatch = allText.match(/MID:?\s*(\d{5,15})/i);
  if (midMatch) return midMatch[1];

  // TID: XXX
  const tidMatch = allText.match(/TID:?\s*(\d{3,10})/i);
  if (tidMatch) return tidMatch[1];

  return null;
}
