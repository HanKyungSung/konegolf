import React, { useEffect, useMemo, useState } from 'react';
import type { Booking, Room } from '@/services/pos-api';
import { toDateStringInTz, getTimePartsInTz } from '@/lib/timezone';

export interface TimelineViewProps {
  bookings: Booking[];
  rooms: Room[];
  onBookingClick: (bookingId: string) => void;
  currentWeekStart: Date;
  setCurrentWeekStart: React.Dispatch<React.SetStateAction<Date>>;
  taxRate: number;
  activeTimezone: string;
  timelineTz: 'venue' | 'browser';
  setTimelineTz: (tz: 'venue' | 'browser') => void;
}

const ROOM_COLORS = [
  {
    solid: 'var(--mc-cyan)',
    bg: 'rgba(29, 224, 197, 0.22)',
    pastBg: 'rgba(29, 224, 197, 0.10)',
    pastBorder: 'rgba(29, 224, 197, 0.45)',
  },
  {
    solid: 'var(--mc-magenta)',
    bg: 'rgba(244, 122, 165, 0.22)',
    pastBg: 'rgba(244, 122, 165, 0.10)',
    pastBorder: 'rgba(244, 122, 165, 0.45)',
  },
  {
    solid: 'var(--mc-purple)',
    bg: 'rgba(184, 85, 231, 0.22)',
    pastBg: 'rgba(184, 85, 231, 0.10)',
    pastBorder: 'rgba(184, 85, 231, 0.45)',
  },
  {
    solid: 'var(--mc-green)',
    bg: 'rgba(95, 214, 146, 0.22)',
    pastBg: 'rgba(95, 214, 146, 0.10)',
    pastBorder: 'rgba(95, 214, 146, 0.45)',
  },
];


export function TimelineView({
  bookings,
  rooms,
  onBookingClick,
  currentWeekStart,
  setCurrentWeekStart,
  activeTimezone,
  timelineTz,
  setTimelineTz,
}: TimelineViewProps) {
  const dayStart = 10 * 60;
  const dayEnd = 24 * 60;
  const totalMinutes = dayEnd - dayStart;

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      return day;
    });
  }, [currentWeekStart]);

  const navigateWeek = (dir: 'prev' | 'next') => {
    setCurrentWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (dir === 'prev' ? -7 : 7));
      return newDate;
    });
  };

  const dateKey = (d: Date) => toDateStringInTz(d, activeTimezone);

  const isBookingPast = (booking: Booking) => {
    const endTime = new Date(booking.endTime);
    const bookingStatus = (booking.bookingStatus || booking.status || '').toUpperCase();
    return endTime < currentTime || bookingStatus === 'COMPLETED';
  };

  const filterBookingsByStatus = (list: Booking[]) =>
    list.filter((b) => {
      const bs = (b.bookingStatus || b.status || '').toUpperCase();
      return bs === 'BOOKED' || bs === 'COMPLETED';
    });

  const getCurrentTimePosition = (day: Date) => {
    const todayStr = toDateStringInTz(currentTime, activeTimezone);
    if (todayStr !== dateKey(day)) return null;
    const tp = getTimePartsInTz(currentTime, activeTimezone);
    if (tp.hours < 10) return null;
    const mins = tp.hours * 60 + tp.minutes;
    return ((mins - dayStart) / totalMinutes) * 100;
  };

  const currentTimeLabel = useMemo(() => {
    const tp = getTimePartsInTz(currentTime, activeTimezone);
    return `${tp.hours}:${String(tp.minutes).padStart(2, '0')}`;
  }, [currentTime, activeTimezone]);

  return (
    <>
      {/* Header panel */}
      <div className="mc-panel px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="mc-section-label flex-1 min-w-[160px]">Weekly Timeline</div>
        <button
          className="mc-btn"
          style={{ padding: '0.3rem 0.7rem', fontSize: '0.7rem' }}
          onClick={() => navigateWeek('prev')}
        >
          ← Prev
        </button>
        <span className="mc-mono mc-meta text-xs min-w-[180px] text-center">
          {weekDays[0].toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: activeTimezone,
          })}{' '}
          –{' '}
          {weekDays[6].toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: activeTimezone,
          })}
        </span>
        <button
          className="mc-btn"
          style={{ padding: '0.3rem 0.7rem', fontSize: '0.7rem' }}
          onClick={() => navigateWeek('next')}
        >
          Next →
        </button>
        <button
          className="mc-btn"
          style={{ padding: '0.3rem 0.7rem', fontSize: '0.7rem' }}
          onClick={() => {
            const next = timelineTz === 'venue' ? 'browser' : 'venue';
            localStorage.setItem('pos-timeline-tz', next);
            setTimelineTz(next);
          }}
          title={`Currently: ${activeTimezone}`}
        >
          {timelineTz === 'venue'
            ? 'AT'
            : Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone.split('/')
                .pop()
                ?.replace('_', ' ')}
        </button>
      </div>

      {/* Per-day panels */}
      {weekDays.map((day) => {
            const dayStr = dateKey(day);
            const dayBookings = bookings.filter(
              (b) => b.date === dayStr && b.bookingSource !== 'QUICK_SALE'
            );
            const filtered = filterBookingsByStatus(dayBookings);
            const totalHours = filtered.reduce((s, b) => s + (b.duration || 0), 0);

            return (
              <div key={dayStr} className="mc-panel px-5 py-4">
                <div className="overflow-x-auto -mx-5 px-5">
                  <div className="min-w-[760px] space-y-3">
                {/* Day header */}
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium min-w-[140px]">
                    {day.toLocaleDateString('en-US', {
                      weekday: 'long',
                      timeZone: activeTimezone,
                    })}
                  </h3>
                  <div className="mc-meta-dim mc-mono">
                    {day.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: activeTimezone,
                    })}
                  </div>
                  <div className="flex-1 h-px bg-[color:var(--mc-divider-soft)]" />
                  <span className="mc-mono text-xs text-[color:var(--mc-gray)]">
                    {totalHours}h · {filtered.length} booking
                    {filtered.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Hour labels */}
                <div className="flex items-start gap-3">
                  <div className="min-w-[90px]" />
                  <div className="flex-1 flex">
                    {Array.from({ length: 14 }, (_, i) => {
                      const hour = i + 10;
                      const label = hour === 12 ? '12P' : hour > 12 ? `${hour - 12}P` : `${hour}A`;
                      return (
                        <div key={i} className="flex-1">
                          <span className="mc-mono text-[9px] text-[color:var(--mc-gray-dim)]">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rows */}
                {rooms.map((room, roomIdx) => {
                  const roomBookings = filterBookingsByStatus(
                    dayBookings.filter((b) => b.roomId === room.id)
                  );
                  const currentTimePos = getCurrentTimePosition(day);
                  const roomColor = ROOM_COLORS[roomIdx % ROOM_COLORS.length];

                  return (
                    <div key={room.id} className="flex items-start gap-3">
                      <div className="min-w-[90px] pt-3 flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: roomColor.solid }}
                          aria-hidden="true"
                        />
                        <span className="text-[13px] font-semibold text-[color:var(--mc-text-primary)]">
                          {room.name}
                        </span>
                      </div>

                      <div className="flex-1 relative h-16 bg-[color:var(--mc-divider-soft)]/40 overflow-hidden">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {Array.from({ length: 14 }, (_, i) => (
                            <div
                              key={i}
                              className="flex-1 border-r border-[color:var(--mc-divider-soft)] last:border-r-0"
                            />
                          ))}
                        </div>

                        {/* Current time */}
                        {currentTimePos !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-px z-20"
                            style={{
                              left: `${currentTimePos}%`,
                              background: 'var(--mc-magenta)',
                              boxShadow: '0 0 8px var(--mc-magenta)',
                            }}
                          >
                            <div
                              className="absolute -top-5 -translate-x-1/2 mc-mono text-[9px]"
                              style={{ color: 'var(--mc-magenta)' }}
                            >
                              {currentTimeLabel}
                            </div>
                          </div>
                        )}

                        {/* Blocks */}
                        {roomBookings.map((b) => {
                          const [h, m] = b.time.split(':').map(Number);
                          const startMinutes = h * 60 + m;
                          const leftPct = ((startMinutes - dayStart) / totalMinutes) * 100;
                          const widthPct = ((b.duration * 60) / totalMinutes) * 100;
                          const past = isBookingPast(b);

                          return (
                            <div
                              key={b.id}
                              onClick={() => onBookingClick(b.id)}
                              className="absolute top-2 bottom-2 rounded-sm cursor-pointer overflow-hidden group transition-all hover:brightness-125"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                background: past ? roomColor.pastBg : roomColor.bg,
                                borderLeft: `2px solid ${past ? roomColor.pastBorder : roomColor.solid}`,
                                opacity: past ? 0.55 : 1,
                              }}
                            >
                              <div className="h-full flex flex-col justify-center px-2">
                                <div className="text-[color:var(--mc-text-primary)] text-[12px] font-semibold truncate">
                                  {b.customerName}
                                </div>
                                <div className="mc-mono text-[11px] font-medium text-[color:var(--mc-text-meta)] truncate">
                                  {b.time} · {b.players}p · {b.duration}h
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
                  </div>
                </div>
            );
          })}
    </>
  );
}
