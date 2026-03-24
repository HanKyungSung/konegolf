import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MonthlyRevenueChart } from '@/components/MonthlyRevenueChart';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '../../components/pos/PhoneInput';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { BookingDetailModal } from '@/components/BookingDetailModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useAuth } from '@/hooks/use-auth';
import { AdminHeader } from '@/components/AdminHeader';
import { toast } from '@/hooks/use-toast';
import { VENUE_TIMEZONE } from '@/lib/timezone';
import { 
  Search, 
  Plus, 
  Edit2, 
  ChevronLeft, 
  ChevronRight,
  Users,
  UserPlus,
  Cake,
  ArrowUpDown,
  Calendar,
  Eye,
  X,
  CalendarDays,
  DollarSign,
  Clock,
  Gift,
  Send,
  Loader2,
  Ticket,
  ExternalLink,
  Settings2,
  ToggleLeft,
  ToggleRight,
  FileDown
} from 'lucide-react';

// Types
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

interface CouponItem {
  id: string;
  code: string;
  description: string;
  discountAmount: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedSeatNumber: number | null;
  milestone: number | null;
  createdAt: string;
  couponType: { id: string; name: string; label: string };
  user: { id: string; name: string; email: string | null; phone: string };
  redeemedBooking?: { id: string; startTime: string } | null;
}

interface CouponTypeItem {
  id: string;
  name: string;
  label: string;
  defaultDescription: string;
  defaultAmount: string;
  active: boolean;
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
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
}

interface Metrics {
  totalCustomers: number;
  newThisMonth: number;
  newLastMonth: number;
  monthOverMonthChange: number;
  upcomingBirthdays: number;
  activeCustomers: number;
  topSpender: { name: string; amount: number } | null;
  todaysBookings: number;
  monthlyRevenue: number;
}

interface BirthdayCustomer {
  id: string;
  name: string;
  phone: string;
  daysUntilBirthday: number;
  birthdayDate: string;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// API helper
const getApiBase = () => process.env.REACT_APP_API_BASE || 'http://localhost:8080';

const READER_ROLES = ['ADMIN', 'SALES'];
const hasReadAccess = (role?: string) => role ? READER_ROLES.includes(role) : false;

export default function CustomerManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReadOnly = user?.role === 'SALES';
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'customers' | 'bookings' | 'coupons' | 'reports'>('customers');
  
  // Common state
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [birthdayList, setBirthdayList] = useState<BirthdayCustomer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Customer state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerPagination, setCustomerPagination] = useState<Pagination | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerSortBy, setCustomerSortBy] = useState<string>('createdAt');
  const [customerSortOrder, setCustomerSortOrder] = useState<'asc' | 'desc'>('desc');
  const [customerPage, setCustomerPage] = useState(1);
  
  // Booking state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingPagination, setBookingPagination] = useState<Pagination | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSortBy, setBookingSortBy] = useState<string>('startTime');
  const [bookingSortOrder, setBookingSortOrder] = useState<'asc' | 'desc'>('desc');
  const [bookingPage, setBookingPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  
  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [bookingDetailModalOpen, setBookingDetailModalOpen] = useState(false);
  const [fullBookingModalOpen, setFullBookingModalOpen] = useState(false);
  const [fullBookingId, setFullBookingId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [bookingSourceFilter, setBookingSourceFilter] = useState<'ALL' | 'ONLINE' | 'WALK_IN' | 'PHONE'>('ALL');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    role: 'CUSTOMER' as 'CUSTOMER' | 'STAFF'
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Send Coupon modal state
  const [sendCouponModalOpen, setSendCouponModalOpen] = useState(false);
  const [couponTypes, setCouponTypes] = useState<Array<{ id: string; name: string; label: string; defaultDescription: string; defaultAmount: string }>>([]);
  const [couponForm, setCouponForm] = useState({ couponTypeId: '', description: '', discountAmount: '', expiresAt: '' });
  const [sendingCoupon, setSendingCoupon] = useState(false);
  const [couponSuccess, setCouponSuccess] = useState('');

  // Coupons tab state
  const [couponList, setCouponList] = useState<CouponItem[]>([]);
  const [couponListLoading, setCouponListLoading] = useState(false);
  const [couponPagination, setCouponPagination] = useState<{ page: number; limit: number; total: number; pages: number } | null>(null);
  const [couponPage, setCouponPage] = useState(1);
  const [couponStatusFilter, setCouponStatusFilter] = useState<string>('ALL');
  const [couponTypeFilter, setCouponTypeFilter] = useState<string>('ALL');
  const [selectedCoupon, setSelectedCoupon] = useState<CouponItem | null>(null);
  const [couponDetailOpen, setCouponDetailOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [typeManagementOpen, setTypeManagementOpen] = useState(false);
  const [allCouponTypes, setAllCouponTypes] = useState<CouponTypeItem[]>([]);
  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', label: '', defaultDescription: '', defaultAmount: '' });
  const [typeFormSubmitting, setTypeFormSubmitting] = useState(false);

  // Customer detail coupon history
  const [customerCoupons, setCustomerCoupons] = useState<CouponItem[]>([]);
  const [customerCouponsLoading, setCustomerCouponsLoading] = useState(false);

  // Report state
  const now = new Date();
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportDownloading, setReportDownloading] = useState(false);

  // Daily report state
  const [dailyDate, setDailyDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [dailyData, setDailyData] = useState<{
    date: string;
    paymentBreakdown: { method: string; count: number; amount: number }[];
    totalRevenue: number;
    totalTips: number;
    totalTax: number;
    totalSubtotal: number;
    bookings: { completed: number; cancelled: number; booked: number; total: number };
    invoices: { paid: number; unpaid: number };
  } | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  const fetchDailySummary = useCallback(async (date: string) => {
    setDailyLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/reports/daily-summary?date=${date}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch daily summary');
      const data = await res.json();
      setDailyData(data);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDailyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dailyDate) fetchDailySummary(dailyDate);
  }, [dailyDate, fetchDailySummary]);

  const shiftDay = (offset: number) => {
    const d = new Date(dailyDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setDailyDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const formatPaymentLabel = (method: string) => {
    switch (method) {
      case 'CARD': return 'Card';
      case 'CASH': return 'Cash';
      case 'GIFT_CARD': return 'Gift Card';
      default: return method;
    }
  };

  const paymentColor = (method: string) => {
    switch (method) {
      case 'CARD': return 'text-blue-400';
      case 'CASH': return 'text-green-400';
      case 'GIFT_CARD': return 'text-purple-400';
      default: return 'text-slate-400';
    }
  };

  const paymentBg = (method: string) => {
    switch (method) {
      case 'CARD': return 'bg-blue-500/10 border-blue-500/30';
      case 'CASH': return 'bg-green-500/10 border-green-500/30';
      case 'GIFT_CARD': return 'bg-purple-500/10 border-purple-500/30';
      default: return 'bg-slate-500/10 border-slate-500/30';
    }
  };

  const handleDownloadReport = async () => {
    setReportDownloading(true);
    try {
      const res = await fetch(
        `/api/reports/monthly-sales?month=${reportMonth}&year=${reportYear}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `K-Golf_Monthly_Report_${reportYear}-${String(reportMonth).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Report downloaded', description: `Monthly report for ${reportMonth}/${reportYear}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setReportDownloading(false);
    }
  };

  // Redirect if not admin or sales
  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (!hasReadAccess(user.role)) {
      navigate('/dashboard');
      toast({ title: 'Access denied', description: 'Admin or Sales access required', variant: 'destructive' });
    }
  }, [user, navigate]);

  // Load metrics
  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/customers/metrics`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setBirthdayList(data.birthdayList || []);
      }
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  }, []);

  // Load customers
  const loadCustomers = useCallback(async () => {
    try {
      setCustomerLoading(true);
      const params = new URLSearchParams({
        page: customerPage.toString(),
        limit: '20',
        sortBy: customerSortBy,
        sortOrder: customerSortOrder,
        ...(searchQuery && { search: searchQuery })
      });
      
      const res = await fetch(`${getApiBase()}/api/customers?${params}`, {
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers);
        setCustomerPagination(data.pagination);
      } else {
        toast({ title: 'Error', description: 'Failed to load customers', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setCustomerLoading(false);
    }
  }, [customerPage, customerSortBy, customerSortOrder, searchQuery]);

  // Load bookings
  const loadBookings = useCallback(async () => {
    try {
      setBookingLoading(true);
      const params = new URLSearchParams({
        page: bookingPage.toString(),
        limit: '20',
        sortBy: bookingSortBy,
        sortOrder: bookingSortOrder,
        ...(searchQuery && { search: searchQuery }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(sourceFilter !== 'ALL' && { source: sourceFilter })
      });
      
      const res = await fetch(`${getApiBase()}/api/customers/bookings/search?${params}`, {
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings);
        setBookingPagination(data.pagination);
      } else {
        toast({ title: 'Error', description: 'Failed to load bookings', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Failed to load bookings:', err);
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setBookingLoading(false);
    }
  }, [bookingPage, bookingSortBy, bookingSortOrder, searchQuery, dateFrom, dateTo, statusFilter, sourceFilter]);

  // Load coupons
  const loadCoupons = useCallback(async () => {
    try {
      setCouponListLoading(true);
      const params = new URLSearchParams({
        page: couponPage.toString(),
        limit: '20',
        ...(searchQuery && { search: searchQuery }),
        ...(couponStatusFilter !== 'ALL' && { status: couponStatusFilter }),
        ...(couponTypeFilter !== 'ALL' && { type: couponTypeFilter }),
      });

      const res = await fetch(`${getApiBase()}/api/coupons?${params}`, {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setCouponList(data.coupons);
        setCouponPagination(data.pagination);
      } else {
        toast({ title: 'Error', description: 'Failed to load coupons', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Failed to load coupons:', err);
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setCouponListLoading(false);
    }
  }, [couponPage, searchQuery, couponStatusFilter, couponTypeFilter]);

  // Load all coupon types (including inactive) for management
  const loadAllCouponTypes = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/coupons/types`, { credentials: 'include' });
      if (res.ok) {
        const types = await res.json();
        setAllCouponTypes(types);
      }
    } catch {}
  };

  // Revoke coupon handler
  const handleChangeCouponStatus = async (couponId: string, newStatus: 'ACTIVE' | 'REDEEMED' | 'EXPIRED') => {
    if (!confirm(`Change coupon status to ${newStatus}?`)) return;
    setChangingStatus(true);
    try {
      const res = await fetch(`${getApiBase()}/api/coupons/${couponId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        toast({ title: 'Status updated', description: `Coupon is now ${newStatus}` });
        setSelectedCoupon({ ...selectedCoupon!, ...updated, status: newStatus });
        loadCoupons();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update status', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setChangingStatus(false);
    }
  };

  // Create coupon type handler
  const handleCreateCouponType = async () => {
    if (!typeForm.name || !typeForm.label || !typeForm.defaultDescription || !typeForm.defaultAmount) {
      toast({ title: 'Error', description: 'All fields are required', variant: 'destructive' });
      return;
    }
    setTypeFormSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/coupons/types`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: typeForm.name.toUpperCase(),
          label: typeForm.label,
          defaultDescription: typeForm.defaultDescription,
          defaultAmount: Number(typeForm.defaultAmount),
        }),
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'Coupon type created' });
        setTypeFormOpen(false);
        setTypeForm({ name: '', label: '', defaultDescription: '', defaultAmount: '' });
        loadAllCouponTypes();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to create type', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setTypeFormSubmitting(false);
    }
  };

  // Toggle coupon type active/inactive
  const handleToggleCouponType = async (typeId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${getApiBase()}/api/coupons/types/${typeId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        loadAllCouponTypes();
      }
    } catch {}
  };

  // Initial load
  useEffect(() => {
    if (hasReadAccess(user?.role)) {
      loadMetrics();
    }
  }, [user, loadMetrics]);

  // Load data based on active tab with debounced search
  useEffect(() => {
    if (!hasReadAccess(user?.role)) return;
    
    const timer = setTimeout(() => {
      if (activeTab === 'customers') {
        setCustomerPage(1);
        loadCustomers();
      } else if (activeTab === 'bookings') {
        setBookingPage(1);
        loadBookings();
      } else if (activeTab === 'coupons') {
        setCouponPage(1);
        loadCoupons();
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  // Load when filters/pagination change (non-search)
  useEffect(() => {
    if (hasReadAccess(user?.role) && activeTab === 'customers') {
      loadCustomers();
    }
  }, [customerPage, customerSortBy, customerSortOrder]);

  useEffect(() => {
    if (hasReadAccess(user?.role) && activeTab === 'bookings') {
      loadBookings();
    }
  }, [bookingPage, bookingSortBy, bookingSortOrder, dateFrom, dateTo, statusFilter, sourceFilter]);

  useEffect(() => {
    if (hasReadAccess(user?.role) && activeTab === 'coupons') {
      loadCoupons();
    }
  }, [couponPage, couponStatusFilter, couponTypeFilter]);

  // Handle tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as 'customers' | 'bookings' | 'coupons' | 'reports');
  };

  // Handle customer sort change
  const handleCustomerSort = (column: string) => {
    if (customerSortBy === column) {
      setCustomerSortOrder(customerSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setCustomerSortBy(column);
      setCustomerSortOrder('desc');
    }
    setCustomerPage(1);
  };

  // Handle booking sort change
  const handleBookingSort = (column: string) => {
    if (bookingSortBy === column) {
      setBookingSortOrder(bookingSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setBookingSortBy(column);
      setBookingSortOrder('desc');
    }
    setBookingPage(1);
  };

  // Load customer detail with all bookings
  const loadCustomerDetail = async (customerId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${getApiBase()}/api/customers/${customerId}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerDetail(data.customer);
      } else {
        toast({ title: 'Error', description: 'Failed to load customer details', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Failed to load customer detail:', err);
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Load coupons for a specific customer
  const loadCustomerCoupons = async (userId: string) => {
    setCustomerCouponsLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/coupons?userId=${userId}&limit=50`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCustomerCoupons(data.coupons || []);
      }
    } catch {} finally {
      setCustomerCouponsLoading(false);
    }
  };

  // Open detail modal
  const openDetailModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerDetail(null);
    setCustomerCoupons([]);
    setDetailModalOpen(true);
    loadCustomerDetail(customer.id);
    loadCustomerCoupons(customer.id);
  };

  // Open booking detail modal
  const openBookingDetailModal = (booking: Booking) => {
    setSelectedBooking(booking);
    setBookingDetailModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.split('T')[0] : '',
      role: 'CUSTOMER' // Edit modal doesn't change role
    });
    setFormError('');
    setEditModalOpen(true);
  };

  // Validation helpers
  const isValidPhone = (phone: string): boolean => {
    return /^\+1\d{10}$/.test(phone);
  };

  const isValidEmail = (email: string): boolean => {
    if (!email) return true; // Email is optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Check for duplicate phone
  const checkDuplicatePhone = async (phone: string): Promise<boolean> => {
    try {
      const res = await fetch(`${getApiBase()}/api/customers?search=${encodeURIComponent(phone)}&limit=1`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        return data.customers.some((c: Customer) => c.phone === phone);
      }
    } catch (err) {
      // On error, let backend handle duplicate check
    }
    return false;
  };

  // Check for duplicate email
  const checkDuplicateEmail = async (email: string): Promise<boolean> => {
    if (!email) return false;
    try {
      const res = await fetch(`${getApiBase()}/api/customers?search=${encodeURIComponent(email)}&limit=5`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        return data.customers.some((c: Customer) => c.email?.toLowerCase() === email.toLowerCase());
      }
    } catch (err) {
      // On error, let backend handle duplicate check
    }
    return false;
  };

  // Open create modal
  const openCreateModal = () => {
    setFormData({ name: '', phone: '', email: '', dateOfBirth: '', role: 'CUSTOMER' });
    setFormError('');
    setCreateModalOpen(true);
  };

  // Handle form submit (create)
  const handleCreate = async () => {
    // Validate name
    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }

    // Validate phone format
    if (!formData.phone.trim()) {
      setFormError('Phone number is required');
      return;
    }
    if (!isValidPhone(formData.phone)) {
      setFormError('Please enter a valid 10-digit phone number');
      return;
    }

    // Validate email required and format
    if (!formData.email.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!isValidEmail(formData.email.trim())) {
      setFormError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    setFormError('');

    // Check for duplicate phone
    const isDuplicatePhone = await checkDuplicatePhone(formData.phone);
    if (isDuplicatePhone) {
      setFormError('A customer with this phone number already exists');
      setSubmitting(false);
      return;
    }

    // Check for duplicate email
    if (formData.email.trim()) {
      const isDuplicateEmail = await checkDuplicateEmail(formData.email.trim());
      if (isDuplicateEmail) {
        setFormError('A customer with this email already exists');
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch(`${getApiBase()}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone,
          email: formData.email.trim() || null,
          dateOfBirth: formData.dateOfBirth || null,
          role: formData.role
        })
      });

      if (res.ok) {
        const roleLabel = formData.role === 'STAFF' ? 'Staff member' : 'Customer';
        toast({ title: 'Success', description: `${roleLabel} created successfully` });
        setCreateModalOpen(false);
        loadCustomers();
        loadMetrics();
      } else {
        const err = await res.json();
        setFormError(err.error || 'Failed to create customer');
      }
    } catch (err) {
      setFormError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle form submit (update)
  const handleUpdate = async () => {
    if (!selectedCustomer) return;
    
    // Validate name
    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }

    // Validate phone format
    if (!formData.phone.trim()) {
      setFormError('Phone number is required');
      return;
    }
    if (!isValidPhone(formData.phone)) {
      setFormError('Please enter a valid 10-digit phone number');
      return;
    }

    // Validate email required and format
    if (!formData.email.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!isValidEmail(formData.email.trim())) {
      setFormError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    setFormError('');

    // Check for duplicate phone (only if phone changed)
    if (formData.phone !== selectedCustomer.phone) {
      const isDuplicatePhone = await checkDuplicatePhone(formData.phone);
      if (isDuplicatePhone) {
        setFormError('A customer with this phone number already exists');
        setSubmitting(false);
        return;
      }
    }

    // Check for duplicate email (only if email changed)
    const currentEmail = selectedCustomer.email?.toLowerCase() || '';
    const newEmail = formData.email.trim().toLowerCase();
    if (newEmail && newEmail !== currentEmail) {
      const isDuplicateEmail = await checkDuplicateEmail(formData.email.trim());
      if (isDuplicateEmail) {
        setFormError('A customer with this email already exists');
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch(`${getApiBase()}/api/customers/${selectedCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone,
          email: formData.email.trim() || null,
          dateOfBirth: formData.dateOfBirth || null
        })
      });

      if (res.ok) {
        toast({ title: 'Success', description: 'Customer updated successfully' });
        setEditModalOpen(false);
        loadCustomers();
      } else {
        const err = await res.json();
        setFormError(err.error || 'Failed to update customer');
      }
    } catch (err) {
      setFormError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: VENUE_TIMEZONE
    });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  };

  // Format phone for display
  const formatPhone = (phone: string) => {
    if (!phone) return '—';
    const cleaned = phone.replace(/^\+1/, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  // Format time
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: VENUE_TIMEZONE
    });
  };

  // View customer from booking
  const viewCustomerFromBooking = (booking: Booking) => {
    if (booking.user) {
      const customer = customers.find(c => c.id === booking.user!.id);
      if (customer) {
        openDetailModal(customer);
      } else {
        setBookingDetailModalOpen(false);
        setSelectedCustomer({
          id: booking.user.id,
          name: booking.user.name,
          phone: booking.user.phone,
          email: booking.user.email,
          dateOfBirth: null,
          registrationSource: 'UNKNOWN',
          createdAt: '',
          bookingCount: 0,
          totalSpent: 0,
          lastBooking: null
        });
        setCustomerDetail(null);
        setDetailModalOpen(true);
        loadCustomerDetail(booking.user.id);
      }
    }
  };

  // Open customer detail from birthday list
  const openBirthdayCustomerDetail = (birthdayCustomer: BirthdayCustomer) => {
    // Create minimal customer object and load full details
    setSelectedCustomer({
      id: birthdayCustomer.id,
      name: birthdayCustomer.name,
      phone: birthdayCustomer.phone,
      email: null,
      dateOfBirth: birthdayCustomer.birthdayDate,
      registrationSource: 'UNKNOWN',
      createdAt: '',
      bookingCount: 0,
      totalSpent: 0,
      lastBooking: null
    });
    setCustomerDetail(null);
    setDetailModalOpen(true);
    loadCustomerDetail(birthdayCustomer.id);
  };

  if (!user || !hasReadAccess(user.role)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black">
      {/* Header */}
      <AdminHeader
        title="K one Golf"
        subtitle="Customer & Booking Management"
        variant="admin"
        sticky
        navItems={[
          { label: 'Dashboard', to: '/pos/dashboard' },
        ]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Revenue Chart */}
        <div className="mb-8">
          <MonthlyRevenueChart />
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {metrics?.totalCustomers ?? '—'}
              </div>
              <p className="text-xs text-slate-400">
                {metrics?.activeCustomers ?? 0} active (30d)
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">New Customers</CardTitle>
              <UserPlus className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {metrics?.newThisMonth ?? '—'}
              </div>
              <p className="text-xs text-slate-400">
                {metrics?.monthOverMonthChange !== undefined && (
                  <span className={metrics.monthOverMonthChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {metrics.monthOverMonthChange >= 0 ? '+' : ''}{metrics.monthOverMonthChange}%
                  </span>
                )} vs last month
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Today's Bookings</CardTitle>
              <CalendarDays className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {metrics?.todaysBookings ?? '—'}
              </div>
              <p className="text-xs text-slate-400">
                Active reservations
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Monthly Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {metrics?.monthlyRevenue !== undefined ? formatCurrency(metrics.monthlyRevenue) : '—'}
              </div>
              <p className="text-xs text-slate-400">
                {(() => {
                  const now = new Date();
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                  return `${firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: VENUE_TIMEZONE })} - ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: VENUE_TIMEZONE })}`;
                })()}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">Birthdays</CardTitle>
              <Cake className="h-4 w-4 text-pink-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {metrics?.upcomingBirthdays ?? '—'}
              </div>
              <p className="text-xs text-slate-400">
                Next 30 days
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Birthday List */}
        {birthdayList.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 mb-8">
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Cake className="h-4 w-4 text-pink-500" />
                Upcoming Birthdays
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {birthdayList.map((customer) => (
                  <Badge
                    key={customer.id}
                    variant="outline"
                    className="border-pink-500/50 text-pink-300 bg-pink-500/10 py-1 px-3 cursor-pointer hover:bg-pink-500/20 hover:border-pink-400 transition-colors"
                    onClick={() => openBirthdayCustomerDetail(customer)}
                  >
                    {customer.name} — {customer.daysUntilBirthday === 0 
                      ? '🎂 Today!' 
                      : customer.daysUntilBirthday === 1 
                        ? 'Tomorrow' 
                        : `in ${customer.daysUntilBirthday} days`}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unified Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={activeTab === 'customers' 
                ? "Search by name, email, or phone..." 
                : "Search by phone, name, or booking ref..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-400"
            />
          </div>
          {activeTab === 'customers' && !isReadOnly && (
            <Button
              onClick={openCreateModal}
              className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-slate-800/50 border border-slate-700 mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger 
              value="customers" 
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm"
            >
              <Users className="h-4 w-4 mr-1 sm:mr-2" />
              Customers
            </TabsTrigger>
            <TabsTrigger 
              value="bookings"
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm"
            >
              <CalendarDays className="h-4 w-4 mr-1 sm:mr-2" />
              Bookings
            </TabsTrigger>
            <TabsTrigger 
              value="coupons"
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm"
            >
              <Ticket className="h-4 w-4 mr-1 sm:mr-2" />
              Coupons
            </TabsTrigger>
            <TabsTrigger 
              value="reports"
              className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm"
            >
              <FileDown className="h-4 w-4 mr-1 sm:mr-2" />
              Reports
            </TabsTrigger>
          </TabsList>

          {/* Customers Tab */}
          <TabsContent value="customers" className="mt-0">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead 
                          className="text-slate-300 cursor-pointer hover:text-white"
                          onClick={() => handleCustomerSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Name
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                        <TableHead className="text-slate-300">Phone</TableHead>
                        <TableHead className="text-slate-300 hidden md:table-cell">Email</TableHead>
                        <TableHead 
                          className="text-slate-300 cursor-pointer hover:text-white"
                          onClick={() => handleCustomerSort('bookingCount')}
                        >
                          <div className="flex items-center gap-1">
                            Bookings
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="text-slate-300 cursor-pointer hover:text-white"
                          onClick={() => handleCustomerSort('totalSpent')}
                        >
                          <div className="flex items-center gap-1">
                            Total Spent
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="text-slate-300 cursor-pointer hover:text-white hidden lg:table-cell"
                          onClick={() => handleCustomerSort('lastBooking')}
                        >
                          <div className="flex items-center gap-1">
                            Last Booking
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                        <TableHead className="text-slate-300 hidden md:table-cell">Source</TableHead>
                        <TableHead className="text-slate-300 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                            Loading customers...
                          </TableCell>
                        </TableRow>
                      ) : customers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                            No customers found
                          </TableCell>
                        </TableRow>
                      ) : (
                        customers.map((customer) => (
                          <TableRow 
                            key={customer.id} 
                            className="border-slate-700 hover:bg-slate-700/30 cursor-pointer"
                            onClick={() => openDetailModal(customer)}
                          >
                            <TableCell className="font-medium text-white">
                              {customer.name}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {formatPhone(customer.phone)}
                            </TableCell>
                            <TableCell className="text-slate-300 hidden md:table-cell">
                              {customer.email || '—'}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {customer.bookingCount}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {formatCurrency(customer.totalSpent)}
                            </TableCell>
                            <TableCell className="text-slate-300 hidden lg:table-cell">
                              {formatDate(customer.lastBooking)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge 
                                variant="outline" 
                                className={
                                  customer.registrationSource === 'ONLINE' 
                                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                    : customer.registrationSource === 'WALK_IN'
                                      ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                      : 'border-slate-500/50 text-slate-400 bg-slate-500/10'
                                }
                              >
                                {customer.registrationSource}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); openDetailModal(customer); }}
                                  className="text-slate-400 hover:text-white hover:bg-slate-700"
                                  title="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {!isReadOnly && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                                  className="text-slate-400 hover:text-white hover:bg-slate-700"
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {customerPagination && customerPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
                    <div className="text-sm text-slate-400">
                      Showing {((customerPagination.page - 1) * customerPagination.limit) + 1} to{' '}
                      {Math.min(customerPagination.page * customerPagination.limit, customerPagination.totalCount)} of{' '}
                      {customerPagination.totalCount} customers
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!customerPagination.hasPrevPage}
                        onClick={() => setCustomerPage(customerPage - 1)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-300">
                        Page {customerPagination.page} of {customerPagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!customerPagination.hasNextPage}
                        onClick={() => setCustomerPage(customerPage + 1)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="mt-0">
            {/* Booking Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-sm">From:</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full sm:w-40 bg-slate-800/50 border-slate-600 text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-sm">To:</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full sm:w-40 bg-slate-800/50 border-slate-600 text-white"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36 bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="BOOKED">Booked</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-36 bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="ALL">All Sources</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="WALK_IN">Walk-in</SelectItem>
                  <SelectItem value="PHONE">Phone</SelectItem>
                </SelectContent>
              </Select>
              {(dateFrom || dateTo || statusFilter !== 'ALL' || sourceFilter !== 'ALL') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setStatusFilter('ALL');
                    setSourceFilter('ALL');
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              )}
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-300 hidden lg:table-cell">Ref#</TableHead>
                        <TableHead className="text-slate-300">Customer</TableHead>
                        <TableHead className="text-slate-300 hidden md:table-cell">Phone</TableHead>
                        <TableHead 
                          className="text-slate-300 cursor-pointer hover:text-white"
                          onClick={() => handleBookingSort('startTime')}
                        >
                          <div className="flex items-center gap-1">
                            Date
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                        <TableHead className="text-slate-300">Time</TableHead>
                        <TableHead className="text-slate-300 hidden md:table-cell">Room</TableHead>
                        <TableHead className="text-slate-300 hidden lg:table-cell">Source</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead 
                          className="text-slate-300 cursor-pointer hover:text-white text-right"
                          onClick={() => handleBookingSort('price')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Total
                            <ArrowUpDown className="h-3 w-3" />
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookingLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                            Loading bookings...
                          </TableCell>
                        </TableRow>
                      ) : bookings.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                            No bookings found
                          </TableCell>
                        </TableRow>
                      ) : (
                        bookings.map((booking) => (
                          <TableRow 
                            key={booking.id} 
                            className="border-slate-700 hover:bg-slate-700/30 cursor-pointer"
                            onClick={() => openBookingDetailModal(booking)}
                          >
                            <TableCell className="font-mono text-xs text-slate-400 hidden lg:table-cell">
                              {booking.id.slice(0, 8)}...
                            </TableCell>
                            <TableCell className="font-medium text-white">
                              {booking.customerName}
                              {booking.user && (
                                <Badge variant="outline" className="ml-2 text-xs border-green-500/30 text-green-400 bg-green-500/5">
                                  Linked
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-slate-300 hidden md:table-cell">
                              {formatPhone(booking.customerPhone)}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {formatDate(booking.startTime)}
                            </TableCell>
                            <TableCell className="text-slate-300">
                              {formatTime(booking.startTime)}
                            </TableCell>
                            <TableCell className="text-slate-300 hidden md:table-cell">
                              {booking.roomName}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Badge 
                                variant="outline"
                                className={
                                  booking.bookingSource === 'ONLINE'
                                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                    : booking.bookingSource === 'WALK_IN'
                                      ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                      : 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                                }
                              >
                                {booking.bookingSource}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline"
                                className={
                                  booking.bookingStatus === 'BOOKED'
                                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                    : booking.bookingStatus === 'COMPLETED'
                                      ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                      : 'border-red-500/50 text-red-400 bg-red-500/10'
                                }
                              >
                                {booking.bookingStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-300 text-right font-medium">
                              {formatCurrency(booking.price)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {bookingPagination && bookingPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
                    <div className="text-sm text-slate-400">
                      Showing {((bookingPagination.page - 1) * bookingPagination.limit) + 1} to{' '}
                      {Math.min(bookingPagination.page * bookingPagination.limit, bookingPagination.totalCount)} of{' '}
                      {bookingPagination.totalCount} bookings
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!bookingPagination.hasPrevPage}
                        onClick={() => setBookingPage(bookingPage - 1)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-300">
                        Page {bookingPagination.page} of {bookingPagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!bookingPagination.hasNextPage}
                        onClick={() => setBookingPage(bookingPage + 1)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Coupons Tab */}
          <TabsContent value="coupons" className="mt-0">
            {/* Coupon Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <Select value={couponStatusFilter} onValueChange={(v) => { setCouponStatusFilter(v); setCouponPage(1); }}>
                <SelectTrigger className="w-full sm:w-36 bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="REDEEMED">Redeemed</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={couponTypeFilter} onValueChange={(v) => { setCouponTypeFilter(v); setCouponPage(1); }}>
                <SelectTrigger className="w-full sm:w-36 bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="BIRTHDAY">Birthday</SelectItem>
                  <SelectItem value="LOYALTY">Loyalty</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
              {(couponStatusFilter !== 'ALL' || couponTypeFilter !== 'ALL') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setCouponStatusFilter('ALL'); setCouponTypeFilter('ALL'); }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { loadAllCouponTypes(); setTypeManagementOpen(true); }}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Manage Types
                </Button>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-300">Code</TableHead>
                        <TableHead className="text-slate-300">Customer</TableHead>
                        <TableHead className="text-slate-300 hidden md:table-cell">Type</TableHead>
                        <TableHead className="text-slate-300">Amount</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="text-slate-300 hidden lg:table-cell">Created</TableHead>
                        <TableHead className="text-slate-300 hidden lg:table-cell">Expires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {couponListLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                            Loading coupons...
                          </TableCell>
                        </TableRow>
                      ) : couponList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                            No coupons found
                          </TableCell>
                        </TableRow>
                      ) : (
                        couponList.map((coupon) => (
                          <TableRow
                            key={coupon.id}
                            className="border-slate-700 hover:bg-slate-700/30 cursor-pointer"
                            onClick={() => { setSelectedCoupon(coupon); setCouponDetailOpen(true); }}
                          >
                            <TableCell className="font-mono text-amber-400 font-medium">
                              {coupon.code}
                            </TableCell>
                            <TableCell className="text-white">
                              {coupon.user.name}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge
                                variant="outline"
                                className={
                                  coupon.couponType.name === 'BIRTHDAY'
                                    ? 'border-pink-500/50 text-pink-400 bg-pink-500/10'
                                    : coupon.couponType.name === 'LOYALTY'
                                      ? 'border-purple-500/50 text-purple-400 bg-purple-500/10'
                                      : 'border-slate-500/50 text-slate-400 bg-slate-500/10'
                                }
                              >
                                {coupon.couponType.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-emerald-400 font-medium">
                              {formatCurrency(Number(coupon.discountAmount))}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  coupon.status === 'ACTIVE'
                                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                    : coupon.status === 'REDEEMED'
                                      ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                      : 'border-red-500/50 text-red-400 bg-red-500/10'
                                }
                              >
                                {coupon.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-300 hidden lg:table-cell">
                              {formatDate(coupon.createdAt)}
                            </TableCell>
                            <TableCell className="text-slate-300 hidden lg:table-cell">
                              {coupon.expiresAt ? formatDate(coupon.expiresAt) : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {couponPagination && couponPagination.pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
                    <div className="text-sm text-slate-400">
                      Showing {((couponPagination.page - 1) * couponPagination.limit) + 1} to{' '}
                      {Math.min(couponPagination.page * couponPagination.limit, couponPagination.total)} of{' '}
                      {couponPagination.total} coupons
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={couponPagination.page <= 1}
                        onClick={() => setCouponPage(couponPage - 1)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-300">
                        Page {couponPagination.page} of {couponPagination.pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={couponPagination.page >= couponPagination.pages}
                        onClick={() => setCouponPage(couponPage + 1)}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="mt-0">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FileDown className="h-5 w-5" />
                  Monthly Sales Report
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Generate and download a PDF sales report for a selected month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Month</Label>
                    <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(parseInt(v, 10))}>
                      <SelectTrigger className="w-[140px] bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)} className="text-white">
                            {new Date(2000, i, 1).toLocaleDateString('en-CA', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Year</Label>
                    <Select value={String(reportYear)} onValueChange={(v) => setReportYear(parseInt(v, 10))}>
                      <SelectTrigger className="w-[110px] bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        {Array.from({ length: 5 }, (_, i) => {
                          const y = new Date().getFullYear() - i;
                          return (
                            <SelectItem key={y} value={String(y)} className="text-white">
                              {y}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleDownloadReport}
                    disabled={reportDownloading}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-medium"
                  >
                    {reportDownloading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4 mr-2" />
                    )}
                    {reportDownloading ? 'Generating...' : 'Download PDF'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Daily Summary Report */}
            <Card className="bg-slate-800/50 border-slate-700 mt-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Daily Report
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Payment breakdown and summary for a specific day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Date Navigation */}
                <div className="flex items-center gap-3 mb-6">
                  <Button variant="outline" size="sm" onClick={() => shiftDay(-1)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="w-[180px] bg-slate-700 border-slate-600 text-white"
                  />
                  <Button variant="outline" size="sm" onClick={() => shiftDay(1)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => {
                      const d = new Date();
                      setDailyDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                    }}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs">
                    Today
                  </Button>
                </div>

                {dailyLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  </div>
                ) : dailyData ? (
                  <Table>
                    <TableBody>
                      {/* Revenue */}
                      <TableRow className="border-slate-700">
                        <TableCell className="text-slate-300 font-medium">Revenue</TableCell>
                        <TableCell className="text-right font-bold text-emerald-400 text-lg">
                          ${dailyData.totalRevenue.toFixed(2)}
                        </TableCell>
                      </TableRow>

                      {/* Payment method breakdown — indented like the chart tooltip */}
                      {dailyData.paymentBreakdown.map((pb) => (
                        <TableRow key={pb.method} className="border-slate-700/50">
                          <TableCell className="pl-8">
                            <span className="flex items-center gap-2">
                              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${
                                pb.method === 'CARD' ? 'bg-blue-400' :
                                pb.method === 'CASH' ? 'bg-amber-400' :
                                pb.method === 'GIFT_CARD' ? 'bg-purple-400' :
                                'bg-emerald-400'
                              }`} />
                              <span className={paymentColor(pb.method)}>
                                {formatPaymentLabel(pb.method)}
                              </span>
                              <span className="text-slate-500 text-xs">({pb.count})</span>
                            </span>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${paymentColor(pb.method)}`}>
                            ${pb.amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}

                      {dailyData.paymentBreakdown.length === 0 && (
                        <TableRow className="border-slate-700/50">
                          <TableCell colSpan={2} className="pl-8 text-slate-500 text-sm">
                            No payments recorded
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Separator */}
                      <TableRow className="border-slate-600"><TableCell colSpan={2} className="py-0" /></TableRow>

                      {/* Bookings */}
                      <TableRow className="border-slate-700">
                        <TableCell className="text-slate-300 font-medium">Bookings</TableCell>
                        <TableCell className="text-right font-bold text-amber-400">{dailyData.bookings.total}</TableCell>
                      </TableRow>
                      <TableRow className="border-slate-700/50">
                        <TableCell className="pl-8 text-slate-400">Completed</TableCell>
                        <TableCell className="text-right text-green-400 font-medium">{dailyData.bookings.completed}</TableCell>
                      </TableRow>
                      <TableRow className="border-slate-700/50">
                        <TableCell className="pl-8 text-slate-400">Active</TableCell>
                        <TableCell className="text-right text-blue-400 font-medium">{dailyData.bookings.booked}</TableCell>
                      </TableRow>
                      <TableRow className="border-slate-700/50">
                        <TableCell className="pl-8 text-slate-400">Cancelled</TableCell>
                        <TableCell className="text-right text-red-400 font-medium">{dailyData.bookings.cancelled}</TableCell>
                      </TableRow>

                      {/* Separator */}
                      <TableRow className="border-slate-600"><TableCell colSpan={2} className="py-0" /></TableRow>

                      {/* Financial summary */}
                      <TableRow className="border-slate-700">
                        <TableCell className="text-slate-300 font-medium">Subtotal</TableCell>
                        <TableCell className="text-right text-slate-300">${dailyData.totalSubtotal.toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow className="border-slate-700">
                        <TableCell className="text-slate-300 font-medium">Tax</TableCell>
                        <TableCell className="text-right text-slate-300">${dailyData.totalTax.toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow className="border-slate-700">
                        <TableCell className="text-slate-300 font-medium">Tips</TableCell>
                        <TableCell className="text-right text-amber-400">${dailyData.totalTips.toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow className="border-slate-700">
                        <TableCell className="text-slate-400">Invoices (Paid / Unpaid)</TableCell>
                        <TableCell className="text-right">
                          <span className="text-green-400 font-medium">{dailyData.invoices.paid}</span>
                          <span className="text-slate-500 mx-1">/</span>
                          <span className="text-red-400 font-medium">{dailyData.invoices.unpaid}</span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Create Customer/Staff Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Add New {formData.role === 'STAFF' ? 'Staff Member' : 'Customer'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {formData.role === 'STAFF' 
                ? 'Create a staff account with POS access'
                : 'Create a new customer record (walk-in registration)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {formError && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded p-2">
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Name <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setFormError('');
                }}
                className="bg-slate-700/50 border-slate-600 text-white"
                placeholder="John Doe"
              />
            </div>
            <PhoneInput
              value={formData.phone}
              onChange={(normalized) => {
                setFormData({ ...formData, phone: normalized });
                setFormError('');
              }}
              label="Phone Number"
              required
              className="[&_input]:bg-slate-700/50 [&_input]:border-slate-600 [&_input]:text-white [&_label]:text-slate-300"
            />
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email <span className="text-red-500">*</span></Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setFormError('');
                }}
                className={`bg-slate-700/50 border-slate-600 text-white ${
                  formData.email && !isValidEmail(formData.email) ? 'border-red-500' : ''
                }`}
                placeholder="john@example.com"
                required
              />
              {formData.email && !isValidEmail(formData.email) && (
                <p className="text-xs text-red-400">Please enter a valid email address</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob" className="text-slate-300">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-slate-300">Account Type</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'CUSTOMER' | 'STAFF') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="CUSTOMER" className="text-white hover:bg-slate-700">Customer</SelectItem>
                  <SelectItem value="STAFF" className="text-white hover:bg-slate-700">Staff (POS Access)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">
                Staff members can access the POS system but not customer data.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {submitting ? 'Creating...' : formData.role === 'STAFF' ? 'Create Staff' : 'Create Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update customer information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {formError && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded p-2">
                {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-slate-300">Name <span className="text-red-500">*</span></Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  setFormError('');
                }}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>
            <PhoneInput
              value={formData.phone}
              onChange={(normalized) => {
                setFormData({ ...formData, phone: normalized });
                setFormError('');
              }}
              label="Phone Number"
              required
              className="[&_input]:bg-slate-700/50 [&_input]:border-slate-600 [&_input]:text-white [&_label]:text-slate-300"
            />
            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-slate-300">Email <span className="text-red-500">*</span></Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setFormError('');
                }}
                className={`bg-slate-700/50 border-slate-600 text-white ${
                  formData.email && !isValidEmail(formData.email) ? 'border-red-500' : ''
                }`}
                required
              />
              {formData.email && !isValidEmail(formData.email) && (
                <p className="text-xs text-red-400">Please enter a valid email address</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dob" className="text-slate-300">Date of Birth</Label>
              <Input
                id="edit-dob"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </div>
            {selectedCustomer && (
              <div className="pt-4 border-t border-slate-700 space-y-2 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Customer since:</span>
                  <span className="text-slate-300">{formatDate(selectedCustomer.createdAt)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total bookings:</span>
                  <span className="text-slate-300">{selectedCustomer.bookingCount}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total spent:</span>
                  <span className="text-slate-300">{formatCurrency(selectedCustomer.totalSpent)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={(open) => {
        setDetailModalOpen(open);
        if (!open) setBookingSourceFilter('ALL');
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white !w-[95vw] sm:!w-[90vw] !max-w-[95vw] sm:!max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCustomer?.name}
              <Badge 
                variant="outline" 
                className={
                  selectedCustomer?.registrationSource === 'ONLINE' 
                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                    : selectedCustomer?.registrationSource === 'WALK_IN'
                      ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                      : 'border-slate-500/50 text-slate-400 bg-slate-500/10'
                }
              >
                {selectedCustomer?.registrationSource}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {formatPhone(selectedCustomer?.phone || '')}
              {selectedCustomer?.email && ` • ${selectedCustomer.email}`}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400">Loading customer details...</div>
            </div>
          ) : customerDetail ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 p-1">
                <div className="bg-slate-700/50 rounded-lg p-4 border-l-4 border-emerald-500">
                  <div className="text-xs text-slate-400 uppercase">Total</div>
                  <div className="text-xl font-bold text-emerald-400">
                    {customerDetail.totalsBySource.ONLINE.count + customerDetail.totalsBySource.WALK_IN.count + customerDetail.totalsBySource.PHONE.count}
                  </div>
                  <div className="text-xs text-emerald-400 font-medium">
                    {formatCurrency(customerDetail.totalsBySource.ONLINE.spent + customerDetail.totalsBySource.WALK_IN.spent + customerDetail.totalsBySource.PHONE.spent)}
                  </div>
                </div>
                <div 
                  className={`bg-slate-700/50 rounded-lg p-4 cursor-pointer transition-all ${bookingSourceFilter === 'ONLINE' ? 'ring-2 ring-green-500' : 'hover:bg-slate-700'}`}
                  onClick={() => setBookingSourceFilter(bookingSourceFilter === 'ONLINE' ? 'ALL' : 'ONLINE')}
                >
                  <div className="text-xs text-slate-400 uppercase">Online</div>
                  <div className="text-xl font-bold text-green-400">
                    {customerDetail.totalsBySource.ONLINE.count}
                  </div>
                  <div className="text-xs text-slate-400">{formatCurrency(customerDetail.totalsBySource.ONLINE.spent)}</div>
                </div>
                <div 
                  className={`bg-slate-700/50 rounded-lg p-4 cursor-pointer transition-all ${bookingSourceFilter === 'WALK_IN' ? 'ring-2 ring-blue-500' : 'hover:bg-slate-700'}`}
                  onClick={() => setBookingSourceFilter(bookingSourceFilter === 'WALK_IN' ? 'ALL' : 'WALK_IN')}
                >
                  <div className="text-xs text-slate-400 uppercase">Walk-in</div>
                  <div className="text-xl font-bold text-blue-400">
                    {customerDetail.totalsBySource.WALK_IN.count}
                  </div>
                  <div className="text-xs text-slate-400">{formatCurrency(customerDetail.totalsBySource.WALK_IN.spent)}</div>
                </div>
                <div 
                  className={`bg-slate-700/50 rounded-lg p-4 cursor-pointer transition-all ${bookingSourceFilter === 'PHONE' ? 'ring-2 ring-amber-500' : 'hover:bg-slate-700'}`}
                  onClick={() => setBookingSourceFilter(bookingSourceFilter === 'PHONE' ? 'ALL' : 'PHONE')}
                >
                  <div className="text-xs text-slate-400 uppercase">Phone</div>
                  <div className="text-xl font-bold text-amber-400">
                    {customerDetail.totalsBySource.PHONE.count}
                  </div>
                  <div className="text-xs text-slate-400">{formatCurrency(customerDetail.totalsBySource.PHONE.spent)}</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400 uppercase">Member Since</div>
                  <div className="text-lg font-bold text-white">
                    {formatDate(customerDetail.createdAt)}
                  </div>
                  {customerDetail.dateOfBirth && (
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Cake className="h-3 w-3" />
                      {formatDate(customerDetail.dateOfBirth)}
                    </div>
                  )}
                </div>
              </div>

              {/* Coupon History */}
              {customerCoupons.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Ticket className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-white">Coupons ({customerCoupons.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customerCoupons.map((c) => (
                      <div
                        key={c.id}
                        className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-700 transition-colors"
                        onClick={() => { setSelectedCoupon(c); setCouponDetailOpen(true); }}
                      >
                        <span className="font-mono text-xs text-amber-400">{c.code}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            c.status === 'ACTIVE'
                              ? 'border-green-500/50 text-green-400 bg-green-500/10'
                              : c.status === 'REDEEMED'
                                ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                : 'border-red-500/50 text-red-400 bg-red-500/10'
                          }`}
                        >
                          {c.status}
                        </Badge>
                        <span className="text-xs text-emerald-400">{formatCurrency(Number(c.discountAmount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bookingSourceFilter !== 'ALL' && (
                <div className="flex items-center gap-2 mb-3 text-sm">
                  <span className="text-slate-400">Filtered by:</span>
                  <Badge 
                    variant="outline"
                    className={
                      bookingSourceFilter === 'ONLINE'
                        ? 'border-green-500/50 text-green-400 bg-green-500/10'
                        : bookingSourceFilter === 'WALK_IN'
                          ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                          : 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                    }
                  >
                    {bookingSourceFilter}
                  </Badge>
                  <button 
                    onClick={() => setBookingSourceFilter('ALL')}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-auto border border-slate-700 rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-800">
                    <TableRow className="border-slate-700 hover:bg-transparent">
                      <TableHead className="text-slate-300">Date</TableHead>
                      <TableHead className="text-slate-300">Time</TableHead>
                      <TableHead className="text-slate-300">Room</TableHead>
                      <TableHead className="text-slate-300 hidden md:table-cell">Source</TableHead>
                      <TableHead className="text-slate-300 hidden lg:table-cell">Created By</TableHead>
                      <TableHead className="text-slate-300">Status</TableHead>
                      <TableHead className="text-slate-300 text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const filteredBookings = bookingSourceFilter === 'ALL' 
                        ? customerDetail.bookings 
                        : customerDetail.bookings.filter(b => b.bookingSource === bookingSourceFilter);
                      
                      if (filteredBookings.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                              No bookings found
                            </TableCell>
                          </TableRow>
                        );
                      }
                      
                      return filteredBookings.map((booking) => (
                        <TableRow 
                          key={booking.id} 
                          className="border-slate-700 hover:bg-slate-700/30 cursor-pointer"
                          onClick={() => {
                            setFullBookingId(booking.id);
                            setFullBookingModalOpen(true);
                          }}
                        >
                          <TableCell className="text-slate-300">
                            {formatDate(booking.startTime)}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {formatTime(booking.startTime)}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {booking.roomName}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge 
                              variant="outline"
                              className={
                                booking.bookingSource === 'ONLINE'
                                  ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                  : booking.bookingSource === 'WALK_IN'
                                    ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                    : 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                              }
                            >
                              {booking.bookingSource}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300 hidden lg:table-cell">
                            {booking.createdByName || (
                              <span className="text-slate-500 italic">Self</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className={
                                booking.bookingStatus === 'BOOKED'
                                  ? 'border-green-500/50 text-green-400 bg-green-500/10'
                                  : booking.bookingStatus === 'COMPLETED'
                                    ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                                    : 'border-red-500/50 text-red-400 bg-red-500/10'
                              }
                            >
                              {booking.bookingStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300 text-right font-medium">
                            {formatCurrency(Number(booking.price))}
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-4">
            {!isReadOnly && (
            <Button
              variant="outline"
              onClick={() => {
                setDetailModalOpen(false);
                if (selectedCustomer) openEditModal(selectedCustomer);
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Customer
            </Button>
            )}
            {!isReadOnly && (
            <Button
              variant="outline"
              onClick={async () => {
                // Load coupon types and open send coupon modal
                try {
                  const res = await fetch(`${getApiBase()}/api/coupons/types`, { credentials: 'include' });
                  if (res.ok) {
                    const types = await res.json();
                    setCouponTypes(types);
                    if (types.length > 0) {
                      setCouponForm({
                        couponTypeId: types[0].id,
                        description: types[0].defaultDescription,
                        discountAmount: String(Number(types[0].defaultAmount).toFixed(2)),
                        expiresAt: '',
                      });
                    }
                  }
                } catch {}
                setCouponSuccess('');
                setSendCouponModalOpen(true);
              }}
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
            >
              <Gift className="h-4 w-4 mr-2" />
              Send Coupon
            </Button>
            )}
            <Button
              onClick={() => setDetailModalOpen(false)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Coupon Modal */}
      <Dialog open={sendCouponModalOpen} onOpenChange={setSendCouponModalOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-400" />
              Send Coupon
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Send a coupon to <span className="text-white font-medium">{selectedCustomer?.name}</span>
              {selectedCustomer?.email ? ` (${selectedCustomer.email})` : ' — no email on file'}
            </DialogDescription>
          </DialogHeader>

          {couponSuccess ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-4xl">🎉</p>
              <p className="text-emerald-400 font-semibold">{couponSuccess}</p>
              <Button onClick={() => setSendCouponModalOpen(false)} className="bg-amber-500 hover:bg-amber-600 text-black mt-2">
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Coupon Type */}
              <div className="space-y-2">
                <Label className="text-slate-300">Type</Label>
                <Select
                  value={couponForm.couponTypeId}
                  onValueChange={(val) => {
                    const type = couponTypes.find(t => t.id === val);
                    setCouponForm({
                      couponTypeId: val,
                      description: type?.defaultDescription || '',
                      discountAmount: type ? String(Number(type.defaultAmount).toFixed(2)) : '',
                      expiresAt: couponForm.expiresAt,
                    });
                  }}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {couponTypes.map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-white hover:bg-slate-700">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-slate-300">Description</Label>
                <Input
                  value={couponForm.description}
                  onChange={e => setCouponForm(f => ({ ...f, description: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label className="text-slate-300">Discount Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={couponForm.discountAmount}
                  onChange={e => setCouponForm(f => ({ ...f, discountAmount: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>

              {/* Expiry (optional) */}
              <div className="space-y-2">
                <Label className="text-slate-300">Expiry Date <span className="text-slate-500">(optional)</span></Label>
                <Input
                  type="date"
                  value={couponForm.expiresAt}
                  onChange={e => setCouponForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>

              {!selectedCustomer?.email && (
                <p className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg p-2">
                  ⚠️ This customer has no email. The coupon will be created but no email will be sent.
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSendCouponModalOpen(false)}
                  className="border-slate-600 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  disabled={sendingCoupon || !couponForm.couponTypeId || !couponForm.description}
                  onClick={async () => {
                    if (!selectedCustomer) return;
                    setSendingCoupon(true);
                    try {
                      const res = await fetch(`${getApiBase()}/api/coupons`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          userId: selectedCustomer.id,
                          couponTypeId: couponForm.couponTypeId,
                          description: couponForm.description,
                          discountAmount: Number(couponForm.discountAmount),
                          expiresAt: couponForm.expiresAt || null,
                        }),
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.error || 'Failed to create coupon');
                      }
                      const coupon = await res.json();
                      setCouponSuccess(`Coupon ${coupon.code} created${selectedCustomer.email ? ' and emailed' : ''}!`);
                      toast({ title: 'Coupon sent', description: `Code: ${coupon.code}` });
                    } catch (err: any) {
                      toast({ title: 'Error', description: err.message, variant: 'destructive' });
                    } finally {
                      setSendingCoupon(false);
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                >
                  {sendingCoupon ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" />Send Coupon</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Booking Detail Modal */}
      <Dialog open={bookingDetailModalOpen} onOpenChange={setBookingDetailModalOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Booking Details
              {selectedBooking && (
                <Badge 
                  variant="outline"
                  className={
                    selectedBooking.bookingStatus === 'BOOKED'
                      ? 'border-green-500/50 text-green-400 bg-green-500/10'
                      : selectedBooking.bookingStatus === 'COMPLETED'
                        ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                        : 'border-red-500/50 text-red-400 bg-red-500/10'
                  }
                >
                  {selectedBooking.bookingStatus}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-mono text-xs">
              {selectedBooking?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 py-4">
              {/* Time & Room Info */}
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-slate-300">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">{formatDate(selectedBooking.startTime)}</span>
                  <span className="text-slate-400">at</span>
                  <span className="font-medium">{formatTime(selectedBooking.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span>{selectedBooking.roomName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <Badge 
                    variant="outline"
                    className={
                      selectedBooking.bookingSource === 'ONLINE'
                        ? 'border-green-500/50 text-green-400 bg-green-500/10'
                        : selectedBooking.bookingSource === 'WALK_IN'
                          ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                          : 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                    }
                  >
                    {selectedBooking.bookingSource}
                  </Badge>
                  <span className="text-xl font-bold text-white">
                    {formatCurrency(selectedBooking.price)}
                  </span>
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
                <div className="text-xs text-slate-400 uppercase mb-2">Customer</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">{selectedBooking.customerName}</div>
                    <div className="text-sm text-slate-400">{formatPhone(selectedBooking.customerPhone)}</div>
                    {selectedBooking.customerEmail && (
                      <div className="text-sm text-slate-400">{selectedBooking.customerEmail}</div>
                    )}
                  </div>
                  {selectedBooking.user && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => viewCustomerFromBooking(selectedBooking)}
                      className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                    >
                      <Users className="h-4 w-4 mr-1" />
                      View Profile
                    </Button>
                  )}
                </div>
                {selectedBooking.user && (
                  <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/5 text-xs">
                    Linked Customer Account
                  </Badge>
                )}
              </div>

              {/* Info Section */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Created by:</span>
                <span className="text-slate-300">
                  {selectedBooking.createdByName || <span className="italic">Self-booked</span>}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Payment:</span>
                <Badge 
                  variant="outline"
                  className={
                    selectedBooking.paymentStatus === 'PAID'
                      ? 'border-green-500/50 text-green-400 bg-green-500/10'
                      : selectedBooking.paymentStatus === 'UNPAID'
                        ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                        : 'border-slate-500/50 text-slate-400 bg-slate-500/10'
                  }
                >
                  {selectedBooking.paymentStatus}
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (selectedBooking) {
                  setFullBookingId(selectedBooking.id);
                  setBookingDetailModalOpen(false);
                  setFullBookingModalOpen(true);
                }
              }}
              className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
            >
              <Eye className="h-4 w-4 mr-1" />
              Full Details
            </Button>
            <Button
              onClick={() => setBookingDetailModalOpen(false)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Booking Detail Modal (POS View) */}
      <BookingDetailModal
        bookingId={fullBookingId}
        open={fullBookingModalOpen}
        onOpenChange={setFullBookingModalOpen}
        onClose={() => {
          loadBookings();
          // Refresh customer detail if open (booking may have been modified)
          if (customerDetail) {
            loadCustomerDetail(customerDetail.id);
          }
        }}
      />

      {/* Coupon Detail Modal */}
      <Dialog open={couponDetailOpen} onOpenChange={setCouponDetailOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-amber-400" />
              Coupon Details
            </DialogTitle>
          </DialogHeader>
          {selectedCoupon && (
            <div className="space-y-4">
              {/* Code + Status */}
              <div className="bg-slate-700/50 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-2xl font-bold text-amber-400">{selectedCoupon.code}</div>
                  <div className="text-sm text-slate-400 mt-1">{selectedCoupon.description}</div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-sm px-3 py-1 ${
                    selectedCoupon.status === 'ACTIVE'
                      ? 'border-green-500/50 text-green-400 bg-green-500/10'
                      : selectedCoupon.status === 'REDEEMED'
                        ? 'border-blue-500/50 text-blue-400 bg-blue-500/10'
                        : 'border-red-500/50 text-red-400 bg-red-500/10'
                  }`}
                >
                  {selectedCoupon.status}
                </Badge>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase">Type</div>
                  <div className="text-white font-medium mt-1">
                    <Badge
                      variant="outline"
                      className={
                        selectedCoupon.couponType.name === 'BIRTHDAY'
                          ? 'border-pink-500/50 text-pink-400 bg-pink-500/10'
                          : selectedCoupon.couponType.name === 'LOYALTY'
                            ? 'border-purple-500/50 text-purple-400 bg-purple-500/10'
                            : 'border-slate-500/50 text-slate-400 bg-slate-500/10'
                      }
                    >
                      {selectedCoupon.couponType.label}
                    </Badge>
                  </div>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase">Amount</div>
                  <div className="text-emerald-400 font-bold text-lg mt-1">
                    {formatCurrency(Number(selectedCoupon.discountAmount))}
                  </div>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase">Customer</div>
                  <div className="text-white font-medium mt-1">{selectedCoupon.user.name}</div>
                  <div className="text-xs text-slate-400">{selectedCoupon.user.email || formatPhone(selectedCoupon.user.phone)}</div>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-400 uppercase">Created</div>
                  <div className="text-white mt-1">{formatDate(selectedCoupon.createdAt)}</div>
                </div>
                {selectedCoupon.expiresAt && (
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase">Expires</div>
                    <div className="text-white mt-1">{formatDate(selectedCoupon.expiresAt)}</div>
                  </div>
                )}
                {selectedCoupon.redeemedAt && (
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase">Redeemed</div>
                    <div className="text-white mt-1">{formatDate(selectedCoupon.redeemedAt)}</div>
                    {selectedCoupon.redeemedSeatNumber != null && (
                      <div className="text-xs text-slate-400">Seat {selectedCoupon.redeemedSeatNumber}</div>
                    )}
                  </div>
                )}
                {selectedCoupon.redeemedBooking && (
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase">Booking</div>
                    <div className="text-white mt-1 text-xs font-mono">
                      {selectedCoupon.redeemedBooking.id.slice(0, 8)}...
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(selectedCoupon.redeemedBooking.startTime)}
                    </div>
                  </div>
                )}
                {selectedCoupon.milestone && (
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="text-xs text-slate-400 uppercase">Milestone</div>
                    <div className="text-purple-400 font-medium mt-1">{selectedCoupon.milestone} bookings</div>
                  </div>
                )}
              </div>

              {/* Public Page Link */}
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="h-3 w-3 text-slate-400" />
                <a
                  href={`/coupon/${selectedCoupon.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  View public coupon page
                </a>
              </div>
            </div>
          )}
          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {selectedCoupon && (
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-sm whitespace-nowrap">Status:</Label>
                <Select
                  value={selectedCoupon.status}
                  onValueChange={(val) => handleChangeCouponStatus(selectedCoupon.id, val as 'ACTIVE' | 'REDEEMED' | 'EXPIRED')}
                  disabled={changingStatus}
                >
                  <SelectTrigger className="w-[140px] bg-slate-900 border-slate-600 text-white">
                    {changingStatus ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Updating...</span>
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="ACTIVE" className="text-green-400 hover:bg-slate-700">Active</SelectItem>
                    <SelectItem value="REDEEMED" className="text-blue-400 hover:bg-slate-700">Redeemed</SelectItem>
                    <SelectItem value="EXPIRED" className="text-red-400 hover:bg-slate-700">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={() => setCouponDetailOpen(false)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coupon Type Management Modal */}
      <Dialog open={typeManagementOpen} onOpenChange={setTypeManagementOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-amber-400" />
              Coupon Types
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Manage coupon types for birthday, loyalty, and custom rewards
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[40vh] overflow-auto">
            {allCouponTypes.map((t) => (
              <div key={t.id} className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">{t.label}</div>
                  <div className="text-xs text-slate-400">{t.name} · Default: {formatCurrency(Number(t.defaultAmount))}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{t.defaultDescription}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleCouponType(t.id, t.active)}
                  className={t.active ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}
                  title={t.active ? 'Click to deactivate' : 'Click to activate'}
                >
                  {t.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </Button>
              </div>
            ))}
          </div>

          {/* Add new type form */}
          {typeFormOpen ? (
            <div className="border-t border-slate-700 pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-slate-300 text-xs">Name (key)</Label>
                  <Input
                    value={typeForm.name}
                    onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. REFERRAL"
                    className="bg-slate-900 border-slate-600 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-xs">Display Label</Label>
                  <Input
                    value={typeForm.label}
                    onChange={e => setTypeForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="e.g. Referral Reward"
                    className="bg-slate-900 border-slate-600 text-white text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300 text-xs">Default Description</Label>
                <Input
                  value={typeForm.defaultDescription}
                  onChange={e => setTypeForm(f => ({ ...f, defaultDescription: e.target.value }))}
                  placeholder="e.g. Thank you for your referral!"
                  className="bg-slate-900 border-slate-600 text-white text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300 text-xs">Default Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={typeForm.defaultAmount}
                  onChange={e => setTypeForm(f => ({ ...f, defaultAmount: e.target.value }))}
                  placeholder="35.00"
                  className="bg-slate-900 border-slate-600 text-white text-sm w-32"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTypeFormOpen(false); setTypeForm({ name: '', label: '', defaultDescription: '', defaultAmount: '' }); }}
                  className="border-slate-600 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateCouponType}
                  disabled={typeFormSubmitting}
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                >
                  {typeFormSubmitting ? 'Creating...' : 'Create Type'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setTypeFormOpen(true)}
              className="border-dashed border-slate-600 text-slate-300 hover:bg-slate-700 w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Type
            </Button>
          )}

          <DialogFooter>
            <Button
              onClick={() => setTypeManagementOpen(false)}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
