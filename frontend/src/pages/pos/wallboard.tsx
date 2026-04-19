import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useAttentionMock } from '@/hooks/use-attention-mock';
import {
  listBookings,
  listRooms,
  createQuickSale,
  type Booking,
  type Room,
} from '@/services/pos-api';
import { BookingModal } from './booking-modal';
import { BookingDetailModal } from '@/components/BookingDetailModal';
import { AdminHeader } from '@/components/AdminHeader';
import { WsStatusDot } from '@/components/WsStatusDot';
import { PiHealthDot } from '@/components/PiHealthDot';
import {
  MCHero,
  MCDataStream,
  MCRoomRail,
  MCTelemetryRail,
  MCToolsRail,
  MCActionDock,
  MCHealthDot,
  MCAttentionBell,
  MCAttentionList,
  TimelineView,
  type MCStreamEvent,
  type MCStreamEventType,
  type MCToolsRailItem,
} from '@/components/mc';
import {
  VENUE_TIMEZONE,
  weekRange,
  toDateStringInTz,
  getTimePartsInTz,
} from '@/lib/timezone';
import { Camera, Clock, FileSearch, Utensils, UsersRound } from 'lucide-react';

/**
 * Wallboard POC — mirrors /pos/dashboard panel-for-panel, but adds the
 * Attention notification panel directly beneath the TimelineView.
 * Admin-only dev route. Real dashboard is untouched.
 */
export default function WallboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'STAFF';
  const isReadOnly = !isAdmin && !isStaff;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [timelineTz, setTimelineTz] = useState<'venue' | 'browser'>(() => {
    return (localStorage.getItem('pos-timeline-tz') as 'venue' | 'browser') || 'venue';
  });
  const activeTimezone =
    timelineTz === 'venue'
      ? VENUE_TIMEZONE
      : Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [preselectedRoomId, setPreselectedRoomId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const t = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Keep wallboard pinned to the current week — snap `currentWeekStart` forward
  // whenever the local day changes so the rolling 7-day window stays fresh
  // without a manual refresh.
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today.getTime() !== currentWeekStart.getTime()) {
      setCurrentWeekStart(today);
    }
  }, [currentTime, currentWeekStart]);

  const loadData = useCallback(async () => {
    try {
      const week = weekRange(currentWeekStart);
      const [list, roomList] = await Promise.all([
        listBookings({ startDate: week.start, endDate: week.end, limit: 500 }),
        listRooms(),
      ]);
      const enriched = list.map((b) => {
        const start = new Date(b.startTime);
        const end = new Date(b.endTime);
        const room = roomList.find((r) => r.id === b.roomId);
        const localDate = toDateStringInTz(start, activeTimezone);
        const tp = getTimePartsInTz(start, activeTimezone);
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
      setRooms(roomList);
      setLastSync(new Date());
    } catch (err) {
      console.warn('wallboard load failed', err);
    }
  }, [currentWeekStart, activeTimezone]);

  useEffect(() => {
    loadData();
    const poll = window.setInterval(loadData, 30_000);
    return () => window.clearInterval(poll);
  }, [loadData]);

  const attentionMock = useAttentionMock();

  const activeCount = useMemo(() => {
    const now = currentTime.getTime();
    return bookings.filter((b) => {
      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();
      const status = (b.bookingStatus || b.status || '').toUpperCase();
      return start <= now && end > now && status !== 'CANCELLED' && status !== 'COMPLETED';
    }).length;
  }, [bookings, currentTime]);

  const todayCount = useMemo(() => {
    const today = toDateStringInTz(currentTime, activeTimezone);
    return bookings.filter((b) => b.date === today).length;
  }, [bookings, currentTime, activeTimezone]);

  const derivedStreamEvents = useMemo<MCStreamEvent[]>(() => {
    const events: MCStreamEvent[] = [];
    const now = currentTime.getTime();
    const windowMs = 24 * 60 * 60 * 1000;
    bookings.forEach((b) => {
      const created = new Date(b.createdAt).getTime();
      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();
      const status = (b.bookingStatus || b.status || '').toUpperCase();
      const payStatus = (b.paymentStatus || '').toUpperCase();
      if (now - created < windowMs) {
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
      if (status === 'BOOKED' && start <= now && end > now && now - start < windowMs) {
        events.push({
          id: `start-${b.id}`,
          timestamp: new Date(start),
          type: 'SessionStart',
          primary: `${b.roomName}`,
          secondary: b.customerName,
        });
      }
      if (status === 'COMPLETED' && now - end < windowMs) {
        events.push({
          id: `end-${b.id}`,
          timestamp: new Date(end),
          type: 'SessionEnd',
          primary: `${b.roomName} · $${b.price.toFixed(2)}`,
          secondary: b.customerName,
        });
      }
      if (payStatus === 'PAID' && b.updatedAt && now - new Date(b.updatedAt).getTime() < windowMs) {
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
      .slice(0, 50);
  }, [bookings, currentTime]);

  const openBookingDetail = useCallback((id: string) => {
    setSelectedBookingId(id);
    setBookingModalOpen(true);
  }, []);

  const toolsRailItems: MCToolsRailItem[] = [
    { key: 'receipts', label: 'Receipts', icon: <Camera className="w-4 h-4" />, onClick: () => navigate('/pos/pending-receipts') },
    { key: 'scan', label: 'Scan', icon: <FileSearch className="w-4 h-4" />, onClick: () => navigate('/pos/receipt-scan') },
    { key: 'menu', label: 'Menu', icon: <Utensils className="w-4 h-4" />, onClick: () => navigate('/pos/menu') },
    { key: 'customers', label: 'Customers', icon: <UsersRound className="w-4 h-4" />, onClick: () => navigate('/admin/customers') },
    { key: 'time', label: 'Time', icon: <Clock className="w-4 h-4" />, onClick: () => navigate('/pos/time-management') },
  ];

  if (!isAdmin) {
    return (
      <div className="min-h-screen mc-root flex items-center justify-center">
        <div className="text-center">
          <div className="mc-section-label mb-2">// ACCESS DENIED</div>
          <p className="mc-mono text-sm text-[color:var(--mc-text-meta)]">Admin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-root">
      <AdminHeader
        title="K one Golf"
        subtitle="// POS · WALLBOARD POC"
        variant="mc"
        mcRightExtras={
          <div className="flex items-center gap-2">
            <WsStatusDot />
            <PiHealthDot />
            <MCHealthDot enabled={isAdmin} />
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
        }
      />

      <MCRoomRail
        rooms={rooms}
        bookings={bookings}
        isReadOnly={isReadOnly}
        onSelectRoom={(roomId) => {
          const current = bookings.find((b) => {
            if (b.roomId !== roomId) return false;
            const now = Date.now();
            const start = new Date(b.startTime).getTime();
            const end = new Date(b.endTime).getTime();
            return start <= now && end > now;
          });
          if (current) {
            openBookingDetail(current.id);
          } else if (!isReadOnly) {
            setPreselectedRoomId(roomId);
            setShowCreateModal(true);
          }
        }}
      />
      <MCTelemetryRail
        bookingsCount={bookings.length}
        roomsCount={rooms.length}
        activeCount={activeCount}
        lastSync={lastSync}
      />

      <main className="mx-auto px-4 sm:px-8 2xl:pl-[224px] 2xl:pr-[244px] 2xl:px-0 py-6 sm:py-10 space-y-8 max-w-[1800px] 2xl:max-w-none">
        {/* Top zone: Stats | Timeline+Attention | Data Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-2">
          {/* LEFT — stacked stats + controls */}
          <div className="flex flex-col gap-2">
            <div className="mc-panel py-6">
              <MCHero
                number={bookings.length}
                label="Total Bookings"
                sublabel="Loaded this session"
                muted
              />
            </div>
            <div className="mc-panel py-6">
              <MCHero
                number={activeCount}
                label="Active Sessions"
                sublabel={`${todayCount} bookings today`}
                accent
                legend={[
                  { variant: 'cyan', label: 'Occupied' },
                  { variant: 'purple', label: 'Recently ended' },
                  { variant: 'gray', label: 'Available' },
                ]}
              />
            </div>
            <div className="mc-panel py-4">
              {!isReadOnly && (
                <>
                  <div className="mc-section-label px-5 pb-2">Actions</div>
                  <div className="px-5 pb-4">
                    <MCActionDock
                      onCreateBooking={() => setShowCreateModal(true)}
                      onQuickSale={async () => {
                        try {
                          const booking = await createQuickSale();
                          navigate(`/pos/booking/${booking.id}`);
                        } catch (err: any) {
                          alert(err.message || 'Failed to create quick sale');
                        }
                      }}
                    />
                  </div>
                  <div
                    aria-hidden
                    className="mx-5"
                    style={{ height: 1, background: 'var(--mc-divider-soft)' }}
                  />
                </>
              )}
              <div className="mc-section-label px-5 pt-3 pb-2">Tools</div>
              <MCToolsRail items={toolsRailItems} variant="vertical" />
            </div>
          </div>

          {/* CENTER — Timeline (week) + Attention panel beneath */}
          <div className="flex flex-col gap-2 min-w-0">
            <TimelineView
              bookings={bookings}
              rooms={rooms}
              onBookingClick={openBookingDetail}
              currentWeekStart={currentWeekStart}
              setCurrentWeekStart={setCurrentWeekStart}
              taxRate={8}
              activeTimezone={activeTimezone}
              timelineTz={timelineTz}
              setTimelineTz={(tz) => {
                localStorage.setItem('pos-timeline-tz', tz);
                setTimelineTz(tz);
              }}
              hideWeekNav
            />

            {/* ATTENTION panel — beneath the weekly timeline */}
            <div className="mc-panel py-4">
              <MCAttentionList
                items={attentionMock.items}
                readIds={attentionMock.readIds}
                onMarkRead={attentionMock.markRead}
                onMarkAllRead={attentionMock.markAllRead}
                onOpenItem={(item) => {
                  if (item.linkHref) navigate(item.linkHref);
                }}
                listClassName="max-h-[320px] overflow-y-auto"
              />
            </div>
          </div>

          {/* RIGHT — Data stream */}
          <div className="mc-panel py-6 max-h-[720px] overflow-hidden">
            <MCDataStream events={derivedStreamEvents} />
          </div>
        </div>
      </main>

      <BookingModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setPreselectedRoomId(undefined);
        }}
        rooms={rooms}
        onSuccess={() => {
          loadData();
        }}
        preselectedRoomId={preselectedRoomId}
      />

      <BookingDetailModal
        bookingId={selectedBookingId}
        open={bookingModalOpen}
        onOpenChange={setBookingModalOpen}
        onClose={() => {
          setBookingModalOpen(false);
          setSelectedBookingId(null);
          loadData();
        }}
      />
    </div>
  );
}
