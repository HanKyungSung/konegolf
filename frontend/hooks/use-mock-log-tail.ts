import { useEffect, useRef, useState } from 'react';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogLine {
  id: string;
  ts: Date;
  level: LogLevel;
  source: string;
  message: string;
  /** Optional structured details — shown when the line is clicked. */
  requestId?: string;
  durationMs?: number;
  status?: number;
  userId?: string;
  stack?: string;
  payload?: Record<string, unknown>;
}

const SAMPLES: Array<Omit<LogLine, 'id' | 'ts'>> = [
  {
    level: 'INFO',
    source: 'http',
    message: 'GET /api/bookings?week=2026-04-19 200 41ms',
    requestId: 'req_a8f21c',
    status: 200,
    durationMs: 41,
    userId: 'admin01',
    payload: { route: '/api/bookings', query: { week: '2026-04-19' }, rows: 47 },
  },
  {
    level: 'INFO',
    source: 'http',
    message: 'GET /api/rooms 200 12ms',
    requestId: 'req_b91fe2',
    status: 200,
    durationMs: 12,
    userId: 'admin01',
    payload: { route: '/api/rooms', rows: 4 },
  },
  {
    level: 'INFO',
    source: 'ws',
    message: 'broadcast booking.updated -> 3 clients',
    payload: { event: 'booking.updated', bookingId: 'cmh4q3xyz', recipients: 3 },
  },
  {
    level: 'DEBUG',
    source: 'prisma',
    message: 'SELECT * FROM "Booking" WHERE startTime BETWEEN ...',
    durationMs: 4,
    payload: {
      sql: 'SELECT b.*, r.name AS room_name FROM "Booking" b JOIN "Room" r ON b."roomId"=r.id WHERE b."startTime" BETWEEN $1 AND $2',
      params: ['2026-04-19T00:00Z', '2026-04-26T00:00Z'],
      rowCount: 47,
    },
  },
  {
    level: 'INFO',
    source: 'http',
    message: 'POST /api/bookings 201 87ms',
    requestId: 'req_c33aa1',
    status: 201,
    durationMs: 87,
    userId: 'staff03',
    payload: {
      route: '/api/bookings',
      method: 'POST',
      body: { roomId: 'r2', players: 2, startTime: '2026-04-19T18:00Z' },
    },
  },
  {
    level: 'WARN',
    source: 'ocr',
    message: 'pi.kgolf.local heartbeat 4.2s late',
    payload: { device: 'pi-01', lastSeen: '2026-04-19T22:41:18Z', expectedInterval: 5000, actualGap: 9200 },
  },
  {
    level: 'INFO',
    source: 'cron',
    message: 'autoCompleteBookings: 2 marked COMPLETED',
    durationMs: 18,
    payload: { job: 'autoCompleteBookings', updated: 2, ids: ['cmh4q3', 'cmh4q5'] },
  },
  {
    level: 'INFO',
    source: 'auth',
    message: 'session refresh user=staff03 ttl=30m',
    userId: 'staff03',
    payload: { action: 'refresh', ttlSeconds: 1800 },
  },
  {
    level: 'DEBUG',
    source: 'cache',
    message: 'tax-rate hit (ttl 296s)',
    payload: { key: 'tax-rate:global', ttl: 296, hit: true },
  },
  {
    level: 'ERROR',
    source: 'receipts',
    message: 'ocr parse failed booking=cmh4q3 — retry 1/3',
    requestId: 'req_d12009',
    status: 502,
    payload: { bookingId: 'cmh4q3', attempt: 1, ocrEngine: 'tesseract-5.3' },
    stack: `Error: OCR confidence below threshold (0.42 < 0.65)
    at processReceipt (/app/src/services/ocr.ts:142:11)
    at async retryWithBackoff (/app/src/lib/retry.ts:38:5)
    at async ReceiptWorker.handle (/app/src/workers/receipt.ts:71:9)`,
  },
  {
    level: 'INFO',
    source: 'ws',
    message: 'client connected role=ADMIN id=ws_8421',
    payload: { clientId: 'ws_8421', role: 'ADMIN', userAgent: 'Chrome/126.0' },
  },
  {
    level: 'INFO',
    source: 'http',
    message: 'GET /api/pending-receipts 200 23ms',
    requestId: 'req_e5510a',
    status: 200,
    durationMs: 23,
    payload: { route: '/api/pending-receipts', rows: 3 },
  },
];

let __seq = 0;

function pick(): Omit<LogLine, 'id' | 'ts'> {
  return SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
}

/**
 * Emits fake backend log lines on a randomized interval. Mock-only — real
 * backend log streaming will land via SSE in a follow-up.
 */
export function useMockLogTail(maxLines = 200): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>(() => {
    const seed: LogLine[] = [];
    const now = Date.now();
    for (let i = 0; i < 8; i += 1) {
      const s = pick();
      __seq += 1;
      seed.push({
        ...s,
        id: `seed-${__seq}`,
        ts: new Date(now - (8 - i) * 1500),
      });
    }
    return seed;
  });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const s = pick();
      __seq += 1;
      const line: LogLine = { ...s, id: `m-${__seq}`, ts: new Date() };
      setLines((prev) => {
        const next = [...prev, line];
        if (next.length > maxLines) next.splice(0, next.length - maxLines);
        return next;
      });
      const delay = 600 + Math.random() * 1700;
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, 800);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [maxLines]);

  return lines;
}
