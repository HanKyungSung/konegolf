import React from 'react';
import type { Room, Booking } from '@/services/pos-api';
import { MCStatDot } from './MCStatDot';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Check } from 'lucide-react';

interface MCRoomRailProps {
  rooms: Room[];
  bookings: Booking[];
  onSelectRoom?: (roomId: string) => void;
  onChangeStatus?: (roomId: string, nextStatus: string) => void;
  isReadOnly?: boolean;
}

function timeRemaining(endIso: string, now: number): string {
  const diff = new Date(endIso).getTime() - now;
  if (diff <= 0) return '--:--';
  const mins = Math.floor(diff / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const STATUS_OPTIONS: Array<{ value: string; label: string; dot: 'cyan' | 'gray' | 'dim' }> = [
  { value: 'ACTIVE', label: 'Active', dot: 'cyan' },
  { value: 'MAINTENANCE', label: 'Maintenance', dot: 'gray' },
  { value: 'CLOSED', label: 'Closed', dot: 'dim' },
];

export function MCRoomRail({
  rooms,
  bookings,
  onSelectRoom,
  onChangeStatus,
  isReadOnly,
}: MCRoomRailProps) {
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

        <ul className="flex flex-col gap-3 overflow-y-auto flex-1 mc-scroll-none">
          {sorted.map((room) => {
            const current = bookings.find((b) => {
              if (b.roomId !== room.id) return false;
              if (b.bookingSource === 'QUICK_SALE') return false;
              const start = new Date(b.startTime).getTime();
              const end = new Date(b.endTime).getTime();
              const status = (b.bookingStatus || b.status || '').toUpperCase();
              return start <= now && end > now && status !== 'CANCELLED' && status !== 'COMPLETED';
            });

            const variant: 'cyan' | 'gray' | 'dim' =
              room.status === 'MAINTENANCE' || room.status === 'CLOSED'
                ? 'dim'
                : current
                ? 'cyan'
                : 'gray';

            const subline = current
              ? current.customerName
              : room.status === 'MAINTENANCE'
              ? 'maintenance'
              : room.status === 'CLOSED'
              ? 'closed'
              : 'available';

            return (
              <li key={room.id}>
                <div className="flex items-center gap-2 group">
                  {/* Status dot — admin: popover trigger; otherwise static */}
                  {!isReadOnly && onChangeStatus ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Change ${room.name} status`}
                          className="relative focus:outline-none rounded-full p-0.5 -m-0.5 hover:bg-[color:var(--mc-surface-raised)] transition-colors"
                        >
                          <MCStatDot variant={variant} pulse={!!current} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={6}
                        className="mc-popover-content w-44 p-1"
                      >
                        <div className="mc-section-label px-2 pt-1 pb-1">{room.name}</div>
                        <div className="flex flex-col">
                          {STATUS_OPTIONS.map((opt) => {
                            const active = room.status === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={active}
                                onClick={() => {
                                  if (!active) onChangeStatus(room.id, opt.value);
                                  // close popover by blurring — Radix closes on click of another trigger; use document click
                                  (document.activeElement as HTMLElement | null)?.blur();
                                }}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                                  active
                                    ? 'text-[color:var(--mc-cyan)]'
                                    : 'text-white hover:bg-[color:var(--mc-surface)] hover:text-[color:var(--mc-cyan)]'
                                }`}
                              >
                                <MCStatDot variant={opt.dot} />
                                <span className="flex-1">{opt.label}</span>
                                {active && <Check className="h-3.5 w-3.5" />}
                              </button>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <MCStatDot variant={variant} pulse={!!current} />
                  )}

                  <button
                    onClick={() => onSelectRoom?.(room.id)}
                    className="flex-1 text-left focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-[color:var(--mc-cyan)] transition-colors">
                        {room.name}
                      </span>
                      {current && (
                        <span className="ml-auto mc-mono text-[12px] font-semibold text-[color:var(--mc-cyan)]">
                          {timeRemaining(current.endTime, now)}
                        </span>
                      )}
                    </div>
                    <div className="mc-meta-dim mc-mono pl-0 truncate">{subline}</div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
