import React from 'react';
import type { Room, Booking } from '@/services/pos-api';
import { MCStatDot } from './MCStatDot';

interface MCRoomTilesProps {
  rooms: Room[];
  bookings: Booking[];
  onSelectRoom?: (roomId: string) => void;
  /** Tailwind grid-cols override (defaults to 2 columns). */
  columnsClass?: string;
}

function timeRemaining(endIso: string, now: number): { label: string; mins: number } {
  const diff = new Date(endIso).getTime() - now;
  if (diff <= 0) return { label: '--:--', mins: 0 };
  const mins = Math.floor(diff / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    mins,
  };
}

/**
 * 2×2 (or Nxcol) grid of room tiles for the wallboard dashboard.
 * Larger, breathier alternative to MCRoomRail's compact vertical list.
 */
export function MCRoomTiles({
  rooms,
  bookings,
  onSelectRoom,
  columnsClass = 'grid-cols-2',
}: MCRoomTilesProps) {
  const now = Date.now();
  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={`grid ${columnsClass} gap-3 h-full`}>
      {sorted.map((room) => {
        const current = bookings.find((b) => {
          if (b.roomId !== room.id) return false;
          const start = new Date(b.startTime).getTime();
          const end = new Date(b.endTime).getTime();
          const status = (b.bookingStatus || b.status || '').toUpperCase();
          return (
            start <= now &&
            end > now &&
            status !== 'CANCELLED' &&
            status !== 'COMPLETED'
          );
        });

        const isMaint = room.status === 'MAINTENANCE';
        const isClosed = room.status === 'CLOSED';
        const variant: 'cyan' | 'gray' | 'dim' = isMaint || isClosed
          ? 'dim'
          : current
            ? 'cyan'
            : 'gray';

        const remaining = current ? timeRemaining(current.endTime, now) : null;
        const endingSoon = remaining !== null && remaining.mins <= 10;

        const statusLabel = isMaint
          ? 'MAINTENANCE'
          : isClosed
            ? 'CLOSED'
            : current
              ? endingSoon
                ? 'ENDING SOON'
                : 'OCCUPIED'
              : 'AVAILABLE';

        const accentColor =
          variant === 'dim'
            ? 'var(--mc-text-meta-dim)'
            : variant === 'cyan'
              ? endingSoon
                ? 'var(--mc-amber)'
                : 'var(--mc-cyan)'
              : 'var(--mc-text-meta)';

        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelectRoom?.(room.id)}
            className="mc-room-tile text-left rounded-sm px-4 py-3 flex flex-col gap-2 transition-colors focus:outline-none focus-visible:ring-1"
            style={{
              background: 'var(--mc-surface, transparent)',
              border: '1px solid var(--mc-divider)',
              borderLeft: `3px solid ${accentColor}`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MCStatDot variant={variant} pulse={!!current && !isMaint && !isClosed} />
                <span
                  className="mc-mono text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: accentColor }}
                >
                  {statusLabel}
                </span>
              </div>
              {remaining && (
                <span
                  className="mc-mono text-[11px]"
                  style={{ color: endingSoon ? 'var(--mc-amber)' : 'var(--mc-text-meta)' }}
                >
                  {remaining.label}
                </span>
              )}
            </div>

            <div className="flex-1 flex items-center">
              <span
                className="text-base font-semibold"
                style={{ color: 'var(--mc-text-primary)' }}
              >
                {room.name}
              </span>
            </div>

            <div
              className="text-xs truncate"
              style={{ color: 'var(--mc-text-meta)' }}
            >
              {current
                ? current.customerName
                : isMaint
                  ? 'Out of service'
                  : isClosed
                    ? 'Closed today'
                    : 'Available now'}
            </div>
          </button>
        );
      })}
    </div>
  );
}
