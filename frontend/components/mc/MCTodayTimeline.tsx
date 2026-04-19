import React, { useMemo } from 'react';
import type { Room, Booking } from '@/services/pos-api';

interface MCTodayTimelineProps {
  rooms: Room[];
  bookings: Booking[]; // already filtered to today (or will be filtered inside)
  onBookingClick?: (bookingId: string) => void;
  /** Hour window. Defaults 6 → 23 (6am to 11pm). */
  startHour?: number;
  endHour?: number;
}

// Per-room accent palette (mirror of dashboard.tsx ROOM_COLORS).
const ROOM_COLORS = [
  { solid: 'var(--mc-cyan)', bg: 'rgba(29, 224, 197, 0.22)' },
  { solid: 'var(--mc-magenta)', bg: 'rgba(244, 122, 165, 0.22)' },
  { solid: 'var(--mc-purple)', bg: 'rgba(184, 85, 231, 0.22)' },
  { solid: 'var(--mc-green)', bg: 'rgba(95, 214, 146, 0.22)' },
];

function hourToLabel(h: number): string {
  const display = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'a' : 'p';
  return `${display}${suffix}`;
}

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isToday(iso: string, todayStart: number): boolean {
  const t = new Date(iso).getTime();
  return t >= todayStart && t < todayStart + 86_400_000;
}

/**
 * Compact single-day timeline. Horizontal ribbon, one lane per room.
 * X axis: startHour → endHour. Booking blocks colored by room.
 * "Now" indicator overlaid.
 */
export function MCTodayTimeline({
  rooms,
  bookings,
  onBookingClick,
  startHour = 6,
  endHour = 23,
}: MCTodayTimelineProps) {
  const todayStart = useMemo(() => startOfTodayLocal().getTime(), []);
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => a.name.localeCompare(b.name)),
    [rooms],
  );

  const todayBookings = useMemo(
    () => bookings.filter((b) => isToday(b.startTime, todayStart)),
    [bookings, todayStart],
  );

  const totalHours = endHour - startHour;
  const windowStartMs = todayStart + startHour * 3_600_000;
  const windowEndMs = todayStart + endHour * 3_600_000;
  const windowSpanMs = windowEndMs - windowStartMs;

  const now = Date.now();
  const nowPct =
    now >= windowStartMs && now <= windowEndMs
      ? ((now - windowStartMs) / windowSpanMs) * 100
      : null;

  // hour gridline positions (0%, ... 100%)
  const hourTicks: Array<{ hour: number; pct: number }> = [];
  for (let h = startHour; h <= endHour; h += 1) {
    hourTicks.push({
      hour: h,
      pct: ((h - startHour) / totalHours) * 100,
    });
  }

  const LANE_HEIGHT = 56;

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0">
        {/* Hour grid + labels */}
        <div className="absolute inset-0 flex flex-col">
          {/* hour labels */}
          <div
            className="relative h-5 flex-shrink-0"
            style={{ marginLeft: 72 }}
          >
            {hourTicks.map((t) => (
              <span
                key={t.hour}
                className="absolute top-0 mc-mono text-[10px] uppercase tracking-wider -translate-x-1/2"
                style={{
                  left: `${t.pct}%`,
                  color: 'var(--mc-text-meta-dim)',
                }}
              >
                {hourToLabel(t.hour)}
              </span>
            ))}
          </div>

          {/* Lane area */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {/* Vertical grid lines */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ marginLeft: 72 }}
            >
              {hourTicks.map((t) => (
                <span
                  key={t.hour}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${t.pct}%`,
                    width: 1,
                    background:
                      t.hour % 3 === 0
                        ? 'var(--mc-divider)'
                        : 'var(--mc-divider-soft)',
                  }}
                />
              ))}
            </div>

            {/* Now line */}
            {nowPct !== null && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ marginLeft: 72 }}
              >
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${nowPct}%`,
                    width: 1,
                    background: 'var(--mc-amber)',
                    boxShadow: '0 0 6px rgba(245, 158, 11, 0.55)',
                  }}
                >
                  <span
                    className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full"
                    style={{ background: 'var(--mc-amber)' }}
                  />
                </div>
              </div>
            )}

            {/* Lanes */}
            <div
              className="absolute inset-0 overflow-y-auto"
              style={{ scrollbarWidth: 'thin' }}
            >
              {sortedRooms.map((room, idx) => {
                const color = ROOM_COLORS[idx % ROOM_COLORS.length];
                const laneBookings = todayBookings.filter(
                  (b) => b.roomId === room.id,
                );

                return (
                  <div
                    key={room.id}
                    className="relative flex items-center"
                    style={{
                      height: LANE_HEIGHT,
                      borderBottom: '1px solid var(--mc-divider-soft)',
                    }}
                  >
                    {/* Lane label */}
                    <div
                      className="flex-shrink-0 pr-3 flex items-center gap-2"
                      style={{ width: 72 }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: color.solid }}
                      />
                      <span
                        className="mc-mono text-[11px] truncate"
                        style={{ color: 'var(--mc-text-primary)' }}
                      >
                        {room.name}
                      </span>
                    </div>

                    {/* Lane track */}
                    <div className="relative flex-1 h-full">
                      {laneBookings.map((b) => {
                        const start = new Date(b.startTime).getTime();
                        const end = new Date(b.endTime).getTime();
                        const clampedStart = Math.max(start, windowStartMs);
                        const clampedEnd = Math.min(end, windowEndMs);
                        if (clampedEnd <= windowStartMs || clampedStart >= windowEndMs) {
                          return null;
                        }
                        const leftPct =
                          ((clampedStart - windowStartMs) / windowSpanMs) * 100;
                        const widthPct =
                          ((clampedEnd - clampedStart) / windowSpanMs) * 100;
                        const past = end < now;
                        const status = (b.bookingStatus || b.status || '').toUpperCase();
                        const cancelled = status === 'CANCELLED';

                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => onBookingClick?.(b.id)}
                            className="absolute rounded-sm px-2 py-1 text-left overflow-hidden focus:outline-none focus-visible:ring-1 transition-opacity"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: 6,
                              bottom: 6,
                              background: color.bg,
                              borderLeft: `2px solid ${color.solid}`,
                              opacity: cancelled ? 0.35 : past ? 0.55 : 1,
                              textDecoration: cancelled ? 'line-through' : 'none',
                            }}
                            title={`${b.customerName || 'Booking'} · ${b.time || ''}`}
                          >
                            <div
                              className="mc-mono text-[11px] truncate"
                              style={{ color: 'var(--mc-text-primary)' }}
                            >
                              {b.customerName || 'Booking'}
                            </div>
                            <div
                              className="mc-mono text-[10px] truncate"
                              style={{ color: 'var(--mc-text-meta)' }}
                            >
                              {b.time}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
