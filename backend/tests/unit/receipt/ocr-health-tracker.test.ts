/**
 * Unit tests for `observeOcrHealth()` — the transition-only wrapper around
 * `checkOcrHealth()`. Asserts that `ocr.pi_health_changed` is emitted exactly
 * when the `(reachable, modelLoaded)` tuple changes and never on steady state.
 */

import { eventBus } from '../../../src/services/eventBus';
import { observeOcrHealth, resetOcrHealthTracker } from '../../../src/services/ocrService';

type MockFetch = jest.Mock<Promise<Partial<Response>>, [RequestInfo | URL, RequestInit?]>;

function mockHealthResponse(body: {
  status?: string;
  modelLoaded?: boolean;
  memoryMB?: number;
  uptimeSeconds?: number;
}) {
  return {
    ok: true,
    json: async () => body,
  } as Partial<Response>;
}

function mockRejected(message = 'ECONNREFUSED') {
  const err = new Error(message);
  return Promise.reject(err);
}

describe('observeOcrHealth — transition emits', () => {
  const origFetch = globalThis.fetch;
  let fetchMock: MockFetch;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    resetOcrHealthTracker();
    fetchMock = jest.fn() as unknown as MockFetch;
    (globalThis as any).fetch = fetchMock;
    emitSpy = jest.spyOn(eventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
    (globalThis as any).fetch = origFetch;
  });

  function countPiHealthEmits(): number {
    return emitSpy.mock.calls.filter(
      ([evt]: any[]) => evt?.type === 'ocr.pi_health_changed'
    ).length;
  }

  it('emits on the very first observation (null -> state)', async () => {
    fetchMock.mockResolvedValue(mockHealthResponse({ modelLoaded: true, status: 'ok' }));

    const payload = await observeOcrHealth();

    expect(payload.reachable).toBe(true);
    expect(payload.modelLoaded).toBe(true);
    expect(countPiHealthEmits()).toBe(1);
  });

  it('does NOT emit on steady-state repeat calls (reachable+modelLoaded)', async () => {
    fetchMock.mockResolvedValue(mockHealthResponse({ modelLoaded: true }));

    await observeOcrHealth(); // first call emits
    await observeOcrHealth();
    await observeOcrHealth();
    await observeOcrHealth();

    expect(countPiHealthEmits()).toBe(1);
  });

  it('emits exactly once when reachable -> unreachable', async () => {
    fetchMock.mockResolvedValueOnce(mockHealthResponse({ modelLoaded: true }));
    await observeOcrHealth(); // baseline
    expect(countPiHealthEmits()).toBe(1);

    fetchMock.mockImplementationOnce(() => mockRejected('unreachable'));
    const payload = await observeOcrHealth();

    expect(payload.reachable).toBe(false);
    expect(payload.error).toMatch(/unreachable/);
    expect(countPiHealthEmits()).toBe(2);

    // stays down — no more emits
    fetchMock.mockImplementationOnce(() => mockRejected('unreachable'));
    await observeOcrHealth();
    expect(countPiHealthEmits()).toBe(2);
  });

  it('emits when unreachable -> reachable', async () => {
    fetchMock.mockImplementationOnce(() => mockRejected('down'));
    await observeOcrHealth();

    fetchMock.mockResolvedValueOnce(mockHealthResponse({ modelLoaded: true }));
    await observeOcrHealth();

    expect(countPiHealthEmits()).toBe(2);
  });

  it('emits on modelLoaded transition even with reachable unchanged', async () => {
    fetchMock.mockResolvedValueOnce(mockHealthResponse({ modelLoaded: false }));
    await observeOcrHealth(); // first: reachable=true, modelLoaded=false

    fetchMock.mockResolvedValueOnce(mockHealthResponse({ modelLoaded: true }));
    await observeOcrHealth(); // transition on modelLoaded

    fetchMock.mockResolvedValueOnce(mockHealthResponse({ modelLoaded: true }));
    await observeOcrHealth(); // steady — no emit

    expect(countPiHealthEmits()).toBe(2);
  });

  it('returns payload even when checkOcrHealth throws (no rethrow)', async () => {
    fetchMock.mockImplementationOnce(() => mockRejected('ECONNREFUSED'));

    const payload = await observeOcrHealth();

    expect(payload.reachable).toBe(false);
    expect(payload.modelLoaded).toBeUndefined();
    expect(payload.error).toMatch(/ECONNREFUSED/);
    // never throws -> callers like the 5-min queue loop stay safe
  });

  it('emits with audience=staff so STAFF + SALES + ADMIN all receive it', async () => {
    fetchMock.mockResolvedValueOnce(mockHealthResponse({ modelLoaded: true }));
    await observeOcrHealth();

    const call = emitSpy.mock.calls.find(([evt]: any[]) => evt?.type === 'ocr.pi_health_changed');
    expect(call).toBeDefined();
    expect(call![0].audience).toBe('staff');
  });
});
