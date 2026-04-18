import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useWebSocket, useWsEvent } from '@/hooks/use-websocket';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { buttonStyles } from '@/styles/buttonStyles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  type Room
} from '@/services/pos-api';
import { BookingModal } from './booking-modal';
import { BookingDetailModal } from '@/components/BookingDetailModal';
import { AdminHeader } from '@/components/AdminHeader';
import { WsStatusDot } from '@/components/WsStatusDot';
import ClockModal from './clock-modal';
import ManagerPanel from './manager-panel';
import { VENUE_TIMEZONE, todayRange, weekRange, todayDateString, toDateStringInTz, getTimePartsInTz } from '@/lib/timezone';

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
  
  // Timeline navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  
  // Component navigation state
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  
  // Booking modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [preselectedRoomId, setPreselectedRoomId] = useState<string | undefined>(undefined);

  // Clock in/out modal state
  const [showClockModal, setShowClockModal] = useState(false);

  // Timeline timezone: 'venue' (Atlantic) or 'browser' (local)
  const [timelineTz, setTimelineTz] = useState<'venue' | 'browser'>(() => {
    return (localStorage.getItem('pos-timeline-tz') as 'venue' | 'browser') || 'venue';
  });
  const activeTimezone = timelineTz === 'venue' ? VENUE_TIMEZONE : Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Auto-refresh current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadData(true); // Initial load with loading spinner
    loadTaxRate();
  }, []);

  // Reload data when selected week or timezone changes (no loading spinner)
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
        // Update room status and today's bookings
        // Use Atlantic timezone so "today" always matches venue's day
        const today = todayRange();
        
        // Also fetch current week's bookings to keep timeline fresh
        // Use Atlantic timezone so week boundaries align with venue days
        const week = weekRange(currentWeekStart);
        
        const [todayBookingsData, weekBookingsData, roomsData] = await Promise.all([
          listBookings({ 
            startDate: today.start, 
            endDate: today.end,
            limit: 100 
          }),
          listBookings({ 
            startDate: week.start, 
            endDate: week.end,
            limit: 500 
          }),
          listRooms()
        ]);
        
        // Merge and transform bookings
        const bookingsMap = new Map<string, any>();
        weekBookingsData.forEach(b => bookingsMap.set(b.id, b));
        todayBookingsData.forEach(b => bookingsMap.set(b.id, b));
        
        const mergedBookings = Array.from(bookingsMap.values()).map(b => {
          const start = new Date(b.startTime);
          const end = new Date(b.endTime);
          const room = roomsData.find(r => r.id === b.roomId);
          
          // Use selected timezone for date/time (consistent with loadData)
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
        
        // Update bookings and rooms
        setBookings(mergedBookings);
        setRooms(roomsData);
      } catch (err) {
        // Silent fail on poll - don't interrupt user experience
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
      
      // Calculate date ranges for API calls
      const now = new Date();
      
      // Today's range (for Room Status - real-time view) - Atlantic timezone
      const today = todayRange();
      
      // Selected week range (for Timeline - use currentWeekStart for navigation)
      // Uses Atlantic timezone so boundaries correctly capture late-night bookings
      const week = weekRange(currentWeekStart);
      
      console.log('[Dashboard] Week range:', {
        currentWeekStart: currentWeekStart.toString(),
        weekStartUTC: week.start,
        weekEndUTC: week.end,
      });
      
      // Load bookings with two separate API calls
      const [todayBookingsData, weekBookingsData, roomsData] = await Promise.all([
        listBookings({ 
          startDate: today.start, 
          endDate: today.end,
          limit: 100 // Today should have < 100 bookings
        }),
        listBookings({ 
          startDate: week.start, 
          endDate: week.end,
          limit: 500 // Week should have < 500 bookings
        }),
        listRooms()
      ]);
      
      // Merge bookings and deduplicate by ID (today's bookings are subset of week)
      const bookingsMap = new Map<string, any>();
      
      // Add week bookings first
      weekBookingsData.forEach(b => bookingsMap.set(b.id, b));
      
      // Add/overwrite with today's bookings (ensures fresh data for today)
      todayBookingsData.forEach(b => bookingsMap.set(b.id, b));
      
      const mergedBookings = Array.from(bookingsMap.values());
      
      // Transform bookings to add derived fields (date, time, roomName)
      const transformedBookings = mergedBookings.map(b => {
        const start = new Date(b.startTime);
        const end = new Date(b.endTime);
        const room = roomsData.find(r => r.id === b.roomId);
        
        // Use selected timezone for date/time extraction
        const localDate = toDateStringInTz(start, activeTimezone);
        const tp = getTimePartsInTz(start, activeTimezone);
        const localTime = `${String(tp.hours).padStart(2, '0')}:${String(tp.minutes).padStart(2, '0')}`;
        
        return {
          ...b,
          date: localDate, // YYYY-MM-DD in selected timezone
          time: localTime, // HH:MM in selected timezone
          duration: (end.getTime() - start.getTime()) / (1000 * 60 * 60), // hours
          roomName: room?.name || 'Unknown Room',
        };
      });
      
      console.log('[POS Dashboard] Loaded', transformedBookings.length, 'bookings (', todayBookingsData.length, 'today,', weekBookingsData.length, 'this week) and', roomsData.length, 'rooms');
      setBookings(transformedBookings);
      setRooms(roomsData);
    } catch (err) {
      console.error('[POS Dashboard] Failed to load data:', err);
      // Only show alert on initial load, not during polling
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

  async function updateBookingStatus(id: string, status: string) {
    try {
      // Convert lowercase status to uppercase for backend API
      const upperStatus = status.toUpperCase();
      await apiUpdateBookingStatus(id, upperStatus);
      await loadData();
    } catch (err) {
      console.error('Failed to update booking:', err);
      alert(`Failed to update booking: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  // Handle booking detail navigation
  function openBookingDetail(bookingId: string) {
    setSelectedBookingId(bookingId);
    setBookingModalOpen(true);
  }

  function closeBookingDetail() {
    setBookingModalOpen(false);
    setSelectedBookingId(null);
    // Refresh data when returning from booking detail
    loadData(false);
  }

  // Current bookings (happening right now)
  const currentBookings = useMemo(() => {
    const now = new Date();
    return bookings.filter(b => {
      const start = new Date(b.startTime);
      const end = new Date(b.endTime);
      // Only show bookings that are:
      // 1. Currently active (time-wise)
      // 2. Not cancelled
      // 3. Not completed
      const status = (b.bookingStatus || b.status || '').toUpperCase();
      return now >= start && now <= end && status !== 'CANCELLED' && status !== 'COMPLETED';
    });
  }, [bookings]);

  // Today's bookings (use local timezone for comparison)
  const todayBookings = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    return bookings.filter(b => b.date === today);
  }, [bookings]);

  const getStatusColor = (status: string) => {
    const s = status?.toUpperCase();
    if (s === 'BOOKED') return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (s === 'CONFIRMED') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'; // Legacy support
    if (s === 'COMPLETED') return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (s === 'CANCELLED') return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (s === 'EXPIRED') return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    if (s === 'ACTIVE') return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (s === 'MAINTENANCE') return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    if (s === 'CLOSED') return 'bg-red-500/20 text-red-300 border-red-500/30';
    return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  const getPaymentStatusColor = (status: string) => {
    if (status === 'UNPAID') return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (status === 'PAID') return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (status === 'BILLED') return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'; // Legacy support
    return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-300 text-xl mb-2">Loading POS Dashboard...</p>
          <p className="text-slate-500 text-sm">Fetching bookings and rooms from backend</p>
        </div>
      </div>
    );
  }

  // Removed excessive render logging - React re-renders are normal
  // console.log('[POS Dashboard] Render - bookings:', bookings.length, 'rooms:', rooms.length);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header - Always visible */}
      <AdminHeader
        title="K one Golf POS"
        navItems={[
          { label: 'Customers', to: '/admin/customers', show: user?.role === 'ADMIN' || user?.role === 'SALES' },
        ]}
      />

      {/* Main Content - Dashboard View */}
      <main className="max-w-[1800px] mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 w-full">
        {/* Real-Time Room Status */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-3">
                Room Status (Real-Time)
                <span className="text-xs font-normal text-slate-400 font-mono">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: VENUE_TIMEZONE })}
                </span>
                <WsStatusDot />
              </CardTitle>
              <CardDescription>Live view of currently occupied rooms</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                onClick={() => setShowClockModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm"
                size="sm"
              >
                <Clock className="h-4 w-4" />
                <span>Clock In/Out</span>
              </Button>
              {user?.role === 'ADMIN' && (
              <Button 
                onClick={() => navigate('/pos/time-management')}
                variant="outline"
                className="flex items-center gap-2 text-xs sm:text-sm"
                size="sm"
              >
                <Users className="h-4 w-4" />
                <span>Time Mgmt</span>
              </Button>
              )}
              <Button 
                onClick={() => navigate('/pos/pending-receipts')}
                variant="outline"
                className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 border-amber-500/50 hover:bg-amber-500/10"
                size="sm"
              >
                <Camera className="h-4 w-4" />
                <span>Receipts</span>
              </Button>
              {!isReadOnly && (
              <Button 
                onClick={async () => {
                  try {
                    const booking = await createQuickSale();
                    navigate(`/pos/booking/${booking.id}`);
                  } catch (err: any) {
                    alert(err.message || 'Failed to create quick sale');
                  }
                }}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs sm:text-sm"
                size="sm"
              >
                <ShoppingBag className="h-4 w-4" />
                <span>Quick Sale</span>
              </Button>
              )}
              {!isReadOnly && (
              <Button 
                onClick={() => setShowCreateModal(true)}
                className={`${buttonStyles.primarySemibold} flex items-center gap-2 text-xs sm:text-sm`}
                size="sm"
              >
                <Plus className="h-4 w-4" />
                <span>Create Booking</span>
              </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Status Legend */}
            <div className="flex gap-6 p-4 bg-slate-700/30 rounded-lg mb-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500" />
                <span className="text-sm text-slate-300">Empty Table</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-500" />
                <span className="text-sm text-slate-300">Occupied</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {rooms.map((room) => {
                const roomCurrentBookings = currentBookings.filter(b => b.roomId === room.id);
                const currentBooking = roomCurrentBookings[0];
                const roomStatus = currentBooking ? "occupied" : "empty";

                return (
                  <div
                    key={room.id}
                    className={`border-4 rounded-lg p-4 transition-all hover:scale-[1.02] ${
                      roomStatus === 'empty' 
                        ? 'border-green-500 bg-green-50/10' 
                        : 'border-yellow-500 bg-yellow-50/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-4 h-4 rounded-full ${roomStatus === 'empty' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className={`text-xs px-2 py-1 rounded ${roomStatus === 'empty' ? 'bg-green-500' : 'bg-yellow-500'} text-white`}>
                        {roomStatus === 'empty' ? 'Empty' : 'Occupied'}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold mb-3 text-white">{room.name}</h3>
                    
                    {currentBooking ? (
                      <div className="space-y-2">
                        <div className="p-2 bg-slate-700/50 rounded">
                          <div className="text-xs text-slate-400">Customer</div>
                          <div className="text-sm font-semibold text-white truncate">{currentBooking.customerName}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-slate-700/30 rounded">
                            <div className="text-slate-400">Start</div>
                            <div className="font-medium text-white">{currentBooking.time}</div>
                          </div>
                          <div className="p-2 bg-slate-700/30 rounded">
                            <div className="text-slate-400">Duration</div>
                            <div className="font-medium text-white">{currentBooking.duration}h</div>
                          </div>
                        </div>

                        <div className="p-2 bg-slate-700/30 rounded text-xs">
                          <div className="text-slate-400">Players</div>
                          <div className="font-medium text-white">{currentBooking.players}</div>
                        </div>

                        <Button 
                          size="sm" 
                          className={`w-full text-xs ${buttonStyles.secondary}`}
                          variant="outline"
                          onClick={() => openBookingDetail(currentBooking.id)}
                        >
                          Manage
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-xs text-slate-400 mb-2">No booking</p>
                        {!isReadOnly && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`w-full text-xs ${buttonStyles.secondary}`}
                          onClick={() => {
                            setPreselectedRoomId(room.id);
                            setShowCreateModal(true);
                          }}
                        >
                          <span className="text-lg mr-1">+</span>
                          Book
                        </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tabs for different management views */}
        <Tabs defaultValue="timeline" className="space-y-6">
          <TabsList className={`grid w-full ${isReadOnly ? 'grid-cols-1' : isStaff ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            {!isReadOnly && <TabsTrigger value="rooms">Room Management</TabsTrigger>}
            {!isReadOnly && <TabsTrigger value="menu">Menu</TabsTrigger>}
            {!isReadOnly && <TabsTrigger value="tax">Tax Settings</TabsTrigger>}
            {isStaff && <TabsTrigger value="manager">Manager 🔒</TabsTrigger>}
          </TabsList>

          <TabsContent value="timeline">
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
          </TabsContent>

          <TabsContent value="menu">
            <Card>
              <CardHeader>
                <CardTitle>Menu Management</CardTitle>
                <CardDescription>Administer food & drink items</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <p className="text-slate-300">Menu management allows you to add, edit, and manage food and drink items.</p>
                  <div className="flex gap-3">
                    <Button size="sm" className={buttonStyles.primary} onClick={() => navigate('/pos/menu')}>Open Menu Management</Button>
                    <Button size="sm" variant="outline" className={buttonStyles.secondary} onClick={() => navigate('/pos/menu')}>Quick Edit</Button>
                  </div>
                  <p className="text-[11px] text-slate-500">Future enhancements: category CRUD, bulk availability toggles, price history, printing labels.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rooms">
            <Card>
              <CardHeader>
                <CardTitle>Room Management</CardTitle>
                <CardDescription>Control room status and availability</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {rooms.map((room) => {
                    const roomTodayBookings = todayBookings.filter(b => b.roomId === room.id);

                    return (
                      <Card key={room.id} className="bg-slate-700/30 border-slate-600">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-xl text-white">{room.name}</CardTitle>
                            <div className="flex items-center gap-3">
                              <label className="text-slate-400 text-sm">Room Status:</label>
                              <select 
                                value={room.status} 
                                onChange={e => updateRoomStatus(room.id, e.target.value)} 
                                className="w-[160px] bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                              >
                                <option value="ACTIVE">Active</option>
                                <option value="MAINTENANCE">Maintenance</option>
                                <option value="CLOSED">Closed</option>
                              </select>
                              <Badge className={`${getStatusColor(room.status)} border`}>{room.status}</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-400 mb-3">Room Details</h4>
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-400">Capacity:</span>
                                  <span className="text-white font-medium">{room.capacity} players</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-400">Hourly Rate:</span>
                                  <span className="text-white font-medium">${room.hourlyRate}/person/hour</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-400">Today's Bookings:</span>
                                  <span className="text-white font-medium">{roomTodayBookings.length}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-sm font-semibold text-slate-400 mb-3">Today's Bookings</h4>
                              {roomTodayBookings.length > 0 ? (
                                <div className="space-y-2 max-h-[120px] overflow-y-auto">
                                  {roomTodayBookings.map((booking) => (
                                    <div
                                      key={booking.id}
                                      onClick={() => openBookingDetail(booking.id)}
                                      className="block p-2 bg-slate-600/30 rounded hover:bg-slate-600/50 transition-colors cursor-pointer"
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="text-sm font-medium text-white">{booking.customerName}</div>
                                          <div className="text-xs text-slate-400">
                                            {booking.time} • {booking.players} players
                                          </div>
                                        </div>
                                        <Badge className={`${getStatusColor(booking.status)} border text-xs`}>
                                          {booking.status}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-500 italic">No bookings today</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax">
            <Card>
              <CardHeader>
                <CardTitle>Tax Settings</CardTitle>
                <CardDescription>Configure global tax rate for all transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <label className="text-slate-300 font-medium">Global Tax Rate:</label>
                    {editingTax ? (
                      <>
                        <input
                          type="number"
                          value={tempTaxRate}
                          onChange={e => setTempTaxRate(e.target.value)}
                          className="w-24 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                          step="0.1"
                          min="0"
                          max="100"
                        />
                        <span className="text-slate-300">%</span>
                        <Button onClick={saveTaxRate} size="sm" className={buttonStyles.success}>
                          Save
                        </Button>
                        <Button onClick={() => {
                          setEditingTax(false);
                          setTempTaxRate(taxRate.toString());
                        }} size="sm" variant="outline" className={buttonStyles.secondary}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-white">{taxRate}%</span>
                        <Button onClick={() => setEditingTax(true)} size="sm" variant="outline" className={buttonStyles.secondary}>
                          Edit
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-slate-400">
                    This tax rate is applied to all bookings and menu item orders.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isStaff && (
            <TabsContent value="manager">
              <ManagerPanel />
            </TabsContent>
          )}
        </Tabs>

        {/* Debug Info */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-sm">Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono text-slate-400">
            <div>Total Bookings: {bookings.length}</div>
            <div>Total Rooms: {rooms.length}</div>
            <div>Today's Bookings: {todayBookings.length}</div>
            <div>Current Bookings: {currentBookings.length}</div>
            <div className="mt-2">
              <details>
                <summary className="cursor-pointer hover:text-slate-300">Raw Bookings Data</summary>
                <pre className="mt-2 text-[10px] max-h-40 overflow-auto bg-slate-900 p-2 rounded">
                  {JSON.stringify(bookings.slice(0, 3), null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      </main>
      
      {/* Booking Modal */}
      <BookingModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setPreselectedRoomId(undefined);
        }}
        rooms={rooms}
        onSuccess={() => {
          // Refresh bookings after successful creation
          loadData();
        }}
        preselectedRoomId={preselectedRoomId}
      />

      {/* Booking Detail Modal */}
      <BookingDetailModal
        bookingId={selectedBookingId}
        open={bookingModalOpen}
        onOpenChange={setBookingModalOpen}
        onClose={closeBookingDetail}
      />

      {/* Clock In/Out Modal */}
      <ClockModal isOpen={showClockModal} onClose={() => setShowClockModal(false)} />
    </div>
  );
}

// Timeline View Component (matching Electron POS)
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

function TimelineView({ bookings, rooms, onBookingClick, currentWeekStart, setCurrentWeekStart, taxRate, activeTimezone, timelineTz, setTimelineTz }: TimelineViewProps) {
  const navigate = useNavigate();
  const dayStart = 10 * 60; // 10:00 AM
  const dayEnd = 24 * 60;   // Midnight (12:00 AM next day)
  const totalMinutes = dayEnd - dayStart;

  // Track current time for real-time bar
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
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
    setCurrentWeekStart(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (dir === 'prev' ? -7 : 7));
      return newDate;
    });
  };

  const dateKey = (d: Date) => {
    return toDateStringInTz(d, activeTimezone);
  };

  // Assign colors to rooms
  const roomColors = ['bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-600'];

  // Helper: Check if booking has ended (past) or is completed
  const isBookingPast = (booking: Booking) => {
    const endTime = new Date(booking.endTime);
    const bookingStatus = (booking.bookingStatus || booking.status || '').toUpperCase();
    return endTime < currentTime || bookingStatus === 'COMPLETED';
  };

  // Helper: Filter bookings by status (show BOOKED and COMPLETED, hide CANCELLED/EXPIRED)
  const filterBookingsByStatus = (bookingsToFilter: Booking[]) => {
    return bookingsToFilter.filter(b => {
      const bookingStatus = (b.bookingStatus || b.status || '').toUpperCase();
      return bookingStatus === 'BOOKED' || bookingStatus === 'COMPLETED';
    });
  };

  // Helper: Calculate current time position in timeline
  const getCurrentTimePosition = (day: Date) => {
    // Only show current time bar for today
    const today = new Date();
    const todayStr = toDateStringInTz(today, activeTimezone);
    const dayStr = dateKey(day);
    
    if (todayStr !== dayStr) return null;
    
    const tp = getTimePartsInTz(currentTime, activeTimezone);
    
    // Only show if within operating hours (10AM - 12AM)
    if (tp.hours < 10) return null;
    
    const currentTotalMinutes = tp.hours * 60 + tp.minutes;
    const leftPct = ((currentTotalMinutes - dayStart) / totalMinutes) * 100;
    
    return leftPct;
  };

  // Get current time label in the active timezone
  const currentTimeLabel = useMemo(() => {
    const tp = getTimePartsInTz(currentTime, activeTimezone);
    return `${tp.hours}:${String(tp.minutes).padStart(2, '0')}`;
  }, [currentTime, activeTimezone]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle>Timeline View</CardTitle>
            <CardDescription>Horizontal timeline by room and day</CardDescription>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button size="sm" variant="outline" className={buttonStyles.pagination} onClick={() => navigateWeek('prev')}>← Prev</Button>
            <span className="text-white text-xs sm:text-sm font-medium flex-1 sm:flex-none sm:min-w-[200px] text-center truncate">
              {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: activeTimezone })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: activeTimezone })}
            </span>
            <Button size="sm" variant="outline" className={buttonStyles.pagination} onClick={() => navigateWeek('next')}>Next →</Button>
            <button
              onClick={() => {
                const next = timelineTz === 'venue' ? 'browser' : 'venue';
                localStorage.setItem('pos-timeline-tz', next);
                setTimelineTz(next);
              }}
              className="text-[10px] px-2 py-1 rounded border border-slate-600 hover:border-slate-400 transition-colors text-slate-300 hover:text-white whitespace-nowrap"
              title={`Currently showing: ${activeTimezone}`}
            >
              🕐 {timelineTz === 'venue' ? 'AT' : Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ')}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Room Legend */}
        <div className="flex gap-4 mb-6 flex-wrap">
          {rooms.map((room, idx) => (
            <div key={room.id} className="flex items-center gap-2 text-xs text-slate-300">
              <div className={`w-4 h-4 rounded ${roomColors[idx % roomColors.length]}`}></div>
              <span>{room.name}</span>
            </div>
          ))}
        </div>

        {/* Scrollable timeline container for mobile */}
        <div className="overflow-x-auto -mx-3 sm:-mx-6 px-3 sm:px-6">
          <div className="min-w-[700px]">
        {/* Timeline Grid */}
        <div className="space-y-8">
          {weekDays.map((day) => {
            const dayStr = dateKey(day);
            const dayBookings = bookings.filter(b => b.date === dayStr && b.bookingSource !== 'QUICK_SALE');
            const filteredDayBookings = filterBookingsByStatus(dayBookings);
            const totalHours = filteredDayBookings.reduce((sum, b) => sum + (b.duration || 0), 0);
            const subtotal = filteredDayBookings.reduce((sum, b) => sum + (b.price || 0), 0);
            const totalRevenue = subtotal * (1 + taxRate / 100);

            return (
              <div key={dayStr} className="space-y-2">
                {/* Day Header */}
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white min-w-[120px]">
                    {day.toLocaleDateString('en-US', { weekday: 'long', timeZone: activeTimezone })}
                  </h3>
                  <div className="text-[11px] text-slate-400">
                    {day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: activeTimezone })}
                  </div>
                  <div className="flex-1 h-px bg-slate-700" />
                  {/* TODO: Re-enable when employee permissions implemented
                  <Badge className="bg-green-600/60 text-green-200">
                    ${totalRevenue.toFixed(2)}
                  </Badge>
                  */}
                  <Badge className="bg-amber-600/60 text-amber-200">
                    {totalHours} hour{totalHours !== 1 ? 's' : ''}
                  </Badge>
                  <Badge className="bg-slate-700/60 text-slate-300">
                    {filteredDayBookings.length} booking{filteredDayBookings.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                {/* Hour Labels */}
                <div className="flex items-start gap-3">
                  <div className="min-w-[90px]"></div>
                  <div className="flex-1 flex">
                    {Array.from({ length: 14 }, (_, i) => {
                      const hour = i + 10; // Start at 10 AM
                      const displayHour = hour > 12 ? hour - 12 : hour;
                      const period = hour < 12 ? 'A' : 'P';
                      return (
                        <div key={i} className="flex-1 text-left">
                          <span className="text-[9px] text-slate-500 pl-1">{displayHour}{period}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Room Rows */}
                {rooms.map((room, roomIdx) => {
                  const roomBookings = filterBookingsByStatus(dayBookings.filter(b => b.roomId === room.id));
                  const roomColor = roomColors[roomIdx % roomColors.length];
                  const currentTimePos = getCurrentTimePosition(day);

                  return (
                    <div key={room.id} className="flex items-start gap-3">
                      {/* Room Label */}
                      <div className="min-w-[90px] pt-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded ${roomColor}`}></div>
                          <span className="text-[11px] font-medium text-slate-300">{room.name}</span>
                        </div>
                      </div>

                      {/* Timeline Bar */}
                      <div className="flex-1 relative h-14 bg-slate-700/30 rounded-lg border border-slate-700 overflow-hidden">
                        {/* Hour Grid Lines */}
                        <div className="absolute inset-0 flex">
                          {Array.from({ length: 14 }, (_, i) => (
                            <div key={i} className="flex-1 border-r border-slate-700/40 last:border-r-0"></div>
                          ))}
                        </div>

                        {/* Current Time Bar (Real-time indicator for today) */}
                        {currentTimePos !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-lg z-40 animate-pulse"
                            style={{ left: `${currentTimePos}%` }}
                          >
                            <div className="absolute -top-6 -left-4 bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                              {currentTimeLabel}
                            </div>
                          </div>
                        )}

                        {/* Booking Blocks */}
                        {roomBookings.map((booking) => {
                          const [h, m] = booking.time.split(':').map(Number);
                          const startMinutes = h * 60 + m;
                          const leftPct = ((startMinutes - dayStart) / totalMinutes) * 100;
                          const widthPct = (booking.duration * 60 / totalMinutes) * 100;
                          const isPast = isBookingPast(booking);

                          return (
                            <div
                              key={booking.id}
                              className={`${isPast ? 'bg-slate-500 opacity-40' : roomColor} absolute top-2 bottom-2 rounded-md hover:opacity-80 transition-all cursor-pointer overflow-hidden group shadow-md`}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              onClick={() => onBookingClick(booking.id)}
                            >
                              <div className="h-full flex flex-col justify-center px-2">
                                <div className="text-white text-[10px] font-semibold truncate">
                                  {booking.customerName}
                                </div>
                                <div className="text-white/90 text-[9px] truncate">
                                  {booking.time} • {booking.players}p • {booking.duration}h
                                </div>
                              </div>

                              {/* Hover Tooltip */}
                              <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded shadow-xl z-10 whitespace-nowrap">
                                <div className="text-white text-[10px] font-semibold">{booking.customerName}</div>
                                <div className="text-slate-300 text-[9px]">{booking.customerEmail}</div>
                                <div className="text-slate-400 text-[9px] mt-1">
                                  {booking.time} • {booking.duration}h • {booking.players} players • ${booking.price}
                                </div>
                                {isPast && <div className="text-slate-500 text-[9px] mt-1">(Past)</div>}
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
        </div>
      </CardContent>
    </Card>
  );
}
