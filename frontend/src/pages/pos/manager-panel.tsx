import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { verifyManager } from '@/services/pos-api';
import { VENUE_TIMEZONE } from '@/lib/timezone';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  Lock,
  Unlock,
  ArrowUpDown,
  X,
} from 'lucide-react';

const getApiBase = () => process.env.REACT_APP_API_BASE || 'http://localhost:8080';

// ── Types ──
interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  dateOfBirth: string | null;
  registrationSource: string;
  createdAt: string;
  bookingCount: number;
  totalSpent: number;
  lastBooking: string | null;
}

interface CustomerDetail extends Customer {
  updatedAt: string;
  bookings: CustomerBooking[];
  totalsBySource: {
    ONLINE: { count: number; spent: number };
    WALK_IN: { count: number; spent: number };
    PHONE: { count: number; spent: number };
  };
}

interface CustomerBooking {
  id: string;
  startTime: string;
  endTime: string;
  price: string;
  bookingStatus: string;
  paymentStatus: string;
  roomId: string;
  roomName: string;
  customerName: string;
  customerPhone: string;
  bookingSource: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface Booking {
  id: string;
  startTime: string;
  endTime: string;
  price: number;
  bookingStatus: string;
  paymentStatus: string;
  bookingSource: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  roomId: string;
  roomName: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  user: { id: string; name: string; phone: string; email: string | null } | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ── PIN Pad ──
function PinPad({ onSubmit, error, loading }: { onSubmit: (pin: string) => void; error: string; loading: boolean }) {
  const [pin, setPin] = useState('');

  const handleKey = (key: string) => {
    if (key === '⌫') setPin(p => p.slice(0, -1));
    else if (pin.length < 6) setPin(p => p + key);
  };

  const handleSubmit = () => {
    if (pin.length >= 4) onSubmit(pin);
  };

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <Lock className="w-10 h-10 text-amber-400" />
      <p className="text-slate-300 text-sm">Enter Manager PIN to unlock</p>
      <div className="flex justify-center gap-2 mb-2">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${i < pin.length ? 'bg-amber-400' : 'bg-slate-600'}`}
          />
        ))}
        {pin.length > 4 && [4, 5].map(i => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${i < pin.length ? 'bg-amber-400' : 'bg-slate-600'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 w-56">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map(key => (
          <button
            key={key}
            onClick={() => key && handleKey(key)}
            disabled={!key || loading}
            className={`h-12 rounded-lg text-lg font-semibold transition-colors ${
              !key ? 'invisible' :
              key === '⌫' ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' :
              'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
      <Button
        onClick={handleSubmit}
        disabled={pin.length < 4 || loading}
        className="w-56 bg-amber-600 hover:bg-amber-500 text-white"
      >
        {loading ? 'Verifying...' : 'Unlock'}
      </Button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

// ── Status badge helpers ──
function statusBadge(status: string) {
  const cls: Record<string, string> = {
    BOOKED: 'bg-blue-900/50 text-blue-300 border-blue-700',
    COMPLETED: 'bg-green-900/50 text-green-300 border-green-700',
    CANCELLED: 'bg-red-900/50 text-red-300 border-red-700',
    NO_SHOW: 'bg-slate-800 text-slate-400 border-slate-600',
  };
  return <Badge variant="outline" className={cls[status] || 'text-slate-400'}>{status}</Badge>;
}

function paymentBadge(status: string) {
  const cls: Record<string, string> = {
    PAID: 'bg-green-900/50 text-green-300 border-green-700',
    UNPAID: 'bg-amber-900/50 text-amber-300 border-amber-700',
    REFUNDED: 'bg-red-900/50 text-red-300 border-red-700',
  };
  return <Badge variant="outline" className={cls[status] || 'text-slate-400'}>{status}</Badge>;
}

function sourceBadge(source: string) {
  const cls: Record<string, string> = {
    ONLINE: 'bg-purple-900/50 text-purple-300 border-purple-700',
    WALK_IN: 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
    PHONE: 'bg-indigo-900/50 text-indigo-300 border-indigo-700',
    QUICK_SALE: 'bg-amber-900/50 text-amber-300 border-amber-700',
  };
  return <Badge variant="outline" className={cls[source] || 'text-slate-400'}>{source.replace('_', ' ')}</Badge>;
}

// ── Format helpers ──
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: VENUE_TIMEZONE });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { timeZone: VENUE_TIMEZONE, hour: '2-digit', minute: '2-digit' });
}
function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11) return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return phone;
}

// ── Main Component ──
export default function ManagerPanel() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [managerName, setManagerName] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerPagination, setCustomerPagination] = useState<Pagination | null>(null);
  const [customerSort, setCustomerSort] = useState<{ by: string; order: 'asc' | 'desc' }>({ by: 'createdAt', order: 'desc' });
  const [customerLoading, setCustomerLoading] = useState(false);

  // Customer detail modal
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Bookings state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingPagination, setBookingPagination] = useState<Pagination | null>(null);
  const [bookingSort, setBookingSort] = useState<{ by: string; order: 'asc' | 'desc' }>({ by: 'startTime', order: 'desc' });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');

  // ── PIN Verification ──
  const handlePinSubmit = async (pin: string) => {
    setPinError('');
    setPinLoading(true);
    try {
      const result = await verifyManager(pin);
      if (result.authorized) {
        setUnlocked(true);
        setManagerName(result.employeeName || '');
      } else {
        setPinError(result.reason || 'Access denied');
      }
    } catch (err: any) {
      setPinError(err.message || 'Verification failed');
    } finally {
      setPinLoading(false);
    }
  };

  // ── Customer API ──
  const loadCustomers = useCallback(async () => {
    setCustomerLoading(true);
    try {
      const params = new URLSearchParams({
        page: customerPage.toString(),
        limit: '20',
        sortBy: customerSort.by,
        sortOrder: customerSort.order,
      });
      if (customerSearch) params.append('search', customerSearch);

      const res = await fetch(`${getApiBase()}/api/customers?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers);
        setCustomerPagination(data.pagination);
      }
    } finally {
      setCustomerLoading(false);
    }
  }, [customerPage, customerSort, customerSearch]);

  const loadCustomerDetail = async (id: string) => {
    setCustomerDetailLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/customers/${id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSelectedCustomer(data);
        setEditName(data.name);
        setEditPhone(data.phone);
        setEditDob(data.dateOfBirth?.slice(0, 10) || '');
      }
    } finally {
      setCustomerDetailLoading(false);
    }
  };

  const saveCustomerEdit = async () => {
    if (!selectedCustomer) return;
    setEditSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, phone: editPhone, dateOfBirth: editDob || null }),
      });
      if (res.ok) {
        setEditingCustomer(false);
        await loadCustomerDetail(selectedCustomer.id);
        await loadCustomers();
      }
    } finally {
      setEditSaving(false);
    }
  };

  // ── Bookings API ──
  const loadBookings = useCallback(async () => {
    setBookingLoading(true);
    try {
      const params = new URLSearchParams({
        page: bookingPage.toString(),
        limit: '20',
        sortBy: bookingSort.by,
        sortOrder: bookingSort.order,
      });
      if (bookingSearch) params.append('search', bookingSearch);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (sourceFilter !== 'ALL') params.append('source', sourceFilter);

      const res = await fetch(`${getApiBase()}/api/customers/bookings/search?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings);
        setBookingPagination(data.pagination);
      }
    } finally {
      setBookingLoading(false);
    }
  }, [bookingPage, bookingSort, bookingSearch, dateFrom, dateTo, statusFilter, sourceFilter]);

  // ── Data loading ──
  useEffect(() => {
    if (unlocked) loadCustomers();
  }, [unlocked, loadCustomers]);

  useEffect(() => {
    if (unlocked) loadBookings();
  }, [unlocked, loadBookings]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setCustomerPage(1); }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  useEffect(() => {
    const t = setTimeout(() => { setBookingPage(1); }, 300);
    return () => clearTimeout(t);
  }, [bookingSearch]);

  const toggleCustomerSort = (col: string) => {
    setCustomerSort(prev => ({
      by: col,
      order: prev.by === col && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleBookingSort = (col: string) => {
    setBookingSort(prev => ({
      by: col,
      order: prev.by === col && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  // ── PIN Screen ──
  if (!unlocked) {
    return (
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent>
          <PinPad onSubmit={handlePinSubmit} error={pinError} loading={pinLoading} />
        </CardContent>
      </Card>
    );
  }

  // ── Unlocked Manager Panel ──
  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-green-400" />
            <CardTitle className="text-base">Manager Panel</CardTitle>
            <Badge variant="outline" className="text-green-400 border-green-600 text-xs">
              {managerName}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-400 hover:text-white"
            onClick={() => { setUnlocked(false); setManagerName(''); }}
          >
            <Lock className="w-3 h-3 mr-1" /> Lock
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="customers">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
          </TabsList>

          {/* ── Customers Tab ── */}
          <TabsContent value="customers">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="pl-10 bg-slate-900 border-slate-600 text-white"
                />
              </div>

              {/* Table */}
              <div className="rounded border border-slate-700 overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader className="bg-slate-900/80 sticky top-0">
                    <TableRow className="border-slate-700 hover:bg-transparent">
                      <TableHead className="text-slate-300 cursor-pointer" onClick={() => toggleCustomerSort('name')}>
                        Name <ArrowUpDown className="inline w-3 h-3 ml-1" />
                      </TableHead>
                      <TableHead className="text-slate-300">Phone</TableHead>
                      <TableHead className="text-slate-300 hidden md:table-cell">Email</TableHead>
                      <TableHead className="text-slate-300 cursor-pointer text-right" onClick={() => toggleCustomerSort('bookingCount')}>
                        Bookings <ArrowUpDown className="inline w-3 h-3 ml-1" />
                      </TableHead>
                      <TableHead className="text-slate-300 cursor-pointer text-right" onClick={() => toggleCustomerSort('totalSpent')}>
                        Spent <ArrowUpDown className="inline w-3 h-3 ml-1" />
                      </TableHead>
                      <TableHead className="text-slate-300 hidden lg:table-cell">Last Booking</TableHead>
                      <TableHead className="text-slate-300 w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                    ) : customers.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No customers found</TableCell></TableRow>
                    ) : customers.map(c => (
                      <TableRow key={c.id} className="border-slate-700 hover:bg-slate-800/60 cursor-pointer" onClick={() => loadCustomerDetail(c.id)}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-slate-300 text-sm">{fmtPhone(c.phone)}</TableCell>
                        <TableCell className="text-slate-400 text-sm hidden md:table-cell">{c.email || '—'}</TableCell>
                        <TableCell className="text-right">{c.bookingCount}</TableCell>
                        <TableCell className="text-right">${c.totalSpent.toFixed(2)}</TableCell>
                        <TableCell className="text-slate-400 text-sm hidden lg:table-cell">
                          {c.lastBooking ? fmtDate(c.lastBooking) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); loadCustomerDetail(c.id); }}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {customerPagination && customerPagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Page {customerPagination.page} of {customerPagination.totalPages} ({customerPagination.totalCount} total)</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 border-slate-600" disabled={!customerPagination.hasPrevPage} onClick={() => setCustomerPage(p => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 border-slate-600" disabled={!customerPagination.hasNextPage} onClick={() => setCustomerPage(p => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Bookings Tab ── */}
          <TabsContent value="bookings">
            <div className="space-y-4">
              {/* Search + Filters */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by phone, name, or booking ref..."
                    value={bookingSearch}
                    onChange={e => setBookingSearch(e.target.value)}
                    className="pl-10 bg-slate-900 border-slate-600 text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm"
                    placeholder="From"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm"
                    placeholder="To"
                  />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px] bg-slate-900 border-slate-600 text-white text-sm h-8">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="BOOKED">Booked</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-[130px] bg-slate-900 border-slate-600 text-white text-sm h-8">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Sources</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="WALK_IN">Walk-in</SelectItem>
                      <SelectItem value="PHONE">Phone</SelectItem>
                      <SelectItem value="QUICK_SALE">Quick Sale</SelectItem>
                    </SelectContent>
                  </Select>
                  {(dateFrom || dateTo || statusFilter !== 'ALL' || sourceFilter !== 'ALL') && (
                    <Button size="sm" variant="ghost" className="text-slate-400 h-8 px-2" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter('ALL'); setSourceFilter('ALL'); }}>
                      <X className="w-3 h-3 mr-1" /> Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="rounded border border-slate-700 overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader className="bg-slate-900/80 sticky top-0">
                    <TableRow className="border-slate-700 hover:bg-transparent">
                      <TableHead className="text-slate-300">Customer</TableHead>
                      <TableHead className="text-slate-300 hidden md:table-cell">Phone</TableHead>
                      <TableHead className="text-slate-300 cursor-pointer" onClick={() => toggleBookingSort('startTime')}>
                        Date <ArrowUpDown className="inline w-3 h-3 ml-1" />
                      </TableHead>
                      <TableHead className="text-slate-300">Time</TableHead>
                      <TableHead className="text-slate-300 hidden md:table-cell">Room</TableHead>
                      <TableHead className="text-slate-300 hidden lg:table-cell">Source</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      <TableHead className="text-slate-300 cursor-pointer text-right" onClick={() => toggleBookingSort('price')}>
                        Total <ArrowUpDown className="inline w-3 h-3 ml-1" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Loading...</TableCell></TableRow>
                    ) : bookings.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">No bookings found</TableCell></TableRow>
                    ) : bookings.map(b => (
                      <TableRow
                        key={b.id}
                        className="border-slate-700 hover:bg-slate-800/60 cursor-pointer"
                        onClick={() => navigate(`/pos/booking/${b.id}`)}
                      >
                        <TableCell className="font-medium">{b.customerName || 'Quick Sale'}</TableCell>
                        <TableCell className="text-slate-300 text-sm hidden md:table-cell">{b.customerPhone ? fmtPhone(b.customerPhone) : '—'}</TableCell>
                        <TableCell className="text-sm">{fmtDate(b.startTime)}</TableCell>
                        <TableCell className="text-sm">{fmtTime(b.startTime)}</TableCell>
                        <TableCell className="text-sm hidden md:table-cell">{b.roomName}</TableCell>
                        <TableCell className="hidden lg:table-cell">{sourceBadge(b.bookingSource)}</TableCell>
                        <TableCell>{statusBadge(b.bookingStatus)}</TableCell>
                        <TableCell className="text-right">${Number(b.price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {bookingPagination && bookingPagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Page {bookingPagination.page} of {bookingPagination.totalPages} ({bookingPagination.totalCount} total)</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 border-slate-600" disabled={!bookingPagination.hasPrevPage} onClick={() => setBookingPage(p => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 border-slate-600" disabled={!bookingPagination.hasNextPage} onClick={() => setBookingPage(p => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Customer Detail Modal ── */}
        <Dialog open={!!selectedCustomer} onOpenChange={(open) => { if (!open) { setSelectedCustomer(null); setEditingCustomer(false); } }}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedCustomer?.name}
                {selectedCustomer && sourceBadge(selectedCustomer.registrationSource)}
              </DialogTitle>
            </DialogHeader>

            {customerDetailLoading ? (
              <p className="text-slate-400 py-4">Loading...</p>
            ) : selectedCustomer && (
              <div className="space-y-4">
                {/* Info / Edit section */}
                {editingCustomer ? (
                  <div className="space-y-3 bg-slate-800/60 p-4 rounded-lg border border-slate-700">
                    <div>
                      <label className="text-xs text-slate-400">Name</label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-slate-900 border-slate-600 text-white mt-1" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Phone</label>
                      <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="bg-slate-900 border-slate-600 text-white mt-1" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Date of Birth</label>
                      <Input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className="bg-slate-900 border-slate-600 text-white mt-1" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveCustomerEdit} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save'}</Button>
                      <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => setEditingCustomer(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-800/60 p-4 rounded-lg border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="space-y-1 text-sm">
                        <p><span className="text-slate-400">Phone:</span> {fmtPhone(selectedCustomer.phone)}</p>
                        <p><span className="text-slate-400">Email:</span> {selectedCustomer.email || '—'}</p>
                        <p><span className="text-slate-400">Birthday:</span> {selectedCustomer.dateOfBirth ? fmtDate(selectedCustomer.dateOfBirth) : '—'}</p>
                      </div>
                      <Button size="sm" variant="outline" className="border-slate-600 text-slate-300" onClick={() => setEditingCustomer(true)}>
                        <Edit2 className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700 text-center">
                    <p className="text-xl font-bold">{selectedCustomer.bookingCount}</p>
                    <p className="text-xs text-slate-400">Bookings</p>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700 text-center">
                    <p className="text-xl font-bold">${selectedCustomer.totalSpent.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">Total Spent</p>
                  </div>
                  <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700 text-center">
                    <p className="text-xl font-bold">{selectedCustomer.lastBooking ? fmtDate(selectedCustomer.lastBooking) : '—'}</p>
                    <p className="text-xs text-slate-400">Last Visit</p>
                  </div>
                </div>

                {/* Booking history */}
                {selectedCustomer.bookings?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">Booking History</p>
                    <div className="rounded border border-slate-700 overflow-auto max-h-[250px]">
                      <Table>
                        <TableHeader className="bg-slate-900/80 sticky top-0">
                          <TableRow className="border-slate-700 hover:bg-transparent">
                            <TableHead className="text-slate-300 text-xs">Date</TableHead>
                            <TableHead className="text-slate-300 text-xs">Room</TableHead>
                            <TableHead className="text-slate-300 text-xs">Source</TableHead>
                            <TableHead className="text-slate-300 text-xs">Status</TableHead>
                            <TableHead className="text-slate-300 text-xs text-right">Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedCustomer.bookings.map(bk => (
                            <TableRow
                              key={bk.id}
                              className="border-slate-700 hover:bg-slate-800/60 cursor-pointer"
                              onClick={() => { setSelectedCustomer(null); navigate(`/pos/booking/${bk.id}`); }}
                            >
                              <TableCell className="text-sm">{fmtDate(bk.startTime)}</TableCell>
                              <TableCell className="text-sm">{bk.roomName}</TableCell>
                              <TableCell>{sourceBadge(bk.bookingSource)}</TableCell>
                              <TableCell>{statusBadge(bk.bookingStatus)}</TableCell>
                              <TableCell className="text-right text-sm">${Number(bk.price).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
