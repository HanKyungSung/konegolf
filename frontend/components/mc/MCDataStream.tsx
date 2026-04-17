import React, { useEffect, useRef } from 'react';

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

export function MCDataStream({ events, maxEntries = 30 }: MCDataStreamProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const capped = events.slice(0, maxEntries);

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
        <div className="mc-meta mc-mono text-right">
          <div>{formatTime(new Date())}</div>
          <div className="mc-meta-dim mt-1">{formatDate(new Date())}</div>
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
            {capped.map((ev) => (
              <li
                key={ev.id}
                className="mc-stream-entry mc-mono text-[13px] leading-snug"
              >
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
