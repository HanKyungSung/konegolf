import React from 'react';
import type { Room, Booking } from '@/services/pos-api';
import { MCStatDot } from './MCStatDot';

interface MCRoomRailProps {
  rooms: Room[];
  bookings: Booking[];
  onSelectRoom?: (roomId: string) => void;
}

function timeRemaining(endIso: string, now: number): string {
  const diff = new Date(endIso).getTime() - now;
  if (diff <= 0) return '--:--';
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function MCRoomRail({ rooms, bookings, onSelectRoom }: MCRoomRailProps) {
  const now = Date.now();
  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside
      className="hidden 2xl:flex fixed left-0 top-0 bottom-0 flex-col z-30 pointer-events-none"
      style={{ width: '200px', paddingTop: '88px', paddingBottom: '24px' }}
      aria-label="Room status rail"
    >
      <div className="flex flex-col h-full pl-6 pr-4 pointer-events-auto">
        <div className="mc-section-label mb-1">Now Playing</div>
        <div className="mc-meta-dim mc-mono mb-4">{sorted.length} rooms</div>

        <ul className="flex flex-col gap-3 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
          {sorted.map((room) => {
            const current = bookings.find((b) => {
              if (b.roomId !== room.id) return false;
              const start = new Date(b.startTime).getTime();
              const end = new Date(b.endTime).getTime();
              const status = (b.bookingStatus || b.status || '').toUpperCase();
              return start <= now && end > now && status !== 'CANCELLED' && status !== 'COMPLETED';
            });

            const variant =
              room.status === 'MAINTENANCE' || room.status === 'CLOSED'
                ? 'dim'
                : current
                ? 'cyan'
                : 'gray';

            return (
              <li key={room.id}>
                <button
                  onClick={() => onSelectRoom?.(room.id)}
                  className="w-full text-left group focus:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <MCStatDot variant={variant} pulse={!!current} />
                    <span className="text-xs font-medium text-white group-hover:text-[color:var(--mc-cyan)] transition-colors">
                      {room.name}
                    </span>
                    {current && (
                      <span className="ml-auto mc-mono text-[10px] text-[color:var(--mc-cyan)]">
                        {timeRemaining(current.endTime, now)}
                      </span>
                    )}
                  </div>
                  <div className="mc-meta-dim mc-mono pl-4 truncate">
                    {current
                      ? current.customerName
                      : room.status === 'MAINTENANCE'
                      ? 'maintenance'
                      : room.status === 'CLOSED'
                      ? 'closed'
                      : 'available'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
