import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ShoppingBag, Clock, Users, Camera } from 'lucide-react';
import {
  listBookings,
  listRooms,
  updateBookingStatus as apiUpdateBookingStatus,
  updateRoomStatus as apiUpdateRoomStatus,
  getGlobalTaxRate,
  updateGlobalTaxRate,
  createQuickSale,
  type Booking,
  type Room,
} from '@/services/pos-api';
import { BookingModal } from './booking-modal';
import { BookingDetailModal } from '@/components/BookingDetailModal';
import { AdminHeader } from '@/components/AdminHeader';
import ClockModal from './clock-modal';
import ManagerPanel from './manager-panel';
import {
  MCHero,
  MCDataStream,
  MCSection,
  MCStatDot,
  MCRoomRail,
  MCTelemetryRail,
  type MCStreamEvent,
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

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [taxRate, setTaxRate] = useState(8);
  const [editingTax, setEditingTax] = useState(false);
  const [tempTaxRate, setTempTaxRate] = useState('8');

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

  useEffect(() => {
    loadData(true);
    loadTaxRate();
  }, []);

  useEffect(() => {
    loadData(false);
  }, [currentWeekStart, activeTimezone]);

  useEffect(() => {
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
  }, [currentWeekStart]);

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
      setTempTaxRate(rate.toString());
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

  async function saveTaxRate() {
    const rate = parseFloat(tempTaxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    try {
      await updateGlobalTaxRate(rate);
      setTaxRate(rate);
      setEditingTax(false);
    } catch (err) {
      console.error('Failed to update tax rate:', err);
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
  const streamEvents = useMemo<MCStreamEvent[]>(() => {
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

  return (
    <div className="mc-root">
      <AdminHeader
        title="K one Golf"
        navItems={[
          {
            label: 'Customers',
            to: '/admin/customers',
            show: user?.role === 'ADMIN' || user?.role === 'SALES',
          },
        ]}
      />

      {/* Fixed viewport-edge side rails (2xl+ only) */}
      <MCRoomRail
        rooms={rooms}
        bookings={bookings}
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
        {/* Utility chip row — low-frequency nav & shift ops */}
        <div className="flex flex-wrap items-center gap-2">
          <button className="mc-chip" onClick={() => setShowClockModal(true)}>
            <Clock className="h-3 w-3" /> Clock
          </button>
          {user?.role === 'ADMIN' && (
            <button className="mc-chip" onClick={() => navigate('/pos/time-management')}>
              <Users className="h-3 w-3" /> Time Mgmt
            </button>
          )}
          {!isReadOnly && (
            <button className="mc-chip" onClick={() => navigate('/pos/menu')}>
              Menu
            </button>
          )}
          <button
            className="mc-chip mc-chip-alert"
            onClick={() => navigate('/pos/pending-receipts')}
          >
            <Camera className="h-3 w-3" />
            Receipts
            <span className="mc-chip-badge" aria-hidden />
          </button>
        </div>

        {/* Top zone: Stats | Timeline | Data Stream — all in bordered panels */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-0 border border-[color:var(--mc-divider)]">
          {/* LEFT — stacked stats */}
          <div className="flex flex-col divide-y divide-[color:var(--mc-divider)] lg:border-r lg:border-[color:var(--mc-divider)]">
            <div className="mc-panel border-0 py-6">
              <MCHero
                number={bookings.length}
                label="Total Bookings"
                sublabel="Loaded this session"
                muted
              />
            </div>
            <div className="mc-panel border-0 py-6">
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
          </div>

          {/* CENTER — Timeline */}
          <div className="mc-panel border-0 py-6 lg:border-r lg:border-[color:var(--mc-divider)] overflow-hidden">
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
          <div className="mc-panel border-0 py-6 max-h-[720px] overflow-hidden">
            <MCDataStream events={streamEvents} />
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={!isReadOnly ? 'rooms' : 'tax'} className="space-y-6">
          <TabsList className="bg-transparent p-0 gap-1 justify-start h-auto border-b border-[color:var(--mc-divider-soft)] rounded-none w-full flex flex-wrap">
            {!isReadOnly && (
              <TabsTrigger value="rooms" className="mc-tab">
                Rooms
              </TabsTrigger>
            )}
            {!isReadOnly && (
              <TabsTrigger value="tax" className="mc-tab">
                Tax
              </TabsTrigger>
            )}
            {isStaff && (
              <TabsTrigger value="manager" className="mc-tab">
                Manager
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="rooms">
            <MCSection label="Room Management">
              <div className="divide-y divide-[color:var(--mc-divider-soft)]">
                {rooms.map((room) => {
                  const roomTodayBookings = todayBookings.filter((b) => b.roomId === room.id);
                  return (
                    <div
                      key={room.id}
                      className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-4 py-5 items-start"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <MCStatDot
                            variant={
                              room.status === 'ACTIVE'
                                ? 'cyan'
                                : room.status === 'MAINTENANCE'
                                ? 'gray'
                                : 'dim'
                            }
                          />
                          <span className="text-sm font-medium">{room.name}</span>
                        </div>
                        <div className="mc-meta mt-1">
                          {room.capacity} players · ${room.hourlyRate}/hr
                        </div>
                      </div>

                      <div>
                        <div className="mc-section-label mb-2">
                          Today · {roomTodayBookings.length}
                        </div>
                        {roomTodayBookings.length > 0 ? (
                          <ul className="flex flex-col gap-1 mc-mono text-xs">
                            {roomTodayBookings.slice(0, 4).map((b) => (
                              <li
                                key={b.id}
                                onClick={() => openBookingDetail(b.id)}
                                className="flex items-center gap-2 cursor-pointer hover:text-[color:var(--mc-cyan)] transition-colors"
                              >
                                <span className="text-[color:var(--mc-gray)]">{b.time}</span>
                                <span>{b.customerName}</span>
                                <span className="text-[color:var(--mc-gray-dim)]">
                                  · {b.players}p · {b.duration}h
                                </span>
                              </li>
                            ))}
                            {roomTodayBookings.length > 4 && (
                              <li className="mc-meta-dim">
                                + {roomTodayBookings.length - 4} more
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p className="mc-meta-dim">No bookings today</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <select
                          value={room.status}
                          onChange={(e) => updateRoomStatus(room.id, e.target.value)}
                          className="bg-transparent border border-[color:var(--mc-divider)] text-sm px-3 py-1.5 rounded focus:outline-none focus:border-[color:var(--mc-cyan)] text-white"
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </MCSection>
          </TabsContent>

          <TabsContent value="tax">
            <MCSection label="Tax Configuration">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="mc-meta">Global tax rate</span>
                {editingTax ? (
                  <>
                    <input
                      type="number"
                      value={tempTaxRate}
                      onChange={(e) => setTempTaxRate(e.target.value)}
                      className="w-24 bg-transparent border border-[color:var(--mc-divider)] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[color:var(--mc-cyan)]"
                      step="0.1"
                      min="0"
                      max="100"
                    />
                    <span className="mc-meta">%</span>
                    <button className="mc-btn mc-btn-primary" onClick={saveTaxRate}>
                      Save
                    </button>
                    <button
                      className="mc-btn"
                      onClick={() => {
                        setEditingTax(false);
                        setTempTaxRate(taxRate.toString());
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="mc-hero-number" style={{ fontSize: '2rem' }}>
                      {taxRate}
                      <span className="mc-meta ml-1">%</span>
                    </span>
                    <button className="mc-btn" onClick={() => setEditingTax(true)}>
                      Edit
                    </button>
                  </>
                )}
              </div>
              <p className="mc-meta mt-4">
                Applied to all bookings and menu orders.
              </p>
            </MCSection>
          </TabsContent>

          {isStaff && (
            <TabsContent value="manager">
              <ManagerPanel />
            </TabsContent>
          )}
        </Tabs>

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

      {/* Floating primary action cluster — thumb-reachable POS actions */}
      {!isReadOnly && (
        <div className="mc-fab-cluster">
          <button
            className="mc-fab mc-fab-secondary"
            onClick={async () => {
              try {
                const booking = await createQuickSale();
                navigate(`/pos/booking/${booking.id}`);
              } catch (err: any) {
                alert(err.message || 'Failed to create quick sale');
              }
            }}
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Quick Sale
          </button>
          <button
            className="mc-fab mc-fab-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Create Booking
          </button>
        </div>
      )}

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

      <ClockModal isOpen={showClockModal} onClose={() => setShowClockModal(false)} />
    </div>
  );
}

// ---------- Timeline ----------
interface TimelineViewProps {
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

function TimelineView({
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
    <MCSection
      label="Weekly Timeline"
      right={
        <>
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
        </>
      }
    >
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="min-w-[760px] space-y-10">
          {weekDays.map((day) => {
            const dayStr = dateKey(day);
            const dayBookings = bookings.filter(
              (b) => b.date === dayStr && b.bookingSource !== 'QUICK_SALE'
            );
            const filtered = filterBookingsByStatus(dayBookings);
            const totalHours = filtered.reduce((s, b) => s + (b.duration || 0), 0);

            return (
              <div key={dayStr} className="space-y-4">
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
                {rooms.map((room) => {
                  const roomBookings = filterBookingsByStatus(
                    dayBookings.filter((b) => b.roomId === room.id)
                  );
                  const currentTimePos = getCurrentTimePosition(day);

                  return (
                    <div key={room.id} className="flex items-start gap-3">
                      <div className="min-w-[90px] pt-2">
                        <span className="text-[13px] font-semibold text-[color:var(--mc-white)]">
                          {room.name}
                        </span>
                      </div>

                      <div className="flex-1 relative h-11 bg-[color:var(--mc-divider-soft)]/40 overflow-hidden">
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
                              className="absolute top-1 bottom-1 rounded-sm cursor-pointer overflow-hidden group transition-all hover:brightness-125"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                background: past
                                  ? 'rgba(184, 85, 231, 0.25)'
                                  : 'rgba(59, 158, 255, 0.25)',
                                borderLeft: `2px solid ${
                                  past ? 'var(--mc-purple)' : 'var(--mc-cyan)'
                                }`,
                              }}
                            >
                              <div className="h-full flex flex-col justify-center px-2">
                                <div className="text-white text-[12px] font-semibold truncate">
                                  {b.customerName}
                                </div>
                                <div className="mc-mono text-[11px] font-medium text-[color:var(--mc-gray)] truncate">
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
            );
          })}
        </div>
      </div>
    </MCSection>
  );
}
