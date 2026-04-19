/**
 * Guard tests for Phase 3 WS helpers. Protects against accidental audience
 * flips (e.g., someone downgrading `ocr.pi_health_changed` to `admin`-only
 * and silently breaking staff visibility).
 */

import { eventBus } from '../../../src/services/eventBus';
import {
  emitOcrPiHealthChanged,
  emitReceiptQueueProgress,
} from '../../../src/services/wsEvents';

describe('wsEvents — Phase 3 audience guards', () => {
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    emitSpy = jest.spyOn(eventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  it('emitOcrPiHealthChanged uses audience=staff', () => {
    emitOcrPiHealthChanged({
      reachable: true,
      modelLoaded: true,
      responseTimeMs: 42,
    });

    expect(emitSpy).toHaveBeenCalledTimes(1);
    const envelope = emitSpy.mock.calls[0][0];
    expect(envelope.type).toBe('ocr.pi_health_changed');
    expect(envelope.audience).toBe('staff');
    expect(envelope.payload.reachable).toBe(true);
  });

  it('emitReceiptQueueProgress uses audience=staff', () => {
    emitReceiptQueueProgress({ processed: 2, total: 5, batchId: 'batch-x' });

    expect(emitSpy).toHaveBeenCalledTimes(1);
    const envelope = emitSpy.mock.calls[0][0];
    expect(envelope.type).toBe('receipt.queue_progress');
    expect(envelope.audience).toBe('staff');
    expect(envelope.payload).toMatchObject({ processed: 2, total: 5, batchId: 'batch-x' });
  });

  it('safeEmit swallows emit failures so HTTP responses are never broken', () => {
    emitSpy.mockImplementationOnce(() => {
      throw new Error('broker down');
    });

    expect(() =>
      emitOcrPiHealthChanged({ reachable: false, error: 'x' })
    ).not.toThrow();
  });
});
