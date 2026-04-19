import React, { useEffect, useMemo, useRef } from 'react';
import { Zap } from 'lucide-react';

export type MCStreamEventType =
  | 'BookingCreate'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PaymentSettle'
  | 'StatusChange'
  | 'QuickSale';

export interface MCStreamEvent {
  id: string;
  timestamp: Date;
  type: MCStreamEventType;
  primary: string;
  secondary?: string;
  meta?: string;
}

interface MCDataStreamProps {
  events: MCStreamEvent[];
  maxEntries?: number;
  /**
   * When provided, shows a small "Simulate" button in the header.
   * Gated by caller (e.g. admin-only on the dashboard).
   */
  onSimulate?: () => void;
}

const typeColor: Record<MCStreamEventType, string> = {
  BookingCreate: 'var(--mc-cyan)',
  SessionStart: 'var(--mc-cyan)',
  SessionEnd: 'var(--mc-purple)',
  PaymentSettle: 'var(--mc-magenta)',
  StatusChange: 'var(--mc-gray)',
  QuickSale: 'var(--mc-magenta)',
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Halifax',
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Halifax',
  });
}

export function MCDataStream({
  events,
  maxEntries = 30,
  onSimulate,
}: MCDataStreamProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const capped = events.slice(0, maxEntries);

  // Track previously-seen event IDs so only genuinely new entries animate.
  // First render is marked "seen" without animating (avoids animating the backlog).
  const seenIdsRef = useRef<Set<string> | null>(null);
  const newIds = useMemo<Set<string>>(() => {
    if (seenIdsRef.current === null) {
      return new Set<string>();
    }
    const previous = seenIdsRef.current;
    const fresh = new Set<string>();
    for (const ev of capped) {
      if (!previous.has(ev.id)) fresh.add(ev.id);
    }
    return fresh;
  }, [capped]);

  useEffect(() => {
    seenIdsRef.current = new Set(capped.map((ev) => ev.id));
  }, [capped]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="mc-section-label">Data Stream</div>
          <div className="mc-meta mt-1">Real-Time</div>
        </div>
        <div className="flex items-center gap-3">
          {onSimulate && (
            <button
              type="button"
              onClick={onSimulate}
              className="mc-chip mc-mono"
              aria-label="Simulate event"
            >
              <Zap className="h-3.5 w-3.5" />
              Simulate
            </button>
          )}
          <div className="mc-meta mc-mono text-right">
            <div>{formatTime(new Date())}</div>
            <div className="mc-meta-dim mt-1">{formatDate(new Date())}</div>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {capped.length === 0 ? (
          <div className="mc-meta mc-mono py-6 text-center">// awaiting events</div>
        ) : (
          <ul className="flex flex-col gap-4">
            {capped.map((ev) => {
              const isNew = newIds.has(ev.id);
              const className = [
                'mc-stream-entry mc-mono text-[13px] leading-snug',
                isNew ? 'mc-stream-new' : '',
                isNew ? 'mc-stream-new--telegraph' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li key={ev.id} className={className}>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-semibold"
                      style={{ color: typeColor[ev.type] }}
                    >
                      {ev.type}
                    </span>
                    {ev.secondary && (
                      <span className="text-[color:var(--mc-white)] font-medium">
                        {ev.secondary}
                      </span>
                    )}
                  </div>
                  <div className="text-[color:var(--mc-gray)] mt-1 break-all">
                    {formatTime(ev.timestamp)} · {ev.primary}
                  </div>
                  {ev.meta && (
                    <div className="text-[color:var(--mc-gray-dim)] mt-0.5">
                      "{ev.meta}"
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
