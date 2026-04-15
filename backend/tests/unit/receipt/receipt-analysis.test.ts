/**
 * Unit tests for Ollama receipt analysis — parsing + amount matching.
 */

import { parseOllamaResponse } from '../../../src/services/ollamaService';
import { compareAmounts } from '../../../src/services/receiptAnalyzer';

// ─── Ollama Response Parsing ───

describe('parseOllamaResponse', () => {
  it('parses valid JSON response', () => {
    const raw = JSON.stringify({
      amount: 45.99,
      cardLast4: '4532',
      cardType: 'Visa',
      transactionDate: '2026-04-10',
      transactionTime: '14:30',
      terminalId: 'T001',
      approvalCode: 'A12345',
    });

    const result = parseOllamaResponse(raw);
    expect(result.success).toBe(true);
    expect(result.extractedAmount).toBe(45.99);
    expect(result.cardLast4).toBe('4532');
    expect(result.cardType).toBe('Visa');
    expect(result.transactionDate).toBe('2026-04-10');
    expect(result.transactionTime).toBe('14:30');
    expect(result.terminalId).toBe('T001');
    expect(result.approvalCode).toBe('A12345');
  });

  it('extracts JSON from surrounding text', () => {
    const raw = `Here is the extracted data:\n${JSON.stringify({
      amount: 30.0,
      cardLast4: '1234',
      cardType: null,
      transactionDate: null,
      transactionTime: null,
      terminalId: null,
      approvalCode: null,
    })}\nThat's the result.`;

    const result = parseOllamaResponse(raw);
    expect(result.success).toBe(true);
    expect(result.extractedAmount).toBe(30.0);
    expect(result.cardLast4).toBe('1234');
  });

  it('handles all-null fields gracefully', () => {
    const raw = JSON.stringify({
      amount: null,
      cardLast4: null,
      cardType: null,
      transactionDate: null,
      transactionTime: null,
      terminalId: null,
      approvalCode: null,
    });

    const result = parseOllamaResponse(raw);
    expect(result.success).toBe(true);
    expect(result.extractedAmount).toBeNull();
    expect(result.cardLast4).toBeNull();
  });

  it('returns failure for empty response', () => {
    const result = parseOllamaResponse('');
    expect(result.success).toBe(false);
  });

  it('returns failure for non-JSON response', () => {
    const result = parseOllamaResponse('I cannot read this receipt image.');
    expect(result.success).toBe(false);
  });

  it('falls back to regex for malformed JSON', () => {
    const raw = '{ amount: $45.99, card ending in 4532, Visa }';
    const result = parseOllamaResponse(raw);
    // Regex fallback should extract amount
    expect(result.extractedAmount).toBe(45.99);
  });

  it('sanitizes card last 4 from longer number', () => {
    const raw = JSON.stringify({
      amount: 20.0,
      cardLast4: '1234567890',
      cardType: null,
      transactionDate: null,
      transactionTime: null,
      terminalId: null,
      approvalCode: null,
    });

    const result = parseOllamaResponse(raw);
    expect(result.cardLast4).toBe('7890'); // last 4
  });

  it('rejects invalid card last 4 (too short)', () => {
    const raw = JSON.stringify({
      amount: 20.0,
      cardLast4: '12',
      cardType: null,
      transactionDate: null,
      transactionTime: null,
      terminalId: null,
      approvalCode: null,
    });

    const result = parseOllamaResponse(raw);
    expect(result.cardLast4).toBeNull();
  });

  it('handles amount as string number', () => {
    const raw = JSON.stringify({
      amount: '49.99',
      cardLast4: '5678',
      cardType: 'Mastercard',
      transactionDate: null,
      transactionTime: null,
      terminalId: null,
      approvalCode: null,
    });

    const result = parseOllamaResponse(raw);
    expect(result.extractedAmount).toBe(49.99);
  });

  it('handles cardLast4 as number', () => {
    const raw = JSON.stringify({
      amount: 35,
      cardLast4: 4532,
      cardType: null,
      transactionDate: null,
      transactionTime: null,
      terminalId: null,
      approvalCode: null,
    });

    const result = parseOllamaResponse(raw);
    expect(result.cardLast4).toBe('4532');
  });

  it('trims whitespace from string fields', () => {
    const raw = JSON.stringify({
      amount: 25.0,
      cardLast4: '1111',
      cardType: '  Visa  ',
      transactionDate: ' 2026-04-10 ',
      transactionTime: ' 14:30 ',
      terminalId: ' T001 ',
      approvalCode: ' ABC123 ',
    });

    const result = parseOllamaResponse(raw);
    expect(result.cardType).toBe('Visa');
    expect(result.transactionDate).toBe('2026-04-10');
    expect(result.transactionTime).toBe('14:30');
    expect(result.terminalId).toBe('T001');
    expect(result.approvalCode).toBe('ABC123');
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
