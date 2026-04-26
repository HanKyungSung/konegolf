import { useEffect, useRef, useState } from 'react';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogLine {
  id: string;
  ts: Date;
  level: LogLevel;
  source: string;
  message: string;
}

const SAMPLES: Array<Omit<LogLine, 'id' | 'ts'>> = [
  { level: 'INFO', source: 'http', message: 'GET /api/bookings?week=2026-04-19 200 41ms' },
  { level: 'INFO', source: 'http', message: 'GET /api/rooms 200 12ms' },
  { level: 'INFO', source: 'ws', message: 'broadcast booking.updated -> 3 clients' },
  { level: 'DEBUG', source: 'prisma', message: 'SELECT * FROM "Booking" WHERE startTime BETWEEN ...' },
  { level: 'INFO', source: 'http', message: 'POST /api/bookings 201 87ms' },
  { level: 'WARN', source: 'ocr', message: 'pi.kgolf.local heartbeat 4.2s late' },
  { level: 'INFO', source: 'cron', message: 'autoCompleteBookings: 2 marked COMPLETED' },
  { level: 'INFO', source: 'auth', message: 'session refresh user=staff03 ttl=30m' },
  { level: 'DEBUG', source: 'cache', message: 'tax-rate hit (ttl 296s)' },
  { level: 'ERROR', source: 'receipts', message: 'ocr parse failed booking=cmh4q3 — retry 1/3' },
  { level: 'INFO', source: 'ws', message: 'client connected role=ADMIN id=ws_8421' },
  { level: 'INFO', source: 'http', message: 'GET /api/pending-receipts 200 23ms' },
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
