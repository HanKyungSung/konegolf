import React from 'react';
import type { Room, Booking } from '@/services/pos-api';

interface MCVenueViewProps {
  rooms: Room[];
  bookings: Booking[];
  onSelectRoom?: (roomId: string) => void;
}

type NodeStatus = 'idle' | 'occupied' | 'completed' | 'maintenance' | 'closed';

function nodeStatusFor(room: Room, bookings: Booking[]): { status: NodeStatus; current?: Booking; upcoming?: Booking } {
  if (room.status === 'MAINTENANCE') return { status: 'maintenance' };
  if (room.status === 'CLOSED') return { status: 'closed' };

  const now = Date.now();
  const roomBookings = bookings.filter((b) => b.roomId === room.id && b.bookingStatus !== 'CANCELLED');

  const current = roomBookings.find((b) => {
    const start = new Date(b.startTime).getTime();
    const end = new Date(b.endTime).getTime();
    return start <= now && end > now && b.bookingStatus !== 'COMPLETED';
  });
  if (current) return { status: 'occupied', current };

  const recent = roomBookings
    .filter((b) => {
      const end = new Date(b.endTime).getTime();
      return end <= now && now - end < 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())[0];

  const upcoming = roomBookings
    .filter((b) => new Date(b.startTime).getTime() > now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  if (recent) return { status: 'completed', current: recent, upcoming };
  return { status: 'idle', upcoming };
}

function fmtTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Halifax',
  });
}

export function MCVenueView({ rooms, bookings, onSelectRoom }: MCVenueViewProps) {
  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full border opacity-20"
          style={{
            width: 'min(80%, 520px)',
            aspectRatio: '1',
            borderColor: 'var(--mc-divider)',
          }}
        />
        <div
          className="absolute rounded-full border opacity-10"
          style={{
            width: 'min(100%, 680px)',
            aspectRatio: '1',
            borderColor: 'var(--mc-divider)',
          }}
        />
      </div>

      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8 p-8">
        {sorted.map((room) => {
          const { status, current, upcoming } = nodeStatusFor(room, bookings);
          const nodeCls =
            status === 'occupied'
              ? 'mc-node mc-node-occupied'
              : status === 'completed'
              ? 'mc-node mc-node-completed'
              : status === 'maintenance'
              ? 'mc-node mc-node-maintenance'
              : 'mc-node';

          return (
            <button
              key={room.id}
              onClick={() => onSelectRoom?.(room.id)}
              className="flex flex-col items-center gap-3 group focus:outline-none"
            >
              <div className="relative">
                {status === 'occupied' && (
                  <span
                    className="mc-pulse-ring"
                    style={{
                      boxShadow: '0 0 0 1px var(--mc-cyan)',
                    }}
                  />
                )}
                <div className={nodeCls}>
                  <span className="text-sm font-medium tracking-wide">
                    {room.name}
                  </span>
                  {status === 'occupied' && current && (
                    <span className="mc-mono text-[10px] text-[color:var(--mc-cyan)] mt-1">
                      LIVE
                    </span>
                  )}
                </div>
              </div>

              <div className="text-center min-h-[2.5rem]">
                {status === 'occupied' && current && (
                  <>
                    <div className="text-xs text-[color:var(--mc-white)] truncate max-w-[120px]">
                      {current.customerName}
                    </div>
                    <div className="mc-meta-dim mc-mono">
                      until {fmtTimeShort(current.endTime)}
                    </div>
                  </>
                )}
                {status === 'idle' && upcoming && (
                  <>
                    <div className="mc-meta truncate max-w-[120px]">next</div>
                    <div className="mc-meta-dim mc-mono">
                      {fmtTimeShort(upcoming.startTime)}
                    </div>
                  </>
                )}
                {status === 'completed' && (
                  <div className="mc-meta-dim mc-mono">just ended</div>
                )}
                {status === 'maintenance' && (
                  <div className="mc-meta-dim">maintenance</div>
                )}
                {status === 'closed' && (
                  <div className="mc-meta-dim">closed</div>
                )}
                {status === 'idle' && !upcoming && (
                  <div className="mc-meta-dim">available</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
