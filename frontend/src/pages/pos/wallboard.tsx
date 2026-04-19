import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  ShoppingBag,
  Utensils,
  Clock as ClockIcon,
  Camera,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAttentionMock } from '@/hooks/use-attention-mock';
import {
  listBookings,
  listRooms,
  type Booking,
  type Room,
} from '@/services/pos-api';
import { WsStatusDot } from '@/components/WsStatusDot';
import { PiHealthDot } from '@/components/PiHealthDot';
import {
  MCHero,
  MCDataStream,
  MCRoomTiles,
  MCTodayTimeline,
  MCAttentionBell,
  MCAttentionList,
  MCHealthDot,
  type MCStreamEvent,
  type MCStreamEventType,
} from '@/components/mc';
import {
  VENUE_TIMEZONE,
  todayRange,
  toDateStringInTz,
  getTimePartsInTz,
} from '@/lib/timezone';

/**
 * Wallboard POC — single-viewport dashboard (1440×900 target, zero scroll).
 * Admin-only. Real /pos/dashboard untouched.
 */
export default function WallboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live clock for the header + relative-time derivations.
  useEffect(() => {
    const t = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const today = todayRange();
      const [todayBookings, roomsData] = await Promise.all([
        listBookings({ startDate: today.start, endDate: today.end, limit: 200 }),
        listRooms(),
      ]);
      const enriched = todayBookings.map((b) => {
        const start = new Date(b.startTime);
        const end = new Date(b.endTime);
        const room = roomsData.find((r) => r.id === b.roomId);
        const localDate = toDateStringInTz(start, VENUE_TIMEZONE);
        const tp = getTimePartsInTz(start, VENUE_TIMEZONE);
        const localTime = `${String(tp.hours).padStart(2, '0')}:${String(tp.minutes).padStart(2, '0')}`;
        return {
          ...b,
          date: localDate,
          time: localTime,
          duration: (end.getTime() - start.getTime()) / (1000 * 60 * 60),
          roomName: room?.name || 'Unknown Room',
        };
      });
      setBookings(enriched);
      setRooms(roomsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, 15_000);
    return () => window.clearInterval(poll);
  }, [load]);

  const attentionMock = useAttentionMock();

  // Active sessions count for the header stats.
  const activeCount = useMemo(() => {
    const now = currentTime.getTime();
    return bookings.filter((b) => {
      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();
      const status = (b.bookingStatus || b.status || '').toUpperCase();
      return start <= now && end > now && status !== 'CANCELLED' && status !== 'COMPLETED';
    }).length;
  }, [bookings, currentTime]);

  // Derive stream events restricted to today. Same shape as the main dashboard.
  const streamEvents = useMemo<MCStreamEvent[]>(() => {
    const events: MCStreamEvent[] = [];
    const now = currentTime.getTime();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const inToday = (ms: number) =>
      ms >= todayStartMs && ms < todayStartMs + 86_400_000;

    bookings.forEach((b) => {
      const created = new Date(b.createdAt).getTime();
      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();
      const status = (b.bookingStatus || b.status || '').toUpperCase();
      const payStatus = (b.paymentStatus || '').toUpperCase();

      if (inToday(created)) {
        events.push({
          id: `create-${b.id}`,
          timestamp: new Date(b.createdAt),
          type: (b.bookingSource === 'QUICK_SALE'
            ? 'QuickSale'
            : 'BookingCreate') as MCStreamEventType,
          primary: `${b.roomName} · ${b.players}p · ${b.duration}h`,
          secondary: b.customerName,
          meta: b.bookingSource || 'ONLINE',
        });
      }
      if (
        status === 'BOOKED' &&
        start <= now &&
        end > now &&
        inToday(start)
      ) {
        events.push({
          id: `start-${b.id}`,
          timestamp: new Date(start),
          type: 'SessionStart',
          primary: `${b.roomName}`,
          secondary: b.customerName,
        });
      }
      if (status === 'COMPLETED' && inToday(end)) {
        events.push({
          id: `end-${b.id}`,
          timestamp: new Date(end),
          type: 'SessionEnd',
          primary: `${b.roomName} · $${b.price.toFixed(2)}`,
          secondary: b.customerName,
        });
      }
      if (payStatus === 'PAID' && b.updatedAt && inToday(new Date(b.updatedAt).getTime())) {
        events.push({
          id: `pay-${b.id}`,
          timestamp: new Date(b.updatedAt),
          type: 'PaymentSettle',
          primary: `${b.roomName} · $${b.price.toFixed(2)}`,
          secondary: b.customerName,
        });
      }
    });

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 60);
  }, [bookings, currentTime]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen mc-root flex items-center justify-center">
        <div className="text-center">
          <div className="mc-section-label mb-2">// ACCESS DENIED</div>
          <p className="mc-mono text-sm text-[color:var(--mc-text-meta)]">Admin only.</p>
        </div>
      </div>
    );
  }

  const clockText = currentTime.toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: VENUE_TIMEZONE,
  });

  return (
    <div
      className="mc-root grid"
      style={{
        height: '100dvh',
        gridTemplateRows: '56px 1fr 64px',
      }}
    >
      {/* HEADER */}
      <header
        className="flex items-center justify-between px-6 border-b"
        style={{ background: 'var(--mc-bg)', borderColor: 'var(--mc-divider)' }}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/pos/dashboard')}
            className="mc-mono text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            style={{ color: 'var(--mc-text-meta-dim)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mc-cyan)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mc-text-meta-dim)')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <div className="flex flex-col leading-tight">
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--mc-text-hero)' }}
            >
              K one Golf
            </span>
            <span className="mc-section-label">// WALLBOARD · POC</span>
          </div>
        </div>

        <div className="flex items-center gap-5 mc-mono text-[12px]">
          <Pill label="Clock" value={clockText} />
          <Pill label="Today" value={String(bookings.length)} />
          <Pill label="Active" value={String(activeCount)} accent />
          <Pill label="Attention" value={String(attentionMock.items.length)} />
        </div>

        <div className="flex items-center gap-2">
          <WsStatusDot />
          <PiHealthDot />
          <MCHealthDot enabled />
          <span
            aria-hidden
            className="inline-block h-5 w-px"
            style={{ background: 'var(--mc-divider)' }}
          />
          <MCAttentionBell
            items={attentionMock.items}
            readIds={attentionMock.readIds}
            onMarkRead={attentionMock.markRead}
            onMarkAllRead={attentionMock.markAllRead}
            onOpenItem={(item) => {
              if (item.linkHref) navigate(item.linkHref);
            }}
          />
        </div>
      </header>

      {/* MAIN GRID */}
      <main
        className="min-h-0 grid gap-3 px-3 py-3"
        style={{
          gridTemplateColumns: '280px 1fr 340px',
          gridTemplateRows: '260px 1fr',
          gridTemplateAreas: `
            "stats timeline stream"
            "rooms attention stream"
          `,
        }}
      >
        {/* STATS */}
        <section className="mc-panel p-4 flex flex-col gap-3" style={{ gridArea: 'stats' }}>
          <div className="mc-section-label">// STATS</div>
          <div className="flex-1 flex flex-col justify-around">
            <MCHero
              number={bookings.length}
              label="Today's Bookings"
              sublabel={loading ? 'Loading…' : 'Confirmed + completed'}
              muted
            />
            <MCHero
              number={activeCount}
              label="Active Sessions"
              sublabel="In progress now"
              accent
            />
          </div>
        </section>

        {/* TIMELINE */}
        <section className="mc-panel p-4 flex flex-col gap-3 min-h-0" style={{ gridArea: 'timeline' }}>
          <div className="flex items-center justify-between">
            <div className="mc-section-label">// TODAY · 6AM → 11PM</div>
            <span
              className="mc-mono text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--mc-text-meta-dim)' }}
            >
              {bookings.length} booking{bookings.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <MCTodayTimeline
              rooms={rooms}
              bookings={bookings}
              onBookingClick={(id) => navigate(`/pos/booking/${id}`)}
            />
          </div>
        </section>

        {/* STREAM */}
        <section
          className="mc-panel p-4 flex flex-col min-h-0"
          style={{ gridArea: 'stream' }}
        >
          <MCDataStream events={streamEvents} maxEntries={60} />
        </section>

        {/* ROOM TILES */}
        <section className="mc-panel p-4 flex flex-col gap-3 min-h-0" style={{ gridArea: 'rooms' }}>
          <div className="mc-section-label">// ROOM STATUS</div>
          <div className="flex-1 min-h-0">
            <MCRoomTiles
              rooms={rooms}
              bookings={bookings}
              onSelectRoom={(roomId) => {
                const current = bookings.find((b) => {
                  if (b.roomId !== roomId) return false;
                  const now = Date.now();
                  const start = new Date(b.startTime).getTime();
                  const end = new Date(b.endTime).getTime();
                  return start <= now && end > now;
                });
                if (current) navigate(`/pos/booking/${current.id}`);
              }}
            />
          </div>
        </section>

        {/* ATTENTION */}
        <section
          className="mc-panel flex flex-col min-h-0 overflow-hidden"
          style={{ gridArea: 'attention' }}
        >
          <MCAttentionList
            items={attentionMock.items}
            readIds={attentionMock.readIds}
            onMarkRead={attentionMock.markRead}
            onMarkAllRead={attentionMock.markAllRead}
            onOpenItem={(item) => {
              if (item.linkHref) navigate(item.linkHref);
            }}
            listClassName="flex-1 overflow-y-auto"
          />
        </section>
      </main>

      {/* FOOTER ACTION DOCK */}
      <footer
        className="flex items-center justify-between px-6 border-t"
        style={{ background: 'var(--mc-bg)', borderColor: 'var(--mc-divider)' }}
      >
        <div className="flex items-center gap-3">
          <FooterPrimary icon={<Plus className="w-4 h-4" />} label="Booking" onClick={() => navigate('/pos/dashboard')} />
          <FooterPrimary icon={<ShoppingBag className="w-4 h-4" />} label="Quick Sale" onClick={() => navigate('/pos/dashboard')} />
        </div>
        <div className="flex items-center gap-4">
          <FooterChip icon={<Utensils className="w-3.5 h-3.5" />} label="Menu" onClick={() => navigate('/pos/menu')} />
          <FooterChip icon={<ClockIcon className="w-3.5 h-3.5" />} label="Time" onClick={() => navigate('/pos/time-management')} />
          <FooterChip icon={<Camera className="w-3.5 h-3.5" />} label="Receipts" onClick={() => navigate('/pos/pending-receipts')} />
          <FooterChip icon={<UsersRound className="w-3.5 h-3.5" />} label="Customers" onClick={() => navigate('/admin/customers')} />
        </div>
      </footer>
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-[10px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--mc-text-meta-dim)' }}
      >
        {label}
      </span>
      <span
        className="mc-mono"
        style={{
          color: accent ? 'var(--mc-cyan)' : 'var(--mc-text-primary)',
          fontSize: 14,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FooterPrimary({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-sm mc-mono text-[12px] uppercase tracking-wider transition-colors"
      style={{
        color: 'var(--mc-cyan)',
        border: '1px solid var(--mc-cyan)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(29, 224, 197, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function FooterChip({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 mc-mono text-[11px] uppercase tracking-wider transition-colors"
      style={{ color: 'var(--mc-text-meta)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mc-cyan)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mc-text-meta)')}
    >
      {icon}
      {label}
    </button>
  );
}
