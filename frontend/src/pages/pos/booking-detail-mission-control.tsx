import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Users, Plus, Minus, Trash2, Printer, Edit, CheckCircle2, AlertCircle, CreditCard, Banknote, Gift, User, Clock, Calendar, Mail, X, Ticket, Loader2, Camera, ArrowLeft, Phone, ReceiptText } from 'lucide-react';
import Receipt from '../../components/Receipt';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MCPanelHeader } from '@/components/mc';
import { VENUE_TIMEZONE } from '@/lib/timezone';
import { useAuth } from '@/hooks/use-auth';
import {
  getBooking,
  updateBookingStatus as apiUpdateBookingStatus,
  updateBookingPlayers as apiUpdateBookingPlayers,
  extendBooking as apiExtendBooking,
  listRooms,
  listMenuItems,
  getGlobalTaxRate,
  getInvoices,
  createOrder as apiCreateOrder,
  updateOrder as apiUpdateOrder,
  deleteOrder as apiDeleteOrder,
  unpayInvoice as apiUnpayInvoice,
  addPayment as apiAddPayment,
  getReceipt,
  getSeatReceipt,
  sendReceiptEmail,
  type Booking,
  type Room,
  type MenuItem,
  type Invoice,
  type Order,
  type ReceiptData
} from '@/services/pos-api';
import ReceiptCaptureModal from './receipt-capture-modal';

const API_BASE = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';

interface POSBookingDetailProps {
  bookingId: string;
  onBack: () => void;
}

// Simple icon components (inline SVGs for icons not in lucide-react)
const MoveRight = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
);
const Split = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h12m-12 5h12M3 7h.01M3 12h.01M3 17h.01" /></svg>
);

const statusStyles: Record<string, string> = {
  booked: 'mc-status-badge mc-status-info',
  completed: 'mc-status-badge mc-status-success',
  cancelled: 'mc-status-badge mc-status-danger'
};

const paymentStatusStyles: Record<string, string> = {
  UNPAID: 'mc-status-badge mc-status-danger',
  BILLED: 'mc-status-badge mc-status-warning',
  PAID: 'mc-status-badge mc-status-success'
};

interface OrderItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  seat?: number;
  splitPrice?: number;
}

const seatColors = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500',
  'bg-cyan-500', 'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500'
];

const roomColors: Record<string, string> = {
  '1': 'bg-blue-500',
  '2': 'bg-green-500',
  '3': 'bg-purple-500',
  '4': 'bg-orange-500',
};

const MAX_SEATS = 10;

export default function POSBookingDetail({ bookingId, onBack }: POSBookingDetailProps) {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'SALES';
  // State
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [globalTaxRate, setGlobalTaxRate] = useState(8);
  const [bookingTaxRate, setBookingTaxRate] = useState<number | null>(null);

  // Invoice and order data from backend
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [backendOrders, setBackendOrders] = useState<Order[]>([]);

  // Order management
  const [numberOfSeats, setNumberOfSeats] = useState<number>(1);
  const [selectedSeat, setSelectedSeat] = useState<number>(1);
  const [showMenuPanel, setShowMenuPanel] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);

  // Seat payment tracking
  const [seatPayments, setSeatPayments] = useState<Record<number, { status: 'UNPAID' | 'PAID'; method?: string; tip?: number; total?: number; payments?: { id: string; method: string; amount: number }[] }>>({});

  // Dialog state
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [discountName, setDiscountName] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENT'>('FLAT');

  // Coupon dialog state
  const [showCouponDialog, setShowCouponDialog] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponData, setCouponData] = useState<{ code: string; description: string; discountAmount: number; couponType: { label: string }; user: { name: string }; isValid: boolean; error?: string | null } | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  // Gift card dialog state
  const [showGiftCardDialog, setShowGiftCardDialog] = useState(false);
  const [giftCardAmount, setGiftCardAmount] = useState('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [selectedOrderItem, setSelectedOrderItem] = useState<OrderItem | null>(null);
  const [selectedSeatsForSplit, setSelectedSeatsForSplit] = useState<number[]>([]);
  const [showTaxEditDialog, setShowTaxEditDialog] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string>('');
  const [printingSeat, setPrintingSeat] = useState<number | null>(null);

  // Payment state
  const [tipAmountBySeat, setTipAmountBySeat] = useState<Record<number, string>>({});
  const [tipMethodBySeat, setTipMethodBySeat] = useState<Record<number, 'CARD' | 'CASH'>>({});
  const [processingPayment, setProcessingPayment] = useState<number | null>(null);

  // Collect payment dialog state
  const [paymentDialogSeat, setPaymentDialogSeat] = useState<number | null>(null);
  const [paymentDialogAmount, setPaymentDialogAmount] = useState<string>('');
  const [paymentDialogMethod, setPaymentDialogMethod] = useState<'CARD' | 'CASH' | 'GIFT_CARD' | 'COUPON' | null>(null);

  // Receipt modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptMode, setReceiptMode] = useState<'full' | 'seat'>('full');
  const [receiptSeatIndex, setReceiptSeatIndex] = useState<number | undefined>(undefined);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  // Confirmation dialog state
  const [cancelBookingOpen, setCancelBookingOpen] = useState(false);
  const [cancelPaymentSeat, setCancelPaymentSeat] = useState<number | null>(null);
  const [removeOrderId, setRemoveOrderId] = useState<string | null>(null);
  const [removeOrderName, setRemoveOrderName] = useState<string>('');

  // Receipt photo capture state
  const [capturePaymentId, setCapturePaymentId] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<'upload' | 'view'>('upload');
  const [receiptPhotos, setReceiptPhotos] = useState<Record<string, boolean>>({});
  const [deliveryMethod, setDeliveryMethod] = useState<'print' | 'email'>('print');
  const [printerType, setPrinterType] = useState<'thermal' | 'regular'>('thermal');
  const [emailAddress, setEmailAddress] = useState<string>('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [bookingId]);

  // Auto-open gift card dialog if ?action=gift-card is in URL (from MC Action Dock)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'gift-card') {
      setGiftCardAmount('');
      setShowGiftCardDialog(true);
      params.delete('action');
      const next = params.toString();
      const url = `${window.location.pathname}${next ? `?${next}` : ''}`;
      window.history.replaceState({}, '', url);
    }
  }, [bookingId]);

  // Keep only UI preferences in localStorage (like expanded seats, custom tax rate)
  useEffect(() => {
    if (!bookingId) return;
    const savedTaxRate = localStorage.getItem(`booking-${bookingId}-taxRate`);

    if (savedTaxRate) {
      try {
        setBookingTaxRate(parseFloat(savedTaxRate));
      } catch (e) {
        console.error('[BookingDetail] Failed to load saved tax rate:', e);
      }
    }
  }, [bookingId]);

  async function loadData() {
    try {
      setLoading(true);

      // Save current scroll position (use container ref if inside modal, else window)
      const container = scrollContainerRef.current;
      const scrollY = container ? container.scrollTop : window.scrollY;

      console.log('[BookingDetail] Loading data for booking ID:', bookingId);

      const [bookingData, roomsData, menuData, taxRate, invoicesData] = await Promise.all([
        getBooking(bookingId),
        listRooms(),
        listMenuItems().catch(() => [] as MenuItem[]), // Menu might not exist yet
        getGlobalTaxRate(),
        getInvoices(bookingId).catch(() => [] as Invoice[]) // Load invoices with orders
      ]);

      console.log('[BookingDetail] Booking data:', bookingData);
      console.log('[BookingDetail] Rooms:', roomsData.length);
      console.log('[BookingDetail] Menu items:', menuData.length);
      console.log('[BookingDetail] Tax rate:', taxRate);
      console.log('[BookingDetail] Invoices:', invoicesData.length);

      setBooking(bookingData);
      setRooms(roomsData);
      setMenu(menuData);
      setGlobalTaxRate(taxRate);
      setInvoices(invoicesData);

      // Convert backend invoices/orders to UI format
      loadOrdersFromInvoices(invoicesData, menuData);

      // Set number of seats from booking
      if (bookingData.players) {
        setNumberOfSeats(bookingData.players);
      }

      // Load payment status from invoices
      loadPaymentStatusFromInvoices(invoicesData);

      console.log('[BookingDetail] Successfully loaded all data');

      // Restore scroll position after render completes
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = scrollY;
        } else {
          window.scrollTo(0, scrollY);
        }
      });
    } catch (err) {
      console.error('[BookingDetail] Failed to load data:', err);
      alert(`Failed to load booking: ${err instanceof Error ? err.message : 'Unknown error'}`);
      onBack();
    } finally {
      setLoading(false);
    }
  }

  // Convert backend invoices/orders to UI OrderItem format
  function loadOrdersFromInvoices(invoicesData: Invoice[], menuData: MenuItem[]) {
    const items: OrderItem[] = [];

    invoicesData.forEach((invoice) => {
      if (invoice.orders && invoice.orders.length > 0) {
        invoice.orders.forEach((order) => {
          // Handle regular menu items
          if (order.menuItemId) {
            const menuItem = menuData.find((m) => m.id === order.menuItemId);
            if (menuItem) {
              items.push({
                id: order.id,
                menuItem: menuItem,
                quantity: order.quantity,
                seat: invoice.seatIndex,
              });
            }
          } else {
            // Handle custom items and discounts (no menuItemId)
            const isDiscountOrder = Number(order.unitPrice) < 0;
            const customMenuItem: MenuItem = {
              id: `custom-${order.id}`,
              name: order.customItemName || (isDiscountOrder ? 'Discount' : 'Custom Item'),
              description: isDiscountOrder ? 'Discount' : 'Custom Item',
              price: Number(order.customItemPrice || order.unitPrice),
              category: 'FOOD',
              available: true,
              createdAt: order.createdAt,
              updatedAt: order.createdAt,
            };
            items.push({
              id: order.id,
              menuItem: customMenuItem,
              quantity: order.quantity,
              seat: invoice.seatIndex,
            });
          }
        });
      }
    });

    setOrderItems(items);
    console.log('[BookingDetail] Loaded', items.length, 'order items from backend');
  }

  // Load payment status from invoices (with split payment support)
  function loadPaymentStatusFromInvoices(invoicesData: Invoice[]) {
    const payments: Record<number, { status: 'UNPAID' | 'PAID'; method?: string; tip?: number; total?: number; payments?: { id: string; method: string; amount: number }[] }> = {};
    const photos: Record<string, boolean> = {};

    invoicesData.forEach((invoice) => {
      payments[invoice.seatIndex] = {
        status: invoice.status,
        method: invoice.paymentMethod || undefined,
        tip: invoice.tip ? parseFloat(String(invoice.tip)) : undefined,
        total: parseFloat(String(invoice.totalAmount)) || 0,
        payments: invoice.payments || [],
      };
      // Track which payments have receipt photos
      invoice.payments?.forEach((p) => {
        if (p.receiptPath) photos[p.id] = true;
      });
    });

    setSeatPayments(payments);
    setReceiptPhotos(photos);
    console.log('[BookingDetail] Loaded payment status for', Object.keys(payments).length, 'seats');
  }

  const roomColor = useMemo(
    () => {
      const room = rooms.find((r) => r.id === booking?.roomId);
      return room?.name || 'Unknown Room';
    },
    [rooms, booking]
  );

  // Order management functions
  const addItemToSeat = async (menuItem: MenuItem, seat: number) => {
    if (!booking) return;

    setOrderLoading(true);
    try {
      console.log('[BookingDetail] Creating order:', { menuItemId: menuItem.id, seat, quantity: 1 });

      const result = await apiCreateOrder({
        bookingId: booking.id,
        menuItemId: menuItem.id,
        seatIndex: seat,
        quantity: 1,
      });

      console.log('[BookingDetail] Order created:', result.order);

      // Add to local state immediately for responsive UI
      const newItem: OrderItem = {
        id: result.order.id,
        menuItem,
        quantity: result.order.quantity,
        seat,
      };
      setOrderItems([...orderItems, newItem]);

      // Refetch invoices to get updated totals
      const updatedInvoices = await getInvoices(booking.id);
      setInvoices(updatedInvoices);

      console.log('[BookingDetail] Invoice updated, new total:', result.updatedInvoice?.totalAmount);
    } catch (err) {
      console.error('[BookingDetail] Failed to add item:', err);
      alert(`Failed to add item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const updateItemQuantity = async (orderItemId: string, change: number) => {
    if (!booking) return;

    const item = orderItems.find(i => i.id === orderItemId);
    if (!item) return;

    const newQuantity = item.quantity + change;

    // If quantity becomes 0, delete the order
    if (newQuantity <= 0) {
      await removeOrderItem(orderItemId);
      return;
    }

    setOrderLoading(true);
    try {
      console.log('[BookingDetail] Updating order quantity:', orderItemId, newQuantity);

      // Call API to update quantity
      const result = await apiUpdateOrder(orderItemId, newQuantity);
      console.log('[BookingDetail] Order updated:', result);

      // Update local state
      setOrderItems(prev =>
        prev.map(i => i.id === orderItemId ? { ...i, quantity: newQuantity } : i)
      );

      // Refetch invoices to get updated totals
      const updatedInvoices = await getInvoices(booking.id);
      setInvoices(updatedInvoices);
    } catch (error) {
      console.error('[BookingDetail] Failed to update order:', error);
      alert(error instanceof Error ? error.message : 'Failed to update order');
    } finally {
      setOrderLoading(false);
    }
  };

  const removeOrderItem = async (orderItemId: string) => {
    if (!booking) return;

    setOrderLoading(true);
    try {
      console.log('[BookingDetail] Deleting order:', orderItemId);

      await apiDeleteOrder(orderItemId);

      console.log('[BookingDetail] Order deleted, reloading data');

      // Reload all data to ensure proper sync
      await loadData();

    } catch (err) {
      console.error('[BookingDetail] Failed to remove item:', err);
      alert(`Failed to remove item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const moveItemToSeat = async (orderItemId: string, newSeat: number | undefined) => {
    if (!booking || !newSeat) return;

    setOrderLoading(true);
    try {
      // Delete old order and create new one at different seat
      const oldItem = orderItems.find(item => item.id === orderItemId);
      if (!oldItem) return;

      const isCustomItem = oldItem.menuItem.id.startsWith('custom-');

      // Delete the old order
      await apiDeleteOrder(orderItemId);

      // Create new order at the new seat
      await apiCreateOrder({
        bookingId: booking.id,
        menuItemId: isCustomItem ? undefined : oldItem.menuItem.id,
        customItemName: isCustomItem ? oldItem.menuItem.name : undefined,
        customItemPrice: isCustomItem ? oldItem.menuItem.price : undefined,
        seatIndex: newSeat,
        quantity: oldItem.quantity,
      });

      // Reload all data
      await loadData();
    } catch (err) {
      console.error('[BookingDetail] Failed to move item:', err);
      alert(`Failed to move item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }

    setShowMoveDialog(false);
    setSelectedOrderItem(null);
  };

  const splitItemAcrossSeats = async () => {
    if (!selectedOrderItem || selectedSeatsForSplit.length === 0 || !booking) return;

    setOrderLoading(true);
    try {
      const splitPrice = selectedOrderItem.menuItem.price / selectedSeatsForSplit.length;
      const itemName = selectedOrderItem.menuItem.name;

      // Delete the original order
      await apiDeleteOrder(selectedOrderItem.id);

      // Create new orders for each selected seat as custom items with split price
      for (const seat of selectedSeatsForSplit) {
        await apiCreateOrder({
          bookingId: booking.id,
          customItemName: `${itemName} (Split ${selectedSeatsForSplit.length} ways)`,
          customItemPrice: splitPrice,
          seatIndex: seat,
          quantity: selectedOrderItem.quantity,
        });
      }

      // Reload all data
      await loadData();
    } catch (err) {
      console.error('[BookingDetail] Failed to split item:', err);
      alert(`Failed to split item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }

    setShowSplitDialog(false);
    setSelectedOrderItem(null);
    setSelectedSeatsForSplit([]);
  };

  const openSplitDialog = (item: OrderItem) => {
    setSelectedOrderItem(item);
    setSelectedSeatsForSplit([]);
    setShowSplitDialog(true);
  };

  const handleMoveItem = (item: OrderItem) => {
    setSelectedOrderItem(item);
    setShowMoveDialog(true);
  };

  const handleSplitItem = (item: OrderItem) => {
    openSplitDialog(item);
  };

  const toggleSeatForSplit = (seat: number) => {
    if (selectedSeatsForSplit.includes(seat)) {
      setSelectedSeatsForSplit(selectedSeatsForSplit.filter((s) => s !== seat));
    } else {
      setSelectedSeatsForSplit([...selectedSeatsForSplit, seat]);
    }
  };

  const handleMenuItemClick = (menuItem: MenuItem) => {
    setSelectedMenuItem(menuItem);
    setShowAddItemDialog(true);
  };

  const handleAddCustomItem = async (seat: number) => {
    if (!booking || !customItemName.trim() || !customItemPrice || parseFloat(customItemPrice) <= 0) {
      alert('Please enter valid item name and price');
      return;
    }

    setOrderLoading(true);
    try {
      const price = parseFloat(customItemPrice);
      await apiCreateOrder({
        bookingId: booking.id,
        customItemName: customItemName.trim(),
        customItemPrice: price,
        seatIndex: seat,
        quantity: 1,
      });

      // Reload data
      await loadData();

      // Reset form and close dialog
      setCustomItemName('');
      setCustomItemPrice('');
      setShowCustomItemDialog(false);
    } catch (err) {
      console.error('Failed to add custom item:', err);
      alert(`Failed to add custom item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const handleAddDiscount = async (seat: number) => {
    if (!booking || !discountName.trim() || !discountAmount || parseFloat(discountAmount) <= 0) {
      alert('Please enter valid discount name and amount');
      return;
    }

    setOrderLoading(true);
    try {
      let finalPrice: number;
      let label = discountName.trim();

      if (discountType === 'PERCENT') {
        const pct = parseFloat(discountAmount);
        if (pct > 100) {
          alert('Percentage cannot exceed 100%');
          setOrderLoading(false);
          return;
        }
        // Calculate seat subtotal for this seat (only regular items, exclude existing discounts)
        const seatItems = getItemsForSeat(seat);
        const regularSubtotal = seatItems
          .filter(item => (item.splitPrice || item.menuItem.price) >= 0)
          .reduce((sum, item) => sum + (item.splitPrice || item.menuItem.price) * item.quantity, 0);
        finalPrice = Math.round(regularSubtotal * pct) / 100;
        label = `${label} (${pct}%)`;
      } else {
        finalPrice = parseFloat(discountAmount);
      }

      // Store as negative price for discount
      await apiCreateOrder({
        bookingId: booking.id,
        customItemName: label,
        customItemPrice: -finalPrice,
        seatIndex: seat,
        quantity: 1,
        discountType,
      });

      // Reload data
      await loadData();

      // Reset form and close dialog
      setDiscountName('');
      setDiscountAmount('');
      setDiscountType('FLAT');
      setShowDiscountDialog(false);
    } catch (err) {
      console.error('Failed to add discount:', err);
      alert(`Failed to add discount: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponValidating(true);
    setCouponData(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/validate/${couponCode.trim().toUpperCase()}`, { credentials: 'include' });
      const data = await res.json();
      setCouponData(data.isValid ? { ...data.coupon, isValid: true } : { ...data.coupon, isValid: false, error: data.error });
    } catch {
      setCouponData({ code: couponCode, description: '', discountAmount: 0, couponType: { label: '' }, user: { name: '' }, isValid: false, error: 'Failed to validate coupon' });
    } finally {
      setCouponValidating(false);
    }
  };

  const handleApplyCoupon = async (seat: number) => {
    if (!booking || !couponData?.isValid) return;
    setCouponApplying(true);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/${couponData.code}/redeem`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, seatNumber: seat }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to redeem coupon');
      }
      await loadData();
      setCouponCode('');
      setCouponData(null);
      setShowCouponDialog(false);
    } catch (err) {
      alert(`Failed to apply coupon: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCouponApplying(false);
    }
  };

  const handleAddGiftCard = async (seat: number) => {
    if (!booking || !giftCardAmount || parseFloat(giftCardAmount) <= 0) {
      alert('Please enter a valid gift card amount');
      return;
    }

    setOrderLoading(true);
    try {
      const amount = parseFloat(giftCardAmount);
      await apiCreateOrder({
        bookingId: booking.id,
        customItemName: `Gift Card ($${amount.toFixed(2)})`,
        customItemPrice: amount,
        seatIndex: seat,
        quantity: 1,
        taxExempt: true,
      });

      await loadData();
      setGiftCardAmount('');
      setShowGiftCardDialog(false);
    } catch (err) {
      console.error('Failed to add gift card:', err);
      alert(`Failed to add gift card: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const addItemFromDialog = (seat: number) => {
    if (selectedMenuItem) {
      addItemToSeat(selectedMenuItem, seat);
      setShowAddItemDialog(false);
      setSelectedMenuItem(null);
    }
  };

  const handlePrintSeat = (seat: number) => {
    const seatItems = getItemsForSeat(seat);
    if (seatItems.length === 0) {
      alert(`No items for Seat ${seat}`);
      return;
    }

    setPrintingSeat(seat);
    setTimeout(() => {
      window.print();
      setPrintingSeat(null);
    }, 100);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const unpayInvoice = async (seat: number) => {
    if (!booking) return;

    setProcessingPayment(seat);
    setCancelPaymentSeat(null);

    try {
      // Find the invoice for this seat
      const invoice = invoices.find((inv) => inv.seatIndex === seat);
      if (!invoice) {
        throw new Error(`No invoice found for seat ${seat}`);
      }

      console.log('[BookingDetail] Canceling payment:', { invoiceId: invoice.id, seat });

      // Call backend API to mark invoice as unpaid
      const result = await apiUnpayInvoice({
        invoiceId: invoice.id,
        bookingId: booking.id,
      });

      console.log('[BookingDetail] Payment canceled:', result.invoice);

      // Update seat payment status
      setSeatPayments(prev => ({
        ...prev,
        [seat]: {
          status: 'UNPAID',
          method: undefined,
          tip: undefined,
          total: result.invoice.totalAmount
        },
      }));

      // Clear tip input for this seat
      setTipAmountBySeat(prev => ({ ...prev, [seat]: '' }));

      // Refetch invoices to ensure we have latest data
      const updatedInvoices = await getInvoices(booking.id);
      setInvoices(updatedInvoices);

      // Reload booking to get updated payment status
      await loadData();

    } catch (err) {
      console.error('[BookingDetail] Failed to cancel payment:', err);
      alert(`Failed to cancel payment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingPayment(null);
    }
  };

  const isSeatPaid = (seat: number) => {
    return seatPayments[seat]?.status === 'PAID';
  };

  const getSeatPayment = (seat: number) => {
    return seatPayments[seat];
  };

  // Receipt modal handlers
  const handleOpenReceiptModal = async (mode: 'full' | 'seat', seatIndex?: number) => {
    if (!bookingId) return;
    setLoadingReceipt(true);
    try {
      let data: ReceiptData;
      if (mode === 'seat' && seatIndex !== undefined) {
        data = await getSeatReceipt(bookingId, seatIndex);
        setReceiptSeatIndex(seatIndex);
      } else {
        data = await getReceipt(bookingId);
      }
      setReceiptData(data);
      setReceiptMode(mode);
      setEmailAddress(booking?.customerEmail || '');
      setDeliveryMethod('print');
      setShowReceiptModal(true);
    } catch (error) {
      console.error('Failed to load receipt:', error);
      alert('Failed to load receipt data');
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleCloseReceiptModal = () => {
    setShowReceiptModal(false);
    setReceiptData(null);
    setReceiptSeatIndex(undefined);
    setEmailAddress('');
    setDeliveryMethod('print');
  };

  const handlePrintFromModal = async () => {
    if (!receiptData) return;

    if (deliveryMethod === 'email') {
      if (!emailAddress || !emailAddress.includes('@')) {
        alert('Please enter a valid email address');
        return;
      }

      setSendingEmail(true);
      try {
        await sendReceiptEmail(bookingId, emailAddress, receiptSeatIndex);
        alert(`Receipt sent successfully to ${emailAddress}!`);
        setShowReceiptModal(false);
      } catch (error) {
        console.error('Email send error:', error);
        alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setSendingEmail(false);
      }
      return;
    }

    if (printerType === 'thermal') {
      // Send to thermal printer via backend API
      try {
        const apiBase = process.env.REACT_APP_API_BASE || 'http://localhost:8080';

        const res = await fetch(`${apiBase}/api/print/receipt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            bookingId: bookingId,
            seatIndex: receiptSeatIndex // Include seat index for seat-specific prints
          })
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: 'Failed to send to thermal printer' }));
          throw new Error(error.error || 'Failed to send to thermal printer');
        }

        const result = await res.json();
        alert(`Sent to thermal printer! (${result.connectedPrinters} printer(s) connected)`);
        setShowReceiptModal(false);
      } catch (error) {
        console.error('Thermal print error:', error);
        alert('Failed to send to thermal printer. Make sure the print server is running.');
      }
    } else {
      // Regular printer - use browser print dialog
      const receiptElement = document.querySelector('.receipt');
      if (!receiptElement) return;

      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) return;

      // Write the receipt content with print styles
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt - ${receiptData.receiptNumber}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: white;
                padding: 20px;
                display: flex;
                justify-content: center;
                align-items: flex-start;
              }
              .receipt {
                background: white;
                color: #0f172a;
              }
              @media print {
                body {
                  padding: 0;
                }
                @page {
                  margin: 10mm;
                }
              }
            </style>
          </head>
          <body>
            ${receiptElement.outerHTML}
          </body>
        </html>
      `);

      printWindow.document.close();

      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      };
    }
  };

  // Payment Summary helper functions
  const getPaidSeatsCount = (): number => {
    return Array.from({ length: numberOfSeats }, (_, i) => i + 1).filter(seat => isSeatPaid(seat)).length;
  };

  const getPaymentProgress = (): number => {
    if (numberOfSeats === 0) return 0;
    return (getPaidSeatsCount() / numberOfSeats) * 100;
  };

  const getTotalPaid = (): number => {
    return Array.from({ length: numberOfSeats }, (_, i) => i + 1)
      .filter(seat => isSeatPaid(seat))
      .reduce((sum, seat) => {
        const payment = getSeatPayment(seat);
        if (!payment) return sum;
        return sum + (parseFloat(String(payment.total || 0)) || 0);
      }, 0);
  };

  const getTotalDue = (): number => {
    return Array.from({ length: numberOfSeats }, (_, i) => i + 1)
      .filter(seat => !isSeatPaid(seat))
      .reduce((sum, seat) => {
        const subtotal = calculateSeatSubtotal(seat);
        const tax = calculateSeatTax(seat);
        const tipAmount = parseFloat(tipAmountBySeat[seat] || '0') || 0;
        return sum + subtotal + tax + tipAmount;
      }, 0);
  };

  // Check if we can safely reduce the number of seats
  const canReduceSeats = () => {
    if (numberOfSeats <= 1) return false;

    const newSeatCount = numberOfSeats - 1;
    const itemsInRemovedSeat = orderItems.some(item => item.seat && item.seat > newSeatCount);

    return !itemsInRemovedSeat;
  };

  const handleReduceSeats = async () => {
    if (!booking) return;

    const newSeatCount = numberOfSeats - 1;
    const itemsInRemovedSeats = orderItems.filter(item => item.seat && item.seat > newSeatCount);

    if (itemsInRemovedSeats.length > 0) {
      const seatNumbers = [...new Set(itemsInRemovedSeats.map(item => item.seat))].sort().join(', ');
      alert(`Cannot reduce seats: ${itemsInRemovedSeats.length} item(s) are assigned to Seat ${seatNumbers}. Please move or remove these items first.`);
      return;
    }

    try {
      await apiUpdateBookingPlayers(booking.id, newSeatCount);
      const clampedSeatCount = Math.max(1, newSeatCount);
      setNumberOfSeats(clampedSeatCount);
      setSelectedSeat(prev => Math.min(prev, clampedSeatCount));
    } catch (err) {
      alert(`Failed to update seats: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleIncreaseSeats = async () => {
    if (!booking) return;

    const newCount = Math.min(MAX_SEATS, numberOfSeats + 1);

    try {
      await apiUpdateBookingPlayers(booking.id, newCount);
      setNumberOfSeats(newCount);
      setSelectedSeat(newCount);
    } catch (err) {
      alert(`Failed to update seats: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Calculation functions
  const effectiveTaxRate = bookingTaxRate !== null ? bookingTaxRate : globalTaxRate;

  const getItemsByCategory = (category: string) => {
    return menu.filter((item: MenuItem) => item.category === category && item.available);
  };

  const getItemsForSeat = (seat: number) => {
    return orderItems.filter((item) => item.seat === seat);
  };

  const calculateSeatSubtotal = (seat: number): number => {
    const invoice = invoices.find(inv => inv.seatIndex === seat);
    if (invoice) {
      return parseFloat(String(invoice.subtotal)) || 0;
    }

    // Fallback to local calculation
    return getItemsForSeat(seat).reduce((sum, item) => {
      const price = item.splitPrice || item.menuItem.price;
      return sum + price * item.quantity;
    }, 0);
  };

  const calculateSeatTax = (seat: number): number => {
    // Use backend-calculated tax (single source of truth with largest remainder distribution)
    const invoice = invoices.find(inv => inv.seatIndex === seat);
    if (invoice) {
      return parseFloat(String(invoice.tax)) || 0;
    }
    // Fallback to local calculation only when no invoice exists yet
    const subtotal = calculateSeatSubtotal(seat);
    return subtotal * (effectiveTaxRate / 100);
  };

  const calculateSeatTotal = (seat: number): number => {
    const invoice = invoices.find(inv => inv.seatIndex === seat);
    if (invoice) {
      return parseFloat(String(invoice.totalAmount)) || 0;
    }

    // Fallback to local calculation
    return calculateSeatSubtotal(seat) + calculateSeatTax(seat);
  };

  const calculateSubtotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.splitPrice || item.menuItem.price) * item.quantity, 0);
  };

  const calculateTax = () => {
    return calculateSubtotal() * (effectiveTaxRate / 100);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const handleCompleteBooking = async () => {
    try {
      await apiUpdateBookingStatus(bookingId, 'COMPLETED');
      await loadData();
    } catch (err) {
      console.error('Failed to complete booking:', err);
      alert(`Failed to complete booking: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleExtendBooking = async () => {
    try {
      await apiExtendBooking(bookingId);
      await loadData();
    } catch (err) {
      console.error('Failed to extend booking:', err);
      alert(`${err instanceof Error ? err.message : 'Failed to extend booking'}`);
    }
  };

  const handleReopenBooking = async () => {
    try {
      await apiUpdateBookingStatus(bookingId, 'BOOKED');
      await loadData();
    } catch (err) {
      console.error('Failed to reopen booking:', err);
      alert(`Failed to reopen booking: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const updateStatus = async (status: string) => {
    try {
      await apiUpdateBookingStatus(bookingId, status.toUpperCase());
      await loadData();
    } catch (err) {
      console.error('Failed to update booking status:', err);
      alert(`Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const changeStatus = async (status: string) => {
    try {
      await apiUpdateBookingStatus(bookingId, status);
      await loadData();
    } catch (err) {
      console.error('Failed to update booking status:', err);
      alert(`Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-black">
        <div className="text-white text-xl">Loading booking...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-black">
        <div className="text-white text-xl">Booking not found</div>
      </div>
    );
  }

  const activeSeat = Math.min(Math.max(selectedSeat, 1), numberOfSeats);
  const seatSummaries = Array.from({ length: numberOfSeats }, (_, i) => {
    const seat = i + 1;
    const isPaid = isSeatPaid(seat);
    const seatItems = getItemsForSeat(seat);
    const regularItems = seatItems.filter(item => (item.splitPrice || item.menuItem.price) >= 0);
    const discountItems = seatItems.filter(item => (item.splitPrice || item.menuItem.price) < 0);
    const payment = getSeatPayment(seat);
    const invoice = invoices.find(inv => inv.seatIndex === seat);
    const payments = invoice?.payments || [];
    const subtotal = calculateSeatSubtotal(seat);
    const preDiscountSubtotal = regularItems.reduce((sum, item) => sum + (item.splitPrice || item.menuItem.price) * item.quantity, 0);
    const discountTotal = discountItems.reduce((sum, item) => sum + (item.splitPrice || item.menuItem.price) * item.quantity, 0);
    const tax = calculateSeatTax(seat);
    const tipAmount = isPaid
      ? payment?.tip || 0
      : parseFloat(tipAmountBySeat[seat] || '0') || 0;
    const total = subtotal + tax + tipAmount;
    const paidSoFar = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = isPaid ? 0 : Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
    const missingReceiptPayments = payments.filter(p => (p.method === 'CARD' || p.method === 'GIFT_CARD') && !p.receiptPath && !receiptPhotos[p.id]);
    const hasCouponDiscount = discountItems.some(item => (item.menuItem?.name || '').includes('🎟️'));

    return {
      seat,
      isPaid,
      seatItems,
      regularItems,
      discountItems,
      payment,
      invoice,
      payments,
      subtotal,
      preDiscountSubtotal,
      discountTotal,
      tax,
      tipAmount,
      total,
      paidSoFar,
      remaining,
      missingReceiptPayments,
      hasCouponDiscount,
    };
  });
  const selectedSeatSummary = seatSummaries.find(summary => summary.seat === activeSeat) || seatSummaries[0];
  const totalCollected = getTotalPaid();
  const totalDue = getTotalDue();
  const missingReceiptCount = seatSummaries.reduce((sum, summary) => sum + summary.missingReceiptPayments.length, 0);
  const endTimeLabel = new Date(booking.endTime).toLocaleTimeString('en-US', {
    timeZone: VENUE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
  const formatMoney = (value: number) => `$${value.toFixed(2)}`;
  const isBookingCompleted = booking.bookingStatus?.toUpperCase() === 'COMPLETED';
  const commandButtonClass = 'mc-action-btn disabled:opacity-40 disabled:pointer-events-none';
  const getSettlementLabel = (summary: (typeof seatSummaries)[number]) => {
    if (summary.missingReceiptPayments.length > 0) return `RECEIPT ${summary.missingReceiptPayments.length}`;
    if (!summary.isPaid && summary.payments.length > 0) return `PARTIAL ${formatMoney(summary.remaining)}`;
    if (summary.isPaid) return 'PAID';
    return formatMoney(summary.remaining || summary.total);
  };
  const getSettlementTone = (summary: (typeof seatSummaries)[number]) => {
    if (summary.missingReceiptPayments.length > 0) return 'text-[color:var(--mc-magenta)]';
    if (!summary.isPaid && summary.payments.length > 0) return 'text-[color:var(--mc-purple)]';
    if (summary.isPaid) return 'text-[color:var(--mc-green)]';
    return 'text-[color:var(--mc-amber)]';
  };

  return (
    <div ref={scrollContainerRef} className="mc-root w-full h-full flex flex-col overflow-y-auto">
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body {
            background: white !important;
            margin: 0;
            padding: 20px;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          /* Hide all seats by default */
          .seat-section {
            display: none !important;
          }

          /* Show only the selected seat when printing */
          ${printingSeat ? `.seat-section-${printingSeat} { display: block !important; page-break-inside: avoid; }` : '.seat-section { display: block !important; page-break-after: always; }'}

          /* Hide grand total when printing specific seat */
          ${printingSeat ? '.grand-total-section { display: none !important; }' : ''}

          /* Clean up the receipt area */
          .print-receipt {
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100%;
            margin: 0;
            padding: 0;
          }

          .print-receipt * {
            background: transparent !important;
            color: black !important;
            border-color: #ddd !important;
          }

          .print-receipt h1,
          .print-receipt h2,
          .print-receipt h3,
          .print-receipt h4 {
            color: black !important;
          }

          .print-receipt .text-amber-400,
          .print-receipt .text-amber-500,
          .print-receipt .text-amber-600 {
            color: #d97706 !important;
          }

          .print-separator {
            border-top: 2px solid #000 !important;
            margin: 20px 0;
          }

          .seat-section .space-y-3 > * {
            margin-bottom: 1rem !important;
          }

          .seat-section > div {
            page-break-inside: avoid;
          }
        }

        .print-only {
          display: none;
        }
      `}</style>

      {/* Print-only header */}
      <div className="print-only mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2">K one Golf</h1>
        <p className="text-lg">Premium Screen Golf Experience</p>
        <p className="text-sm mt-2">45 Keltic Dr, Unit 6, Sydney, NS B1S 1P4 | (902) 270-2259</p>
        <div className="print-separator" />
      </div>

      <main className="hidden no-print flex-1 w-full max-w-[1900px] mx-auto px-3 sm:px-5 py-4 space-y-3">
        <div className="mc-panel py-3 px-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mc-chip shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[color:var(--mc-text-hero)] truncate">
                {booking.customerName}
              </h1>
              <div className="mc-meta mc-mono truncate">
                {roomColor} · {booking.date} · {booking.time}-{endTimeLabel} · {booking.duration}h · {booking.players} player{booking.players === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${statusStyles[booking.bookingStatus?.toLowerCase() || 'booked']} uppercase text-xs px-3 py-1.5`}>
              {booking.bookingStatus || 'BOOKED'}
            </Badge>
            {booking.paymentStatus && (
              <Badge className={`${paymentStatusStyles[booking.paymentStatus]} uppercase text-xs px-3 py-1.5`}>
                {booking.paymentStatus}
              </Badge>
            )}
            {missingReceiptCount > 0 && (
              <span className="mc-chip-alert mc-chip">
                <Camera className="h-3.5 w-3.5" />
                {missingReceiptCount} receipt{missingReceiptCount === 1 ? '' : 's'}
              </span>
            )}
            {!isReadOnly && (
              booking.bookingStatus?.toUpperCase() === 'COMPLETED' ? (
                <button type="button" onClick={handleReopenBooking} className="mc-chip">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Reopen
                </button>
              ) : (
                <button type="button" onClick={handleCompleteBooking} className="mc-chip">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete
                </button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_340px] gap-3 items-start">
          <aside className="space-y-3 xl:sticky xl:top-3">
            <section className="mc-panel space-y-4">
              <div>
                <div className="mc-section-label">Session</div>
                <div className="mt-1 flex items-center gap-2 text-[color:var(--mc-text-hero)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--mc-cyan)] shadow-[0_0_16px_rgba(29,224,197,0.45)]" />
                  <span className="font-semibold">{roomColor}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InfoBlock label="Date" value={<span className="mc-mono">{booking.date}</span>} />
                <InfoBlock label="Time" value={<span className="mc-mono">{booking.time}</span>} />
                <InfoBlock label="End" value={<span className="mc-mono">{endTimeLabel}</span>} />
                <InfoBlock label="Source" value={booking.bookingSource || 'ONLINE'} />
              </div>

              <div className="h-px bg-[color:var(--mc-divider-soft)]" />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[color:var(--mc-cyan)]" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[color:var(--mc-text-primary)] truncate">{booking.customerName}</div>
                    <div className="mc-meta-dim mc-mono truncate">ID {booking.id.slice(0, 8)}</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[color:var(--mc-text-primary)]">
                    <Phone className="h-3.5 w-3.5 text-[color:var(--mc-text-meta)]" />
                    <span className="mc-mono truncate">{booking.customerPhone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[color:var(--mc-text-primary)]">
                    <Mail className="h-3.5 w-3.5 text-[color:var(--mc-text-meta)]" />
                    <span className="truncate">{booking.customerEmail || 'No email'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[color:var(--mc-text-primary)]">
                    <Calendar className="h-3.5 w-3.5 text-[color:var(--mc-text-meta)]" />
                    <span>{booking.user?.dateOfBirth || 'DOB not set'}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mc-panel space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="mc-section-label">Seats</div>
                  <div className="mc-meta">Choose active seat.</div>
                </div>
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleReduceSeats}
                      disabled={!canReduceSeats()}
                      className="mc-chip px-2 disabled:opacity-40 disabled:pointer-events-none"
                      aria-label="Reduce seats"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <span className="mc-mono text-lg text-[color:var(--mc-cyan)] min-w-6 text-center">{numberOfSeats}</span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={async () => {
                        const newCount = Math.min(MAX_SEATS, numberOfSeats + 1);
                        if (booking) {
                          try {
                            await apiUpdateBookingPlayers(booking.id, newCount);
                            setNumberOfSeats(newCount);
                            setSelectedSeat(newCount);
                          } catch (err) {
                            alert(`Failed to update seats: ${err instanceof Error ? err.message : 'Unknown error'}`);
                          }
                        }
                      }}
                      disabled={numberOfSeats >= MAX_SEATS}
                      className="mc-chip px-2 disabled:opacity-40 disabled:pointer-events-none"
                      aria-label="Add seat"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {seatSummaries.map((summary) => (
                  <button
                    key={summary.seat}
                    type="button"
                    onClick={() => setSelectedSeat(summary.seat)}
                    className={`mc-row w-full text-left p-3 flex items-center justify-between gap-3 ${summary.seat === activeSeat ? 'border-[color:var(--mc-cyan)] bg-[rgba(29,224,197,0.08)]' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold text-[color:var(--mc-text-hero)]">
                        <span className={`h-2.5 w-2.5 rounded-full ${seatColors[summary.seat - 1]}`} />
                        Seat {summary.seat}
                      </div>
                      <div className="mt-1 mc-meta-dim">{summary.regularItems.length} item{summary.regularItems.length === 1 ? '' : 's'} · {summary.isPaid ? 'paid' : 'open'}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="mc-mono text-sm text-[color:var(--mc-text-primary)]">{formatMoney(summary.total)}</span>
                      {summary.isPaid ? (
                        <CheckCircle2 className="h-4 w-4 text-[color:var(--mc-green)]" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-[color:var(--mc-amber)]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>

          </aside>

          <div className="space-y-3">
            <section className="mc-panel space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="mc-section-label">Seat Ledger</div>
                  <div className="mc-meta mt-1">Seat {activeSeat} totals and active workflow.</div>
                </div>
                <div className={`mc-mono text-sm ${getSettlementTone(selectedSeatSummary)}`}>
                  {getSettlementLabel(selectedSeatSummary)}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="mc-row">
                  <div className="mc-meta-dim">Subtotal</div>
                  <div className="mc-mono text-lg text-[color:var(--mc-text-hero)]">{formatMoney(selectedSeatSummary.preDiscountSubtotal)}</div>
                </div>
                <div className="mc-row">
                  <div className="mc-meta-dim">Discount</div>
                  <div className="mc-mono text-lg text-[color:var(--mc-green)]">{formatMoney(Math.abs(selectedSeatSummary.discountTotal))}</div>
                </div>
                <div className="mc-row">
                  <div className="mc-meta-dim">Tax</div>
                  <div className="mc-mono text-lg text-[color:var(--mc-text-primary)]">{formatMoney(selectedSeatSummary.tax)}</div>
                </div>
                <div className="mc-row">
                  <div className="mc-meta-dim">Seat Total</div>
                  <div className="mc-mono text-lg text-[color:var(--mc-cyan)]">{formatMoney(selectedSeatSummary.total)}</div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start">
                <section className="mc-panel space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="mc-section-label">Orders</div>
                    {!isReadOnly && !selectedSeatSummary.isPaid && (
                      <button type="button" onClick={() => setShowMenuPanel(true)} className="mc-chip">
                        <Plus className="h-3.5 w-3.5" />
                        Add item
                      </button>
                    )}
                  </div>

                  {selectedSeatSummary.regularItems.length === 0 && selectedSeatSummary.discountItems.length === 0 ? (
                    <div className="mc-row py-10 text-center">
                      <div className="text-[color:var(--mc-text-primary)]">No items on this seat yet.</div>
                      <div className="mc-meta mt-1">Use Add item to start the ledger.</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedSeatSummary.regularItems.map((item) => (
                        <div key={item.id} className="mc-row flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-[color:var(--mc-text-hero)] truncate">
                                {item.menuItem ? item.menuItem.name : (item as any).customItemName || 'Custom Item'}
                              </div>
                              {item.menuItem?.id?.startsWith('custom-') && (
                                <span className="mc-mono text-[11px] text-[color:var(--mc-purple)]">CUSTOM</span>
                              )}
                            </div>
                            <div className="mc-meta">
                              {item.splitPrice ? `${formatMoney(item.splitPrice)} each · split` : `${formatMoney(item.menuItem.price)} × ${item.quantity}`}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <span className="mc-mono text-[color:var(--mc-cyan)] min-w-[76px] sm:text-right">
                              {formatMoney((item.splitPrice || item.menuItem.price) * item.quantity)}
                            </span>
                            {!selectedSeatSummary.isPaid && !isReadOnly && (
                              <>
                                <button type="button" onClick={() => handleMoveItem(item)} className="mc-chip px-2" title="Move item">
                                  <MoveRight className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Move</span>
                                </button>
                                <button type="button" onClick={() => handleSplitItem(item)} className="mc-chip px-2" title="Split item">
                                  <Split className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Split</span>
                                </button>
                                <button type="button" onClick={() => updateItemQuantity(item.id, -1)} className="mc-chip px-2" title="Decrease quantity">
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => updateItemQuantity(item.id, 1)} className="mc-chip px-2" title="Increase quantity">
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRemoveOrderId(item.id); setRemoveOrderName(item.menuItem?.name || 'this item'); }}
                                  className="mc-chip mc-chip-alert px-2"
                                  title="Remove item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}

                      {selectedSeatSummary.discountItems.map((item) => (
                        <div key={item.id} className="mc-row flex items-center justify-between gap-3 border-[rgba(95,214,146,0.35)] bg-[rgba(95,214,146,0.06)]">
                          <div className="min-w-0">
                            <div className="font-semibold text-[color:var(--mc-green)] truncate">{item.menuItem.name}</div>
                            <div className="mc-meta">Discount</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="mc-mono text-[color:var(--mc-green)]">
                              -{formatMoney(Math.abs((item.splitPrice || item.menuItem.price) * item.quantity))}
                            </span>
                            {!selectedSeatSummary.isPaid && !isReadOnly && (
                              <button
                                type="button"
                                onClick={() => { setRemoveOrderId(item.id); setRemoveOrderName(item.menuItem?.name || 'this discount'); }}
                                className="mc-chip mc-chip-alert px-2"
                                title="Remove discount"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="space-y-3">
                  <section className="mc-panel space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="mc-section-label">Payment</div>
                      {selectedSeatSummary.isPaid ? (
                        <span className="text-xs font-semibold text-[color:var(--mc-green)]">PAID</span>
                      ) : (
                        <span className="text-xs font-semibold text-[color:var(--mc-amber)]">OPEN</span>
                      )}
                    </div>
                    <div className="space-y-2 mc-mono text-sm">
                      <div className="flex justify-between text-[color:var(--mc-text-primary)]"><span>Subtotal</span><span>{formatMoney(selectedSeatSummary.preDiscountSubtotal)}</span></div>
                      {selectedSeatSummary.discountItems.map((item) => (
                        <div key={item.id} className="flex justify-between text-[color:var(--mc-green)]">
                          <span>{item.menuItem.name}</span>
                          <span>-{formatMoney(Math.abs((item.splitPrice || item.menuItem.price) * item.quantity))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-[color:var(--mc-text-primary)]"><span>Tax ({effectiveTaxRate}%)</span><span>{formatMoney(selectedSeatSummary.tax)}</span></div>
                      {selectedSeatSummary.tipAmount > 0 && (
                        <div className="flex justify-between text-[color:var(--mc-text-primary)]"><span>Tip</span><span>{formatMoney(selectedSeatSummary.tipAmount)}</span></div>
                      )}
                      <div className="h-px bg-[color:var(--mc-divider-soft)]" />
                      <div className="flex justify-between text-[color:var(--mc-text-hero)] font-semibold"><span>Total</span><span>{formatMoney(selectedSeatSummary.total)}</span></div>
                      {selectedSeatSummary.payments.length > 0 && (
                        <div className="flex justify-between text-[color:var(--mc-green)]"><span>Paid</span><span>{formatMoney(selectedSeatSummary.paidSoFar)}</span></div>
                      )}
                      {!selectedSeatSummary.isPaid && selectedSeatSummary.total > 0 && (
                        <div className="rounded-sm border border-[rgba(248,199,88,0.35)] bg-[rgba(248,199,88,0.08)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="mc-meta-dim">Remaining</span>
                            <span className="mc-meta-dim">Collect next</span>
                          </div>
                          <div className="mt-1 mc-mono text-2xl leading-none text-[color:var(--mc-amber)]">
                            {formatMoney(selectedSeatSummary.remaining)}
                          </div>
                        </div>
                      )}
                      {!selectedSeatSummary.isPaid && !isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentDialogSeat(activeSeat);
                            setPaymentDialogAmount(selectedSeatSummary.remaining > 0 ? selectedSeatSummary.remaining.toFixed(2) : selectedSeatSummary.total.toFixed(2));
                            setPaymentDialogMethod(null);
                            setTipMethodBySeat(prev => ({ ...prev, [activeSeat]: 'CARD' }));
                          }}
                          disabled={selectedSeatSummary.subtotal === 0 && !selectedSeatSummary.hasCouponDiscount}
                          className="mc-chip mc-ledger-action mc-ledger-action-primary w-full justify-center disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <CreditCard className="h-4 w-4" />
                          Collect {formatMoney(selectedSeatSummary.remaining > 0 ? selectedSeatSummary.remaining : selectedSeatSummary.total)}
                        </button>
                      )}
                    </div>
                  </section>

                  {selectedSeatSummary.payments.length > 0 && (
                    <section className="mc-panel space-y-2">
                      <div className="mc-section-label">Payment Records</div>
                      {selectedSeatSummary.payments.map((payment) => {
                        const needsReceipt = (payment.method === 'CARD' || payment.method === 'GIFT_CARD') && !payment.receiptPath && !receiptPhotos[payment.id];
                        return (
                          <div key={payment.id} className="space-y-2">
                            <div className="rounded-sm border border-[color:var(--mc-divider-soft)] p-2 flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 text-sm text-[color:var(--mc-text-primary)]">
                                {payment.method === 'CARD' ? <CreditCard className="h-3.5 w-3.5" /> : payment.method === 'GIFT_CARD' ? <Gift className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                                {payment.method === 'GIFT_CARD' ? 'Gift Card' : payment.method === 'CARD' ? 'Card' : 'Cash'}
                              </span>
                              <span className="mc-mono text-[color:var(--mc-green)]">{formatMoney(Number(payment.amount))}</span>
                            </div>
                            {(payment.method === 'CARD' || payment.method === 'GIFT_CARD') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCaptureMode(needsReceipt ? 'upload' : 'view');
                                  setCapturePaymentId(payment.id);
                                }}
                                className={`mc-chip mc-payment-action ${needsReceipt ? 'mc-chip-alert' : ''}`}
                              >
                                {needsReceipt ? <Camera className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {needsReceipt ? 'Upload Receipt' : 'View Receipt'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {!isReadOnly && selectedSeatSummary.isPaid && (
                        <button
                          type="button"
                          onClick={() => setCancelPaymentSeat(activeSeat)}
                          disabled={processingPayment === activeSeat}
                          className="mc-chip mc-chip-alert mc-payment-action disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {processingPayment === activeSeat ? 'Processing...' : 'Cancel Payment'}
                        </button>
                      )}
                    </section>
                  )}
                </div>
              </div>
          </div>

          <aside className="space-y-3 xl:sticky xl:top-3">
            <section className="mc-panel space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="mc-section-label">Settlement</div>
                  <div className="mc-meta">Payment, balance, receipt state</div>
                </div>
                <div className="mc-mono text-[color:var(--mc-cyan)]">{Math.round(getPaymentProgress())}%</div>
              </div>
              <Progress value={getPaymentProgress()} className="h-2 bg-[color:var(--mc-divider-soft)]" />
              <div className="grid grid-cols-2 gap-2">
                <div className="mc-row">
                  <div className="mc-meta-dim">Collected</div>
                  <div className="mc-mono text-lg text-[color:var(--mc-green)]">{formatMoney(totalCollected)}</div>
                </div>
                <div className="mc-row">
                  <div className="mc-meta-dim">Due</div>
                  <div className="mc-mono text-lg text-[color:var(--mc-amber)]">{formatMoney(totalDue)}</div>
                </div>
              </div>
              <div className="mc-row space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--mc-text-primary)]">
                    <span className={`h-2 w-2 rounded-full ${seatColors[activeSeat - 1]}`} />
                    Active seat {activeSeat}
                  </span>
                  <span className={`mc-mono text-xs ${getSettlementTone(selectedSeatSummary)}`}>
                    {getSettlementLabel(selectedSeatSummary)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-sm border border-[color:var(--mc-divider-soft)] p-2">
                    <div className="mc-meta-dim">Seat total</div>
                    <div className="mc-mono text-[color:var(--mc-text-hero)]">{formatMoney(selectedSeatSummary.total)}</div>
                  </div>
                  <div className="rounded-sm border border-[color:var(--mc-divider-soft)] p-2">
                    <div className="mc-meta-dim">{selectedSeatSummary.isPaid ? 'Paid' : 'Remaining'}</div>
                    <div className={`mc-mono ${selectedSeatSummary.isPaid ? 'text-[color:var(--mc-green)]' : 'text-[color:var(--mc-amber)]'}`}>
                      {formatMoney(selectedSeatSummary.isPaid ? selectedSeatSummary.paidSoFar : selectedSeatSummary.remaining)}
                    </div>
                  </div>
                </div>
                <div className="mc-meta-dim">Use the Seats panel to change the active ledger.</div>
              </div>
            </section>

            {!isReadOnly && (
              <section className="mc-panel space-y-3">
                <div>
                  <div className="mc-section-label">Command Stack</div>
                  {isBookingCompleted && (
                    <div className="mc-meta mt-1">Reopen booking to use edit commands.</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setShowMenuPanel(true)} disabled={isBookingCompleted} className={commandButtonClass}>
                    <Plus className="h-4 w-4" />
                    Item
                  </button>
                  <button type="button" onClick={() => setShowCustomItemDialog(true)} disabled={isBookingCompleted} className={commandButtonClass}>
                    <Edit className="h-4 w-4" />
                    Custom
                  </button>
                  <button type="button" onClick={() => setShowDiscountDialog(true)} disabled={isBookingCompleted} className={commandButtonClass}>
                    <Minus className="h-4 w-4" />
                    Discount
                  </button>
                  <button type="button" onClick={() => { setCouponCode(''); setCouponData(null); setShowCouponDialog(true); }} disabled={isBookingCompleted} className={commandButtonClass}>
                    <Ticket className="h-4 w-4" />
                    Coupon
                  </button>
                  {booking.bookingSource !== 'QUICK_SALE' ? (
                    <button type="button" onClick={handleExtendBooking} disabled={isBookingCompleted} className={commandButtonClass}>
                      <Clock className="h-4 w-4" />
                      +30m
                    </button>
                  ) : (
                    <button type="button" onClick={() => { setGiftCardAmount(''); setShowGiftCardDialog(true); }} disabled={isBookingCompleted} className={commandButtonClass}>
                      <Gift className="h-4 w-4" />
                      Gift Card
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="mc-panel space-y-3">
              <div>
                <div className="mc-section-label">Receipts</div>
                <div className="mc-meta mt-1">Print or preview booking and seat receipts.</div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenReceiptModal('full')}
                disabled={loadingReceipt || orderItems.length === 0}
                className="mc-chip w-full justify-center disabled:opacity-40 disabled:pointer-events-none"
              >
                <Printer className="h-3.5 w-3.5" />
                Full booking receipt
              </button>
              <button
                type="button"
                onClick={() => handleOpenReceiptModal('seat', activeSeat)}
                disabled={loadingReceipt || selectedSeatSummary.seatItems.length === 0}
                className="mc-chip mc-ledger-action mc-ledger-action-secondary w-full justify-center disabled:opacity-40 disabled:pointer-events-none"
              >
                <ReceiptText className="h-3.5 w-3.5" />
                Seat {activeSeat} receipt
              </button>
            </section>

            {!isReadOnly && booking.bookingStatus?.toUpperCase() !== 'COMPLETED' && (
              <section className="mc-panel space-y-2 border-[rgba(244,122,165,0.35)] bg-[rgba(244,122,165,0.03)] py-3">
                <div className="mc-section-label">Booking Actions</div>
                <button type="button" onClick={() => setCancelBookingOpen(true)} className="mc-chip mc-chip-alert w-full justify-center">
                  <X className="h-3.5 w-3.5" />
                  Cancel booking
                </button>
              </section>
            )}
          </aside>
        </div>
      </main>

      {showMenuPanel && (
        <div className="no-print fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Add items">
          <div className="mc-panel h-full max-w-[900px] ml-auto p-0 flex flex-col shadow-2xl">
            <div className="mc-dialog-header">
              <div>
                <div className="mc-section-label">Menu Command</div>
                <div className="mc-meta mt-1">Add menu items to a seat, then return to the ledger.</div>
              </div>
              <button type="button" className="mc-chip ml-auto" onClick={() => setShowMenuPanel(false)}>
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto mc-scroll-thin p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button type="button" onClick={() => { setShowMenuPanel(false); setShowCustomItemDialog(true); }} className="mc-action-btn">
                  <Plus className="h-4 w-4" />
                  Custom
                </button>
                <button type="button" onClick={() => { setShowMenuPanel(false); setShowDiscountDialog(true); }} className="mc-action-btn">
                  <Minus className="h-4 w-4" />
                  Discount
                </button>
                <button type="button" onClick={() => { setShowMenuPanel(false); setCouponCode(''); setCouponData(null); setShowCouponDialog(true); }} className="mc-action-btn">
                  <Ticket className="h-4 w-4" />
                  Coupon
                </button>
                {booking.bookingSource === 'QUICK_SALE' && (
                  <button type="button" onClick={() => { setShowMenuPanel(false); setGiftCardAmount(''); setShowGiftCardDialog(true); }} className="mc-action-btn">
                    <Gift className="h-4 w-4" />
                    Gift Card
                  </button>
                )}
              </div>

              {menu.length === 0 ? (
                <div className="mc-row py-10 text-center">
                  <div className="text-[color:var(--mc-text-primary)]">Menu not available</div>
                  <div className="mc-meta mt-1">Custom items are still available.</div>
                </div>
              ) : (
                <Tabs defaultValue="hours" className="space-y-4">
                  <TabsList className="grid grid-cols-5 bg-[color:var(--mc-surface-raised)] border border-[color:var(--mc-divider)]">
                    <TabsTrigger value="hours">Hours</TabsTrigger>
                    <TabsTrigger value="food">Food</TabsTrigger>
                    <TabsTrigger value="drinks">Drinks</TabsTrigger>
                    <TabsTrigger value="appetizers">Appetizers</TabsTrigger>
                    <TabsTrigger value="desserts">Desserts</TabsTrigger>
                  </TabsList>
                  {(['hours', 'food', 'drinks', 'appetizers', 'desserts'] as const).map((category) => (
                    <TabsContent key={category} value={category}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {getItemsByCategory(category).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              handleMenuItemClick(item);
                              setShowMenuPanel(false);
                            }}
                            className="mc-row text-left hover:border-[color:var(--mc-cyan)]"
                          >
                            <div className="font-semibold text-[color:var(--mc-text-hero)]">{item.name}</div>
                            <div className="mc-meta line-clamp-2">{item.description}</div>
                            <div className="mc-mono mt-2 text-[color:var(--mc-cyan)]">{formatMoney(item.price)}</div>
                          </button>
                        ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="no-print mc-original-layout mc-booking-shell flex-1 space-y-6">
        {/* Header */}
        <div className="mc-panel mc-panel-compact mc-booking-command-compact no-print">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-[-0.03em] text-[color:var(--mc-text-hero)]">
                Booking Details
              </h1>
              <span className="mc-meta truncate">ID: {booking.id}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${statusStyles[booking.bookingStatus?.toLowerCase() || 'booked']} uppercase text-sm px-3 py-1.5`}>
                {booking.bookingStatus || 'BOOKED'}
              </Badge>
              {booking.paymentStatus && (
                <Badge className={`${paymentStatusStyles[booking.paymentStatus]} uppercase text-sm px-3 py-1.5`}>
                  {booking.paymentStatus}
                </Badge>
              )}
              {onBack && (
                <button
                  onClick={onBack}
                  className="mc-chip"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mc-booking-meta-line">
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">Room:</span>
              <span className="flex min-w-0 items-center gap-2 mc-meta-value">
                <span className={`mc-status-dot h-2.5 w-2.5 ${roomColors[booking.roomId]}`} />
                <span className="truncate">{roomColor}</span>
              </span>
            </div>
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">Customer:</span>
              <span className="truncate mc-meta-value">{booking.customerName}</span>
            </div>
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">Session:</span>
              <span className="mc-meta-value">{booking.date} · {booking.time}</span>
            </div>
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">End:</span>
              <span className="mc-meta-value">{endTimeLabel}</span>
            </div>
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">Players:</span>
              <span className="mc-meta-value">
                {booking.players} player{booking.players === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">Phone:</span>
              <span className="truncate mc-meta-value">{booking.customerPhone}</span>
            </div>
            <div className="mc-booking-meta-item">
              <span className="mc-field-label">DOB:</span>
              <span className="mc-meta-value">{booking.user?.dateOfBirth || 'N/A'}</span>
            </div>
            {booking.customerEmail && (
              <div className="mc-booking-meta-item">
                <span className="mc-field-label">Email:</span>
                <span className="truncate mc-meta-value">{booking.customerEmail}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mc-booking-layout">
          {/* Left Column - Order Management */}
          <div className="mc-booking-main">
            {/* Payment Summary */}
            <section className="mc-panel mc-panel-compact mc-payment-summary-compact">
              <MCPanelHeader
                label="Payment Summary"
                meta={`${getPaidSeatsCount()} of ${numberOfSeats} seat${numberOfSeats === 1 ? '' : 's'} paid`}
                border
                tight
              />
              <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.45fr)] lg:items-stretch">
                <div className={`mc-row mc-payment-total-compact ${totalDue > 0 ? 'mc-subpanel-warning' : 'mc-subpanel-success'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mc-kicker">{totalDue > 0 ? 'Total Due' : 'Collected'}</div>
                      <div className={`mt-0.5 font-mono text-2xl font-bold leading-none ${totalDue > 0 ? 'mc-tone-warning' : 'mc-tone-success'}`}>
                        {formatMoney(totalDue > 0 ? totalDue : totalCollected)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div className="font-mono text-base font-semibold text-[color:var(--mc-text-primary)]">{Math.round(getPaymentProgress())}%</div>
                      <div className="mc-kicker">settled</div>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-slate-300">
                    <span>Seats Paid</span>
                    <span className="font-semibold">
                      {getPaidSeatsCount()} / {numberOfSeats}
                    </span>
                  </div>
                  <Progress value={getPaymentProgress()} className="mt-1 h-1.5 bg-slate-700">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${getPaymentProgress()}%` }}
                    />
                  </Progress>
                  <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="mc-metric-tile">
                      <span>Collected</span>
                      <strong>{formatMoney(totalCollected)}</strong>
                    </div>
                    <div className="mc-metric-tile">
                      <span>Open due</span>
                      <strong>{formatMoney(totalDue)}</strong>
                    </div>
                  </div>
                </div>

                {/* Per-Seat Status */}
                <div className="mc-payment-seat-compact">
                  <MCPanelHeader
                    label="Seat Status"
                    meta={(
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 mc-tone-accent" />
                        <span>Seat Management</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-500">Number of Seats</span>
                      </span>
                    )}
                    tight
                    right={(
                    <div className="mc-seat-count-control" aria-label="Number of Seats">
                      {!isReadOnly && (
                        <Button
                          size="sm"
                          onClick={handleReduceSeats}
                          disabled={!canReduceSeats()}
                          className="mc-mini-action mc-mini-action-neutral mc-mini-action-icon"
                          aria-label="Reduce seats"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="min-w-[3.5rem] text-center">
                        <div className="mc-kicker">Seats</div>
                        <div className="font-mono text-lg font-bold mc-tone-accent">{numberOfSeats}</div>
                      </div>
                      {!isReadOnly && (
                        <Button
                          size="sm"
                          onClick={handleIncreaseSeats}
                          disabled={numberOfSeats >= MAX_SEATS}
                          className="mc-mini-action mc-mini-action-neutral mc-mini-action-icon"
                          aria-label="Add seat"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[118px] overflow-y-auto mc-scroll-thin pr-1">
                    {seatSummaries.map((summary) => {
                      const isActiveSummary = summary.seat === activeSeat;
                      return (
                        <button
                          key={summary.seat}
                          type="button"
                          onClick={() => setSelectedSeat(summary.seat)}
                          aria-label={`Seat ${summary.seat} status`}
                          aria-pressed={isActiveSummary}
                          className={`mc-payment-seat-status ${isActiveSummary ? 'mc-payment-seat-status-active' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`mc-status-dot w-3 h-3 ${seatColors[summary.seat - 1]}`} />
                            <span className="text-sm text-white">Seat {summary.seat}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {summary.isPaid ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 mc-tone-success" />
                                <span className="text-xs mc-tone-success font-semibold">PAID</span>
                                <span className="text-xs mc-meta font-mono">{formatMoney(summary.total)}</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-4 w-4 mc-tone-warning" />
                                <span className="text-xs mc-tone-warning font-semibold">UNPAID</span>
                                <span className="text-xs mc-meta font-mono">{formatMoney(summary.remaining || summary.total)}</span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Active Seat Detail with Order Items and Invoices */}
            <div className="space-y-4">
              {Array.from({ length: numberOfSeats }, (_, i) => i + 1).filter((seat) => seat === activeSeat).map((seat) => {
                // Always define isPaid at the top of each seat panel
                const isPaid = isSeatPaid(seat);
                const seatItems = getItemsForSeat(seat);
                const regularItems = seatItems.filter(item => (item.splitPrice || item.menuItem.price) >= 0);
                const discountItems = seatItems.filter(item => (item.splitPrice || item.menuItem.price) < 0);
                const payment = getSeatPayment(seat);
                const subtotal = calculateSeatSubtotal(seat); // backend subtotal (includes discounts)
                const preDiscountSubtotal = regularItems.reduce((sum, item) => sum + (item.splitPrice || item.menuItem.price) * item.quantity, 0);
                const discountTotal = discountItems.reduce((sum, item) => sum + (item.splitPrice || item.menuItem.price) * item.quantity, 0);
                const tax = calculateSeatTax(seat);
                const tipAmount = isPaid
                  ? payment?.tip || 0
                  : parseFloat(tipAmountBySeat[seat] || '0') || 0;
                const total = subtotal + tax + tipAmount;
                const seatPaidSoFar = payment?.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
                const seatRemaining = Math.max(0, Math.round((total - seatPaidSoFar) * 100) / 100);

                return (
                  <section
                    key={seat}
                    data-testid="active-seat-detail"
                    className="mc-panel mc-seat-detail-panel"
                  >
                    <div className="mc-seat-detail-header">
                      <MCPanelHeader
                        as="div"
                        label={(
                          <span className="flex items-center gap-2 sm:gap-3">
                            <span className={`mc-status-dot w-4 h-4 ${seatColors[seat - 1]}`} />
                            <span className="font-bold text-white text-base sm:text-lg">Seat {seat} Detail</span>
                            <Badge variant="outline" className="text-slate-300 border-slate-600 text-xs">
                            {regularItems.length} items
                          </Badge>
                          {discountItems.length > 0 && (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-xs">
                              {discountItems.length} discount{discountItems.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                            <Badge className={`${isPaid ? 'bg-green-500/20 text-green-300 border-green-500/50' : 'bg-amber-500/20 text-amber-300 border-amber-500/50'} text-xs`}>
                              {isPaid ? `${formatMoney(total)} paid` : `${formatMoney(seatRemaining)} due`}
                            </Badge>
                          </span>
                        )}
                        flush
                        right={(
                          <>
                          <button
                            type="button"
                            onClick={() => handleOpenReceiptModal('seat', seat)}
                            disabled={loadingReceipt || seatItems.length === 0}
                            className={`mc-action-btn mc-action-btn-accent mc-action-btn-compact mc-action-btn-fit ${
                              loadingReceipt || seatItems.length === 0
                                ? 'opacity-50 pointer-events-none'
                                : ''
                            }`}
                            aria-label={`Print Seat ${seat} receipt`}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </button>
                          {isPaid ? (
                            <Badge className="bg-green-500 text-white flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              PAID
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500 text-black flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              UNPAID
                            </Badge>
                          )}
                          </>
                        )}
                      />
                    </div>
                    <div className="mc-seat-detail-body">
                      <div className="mc-section-stack">
                        {/* Order Items */}
                        {regularItems.length === 0 && discountItems.length === 0 ? (
                          <div className="mc-empty-state">
                            <p>No items ordered yet</p>
                            <p className="text-sm mt-1">Add items from the menu</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-slate-300 mb-2">Order Items</h4>
                            {regularItems.map((item) => (
                              <div
                                key={item.id}
                                className="mc-subpanel flex items-center justify-between gap-3"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-white font-medium">
                                      {item.menuItem ? item.menuItem.name : (item as any).customItemName || 'Custom Item'}
                                    </p>
                                    {item.menuItem?.id?.startsWith('custom-') && (
                                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50 text-xs">
                                        Custom
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-400">
                                    {item.splitPrice ? (
                                      <>
                                        ${item.splitPrice.toFixed(2)} each{' '}
                                        <span className="text-amber-400">(split)</span>
                                      </>
                                    ) : (
                                      `$${item.menuItem.price.toFixed(2)} × ${item.quantity}`
                                    )}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-amber-400 font-bold min-w-[80px] text-right">
                                    ${((item.splitPrice || item.menuItem.price) * item.quantity).toFixed(2)}
                                  </span>
                                  {!isPaid && !isReadOnly && (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleMoveItem(item)}
                                        className="mc-mini-action mc-mini-action-info hidden sm:inline-flex"
                                        title="Move to another seat"
                                      >
                                        Move
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleMoveItem(item)}
                                        className="mc-mini-action mc-mini-action-info mc-mini-action-icon sm:hidden"
                                        title="Move to another seat"
                                      >
                                        <MoveRight className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSplitItem(item)}
                                        className="mc-mini-action mc-mini-action-accent hidden sm:inline-flex"
                                        title="Split to multiple seats"
                                      >
                                        Split
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSplitItem(item)}
                                        className="mc-mini-action mc-mini-action-accent mc-mini-action-icon sm:hidden"
                                        title="Split to multiple seats"
                                      >
                                        <Split className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateItemQuantity(item.id, -1)}
                                        className="mc-mini-action mc-mini-action-neutral mc-mini-action-icon"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateItemQuantity(item.id, 1)}
                                        className="mc-mini-action mc-mini-action-neutral mc-mini-action-icon"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => { setRemoveOrderId(item.id); setRemoveOrderName(item.menuItem?.name || 'this item'); }}
                                        className="mc-mini-action mc-mini-action-danger mc-mini-action-icon"
                                      >
                                      <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <Separator className="bg-slate-700" />

                        {/* Invoice */}
                        <div className="mc-subpanel mc-section-stack">
                          <h4 className="text-sm font-semibold text-white mb-3">Invoice</h4>
                          <div className="space-y-2 font-mono text-sm">
                            <div className="flex justify-between text-slate-300">
                              <span>Subtotal</span>
                              <span>${preDiscountSubtotal.toFixed(2)}</span>
                            </div>
                            {discountItems.map((item) => (
                              <div key={item.id} className="flex justify-between items-center text-emerald-400">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs">↳</span>
                                  <span>{item.menuItem.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span>-${Math.abs((item.splitPrice || item.menuItem.price) * item.quantity).toFixed(2)}</span>
                                  {!isPaid && !isReadOnly && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setRemoveOrderId(item.id); setRemoveOrderName(item.menuItem?.name || 'this discount'); }}
                                      className="mc-mini-action mc-mini-action-danger mc-mini-action-icon"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="flex justify-between text-slate-300">
                              <span>Tax ({effectiveTaxRate}%)</span>
                              <span>${tax.toFixed(2)}</span>
                            </div>
                            {tipAmount > 0 && (
                              <div className="flex justify-between text-slate-300">
                                <span>Tip {isPaid && (() => { const inv = invoices.find(i => i.seatIndex === seat); return inv?.tipMethod ? <span className="text-xs text-slate-500">({inv.tipMethod === 'CASH' ? '💵 Cash' : '💳 Card'})</span> : ''; })()}</span>
                                <span>${tipAmount.toFixed(2)}</span>
                              </div>
                            )}
                            <Separator className="bg-slate-600" />
                            <div className="flex justify-between text-white font-bold text-base">
                              <span>Total</span>
                              <span className="text-amber-400">${total.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Payment Section */}
                        {isPaid ? (
                          <div className="mc-subpanel mc-subpanel-success mc-section-stack">
                            <div className="flex items-center gap-2 text-green-400 mb-2">
                              <CheckCircle2 className="h-5 w-5" />
                              <span className="font-semibold">PAID</span>
                            </div>
                            <div className="text-sm text-slate-300 space-y-2">
                              {payment?.payments && payment.payments.length > 0 ? (
                                <>
                                  {payment.payments.length > 1 && <p className="font-medium text-slate-200">Payment History:</p>}
                                  {payment.payments.map((p, idx) => (
                                    <div key={idx} className="mc-subpanel mc-subpanel-flush overflow-hidden">
                                      <div className="flex items-center justify-between p-3">
                                        <span className="inline-flex items-center gap-1.5 font-medium">
                                          {p.method === 'CARD' ? <CreditCard className="h-4 w-4" /> : p.method === 'GIFT_CARD' ? <Gift className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                                          {p.method === 'GIFT_CARD' ? 'Gift Card' : p.method === 'CARD' ? 'Card' : 'Cash'}
                                        </span>
                                        <span className="font-semibold text-emerald-400">${Number(p.amount).toFixed(2)}</span>
                                      </div>
                                      {(p.method === 'CARD' || p.method === 'GIFT_CARD') && (
                                        <div className="border-t border-slate-700">
                                          {receiptPhotos[p.id] ? (
                                            <button
                                              onClick={() => { setCaptureMode('view'); setCapturePaymentId(p.id); }}
                                              className="mc-payment-action mc-payment-action-success"
                                            >
                                              <CheckCircle2 className="h-3.5 w-3.5" />
                                              View Receipt
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => { setCaptureMode('upload'); setCapturePaymentId(p.id); }}
                                              className="mc-payment-action mc-payment-action-accent"
                                            >
                                              <Camera className="h-3.5 w-3.5" />
                                              Upload Receipt
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <p>
                                  Method:{' '}
                                  {payment?.method === 'CARD' ? (
                                    <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Card</span>
                                  ) : payment?.method === 'GIFT_CARD' ? (
                                    <span className="inline-flex items-center gap-1"><Gift className="h-3 w-3" /> Gift Card</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash</span>
                                  )}
                                </p>
                              )}
                              <p>Total: ${total.toFixed(2)}</p>
                            </div>
                            {!isReadOnly && (
                            <Button
                              onClick={() => setCancelPaymentSeat(seat)}
                              disabled={processingPayment === seat}
                              variant="outline"
                              className="mc-payment-action mc-payment-action-danger"
                            >
                              {processingPayment === seat ? 'Processing...' : 'Cancel Payment'}
                            </Button>
                            )}
                          </div>
                        ) : (
                          <div className="mc-subpanel mc-section-stack">
                            {/* Show existing partial payments if any */}
                            {(() => {
                              const invoice = invoices.find((inv) => inv.seatIndex === seat);
                              const existingPayments = invoice?.payments || [];
                              const paidSoFar = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                              const seatTotal = subtotal + tax;
                              const remaining = Math.max(0, Math.round((seatTotal - paidSoFar) * 100) / 100);
                              const hasCouponDiscount = discountItems.some(item => (item.menuItem?.name || '').includes('🎟️'));

                              return (
                                <>
                                  {existingPayments.length > 0 && (
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Payments Received</h4>
                                      {existingPayments.map((p, idx) => (
                                        <div key={idx} className="mc-subpanel flex items-center justify-between text-sm">
                                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                                            {p.method === 'COUPON' ? <Ticket className="h-3.5 w-3.5" /> : p.method === 'CARD' ? <CreditCard className="h-3.5 w-3.5" /> : p.method === 'GIFT_CARD' ? <Gift className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                                            {p.method === 'COUPON' ? 'Coupon' : p.method === 'GIFT_CARD' ? 'Gift Card' : p.method === 'CARD' ? 'Card' : 'Cash'}
                                          </span>
                                          <span className="text-emerald-400 font-medium">${Number(p.amount).toFixed(2)}</span>
                                        </div>
                                      ))}
                                      <div className="flex justify-between text-sm font-medium pt-1 border-t border-slate-700">
                                        <span className="text-slate-400">Remaining</span>
                                        <span className="text-amber-400">${remaining.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  )}

                                  {!isReadOnly && (
                                  <Button
                                    onClick={() => {
                                      setPaymentDialogSeat(seat);
                                      setPaymentDialogAmount(remaining > 0 ? remaining.toFixed(2) : seatTotal.toFixed(2));
                                      setPaymentDialogMethod(null);
                                      setTipMethodBySeat(prev => ({ ...prev, [seat]: 'CARD' }));
                                    }}
                                    disabled={subtotal === 0 && !hasCouponDiscount}
                                    className="mc-action-btn mc-action-btn-success"
                                  >
                                    {seatTotal <= 0 && hasCouponDiscount ? (
                                      <><Ticket className="h-4 w-4 mr-2" /> Collect Payment — Coupon Applied</>
                                    ) : existingPayments.length > 0 ? (
                                      <><CreditCard className="h-4 w-4 mr-2" /> {`Add Payment ($${remaining.toFixed(2)} remaining)`}</>
                                    ) : (
                                      <><CreditCard className="h-4 w-4 mr-2" /> {`Collect Payment — $${seatTotal.toFixed(2)}`}</>
                                    )}
                                  </Button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          {/* Right Column - Settlement & Lifecycle */}
          <div className="mc-booking-side">
            {!isReadOnly && (
              <div className="mc-section-stack">
                <section className="mc-panel mc-panel-compact mc-section-stack">
                  <MCPanelHeader label="Quick Actions" border tight />
                  {booking.bookingStatus?.toUpperCase() === 'COMPLETED' ? (
                    <Button
                      onClick={handleReopenBooking}
                      className="mc-action-btn mc-action-btn-info"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Reopen Booking
                    </Button>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        onClick={handleCompleteBooking}
                        className="mc-action-btn mc-action-btn-success"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Complete Booking
                      </Button>
                      <Button
                        onClick={() => setCancelBookingOpen(true)}
                        variant="outline"
                        className="mc-action-btn mc-action-btn-danger"
                      >
                        Cancel Booking
                      </Button>
                    </div>
                  )}
                </section>

                {isBookingCompleted && (
                  <section className="mc-panel mc-panel-compact">
                    <MCPanelHeader
                      label="Menu"
                      meta="Reopen booking to use edit commands."
                      flush
                    />
                  </section>
                )}
                {!isBookingCompleted && (
                  <section className="mc-panel mc-panel-compact mc-section-stack">
                    <MCPanelHeader
                      label="Menu"
                      meta="Order-entry commands stay under Quick Actions."
                      border
                    />
                    {menu.length === 0 ? (
                      <div className="mc-empty-state">
                        <p className="text-sm">Menu not available</p>
                      </div>
                    ) : (
                      <Tabs defaultValue="hours" className="mc-section-stack">
                        <div className="overflow-x-auto -mx-2 px-2">
                          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-5 bg-slate-900/50">
                            <TabsTrigger value="hours">Hours</TabsTrigger>
                            <TabsTrigger value="food">Food</TabsTrigger>
                            <TabsTrigger value="drinks">Drinks</TabsTrigger>
                            <TabsTrigger value="appetizers">Appetizers</TabsTrigger>
                            <TabsTrigger value="desserts">Desserts</TabsTrigger>
                          </TabsList>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            onClick={() => setShowCustomItemDialog(true)}
                            className="mc-menu-tool"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Custom</span>
                          </Button>
                          <Button
                            onClick={() => setShowDiscountDialog(true)}
                            className="mc-menu-tool"
                          >
                            <Minus className="w-4 h-4" />
                            <span>Discount</span>
                          </Button>
                          <Button
                            onClick={() => {
                              setCouponCode('');
                              setCouponData(null);
                              setShowCouponDialog(true);
                            }}
                            className="mc-menu-tool"
                          >
                            <Ticket className="w-4 h-4" />
                            <span>Coupon</span>
                          </Button>
                          {booking.bookingSource !== 'QUICK_SALE' && (
                            <Button
                              onClick={handleExtendBooking}
                              className="mc-menu-tool"
                            >
                              <Clock className="w-4 h-4" />
                              <span>+30m</span>
                            </Button>
                          )}
                          {booking.bookingSource === 'QUICK_SALE' && (
                            <Button
                              onClick={() => {
                                setGiftCardAmount('');
                                setShowGiftCardDialog(true);
                              }}
                              className="mc-menu-tool"
                            >
                              <Gift className="w-4 h-4" />
                              <span>Gift Card</span>
                            </Button>
                          )}
                        </div>

                        {(['hours', 'food', 'drinks', 'appetizers', 'desserts'] as const).map((category) => (
                          <TabsContent key={category} value={category}>
                            <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto mc-scroll-thin pr-1">
                              {getItemsByCategory(category).map((item) => (
                                <button
                                  key={item.id}
                                  onClick={() => handleMenuItemClick(item)}
                                  className="mc-menu-item group"
                                >
                                  <h4 className="font-semibold text-white text-sm mb-1 group-hover:text-amber-400 transition-colors">
                                    {item.name}
                                  </h4>
                                  <p className="text-xs text-slate-400 mb-1 line-clamp-1">{item.description}</p>
                                  <p className="text-amber-400 font-semibold text-sm">${item.price.toFixed(2)}</p>
                                </button>
                              ))}
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                    )}
                  </section>
                )}
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Print-only footer */}
      <div className="print-only mt-8 pt-6 border-t-2 border-black text-center text-sm">
        <p className="font-medium mb-2">Thank you for choosing K one Golf!</p>
        <p>Booking ID: {booking.id}</p>
        <p>Printed: {new Date().toLocaleString('en-US', { timeZone: VENUE_TIMEZONE })}</p>
        {printingSeat && <p className="font-bold mt-2">Seat {printingSeat} Receipt</p>}
      </div>

      {/* Dialogs */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Add to Seat</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select which seat to add "{selectedMenuItem?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
              <Button
                key={seat}
                onClick={() => addItemFromDialog(seat)}
                className={`h-16 ${seatColors[seat - 1]} hover:opacity-90 text-white text-lg font-semibold`}
              >
                Seat {seat}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddItemDialog(false);
                setSelectedMenuItem(null);
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Move Item</DialogTitle>
            <DialogDescription className="text-slate-400">
              Move "{selectedOrderItem?.menuItem.name}" to a different seat
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
              <Button
                key={seat}
                onClick={() => moveItemToSeat(selectedOrderItem!.id, seat)}
                className={`h-16 ${seatColors[seat - 1]} hover:opacity-90 text-white text-lg font-semibold`}
              >
                Seat {seat}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveDialog(false);
                setSelectedOrderItem(null);
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Split Item Cost</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select seats to split "{selectedOrderItem?.menuItem.name}" ($
              {selectedOrderItem?.menuItem.price.toFixed(2)})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-300">
              The cost will be divided evenly across selected seats. Each seat will receive the full quantity.
            </p>

            {/* Seat selection */}
            <div className="space-y-3">
              {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
                <div
                  key={seat}
                  onClick={() => toggleSeatForSplit(seat)}
                  className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-all ${
                    selectedSeatsForSplit.includes(seat)
                      ? 'bg-amber-500/20 border-2 border-amber-500'
                      : 'bg-slate-900/50 border-2 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedSeatsForSplit.includes(seat)
                          ? 'bg-amber-500 border-amber-500'
                          : 'border-slate-500'
                      }`}
                    >
                      {selectedSeatsForSplit.includes(seat) && (
                        <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <div className={`w-4 h-4 rounded-full ${seatColors[seat - 1]}`} />
                    <span className="text-white font-medium">Seat {seat}</span>
                  </div>
                  {selectedSeatsForSplit.includes(seat) && selectedSeatsForSplit.length > 0 && selectedOrderItem && (
                    <span className="text-amber-400 font-bold">
                      ${(selectedOrderItem.menuItem.price / selectedSeatsForSplit.length).toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Split preview */}
            {selectedSeatsForSplit.length > 0 && selectedOrderItem && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Original Price:</span>
                  <span className="text-white font-medium">${selectedOrderItem.menuItem.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">Split Between:</span>
                  <span className="text-white font-medium">{selectedSeatsForSplit.length} seat(s)</span>
                </div>
                <Separator className="bg-amber-500/30" />
                <div className="flex justify-between">
                  <span className="text-amber-400 font-medium">Price Per Seat:</span>
                  <span className="text-amber-400 font-bold text-lg">
                    ${(selectedOrderItem.menuItem.price / selectedSeatsForSplit.length).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSplitDialog(false);
                setSelectedOrderItem(null);
                setSelectedSeatsForSplit([]);
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button onClick={splitItemAcrossSeats} disabled={selectedSeatsForSplit.length === 0}>
              Split to {selectedSeatsForSplit.length} Seat(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Item Dialog */}
      <Dialog open={showCustomItemDialog} onOpenChange={setShowCustomItemDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Add Custom Item</DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter item name and price, then select which seat to add it to
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Item Name Input */}
            <div className="space-y-2">
              <Label htmlFor="customItemName" className="text-white">Item Name</Label>
              <Input
                id="customItemName"
                placeholder="e.g., Special Event Package"
                value={customItemName}
                onChange={(e) => setCustomItemName(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                autoFocus
              />
            </div>

            {/* Price Input */}
            <div className="space-y-2">
              <Label htmlFor="customItemPrice" className="text-white">Price ($)</Label>
              <Input
                id="customItemPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={customItemPrice}
                onChange={(e) => setCustomItemPrice(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {/* Preview */}
            {customItemName && customItemPrice && parseFloat(customItemPrice) > 0 && (
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-white">{customItemName}</div>
                    <div className="text-xs text-slate-400">Custom Item</div>
                  </div>
                  <div className="text-purple-400 font-bold text-lg">
                    ${parseFloat(customItemPrice).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Seat Selection */}
            <div className="space-y-2">
              <Label className="text-white">Select Seat</Label>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
                  <Button
                    key={seat}
                    onClick={() => handleAddCustomItem(seat)}
                    disabled={orderLoading || !customItemName.trim() || !customItemPrice || parseFloat(customItemPrice) <= 0}
                    className={`h-16 ${seatColors[seat - 1]} hover:opacity-90 text-white text-lg font-semibold disabled:opacity-50`}
                  >
                    {orderLoading ? 'Adding...' : `Seat ${seat}`}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomItemDialog(false);
                setCustomItemName('');
                setCustomItemPrice('');
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              disabled={orderLoading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Add Discount</DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter discount details, then select which seat to apply it to
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Discount Name Input */}
            <div className="space-y-2">
              <Label htmlFor="discountName" className="text-white">Discount Name</Label>
              <Input
                id="discountName"
                placeholder="e.g., Senior Discount, Loyalty Reward"
                value={discountName}
                onChange={(e) => setDiscountName(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                autoFocus
              />
            </div>

            {/* Discount Type Toggle */}
            <div className="space-y-2">
              <Label className="text-white">Discount Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => setDiscountType('FLAT')}
                  className={`h-12 text-lg font-semibold ${
                    discountType === 'FLAT'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  $ Flat
                </Button>
                <Button
                  type="button"
                  onClick={() => setDiscountType('PERCENT')}
                  className={`h-12 text-lg font-semibold ${
                    discountType === 'PERCENT'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  % Percent
                </Button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="discountAmount" className="text-white">
                {discountType === 'FLAT' ? 'Amount ($)' : 'Percentage (%)'}
              </Label>
              <Input
                id="discountAmount"
                type="number"
                step={discountType === 'FLAT' ? '0.01' : '1'}
                min="0"
                max={discountType === 'PERCENT' ? '100' : undefined}
                placeholder={discountType === 'FLAT' ? '0.00' : '0'}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {/* Preview */}
            {discountName && discountAmount && parseFloat(discountAmount) > 0 && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-white">
                      {discountName}
                      {discountType === 'PERCENT' && ` (${discountAmount}%)`}
                    </div>
                    <div className="text-xs text-slate-400">Discount • {discountType === 'FLAT' ? 'Flat Amount' : 'Percentage'}</div>
                  </div>
                  <div className="text-emerald-400 font-bold text-lg">
                    {discountType === 'FLAT'
                      ? `-$${parseFloat(discountAmount).toFixed(2)}`
                      : `-${discountAmount}%`}
                  </div>
                </div>
              </div>
            )}

            {/* Seat Selection */}
            <div className="space-y-2">
              <Label className="text-white">Select Seat</Label>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
                  <Button
                    key={seat}
                    onClick={() => handleAddDiscount(seat)}
                    disabled={orderLoading || !discountName.trim() || !discountAmount || parseFloat(discountAmount) <= 0}
                    className={`h-16 ${seatColors[seat - 1]} hover:opacity-90 text-white text-lg font-semibold disabled:opacity-50`}
                  >
                    {orderLoading ? 'Applying...' : `Seat ${seat}`}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDiscountDialog(false);
                setDiscountName('');
                setDiscountAmount('');
                setDiscountType('FLAT');
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              disabled={orderLoading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Coupon Dialog */}
      <Dialog open={showCouponDialog} onOpenChange={setShowCouponDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Ticket className="h-5 w-5 text-amber-400" />
              Apply Coupon
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter the coupon code to validate and apply to a seat
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Code Input */}
            <div className="flex gap-2">
              <Input
                placeholder="e.g., KGOLF-A3X9"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCouponData(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleValidateCoupon()}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 font-mono text-lg tracking-wider"
                autoFocus
              />
              <Button
                onClick={handleValidateCoupon}
                disabled={couponValidating || !couponCode.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-black px-6"
              >
                {couponValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validate'}
              </Button>
            </div>

            {/* Validation Result */}
            {couponData && (
              <div className={`p-4 rounded-lg border ${couponData.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
              }`}>
                {couponData.isValid ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <span className="font-semibold text-emerald-400">Valid Coupon</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-400">Code:</span>{' '}
                        <span className="text-white font-mono">{couponData.code}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Type:</span>{' '}
                        <span className="text-white">{couponData.couponType?.label}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Value:</span>{' '}
                        <span className="text-amber-400 font-bold">${Number(couponData.discountAmount).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">For:</span>{' '}
                        <span className="text-white">{couponData.user?.name}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300">{couponData.description}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <span className="text-red-400">{couponData.error || 'Invalid coupon'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Seat Selection (only when valid) */}
            {couponData?.isValid && (
              <div className="space-y-2">
                <Label className="text-white">Apply to Seat</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
                    <Button
                      key={seat}
                      onClick={() => handleApplyCoupon(seat)}
                      disabled={couponApplying}
                      className={`h-16 ${seatColors[seat - 1]} hover:opacity-90 text-white text-lg font-semibold disabled:opacity-50`}
                    >
                      {couponApplying ? <Loader2 className="h-5 w-5 animate-spin" /> : `Seat ${seat}`}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCouponDialog(false);
                setCouponCode('');
                setCouponData(null);
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gift Card Dialog */}
      <Dialog open={showGiftCardDialog} onOpenChange={setShowGiftCardDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Gift Card Sale</DialogTitle>
            <DialogDescription className="text-slate-400">
              Gift cards are tax-exempt. Select a preset amount or enter a custom value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              {[25, 50, 100].map((preset) => (
                <Button
                  key={preset}
                  onClick={() => setGiftCardAmount(String(preset))}
                  variant={giftCardAmount === String(preset) ? 'default' : 'outline'}
                  className={giftCardAmount === String(preset)
                    ? 'bg-rose-600 hover:bg-rose-700 text-white h-12 text-lg font-bold'
                    : 'border-slate-600 text-slate-300 hover:bg-slate-700 h-12 text-lg font-bold'
                  }
                >
                  ${preset}
                </Button>
              ))}
            </div>
            <div>
              <Label className="text-white">Custom Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={giftCardAmount}
                onChange={(e) => setGiftCardAmount(e.target.value)}
                placeholder="Enter amount..."
                className="bg-slate-700 border-slate-600 text-white mt-1"
              />
            </div>
            {giftCardAmount && parseFloat(giftCardAmount) > 0 && (
              <div className="space-y-2">
                <Label className="text-white">Add to Seat</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => (
                    <Button
                      key={seat}
                      onClick={() => handleAddGiftCard(seat)}
                      disabled={orderLoading}
                      className={`h-16 ${seatColors[seat - 1]} hover:opacity-90 text-white text-lg font-semibold disabled:opacity-50`}
                    >
                      {orderLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `Seat ${seat}`}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowGiftCardDialog(false);
                setGiftCardAmount('');
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tax Rate Edit Dialog */}
      <Dialog open={showTaxEditDialog} onOpenChange={setShowTaxEditDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Tax Rate for This Booking</DialogTitle>
            <DialogDescription className="text-slate-400">
              Set a custom tax rate for this booking, or reset to use the global default ({globalTaxRate}%).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Current: {bookingTaxRate !== null ? `${bookingTaxRate}% (Custom)` : `${globalTaxRate}% (Global Default)`}
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRateInput}
                  onChange={(e) => setTaxRateInput(e.target.value)}
                  className="flex-1 bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Enter tax rate (0-100)"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">Enter a value between 0 and 100. Decimals are supported (e.g., 8.5 for 8.5%)</p>
            </div>

            <div className="border-t border-slate-700 pt-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Quick Select</h4>
              <div className="grid grid-cols-4 gap-2">
                {[0, 5, 8, 10, 13, 15, 20, 25].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setTaxRateInput(rate.toString())}
                    className="px-3 py-2 rounded-md bg-slate-700/50 border border-slate-600 text-slate-200 text-sm hover:bg-slate-600/60 hover:border-amber-500/30 transition-colors"
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            {bookingTaxRate !== null && (
              <Button
                variant="outline"
                onClick={() => {
                  setBookingTaxRate(null);
                  localStorage.removeItem(`booking-${bookingId}-taxRate`);
                  setShowTaxEditDialog(false);
                }}
                className="border-red-500/30 text-red-300 hover:bg-red-500/10"
              >
                Reset to Global ({globalTaxRate}%)
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowTaxEditDialog(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const rate = parseFloat(taxRateInput);
                if (isNaN(rate) || rate < 0 || rate > 100) {
                  alert('Please enter a valid tax rate between 0 and 100');
                  return;
                }
                setBookingTaxRate(rate);
                localStorage.setItem(`booking-${bookingId}-taxRate`, rate.toString());
                setShowTaxEditDialog(false);
              }}
            >
              Save Tax Rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={paymentDialogSeat !== null} onOpenChange={(open) => { if (!open) setPaymentDialogSeat(null); }}>
        <DialogContent className="mc-dialog-content max-w-[640px] p-0 overflow-hidden" showCloseButton={false}>
          {paymentDialogSeat !== null && (() => {
            const invoice = invoices.find((inv) => inv.seatIndex === paymentDialogSeat);
            const existingPayments = invoice?.payments || [];
            const paidSoFar = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const baseTotal = Number(invoice?.subtotal || 0) + Number(invoice?.tax || 0);
            const existingTip = Number(invoice?.tip || 0);
            const newTipVal = parseFloat(tipAmountBySeat[paymentDialogSeat] || '0') || 0;
            const totalWithTip = baseTotal + existingTip + newTipVal;
            const remaining = Math.max(0, Math.round((totalWithTip - paidSoFar) * 100) / 100);
            const selectedPaymentLabel =
              paymentDialogMethod === 'GIFT_CARD'
                ? 'Gift Card'
                : paymentDialogMethod === 'CARD'
                ? 'Card'
                : paymentDialogMethod === 'CASH'
                ? 'Cash'
                : paymentDialogMethod === 'COUPON'
                ? 'Coupon'
                : null;
            const methodOptions = [
              { method: 'CARD' as const, label: 'Card', Icon: CreditCard, tone: 'var(--mc-cyan)' },
              { method: 'CASH' as const, label: 'Cash', Icon: Banknote, tone: 'var(--mc-green)' },
              { method: 'GIFT_CARD' as const, label: 'Gift Card', Icon: Gift, tone: 'var(--mc-magenta)' },
            ];

            const submitPayment = async () => {
              if (!booking || paymentDialogSeat === null) return;
              const seat = paymentDialogSeat;
              setProcessingPayment(seat);
              try {
                const inv = invoices.find((i) => i.seatIndex === seat);
                if (!inv) throw new Error('No invoice found');
                const amount = parseFloat(paymentDialogAmount);
                if (isNaN(amount)) throw new Error('Enter a valid amount');
                if (paymentDialogMethod !== 'COUPON' && amount <= 0) throw new Error('Enter a valid amount');
                if (!paymentDialogMethod) throw new Error('Select a payment method');

                const tipVal = parseFloat(tipAmountBySeat[seat] || '0') || 0;

                const result = await apiAddPayment({
                  invoiceId: inv.id,
                  bookingId: booking.id,
                  seatIndex: seat,
                  method: paymentDialogMethod,
                  amount,
                  tip: tipVal > 0 ? tipVal : undefined,
                  tipMethod: tipVal > 0 ? (tipMethodBySeat[seat] || 'CARD') : undefined,
                });

                if (tipVal > 0) {
                  setTipAmountBySeat({ ...tipAmountBySeat, [seat]: '' });
                  setTipMethodBySeat(prev => { const n = { ...prev }; delete n[seat]; return n; });
                }

                if (result.remaining <= 0.01) {
                  setPaymentDialogSeat(null);
                  await loadData();
                } else {
                  setPaymentDialogAmount(result.remaining.toFixed(2));
                  await loadData();
                }
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              } finally {
                setProcessingPayment(null);
              }
            };

            return (
              <div className="mc-dialog-frame">
                <div
                  aria-hidden
                  className="mc-dialog-frame-accent"
                  style={{ background: 'linear-gradient(90deg, var(--mc-cyan), var(--mc-magenta))' }}
                />
                <DialogHeader className="mc-dialog-header">
                  <div className="min-w-0">
                    <DialogTitle className="text-[color:var(--mc-text-hero)]">Collect Payment</DialogTitle>
                    <DialogDescription className="mc-meta mt-1">
                      Seat {paymentDialogSeat} · {booking.customerName || 'Guest'}
                    </DialogDescription>
                  </div>
                  <div className="ml-auto flex items-start gap-3">
                    <div className="text-right">
                      <div className="mc-section-label">Due</div>
                      <div className="mc-mono text-3xl text-[color:var(--mc-amber)]">${remaining.toFixed(2)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentDialogSeat(null)}
                      className="mc-chip h-8 w-8 justify-center p-0 mc-mono text-xs font-bold text-[color:var(--mc-text-primary)] hover:text-[color:var(--mc-text-hero)]"
                      aria-label="Close collect payment"
                    >
                      X
                    </button>
                  </div>
                </DialogHeader>

                <div className="mc-dialog-body space-y-4">
                  <section className="mc-row p-4">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div>
                        <div className="mc-section-label">Seat {paymentDialogSeat} balance</div>
                        <div className="mc-meta mt-1">
                          Subtotal ${Number(invoice?.subtotal || 0).toFixed(2)} · Tax ${Number(invoice?.tax || 0).toFixed(2)}
                          {(existingTip + newTipVal) > 0 ? ` · Tip $${(existingTip + newTipVal).toFixed(2)}` : ''}
                          {paidSoFar > 0 ? ` · Paid $${paidSoFar.toFixed(2)}` : ''}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="mc-meta-dim">Total with tip</div>
                        <div className="mc-mono text-2xl text-[color:var(--mc-text-hero)]">${totalWithTip.toFixed(2)}</div>
                      </div>
                    </div>
                  </section>

                  {existingPayments.length > 0 && (
                    <section className="space-y-2">
                      <div className="mc-section-label">Already paid</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {existingPayments.map((p, idx) => (
                          <div key={idx} className="mc-row p-3 flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-2 text-sm text-[color:var(--mc-text-primary)]">
                              {p.method === 'CARD' ? <CreditCard className="h-3.5 w-3.5" /> : p.method === 'GIFT_CARD' ? <Gift className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                              {p.method === 'GIFT_CARD' ? 'Gift Card' : p.method === 'CARD' ? 'Card' : p.method === 'COUPON' ? 'Coupon' : 'Cash'}
                            </span>
                            <span className="mc-mono text-[color:var(--mc-green)]">${Number(p.amount).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="space-y-2">
                    <Label className={`mc-section-label ${paymentDialogMethod === null ? 'text-[color:var(--mc-amber)]' : ''}`}>
                      Payment Method
                    </Label>
                    <div className={`grid gap-2 ${baseTotal <= 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                      {methodOptions.map(({ method, label, Icon, tone }) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => {
                            setPaymentDialogMethod(method);
                            if (paymentDialogMethod === 'COUPON') {
                              setPaymentDialogAmount(remaining.toFixed(2));
                            }
                          }}
                          className="mc-chip justify-center h-12"
                          style={{
                            borderColor: paymentDialogMethod === method ? tone : 'var(--mc-divider)',
                            color: paymentDialogMethod === method ? tone : undefined,
                            background: paymentDialogMethod === method ? 'rgba(29, 224, 197, 0.08)' : undefined,
                          }}
                          aria-pressed={paymentDialogMethod === method}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                      {baseTotal <= 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentDialogMethod('COUPON');
                            setPaymentDialogAmount('0.00');
                          }}
                          className="mc-chip justify-center h-12"
                          style={{
                            borderColor: paymentDialogMethod === 'COUPON' ? 'var(--mc-green)' : 'var(--mc-divider)',
                            color: paymentDialogMethod === 'COUPON' ? 'var(--mc-green)' : undefined,
                            background: paymentDialogMethod === 'COUPON' ? 'rgba(95, 214, 146, 0.08)' : undefined,
                          }}
                          aria-pressed={paymentDialogMethod === 'COUPON'}
                        >
                          <Ticket className="h-4 w-4" />
                          Coupon
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="mc-section-label">Amount</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--mc-text-meta)]">$</span>
                          <Input
                            type="number"
                            aria-label="Payment amount"
                            min="0"
                            step="0.01"
                            value={paymentDialogAmount}
                            onChange={e => setPaymentDialogAmount(e.target.value)}
                            disabled={paymentDialogMethod === 'COUPON'}
                            className={`mc-input mc-input-currency w-full text-lg font-semibold ${paymentDialogMethod === 'COUPON' ? 'opacity-50' : ''}`}
                            placeholder="0.00"
                          />
                        </div>
                        {remaining > 0 && (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setPaymentDialogAmount(remaining.toFixed(2))} className="mc-chip justify-center px-3">
                              Full
                            </button>
                            {remaining > 1 && (
                              <button type="button" onClick={() => setPaymentDialogAmount((remaining / 2).toFixed(2))} className="mc-chip justify-center px-3">
                                Half
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="mc-section-label">Tip</Label>
                      <div className="space-y-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--mc-text-meta)]">$</span>
                          <Input
                            type="number"
                            aria-label="Tip amount"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={tipAmountBySeat[paymentDialogSeat] || ''}
                            onChange={(e) => {
                              const seat = paymentDialogSeat!;
                              const val = e.target.value;
                              setTipAmountBySeat({ ...tipAmountBySeat, [seat]: val });
                              const tipNum = parseFloat(val) || 0;
                              const newTotal = baseTotal + existingTip + tipNum;
                              const newRemaining = Math.max(0, Math.round((newTotal - paidSoFar) * 100) / 100);
                              setPaymentDialogAmount(newRemaining.toFixed(2));
                            }}
                            className="mc-input mc-input-currency w-full"
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[10, 15, 18, 20].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => {
                                const seat = paymentDialogSeat!;
                                const inv = invoices.find((i) => i.seatIndex === seat);
                                if (inv) {
                                  const sub = Number(inv.subtotal);
                                  const tipVal = (sub * pct) / 100;
                                  setTipAmountBySeat({ ...tipAmountBySeat, [seat]: tipVal.toFixed(2) });
                                  const newTotal = baseTotal + existingTip + tipVal;
                                  const newRemaining = Math.max(0, Math.round((newTotal - paidSoFar) * 100) / 100);
                                  setPaymentDialogAmount(newRemaining.toFixed(2));
                                }
                              }}
                              className="mc-chip justify-center px-1 text-xs"
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                      {(parseFloat(tipAmountBySeat[paymentDialogSeat] || '0') || 0) > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mc-meta">Tip paid by</span>
                          {(['CARD', 'CASH'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setTipMethodBySeat(prev => ({ ...prev, [paymentDialogSeat!]: m }))}
                              className="mc-chip"
                              style={{
                                borderColor: (tipMethodBySeat[paymentDialogSeat!] || 'CARD') === m ? 'var(--mc-cyan)' : 'var(--mc-divider)',
                                color: (tipMethodBySeat[paymentDialogSeat!] || 'CARD') === m ? 'var(--mc-cyan)' : undefined,
                              }}
                            >
                              {m === 'CARD' ? 'Card' : 'Cash'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                <div className="mc-dialog-footer">
                  <div className="mc-meta">
                    {paymentDialogMethod === null ? 'Select a payment method to continue.' : `Ready to settle by ${selectedPaymentLabel}.`}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentDialogSeat(null)}
                      className="mc-btn"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={submitPayment}
                      className={`mc-btn mc-btn-primary font-bold ${paymentDialogMethod === null ? 'opacity-50 pointer-events-none' : ''}`}
                      disabled={processingPayment === paymentDialogSeat || paymentDialogMethod === null}
                    >
                      {processingPayment === paymentDialogSeat ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                      ) : paymentDialogMethod === null ? (
                        'Select Payment Method'
                      ) : paymentDialogMethod === 'COUPON' ? (
                        <><Ticket className="h-4 w-4" /> Mark Paid by Coupon</>
                      ) : (
                        `Pay $${paymentDialogAmount || '0.00'} by ${selectedPaymentLabel}`
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Receipt Preview Modal */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-md bg-slate-800 text-white border-slate-700">
          <DialogHeader>
            <DialogTitle>Send Receipt</DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose how to send the receipt
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto border border-slate-700 rounded">
            {receiptData && (
              <Receipt
                data={receiptData}
                printMode={receiptMode}
                printingSeatIndex={receiptSeatIndex}
              />
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Delivery Method</Label>
              <RadioGroup value={deliveryMethod} onValueChange={(value) => setDeliveryMethod(value as 'print' | 'email')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="print" id="print" />
                  <Label htmlFor="print" className="text-slate-300 cursor-pointer flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Print
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email" className="text-slate-300 cursor-pointer flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {deliveryMethod === 'print' && (
              <div className="space-y-2">
                <Label className="text-slate-300">Printer Type</Label>
                <RadioGroup value={printerType} onValueChange={(value) => setPrinterType(value as 'thermal' | 'regular')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="thermal" id="thermal" />
                    <Label htmlFor="thermal" className="text-slate-300 cursor-pointer">
                      Thermal Printer (Default)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="regular" id="regular" />
                    <Label htmlFor="regular" className="text-slate-300 cursor-pointer">
                      Regular Printer
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {deliveryMethod === 'email' && (
              <div className="space-y-2">
                <Label htmlFor="email-input" className="text-slate-300">Email Address</Label>
                <Input
                  id="email-input"
                  type="email"
                  placeholder="customer@example.com"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
                {booking?.customerEmail && emailAddress !== booking.customerEmail && (
                  <button
                    onClick={() => setEmailAddress(booking.customerEmail || '')}
                    className="text-xs text-amber-400 hover:text-amber-300"
                  >
                    Use booking email: {booking.customerEmail}
                  </button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseReceiptModal}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Close
            </Button>
            <Button
              onClick={handlePrintFromModal}
              disabled={sendingEmail || (deliveryMethod === 'email' && !emailAddress)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {sendingEmail ? (
                <>Processing...</>
              ) : deliveryMethod === 'email' ? (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Photo Capture Modal */}
      {capturePaymentId && (
        <ReceiptCaptureModal
          paymentId={capturePaymentId}
          mode={captureMode}
          onClose={() => setCapturePaymentId(null)}
          onUploaded={() => {
            setReceiptPhotos(prev => ({ ...prev, [capturePaymentId]: true }));
          }}
        />
      )}

      {/* Cancel Booking Confirmation */}
      <ConfirmDialog
        open={cancelBookingOpen}
        onOpenChange={setCancelBookingOpen}
        title="Cancel Booking"
        description={`Are you sure you want to cancel${booking?.customerName ? ` the booking for ${booking.customerName}` : ' this booking'}? This action cannot be undone.`}
        confirmLabel="Cancel Booking"
        onConfirm={() => {
          setCancelBookingOpen(false);
          updateStatus('cancelled');
        }}
      />

      {/* Cancel Payment Confirmation */}
      <ConfirmDialog
        open={cancelPaymentSeat !== null}
        onOpenChange={(open) => { if (!open) setCancelPaymentSeat(null); }}
        title="Cancel Payment"
        description={`Cancel payment for Seat ${cancelPaymentSeat}? This will mark the invoice as unpaid and remove all payment records for this seat.`}
        confirmLabel="Cancel Payment"
        loading={processingPayment !== null}
        onConfirm={() => {
          if (cancelPaymentSeat !== null) unpayInvoice(cancelPaymentSeat);
        }}
      />

      {/* Remove Order Item Confirmation */}
      <ConfirmDialog
        open={removeOrderId !== null}
        onOpenChange={(open) => { if (!open) setRemoveOrderId(null); }}
        title="Remove Item"
        description={`Remove "${removeOrderName}" from this booking? The invoice total will be recalculated.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removeOrderId) {
            removeOrderItem(removeOrderId);
            setRemoveOrderId(null);
          }
        }}
      />
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{label}</p>
      <div className="text-sm text-slate-200 font-semibold">{value}</div>
    </div>
  );
}
