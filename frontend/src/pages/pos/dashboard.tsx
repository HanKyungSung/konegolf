import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useWebSocket, useWsEvent } from '@/hooks/use-websocket';
import { useAttentionMock } from '@/hooks/use-attention-mock';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, Camera, FileSearch, Utensils, UsersRound, Percent } from 'lucide-react';
import {
  listBookings,
  listRooms,
  updateBookingStatus as apiUpdateBookingStatus,
  updateRoomStatus as apiUpdateRoomStatus,
  getGlobalTaxRate,
  updateGlobalTaxRate,
  createQuickSale,
  getPendingReceipts,
  type Booking,
  type Room,
} from '@/services/pos-api';
import { BookingModal } from './booking-modal';
import { BookingDetailModal } from '@/components/BookingDetailModal';
import { AdminHeader } from '@/components/AdminHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { WsStatusDot } from '@/components/WsStatusDot';
import { PiHealthDot } from '@/components/PiHealthDot';
import ClockModal from './clock-modal';
import ManagerPanel from './manager-panel';
import {
  MCHero,
  MCDataStream,
  MCSection,
  MCStatDot,
  MCRoomRail,
  MCTelemetryRail,
  MCToolsRail,
  MCActionDock,
  MCHealthDot,
  MCAttentionBell,
  MCTaxDialog,
  TimelineView,
  type MCStreamEvent,
  type MCStreamEventType,
  type MCToolsRailItem,
} from '@/components/mc';
import {
  VENUE_TIMEZONE,
  todayRange,
  weekRange,
  toDateStringInTz,
  getTimePartsInTz,
} from '@/lib/timezone';

export default function POSDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReadOnly = user?.role === 'SALES';
  const isStaff = user?.role === 'STAFF';
  const isAdmin = user?.role === 'ADMIN';

  // PROTOTYPE: in-memory mock for attention notifications. Backend service
  // and WS-driven hook will replace this in Phase 2.
  const attentionMock = useAttentionMock();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [taxRate, setTaxRate] = useState(8);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [preselectedRoomId, setPreselectedRoomId] = useState<string | undefined>(undefined);
  const [showClockModal, setShowClockModal] = useState(false);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);
  const [pendingReceiptsCount, setPendingReceiptsCount] = useState(0);
  const [pendingRoomStatus, setPendingRoomStatus] = useState<
    { roomId: string; roomName: string; nextStatus: string } | null
  >(null);
  const [showTaxDialog, setShowTaxDialog] = useState(false);

  const [timelineTz, setTimelineTz] = useState<'venue' | 'browser'>(() => {
    return (localStorage.getItem('pos-timeline-tz') as 'venue' | 'browser') || 'venue';
  });
  const activeTimezone =
    timelineTz === 'venue'
      ? VENUE_TIMEZONE
      : Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll pending-receipts count for rail badge (every 60s)
  useEffect(() => {
    let cancelled = false;
    const loadCount = async () => {
      try {
        const pending = await getPendingReceipts();
        if (!cancelled) setPendingReceiptsCount(pending.length);
      } catch {
        /* silent — dashboard shouldn't fail if receipts endpoint is unavailable */
      }
    };
    loadCount();
    const handle = setInterval(loadCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  useEffect(() => {
    loadData(true);
    loadTaxRate();
  }, []);

  useEffect(() => {
    loadData(false);
  }, [currentWeekStart, activeTimezone]);

  // Realtime: WS drives updates normally; polling kicks in only when WS down >60s.
  const { status: wsStatus, isPollingFallback } = useWebSocket();

  // Polling fallback: only runs while WS is down >60s. When WS is healthy, the
  // WS subscriptions below handle all updates without any timer.
  useEffect(() => {
    if (!isPollingFallback) return;
    const pollInterval = setInterval(async () => {
      try {
        const today = todayRange();
        const week = weekRange(currentWeekStart);

        const [todayBookingsData, weekBookingsData, roomsData] = await Promise.all([
          listBookings({ startDate: today.start, endDate: today.end, limit: 100 }),
          listBookings({ startDate: week.start, endDate: week.end, limit: 500 }),
          listRooms(),
        ]);

        const bookingsMap = new Map<string, any>();
        weekBookingsData.forEach((b) => bookingsMap.set(b.id, b));
        todayBookingsData.forEach((b) => bookingsMap.set(b.id, b));

        const mergedBookings = Array.from(bookingsMap.values()).map((b) => {
          const start = new Date(b.startTime);
          const end = new Date(b.endTime);
          const room = roomsData.find((r) => r.id === b.roomId);
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

        setBookings(mergedBookings);
        setRooms(roomsData);
        setLastSync(new Date());
      } catch (err) {
        console.debug('[Dashboard] Poll update skipped:', err);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [currentWeekStart, isPollingFallback]);

  // WebSocket subscription: targeted refetch on any staff-facing mutation.
  // When WS is healthy, polling is disabled (see poll effect above). When WS is
  // disconnected for >60s, the polling fallback kicks in automatically.
  const refetchFromEvent = React.useCallback(() => { loadData(false); }, [currentWeekStart, activeTimezone]);
  useWsEvent('booking.status_changed', refetchFromEvent);
  useWsEvent('booking.created', refetchFromEvent);
  useWsEvent('booking.updated', refetchFromEvent);
  useWsEvent('booking.cancelled', refetchFromEvent);
  useWsEvent('booking.completed', refetchFromEvent);
  useWsEvent('payment.status_changed', refetchFromEvent);
  useWsEvent('invoice.paid', refetchFromEvent);
  useWsEvent('invoice.unpaid', refetchFromEvent);
  useWsEvent('invoice.payment_added', refetchFromEvent);
  useWsEvent('order.created', refetchFromEvent);
  useWsEvent('order.updated', refetchFromEvent);
  useWsEvent('order.deleted', refetchFromEvent);
  useWsEvent('room.updated', refetchFromEvent);

  async function loadData(showLoading = true) {
    try {
      if (showLoading) setLoading(true);

      const today = todayRange();
      const week = weekRange(currentWeekStart);

      const [todayBookingsData, weekBookingsData, roomsData] = await Promise.all([
        listBookings({ startDate: today.start, endDate: today.end, limit: 100 }),
        listBookings({ startDate: week.start, endDate: week.end, limit: 500 }),
        listRooms(),
      ]);

      const bookingsMap = new Map<string, any>();
      weekBookingsData.forEach((b) => bookingsMap.set(b.id, b));
      todayBookingsData.forEach((b) => bookingsMap.set(b.id, b));

      const transformedBookings = Array.from(bookingsMap.values()).map((b) => {
        const start = new Date(b.startTime);
        const end = new Date(b.endTime);
        const room = roomsData.find((r) => r.id === b.roomId);
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

      setBookings(transformedBookings);
      setRooms(roomsData);
      setLastSync(new Date());
    } catch (err) {
      console.error('[POS Dashboard] Failed to load data:', err);
      if (showLoading) {
        alert(`Failed to load data: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function loadTaxRate() {
    try {
      const rate = await getGlobalTaxRate();
      setTaxRate(rate);
    } catch (err) {
      console.error('Failed to load tax rate:', err);
    }
  }

  async function updateRoomStatus(id: string, status: string) {
    try {
      await apiUpdateRoomStatus(id, status);
      await loadData();
    } catch (err) {
      console.error('Failed to update room:', err);
    }
  }

  function openBookingDetail(bookingId: string) {
    setSelectedBookingId(bookingId);
    setBookingModalOpen(true);
  }

  function closeBookingDetail() {
    setBookingModalOpen(false);
    setSelectedBookingId(null);
    loadData(false);
  }

  const currentBookings = useMemo(() => {
    const now = currentTime;
    return bookings.filter((b) => {
      const start = new Date(b.startTime);
      const end = new Date(b.endTime);
      const status = (b.bookingStatus || b.status || '').toUpperCase();
      return now >= start && now <= end && status !== 'CANCELLED' && status !== 'COMPLETED';
    });
  }, [bookings, currentTime]);

  const todayBookings = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    return bookings.filter((b) => b.date === today);
  }, [bookings]);

  // Derive the real-time data stream from bookings/rooms
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
          type: b.bookingSource === 'QUICK_SALE' ? 'QuickSale' : 'BookingCreate',
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
          primary: `${b.roomName} · until ${new Date(b.endTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: VENUE_TIMEZONE })}`,
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

  // Admin-only synthetic events for previewing the stream animation.
  const [devEvents, setDevEvents] = useState<MCStreamEvent[]>([]);
  const streamEvents = useMemo<MCStreamEvent[]>(
    () => [...devEvents, ...derivedStreamEvents].slice(0, 50),
    [devEvents, derivedStreamEvents],
  );

  const buildDemoEvent = (): MCStreamEvent => {
    const types: MCStreamEventType[] = ['BookingCreate', 'SessionStart', 'PaymentSettle', 'QuickSale'];
    const roomPool = rooms.length ? rooms.map((r) => r.name) : ['Room 1', 'Room 2'];
    const namePool = ['Demo Golfer', 'Walk-In', 'Jordan K.', 'Alex P.', 'Sam R.'];
    const type = types[Math.floor(Math.random() * types.length)];
    const room = roomPool[Math.floor(Math.random() * roomPool.length)];
    const customer = namePool[Math.floor(Math.random() * namePool.length)];
    const players = 1 + Math.floor(Math.random() * 4);
    const amount = (50 + Math.floor(Math.random() * 200)).toFixed(2);

    let primary = `${room}`;
    let meta: string | undefined;
    switch (type) {
      case 'BookingCreate':
        primary = `${room} · ${players}p · 1h`;
        meta = 'DEMO';
        break;
      case 'SessionStart':
        primary = `${room} · until ${new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: VENUE_TIMEZONE })}`;
        break;
      case 'PaymentSettle':
        primary = `${room} · $${amount}`;
        break;
      case 'QuickSale':
        primary = `${room} · $${amount}`;
        meta = 'DEMO';
        break;
      default:
        break;
    }

    return {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      type,
      primary,
      secondary: customer,
      meta,
    };
  };

  const pushDemoEvent = () => {
    setDevEvents((prev) => [buildDemoEvent(), ...prev].slice(0, 10));
  };

  const handleSimulateEvent = () => {
    pushDemoEvent();
  };

  // Hero number: currently active sessions
  const activeCount = currentBookings.length;
  const todayCount = todayBookings.length;

  if (loading) {
    return (
      <div className="mc-root flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <MCStatDot variant="cyan" pulse />
          <p className="mc-meta mc-mono">initializing…</p>
        </div>
      </div>
    );
  }

  const toolsRailItems: MCToolsRailItem[] = [
    {
      id: 'clock',
      label: 'Clock',
      icon: <Clock className="h-4 w-4" />,
      onClick: () => setShowClockModal(true),
    },
    {
      id: 'pending-receipts',
      label: 'Pending Receipts',
      icon: <Camera className="h-4 w-4" />,
      to: '/pos/pending-receipts',
      badge: pendingReceiptsCount,
      alert: pendingReceiptsCount > 0,
    },
    {
      id: 'menu',
      label: 'Menu',
      icon: <Utensils className="h-4 w-4" />,
      to: '/pos/menu',
      hidden: isReadOnly,
    },
    {
      id: 'time-mgmt',
      label: 'Time Mgmt',
      icon: <Users className="h-4 w-4" />,
      to: '/pos/time-management',
      hidden: user?.role !== 'ADMIN',
    },
    {
      id: 'receipt-analysis',
      label: 'OCR Analysis',
      icon: <FileSearch className="h-4 w-4" />,
      to: '/admin/receipt-analysis',
      hidden: user?.role !== 'ADMIN',
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: <UsersRound className="h-4 w-4" />,
      to: '/admin/customers',
      hidden: user?.role !== 'ADMIN' && user?.role !== 'SALES',
    },
    {
      id: 'tax',
      label: 'Tax',
      icon: <Percent className="h-4 w-4" />,
      onClick: () => setShowTaxDialog(true),
      hidden: isReadOnly,
    },
  ];

  return (
    <div className="mc-root">
      <AdminHeader
        title="K one Golf"
        subtitle="// POS · MISSION CONTROL"
        variant="mc"
        mcRightExtras={
          <div className="flex items-center gap-2">
            <WsStatusDot />
            <PiHealthDot />
            <MCHealthDot enabled={user?.role === 'ADMIN'} />
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

      {/* Fixed viewport-edge side rails (2xl+ only) */}
      <MCRoomRail
        rooms={rooms}
        bookings={bookings}
        isReadOnly={isReadOnly}
        onChangeStatus={(roomId, nextStatus) => {
          const room = rooms.find((r) => r.id === roomId);
          if (!room || room.status === nextStatus) return;
          setPendingRoomStatus({
            roomId: room.id,
            roomName: room.name,
            nextStatus,
          });
        }}
        onSelectRoom={(roomId) => {
          const current = currentBookings.find((b) => b.roomId === roomId);
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
        {/* Top zone: Stats | Timeline | Data Stream — each panel is a raised surface with gutters */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-2">
          {/* LEFT — stacked stats + controls panel */}
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

            {/* Controls panel — actions + tools, stacked vertically */}
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

          {/* CENTER — Timeline (stacked panels: header + one per day) */}
          <div className="flex flex-col gap-2 min-w-0">
            <TimelineView
              bookings={bookings}
              rooms={rooms}
              onBookingClick={openBookingDetail}
              currentWeekStart={currentWeekStart}
              setCurrentWeekStart={setCurrentWeekStart}
              taxRate={taxRate}
              activeTimezone={activeTimezone}
              timelineTz={timelineTz}
              setTimelineTz={setTimelineTz}
            />
          </div>

          {/* RIGHT — Data stream */}
          <div className="mc-panel py-6 max-h-[720px] overflow-hidden">
            <MCDataStream
              events={streamEvents}
              onSimulate={isAdmin ? handleSimulateEvent : undefined}
            />
          </div>
        </div>

        {/* Manager panel — only tab left; render directly for staff */}
        {isStaff && <ManagerPanel />}

        {/* Debug strip (kept minimal for devs) */}
        <details className="pt-6 border-t border-[color:var(--mc-divider-soft)]">
          <summary className="mc-meta mc-mono cursor-pointer hover:text-[color:var(--mc-cyan)] transition-colors">
            debug · {bookings.length} bookings · {rooms.length} rooms ·{' '}
            {currentBookings.length} live · {streamEvents.length} events
          </summary>
          <pre className="mt-3 text-[10px] mc-mono max-h-40 overflow-auto text-[color:var(--mc-gray-dim)] p-3 border border-[color:var(--mc-divider-soft)] rounded">
            {JSON.stringify(bookings.slice(0, 3), null, 2)}
          </pre>
        </details>
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
        onClose={closeBookingDetail}
      />

      <ConfirmDialog
        open={pendingRoomStatus !== null}
        onOpenChange={(o) => !o && setPendingRoomStatus(null)}
        title={`Change ${pendingRoomStatus?.roomName ?? ''} to ${
          pendingRoomStatus?.nextStatus ?? ''
        }?`}
        description={
          pendingRoomStatus?.nextStatus === 'CLOSED'
            ? 'This room will no longer accept new bookings until reopened.'
            : pendingRoomStatus?.nextStatus === 'MAINTENANCE'
            ? 'This room will be marked as under maintenance and blocked from new bookings.'
            : 'This room will become available for new bookings.'
        }
        confirmLabel="Change Status"
        destructive={pendingRoomStatus?.nextStatus !== 'ACTIVE'}
        onConfirm={() => {
          if (pendingRoomStatus) {
            updateRoomStatus(pendingRoomStatus.roomId, pendingRoomStatus.nextStatus);
          }
          setPendingRoomStatus(null);
        }}
      />

      <ClockModal isOpen={showClockModal} onClose={() => setShowClockModal(false)} />

      <MCTaxDialog
        open={showTaxDialog}
        onOpenChange={setShowTaxDialog}
        currentRate={taxRate}
        onSave={async (rate) => {
          await updateGlobalTaxRate(rate);
          setTaxRate(rate);
        }}
      />
    </div>
  );
}

