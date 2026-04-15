/**
 * Unit tests for receipt OCR — text parsing + amount matching.
 */

import {
  parseReceiptText,
  extractAmount,
  extractCardLast4,
  extractCardType,
  extractDate,
  extractTime,
  extractApprovalCode,
  extractTerminalId,
  OcrTextLine,
} from '../../../src/services/receiptParser';
import { compareAmounts } from '../../../src/services/receiptAnalyzer';

// ─── Receipt Text Parsing ───

// Helper to create OCR lines from simple strings
function makeLines(texts: string[], confidence = 0.9): OcrTextLine[] {
  return texts.map((text) => ({ text, confidence }));
}

describe('parseReceiptText', () => {
  it('parses a full K GOLF receipt (real EasyOCR output)', () => {
    const lines: OcrTextLine[] = [
      { text: 'K', confidence: 0.97 },
      { text: 'GOLF', confidence: 1.0 },
      { text: 'UNIT', confidence: 1.0 },
      { text: '6', confidence: 1.0 },
      { text: '5', confidence: 1.0 },
      { text: 'KELTIC', confidence: 1.0 },
      { text: 'DRIVE', confidence: 1.0 },
      { text: 'PLAZA', confidence: 1.0 },
      { text: '9022708800', confidence: 1.0 },
      { text: 'SALE', confidence: 0.97 },
      { text: 'MID:', confidence: 0.98 },
      { text: '6891356', confidence: 0.93 },
      { text: 'TID:', confidence: 0.99 },
      { text: '001', confidence: 0.94 },
      { text: 'REF#:', confidence: 0.97 },
      { text: '098001', confidence: 1.0 },
      { text: 'Batch', confidence: 0.74 },
      { text: '04/08/26', confidence: 0.82 },
      { text: '19.12.27', confidence: 0.96 },
      { text: 'APPR', confidence: 1.0 },
      { text: 'CODE:  06834E', confidence: 0.84 },
      { text: 'MASTERCARD', confidence: 1.0 },
      { text: 'Proximity', confidence: 0.75 },
      { text: '6058', confidence: 1.0 },
      { text: 't+ttt*++', confidence: 0.03 },
      { text: '$121.98', confidence: 0.67 },
      { text: 'AMOUNT', confidence: 1.0 },
      { text: 'APPROVED', confidence: 1.0 },
      { text: 'Mastercard', confidence: 1.0 },
    ];

    const result = parseReceiptText(lines);
    expect(result.amount).toBe(121.98);
    expect(result.cardType).toBe('Mastercard');
    expect(result.transactionDate).toBe('2026-04-08');
    expect(result.approvalCode).toBe('06834E');
  });

  it('handles empty lines', () => {
    const result = parseReceiptText([]);
    expect(result.amount).toBeNull();
    expect(result.cardLast4).toBeNull();
    expect(result.cardType).toBeNull();
  });
});

describe('extractAmount', () => {
  it('finds dollar amount near AMOUNT keyword', () => {
    const lines = makeLines(['AMOUNT', '$45.99']);
    expect(extractAmount(lines, lines.map((l) => l.text).join('\n'))).toBe(45.99);
  });

  it('finds amount on same line as AMOUNT', () => {
    const lines = makeLines(['AMOUNT $121.98']);
    expect(extractAmount(lines, lines.map((l) => l.text).join('\n'))).toBe(121.98);
  });

  it('finds TOTAL amount', () => {
    const lines = makeLines(['TOTAL: $89.50']);
    expect(extractAmount(lines, lines.map((l) => l.text).join('\n'))).toBe(89.50);
  });

  it('picks $ amount when no keyword present', () => {
    const lines = makeLines(['Some text', '$55.00', 'More text']);
    expect(extractAmount(lines, lines.map((l) => l.text).join('\n'))).toBe(55.0);
  });

  it('picks largest $ amount as total', () => {
    const lines = makeLines(['$10.00', '$25.50', '$35.50']);
    expect(extractAmount(lines, lines.map((l) => l.text).join('\n'))).toBe(35.50);
  });

  it('returns null when no amount found', () => {
    const lines = makeLines(['APPROVED', 'THANK YOU']);
    expect(extractAmount(lines, lines.map((l) => l.text).join('\n'))).toBeNull();
  });
});

describe('extractCardLast4', () => {
  it('extracts from ****XXXX pattern', () => {
    const lines = makeLines(['****6058']);
    expect(extractCardLast4(lines, '****6058')).toBe('6058');
  });

  it('extracts from XXXX pattern', () => {
    expect(extractCardLast4(makeLines(['XXXX1234']), 'XXXX1234')).toBe('1234');
  });

  it('finds 4 digits near MASTERCARD keyword', () => {
    const lines = makeLines(['MASTERCARD', '6058']);
    expect(extractCardLast4(lines, 'MASTERCARD\n6058')).toBe('6058');
  });

  it('returns null when no card number present', () => {
    const lines = makeLines(['APPROVED', 'THANK YOU']);
    expect(extractCardLast4(lines, 'APPROVED\nTHANK YOU')).toBeNull();
  });
});

describe('extractCardType', () => {
  it('detects Mastercard', () => {
    expect(extractCardType('MASTERCARD Proximity')).toBe('Mastercard');
  });

  it('detects Visa', () => {
    expect(extractCardType('VISA DEBIT')).toBe('Visa');
  });

  it('detects Amex', () => {
    expect(extractCardType('AMERICAN EXPRESS')).toBe('Amex');
  });

  it('detects Interac', () => {
    expect(extractCardType('INTERAC FLASH')).toBe('Interac');
  });

  it('returns null for unknown', () => {
    expect(extractCardType('APPROVED THANK YOU')).toBeNull();
  });
});

describe('extractDate', () => {
  it('parses MM/DD/YY format', () => {
    expect(extractDate('04/08/26')).toBe('2026-04-08');
  });

  it('parses YYYY-MM-DD format', () => {
    expect(extractDate('2026-04-08')).toBe('2026-04-08');
  });

  it('returns null when no date found', () => {
    expect(extractDate('APPROVED')).toBeNull();
  });
});

describe('extractTime', () => {
  it('parses HH:MM:SS format', () => {
    expect(extractTime('19:12:27')).toBe('19:12:27');
  });

  it('parses HH.MM.SS format and normalizes', () => {
    expect(extractTime('19.12.27')).toBe('19:12:27');
  });

  it('returns null when no time found', () => {
    expect(extractTime('APPROVED')).toBeNull();
  });
});

describe('extractApprovalCode', () => {
  it('extracts APPR CODE format', () => {
    expect(extractApprovalCode('APPR CODE: 06834E')).toBe('06834E');
  });

  it('extracts AUTH CODE format', () => {
    expect(extractApprovalCode('AUTH CODE: ABC123')).toBe('ABC123');
  });

  it('extracts CODE: format', () => {
    expect(extractApprovalCode('CODE:  06834E')).toBe('06834E');
  });

  it('returns null when not found', () => {
    expect(extractApprovalCode('APPROVED')).toBeNull();
  });
});

describe('extractTerminalId', () => {
  it('extracts MID', () => {
    expect(extractTerminalId('MID: 6891356')).toBe('6891356');
  });

  it('extracts TID', () => {
    expect(extractTerminalId('TID: 001')).toBe('001');
  });

  it('returns null when not found', () => {
    expect(extractTerminalId('APPROVED')).toBeNull();
  });
});

// ─── Amount Comparison ───

describe('compareAmounts', () => {
  it('returns MATCHED for exact match', () => {
    const result = compareAmounts(45.99, 45.99);
    expect(result.matchStatus).toBe('MATCHED');
    expect(result.mismatchReason).toBeNull();
  });

  it('returns MATCHED within ±$0.01 tolerance', () => {
    expect(compareAmounts(45.99, 46.0).matchStatus).toBe('MATCHED');
    expect(compareAmounts(45.99, 45.98).matchStatus).toBe('MATCHED');
  });

  it('returns MISMATCH for amounts beyond tolerance', () => {
    const result = compareAmounts(45.00, 35.00);
    expect(result.matchStatus).toBe('MISMATCH');
    expect(result.mismatchReason).toContain('system $45.00');
    expect(result.mismatchReason).toContain('receipt $35.00');
  });

  it('returns MISMATCH for small difference beyond tolerance', () => {
    const result = compareAmounts(45.00, 44.97);
    expect(result.matchStatus).toBe('MISMATCH');
  });

  it('returns UNREADABLE when extracted amount is null', () => {
    const result = compareAmounts(45.00, null);
    expect(result.matchStatus).toBe('UNREADABLE');
    expect(result.mismatchReason).toContain('Could not extract');
  });

  it('handles zero amounts', () => {
    const result = compareAmounts(0, 0);
    expect(result.matchStatus).toBe('MATCHED');
  });

  it('handles large amounts', () => {
    const result = compareAmounts(999.99, 999.99);
    expect(result.matchStatus).toBe('MATCHED');
  });

  it('handles floating point precision edge case', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    const result = compareAmounts(0.3, 0.1 + 0.2);
    expect(result.matchStatus).toBe('MATCHED');
  });
});
