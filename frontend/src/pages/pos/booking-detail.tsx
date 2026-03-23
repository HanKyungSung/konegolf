import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Users, Plus, Minus, Trash2, Printer, Edit, CheckCircle2, AlertCircle, CreditCard, Banknote, Gift, User, Clock, Calendar, Mail, X, Ticket, Loader2 } from 'lucide-react';
import Receipt from '../../components/Receipt';
import { VENUE_TIMEZONE } from '@/lib/timezone';
import { 
  getBooking, 
  updateBookingStatus as apiUpdateBookingStatus,
  updateBookingPlayers as apiUpdateBookingPlayers,
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
  booked: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-300 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30'
};

const paymentStatusStyles: Record<string, string> = {
  UNPAID: 'bg-red-500/20 text-red-300 border-red-500/30',
  BILLED: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PAID: 'bg-green-500/20 text-green-300 border-green-500/30'
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
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [selectedOrderItem, setSelectedOrderItem] = useState<OrderItem | null>(null);
  const [selectedSeatsForSplit, setSelectedSeatsForSplit] = useState<number[]>([]);
  const [showTaxEditDialog, setShowTaxEditDialog] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState<string>('');
  const [printingSeat, setPrintingSeat] = useState<number | null>(null);
  const [expandedSeats, setExpandedSeats] = useState<string[]>([]);
  
  // Payment state
  const [tipAmountBySeat, setTipAmountBySeat] = useState<Record<number, string>>({});
  const [tipMethodBySeat, setTipMethodBySeat] = useState<Record<number, 'CARD' | 'CASH'>>({});
  const [processingPayment, setProcessingPayment] = useState<number | null>(null);
  
  // Collect payment dialog state
  const [paymentDialogSeat, setPaymentDialogSeat] = useState<number | null>(null);
  const [paymentDialogAmount, setPaymentDialogAmount] = useState<string>('');
  const [paymentDialogMethod, setPaymentDialogMethod] = useState<'CARD' | 'CASH' | 'GIFT_CARD' | null>(null);

  // Receipt modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptMode, setReceiptMode] = useState<'full' | 'seat'>('full');
  const [receiptSeatIndex, setReceiptSeatIndex] = useState<number | undefined>(undefined);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'print' | 'email'>('print');
  const [printerType, setPrinterType] = useState<'thermal' | 'regular'>('thermal');
  const [emailAddress, setEmailAddress] = useState<string>('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  const seatsInitialized = React.useRef(false);
  const seatRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
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
        
        // Only auto-expand seats on initial load
        if (!seatsInitialized.current) {
          setExpandedSeats(Array.from({ length: bookingData.players }, (_, i) => `seat-${i + 1}`));
          seatsInitialized.current = true;
        }
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
    
    invoicesData.forEach((invoice) => {
      payments[invoice.seatIndex] = {
        status: invoice.status,
        method: invoice.paymentMethod || undefined,
        tip: invoice.tip ? parseFloat(String(invoice.tip)) : undefined,
        total: parseFloat(String(invoice.totalAmount)) || 0,
        payments: invoice.payments || [],
      };
    });
    
    setSeatPayments(payments);
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
    
    if (!confirm(`Cancel payment for Seat ${seat}? This will mark the invoice as unpaid.`)) {
      return;
    }

    setProcessingPayment(seat);

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
      setNumberOfSeats(Math.max(1, newSeatCount));
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
    // Always calculate dynamically with current tax rate
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

  return (
    <div ref={scrollContainerRef} className="w-full h-full flex flex-col overflow-y-auto bg-gradient-to-br from-slate-900 via-slate-800 to-black">
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

      <main className="flex-1 px-3 sm:px-6 py-4 sm:py-8 space-y-6 max-w-[1800px] mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
              Booking Details
            </h1>
            <p className="text-slate-400 text-sm mt-1">ID: {booking.id}</p>
          </div>
          <div className="flex items-center gap-2">
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
                className="bg-slate-700 hover:bg-slate-600 text-white rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Management */}
          <div className="lg:col-span-2 space-y-4">
            {/* Room Card */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-2xl flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${roomColors[booking.roomId]}`} />
                  {roomColor}
                </CardTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-amber-400">Name:</span>
                    <span>{booking.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-amber-400">Phone:</span>
                    <span>{booking.customerPhone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-amber-400">Booking Date:</span>
                    <span>{booking.date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-amber-400">Start Time:</span>
                    <span>
                      {booking.time} ({booking.duration}h)
                    </span>
                  </div>
                  {booking.customerEmail && (
                    <div className="flex items-center gap-2 text-slate-300 col-span-2">
                      <span className="text-amber-400">Email:</span>
                      <span className="truncate">{booking.customerEmail}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-amber-400">Players:</span>
                    <span>{booking.players} players</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-amber-400">Date of Birth:</span>
                    <span>{booking.user?.dateOfBirth || 'N/A'}</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Seat Management Card */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-400" />
                  Seat Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
                  <span className="text-white font-medium">Number of Seats</span>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={handleReduceSeats}
                      disabled={!canReduceSeats()}
                      className="h-10 w-10 p-0 bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      <Minus className="h-5 w-5" />
                    </Button>
                    <span className="text-2xl font-bold text-amber-400 w-12 text-center">{numberOfSeats}</span>
                    <Button
                      size="sm"
                      onClick={async () => {
                        const newCount = Math.min(MAX_SEATS, numberOfSeats + 1);
                        if (booking) {
                          try {
                            await apiUpdateBookingPlayers(booking.id, newCount);
                            setNumberOfSeats(newCount);
                          } catch (err) {
                            alert(`Failed to update seats: ${err instanceof Error ? err.message : 'Unknown error'}`);
                          }
                        }
                      }}
                      disabled={numberOfSeats >= MAX_SEATS}
                      className="h-10 w-10 p-0 bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Seat Panels with Order Items and Invoices */}
            <Accordion type="multiple" value={expandedSeats} onValueChange={setExpandedSeats} className="space-y-4">
              {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => {
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

                return (
                  <div
                    key={seat}
                    ref={(el) => {
                      seatRefs.current[seat] = el;
                    }}
                  >
                    <AccordionItem
                      value={`seat-${seat}`}
                      className="border border-slate-700 rounded-lg bg-slate-800/50 overflow-hidden"
                    >
                    <AccordionTrigger className="px-3 sm:px-6 py-3 sm:py-4 hover:no-underline hover:bg-slate-800/80">
                      <div className="flex flex-wrap items-center justify-between w-full pr-4 gap-2">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className={`w-4 h-4 rounded-full ${seatColors[seat - 1]}`} />
                          <span className="font-bold text-white text-base sm:text-lg">Seat {seat}</span>
                          <Badge variant="outline" className="text-slate-300 border-slate-600 text-xs">
                            {regularItems.length} items
                          </Badge>
                          {discountItems.length > 0 && (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-xs">
                              {discountItems.length} discount{discountItems.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReceiptModal('seat', seat);
                            }}
                            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                              loadingReceipt || seatItems.length === 0
                                ? 'opacity-50 pointer-events-none'
                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-amber-500/50 cursor-pointer'
                            }`}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </div>
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
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 sm:px-6 pb-4 sm:pb-6">
                      <div className="space-y-4 pt-2">
                        {/* Order Items */}
                        {regularItems.length === 0 && discountItems.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 bg-slate-900/30 rounded-lg">
                            <p>No items ordered yet</p>
                            <p className="text-sm mt-1">Add items from the menu</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-slate-300 mb-2">Order Items</h4>
                            {regularItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700"
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
                                  {!isPaid && (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleMoveItem(item)}
                                        className="h-8 px-2 bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/30 text-blue-400 hidden sm:inline-flex"
                                        title="Move to another seat"
                                      >
                                        Move
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleMoveItem(item)}
                                        className="h-8 w-8 p-0 bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/30 text-blue-400 sm:hidden"
                                        title="Move to another seat"
                                      >
                                        <MoveRight className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSplitItem(item)}
                                        className="h-8 px-2 bg-purple-500/20 border-purple-500/50 hover:bg-purple-500/30 text-purple-400 hidden sm:inline-flex"
                                        title="Split to multiple seats"
                                      >
                                        Split
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSplitItem(item)}
                                        className="h-8 w-8 p-0 bg-purple-500/20 border-purple-500/50 hover:bg-purple-500/30 text-purple-400 sm:hidden"
                                        title="Split to multiple seats"
                                      >
                                        <Split className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateItemQuantity(item.id, -1)}
                                        className="h-8 w-8 p-0 bg-slate-700 border-slate-600 hover:bg-slate-600"
                                      >
                                        <Minus className="h-3 w-3 text-white" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateItemQuantity(item.id, 1)}
                                        className="h-8 w-8 p-0 bg-slate-700 border-slate-600 hover:bg-slate-600"
                                      >
                                        <Plus className="h-3 w-3 text-white" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => removeOrderItem(item.id)}
                                        className="h-8 w-8 p-0 bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
                                      >
                                      <Trash2 className="h-3 w-3 text-red-400" />
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
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
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
                                  {!isPaid && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => removeOrderItem(item.id)}
                                      className="h-6 w-6 p-0 bg-red-500/20 border-red-500/50 hover:bg-red-500/30"
                                    >
                                      <Trash2 className="h-3 w-3 text-red-400" />
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
                          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
                            <div className="flex items-center gap-2 text-green-400 mb-2">
                              <CheckCircle2 className="h-5 w-5" />
                              <span className="font-semibold">PAID</span>
                            </div>
                            <div className="text-sm text-slate-300 space-y-1">
                              {payment?.payments && payment.payments.length > 0 ? (
                                <>
                                  {payment.payments.length > 1 && <p className="font-medium text-slate-200">Payment History:</p>}
                                  {payment.payments.map((p, idx) => (
                                    <p key={idx} className="inline-flex items-center gap-1 ml-2">
                                      {p.method === 'CARD' ? <CreditCard className="h-3 w-3" /> : p.method === 'GIFT_CARD' ? <Gift className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
                                      {p.method === 'GIFT_CARD' ? 'Gift Card' : p.method === 'CARD' ? 'Card' : 'Cash'}: ${Number(p.amount).toFixed(2)}
                                    </p>
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
                            <Button
                              onClick={() => unpayInvoice(seat)}
                              disabled={processingPayment === seat}
                              variant="outline"
                              className="w-full bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400 hover:text-red-300"
                            >
                              {processingPayment === seat ? 'Processing...' : 'Cancel Payment'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                            {/* Show existing partial payments if any */}
                            {(() => {
                              const invoice = invoices.find((inv) => inv.seatIndex === seat);
                              const existingPayments = invoice?.payments || [];
                              const paidSoFar = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                              const seatTotal = subtotal + tax;
                              const remaining = Math.max(0, Math.round((seatTotal - paidSoFar) * 100) / 100);

                              return (
                                <>
                                  {existingPayments.length > 0 && (
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Payments Received</h4>
                                      {existingPayments.map((p, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-sm bg-slate-800/70 rounded-md px-3 py-2">
                                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                                            {p.method === 'CARD' ? <CreditCard className="h-3.5 w-3.5" /> : p.method === 'GIFT_CARD' ? <Gift className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                                            {p.method === 'GIFT_CARD' ? 'Gift Card' : p.method === 'CARD' ? 'Card' : 'Cash'}
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

                                  <Button
                                    onClick={() => {
                                      setPaymentDialogSeat(seat);
                                      setPaymentDialogAmount(remaining > 0 ? remaining.toFixed(2) : seatTotal.toFixed(2));
                                      setPaymentDialogMethod(null);
                                      setTipMethodBySeat(prev => ({ ...prev, [seat]: 'CARD' }));
                                    }}
                                    disabled={subtotal === 0}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12"
                                  >
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    {existingPayments.length > 0 
                                      ? `Add Payment ($${remaining.toFixed(2)} remaining)` 
                                      : `Collect Payment — $${seatTotal.toFixed(2)}`}
                                  </Button>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  </div>
                );
              })}
            </Accordion>
          </div>

          {/* Right Column - Info & Menu */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {/* Quick Actions */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {booking.bookingStatus?.toUpperCase() === 'COMPLETED' ? (
                  <Button
                    onClick={handleReopenBooking}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Reopen Booking
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleCompleteBooking}
                      className="w-full bg-green-500 hover:bg-green-600 text-white"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Complete Booking
                    </Button>
                    <Button
                      onClick={() => updateStatus('cancelled')}
                      variant="outline"
                      className="w-full border-red-500 text-red-400 hover:bg-red-500/10"
                    >
                      Cancel Booking
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payment Summary */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Payment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-300">
                    <span>Seats Paid</span>
                    <span className="font-semibold">
                      {getPaidSeatsCount()} / {numberOfSeats}
                    </span>
                  </div>
                  <Progress value={getPaymentProgress()} className="h-2 bg-slate-700">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${getPaymentProgress()}%` }}
                    />
                  </Progress>
                </div>

                <Separator className="bg-slate-700" />

                {/* Per-Seat Status */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Seat Status</h4>
                  {Array.from({ length: numberOfSeats }, (_, i) => i + 1).map((seat) => {
                    const isPaid = isSeatPaid(seat);
                    const payment = getSeatPayment(seat);
                    return (
                      <div key={seat} className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${seatColors[seat - 1]}`} />
                          <span className="text-sm text-white">Seat {seat}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPaid ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-400" />
                              <span className="text-xs text-green-400 font-semibold">PAID</span>
                              <span className="text-xs text-slate-400 font-mono">${(parseFloat(String(payment?.total || 0)) || 0).toFixed(2)}</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4 text-amber-400" />
                              <span className="text-xs text-amber-400 font-semibold">UNPAID</span>
                              <span className="text-xs text-slate-400 font-mono">
                                ${(calculateSeatTotal(seat) + (parseFloat(tipAmountBySeat[seat] || '0') || 0)).toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator className="bg-slate-700" />

                {/* Totals */}
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between text-white font-bold text-base">
                    <span>Total Collected</span>
                    <span className="text-green-400">${getTotalPaid().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300 text-xs">
                    <span>Total Due</span>
                    <span>${getTotalDue().toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Menu */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Menu</CardTitle>
                <CardDescription className="text-slate-400">Click items to add to order</CardDescription>
              </CardHeader>
              <CardContent>
                {menu.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-sm">Menu not available</p>
                  </div>
                ) : (
                  <Tabs defaultValue="hours" className="space-y-4">
                    <div className="overflow-x-auto -mx-2 px-2">
                      <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-5 bg-slate-900/50">
                        <TabsTrigger value="hours">Hours</TabsTrigger>
                        <TabsTrigger value="food">Food</TabsTrigger>
                        <TabsTrigger value="drinks">Drinks</TabsTrigger>
                        <TabsTrigger value="appetizers">Appetizers</TabsTrigger>
                        <TabsTrigger value="desserts">Desserts</TabsTrigger>
                      </TabsList>
                    </div>
                    
                    {/* Custom Item Button */}
                    <div className="mt-4">
                      <Button
                        onClick={() => setShowCustomItemDialog(true)}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-6 text-lg shadow-lg"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Custom Item
                      </Button>
                    </div>

                    {/* Discount Button */}
                    <div className="mt-2">
                      <Button
                        onClick={() => setShowDiscountDialog(true)}
                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-6 text-lg shadow-lg"
                      >
                        <Minus className="w-5 h-5 mr-2" />
                        Discount
                      </Button>
                    </div>

                    {/* Apply Coupon Button */}
                    <div className="mt-2">
                      <Button
                        onClick={() => {
                          setCouponCode('');
                          setCouponData(null);
                          setShowCouponDialog(true);
                        }}
                        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-semibold py-6 text-lg shadow-lg"
                      >
                        <Ticket className="w-5 h-5 mr-2" />
                        Apply Coupon
                      </Button>
                    </div>

                    {(['hours', 'food', 'drinks', 'appetizers', 'desserts'] as const).map((category) => (
                      <TabsContent key={category} value={category}>
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {getItemsByCategory(category).map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleMenuItemClick(item)}
                              className="w-full flex flex-col items-start p-4 border-2 border-slate-700 rounded-lg hover:bg-amber-500/10 hover:border-amber-500 bg-slate-800/80 transition-all text-left group"
                            >
                              <h4 className="font-bold text-white text-base mb-1 group-hover:text-amber-400 transition-colors">
                                {item.name}
                              </h4>
                              <p className="text-xs text-slate-400 mb-2 line-clamp-2">{item.description}</p>
                              <p className="text-amber-400 font-bold text-lg">${item.price.toFixed(2)}</p>
                            </button>
                          ))}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </CardContent>
            </Card>


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
        <DialogContent className="max-w-md bg-slate-800 text-white border-slate-700">
          <DialogHeader>
            <DialogTitle>Collect Payment — Seat {paymentDialogSeat}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select payment method and enter amount
            </DialogDescription>
          </DialogHeader>
          {paymentDialogSeat !== null && (() => {
            const invoice = invoices.find((inv) => inv.seatIndex === paymentDialogSeat);
            const existingPayments = invoice?.payments || [];
            const paidSoFar = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const baseTotal = Number(invoice?.subtotal || 0) + Number(invoice?.tax || 0);
            const existingTip = Number(invoice?.tip || 0);
            const newTipVal = parseFloat(tipAmountBySeat[paymentDialogSeat] || '0') || 0;
            const totalWithTip = baseTotal + existingTip + newTipVal;
            const remaining = Math.max(0, Math.round((totalWithTip - paidSoFar) * 100) / 100);

            return (
              <div className="space-y-4">
                {/* Existing payments */}
                {existingPayments.length > 0 && (
                  <div className="space-y-2 p-3 bg-slate-900/60 rounded-lg border border-slate-700">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Payments Received</h4>
                    {existingPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          {p.method === 'CARD' ? <CreditCard className="h-3.5 w-3.5" /> : p.method === 'GIFT_CARD' ? <Gift className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
                          {p.method === 'GIFT_CARD' ? 'Gift Card' : p.method === 'CARD' ? 'Card' : 'Cash'}
                        </span>
                        <span className="text-emerald-400 font-medium">${Number(p.amount).toFixed(2)}</span>
                      </div>
                    ))}
                    <Separator className="bg-slate-600" />
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-slate-400">Paid</span>
                      <span className="text-emerald-400">${paidSoFar.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Invoice breakdown */}
                <div className="space-y-1 p-3 bg-slate-900/60 rounded-lg border border-slate-700 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal</span>
                    <span>${Number(invoice?.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Tax</span>
                    <span>${Number(invoice?.tax || 0).toFixed(2)}</span>
                  </div>
                  {(existingTip > 0 || newTipVal > 0) && (
                    <div className="flex justify-between text-slate-300">
                      <span>Tip</span>
                      <span>${(existingTip + newTipVal).toFixed(2)}</span>
                    </div>
                  )}
                  <Separator className="bg-slate-600" />
                  <div className="flex justify-between font-bold text-white">
                    <span>Total</span>
                    <span className="text-amber-400">${totalWithTip.toFixed(2)}</span>
                  </div>
                </div>

                {/* Remaining balance */}
                <div className="flex justify-between items-center p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <span className="text-amber-300 font-medium">Remaining</span>
                  <span className="text-amber-400 font-bold text-lg">${remaining.toFixed(2)}</span>
                </div>

                {/* Tip Input */}
                <div className="space-y-2">
                  <Label className="text-slate-300 text-sm">
                    Add Tip (optional)
                    {existingTip > 0 && <span className="text-slate-500 ml-1">(${existingTip.toFixed(2)} already added)</span>}
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={tipAmountBySeat[paymentDialogSeat] || ''}
                        onChange={(e) => {
                          const seat = paymentDialogSeat!;
                          const val = e.target.value;
                          setTipAmountBySeat({ ...tipAmountBySeat, [seat]: val });
                          // Auto-update payment amount to match new remaining
                          const tipNum = parseFloat(val) || 0;
                          const newTotal = baseTotal + existingTip + tipNum;
                          const newRemaining = Math.max(0, Math.round((newTotal - paidSoFar) * 100) / 100);
                          setPaymentDialogAmount(newRemaining.toFixed(2));
                        }}
                        className="pl-7 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                      />
                    </div>
                    {[10, 15, 18, 20].map((pct) => (
                      <Button
                        key={pct}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const seat = paymentDialogSeat!;
                          const inv = invoices.find((i) => i.seatIndex === seat);
                          if (inv) {
                            const sub = Number(inv.subtotal);
                            const tipVal = (sub * pct) / 100;
                            setTipAmountBySeat({ ...tipAmountBySeat, [seat]: tipVal.toFixed(2) });
                            // Auto-update payment amount
                            const newTotal = baseTotal + existingTip + tipVal;
                            const newRemaining = Math.max(0, Math.round((newTotal - paidSoFar) * 100) / 100);
                            setPaymentDialogAmount(newRemaining.toFixed(2));
                          }
                        }}
                        className="bg-slate-700 border-slate-600 hover:bg-amber-500 hover:text-black text-white text-xs px-2"
                      >
                        {pct}%
                      </Button>
                    ))}
                  </div>
                  {/* Tip Method Toggle — only show when a tip is entered */}
                  {(parseFloat(tipAmountBySeat[paymentDialogSeat] || '0') || 0) > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-400">Tip paid by:</span>
                      {(['CARD', 'CASH'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setTipMethodBySeat(prev => ({ ...prev, [paymentDialogSeat!]: m }))}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            (tipMethodBySeat[paymentDialogSeat!] || 'CARD') === m
                              ? 'bg-amber-500 text-black'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {m === 'CARD' ? '💳 Card' : '💵 Cash'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment Method */}
                <div className="space-y-2">
                  <Label className={`text-sm font-semibold ${paymentDialogMethod === null ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
                    {paymentDialogMethod === null ? '⚠️ Select Payment Method' : 'Payment Method'}
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([['CARD', 'Card', CreditCard], ['CASH', 'Cash', Banknote], ['GIFT_CARD', 'Gift Card', Gift]] as const).map(([method, label, Icon]) => (
                      <div
                        key={method}
                        onClick={() => setPaymentDialogMethod(method)}
                        className={`flex items-center justify-center gap-1.5 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          paymentDialogMethod === method
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                        }`}
                      >
                        <Icon className="h-4 w-4 text-white" />
                        <span className="text-white font-medium text-sm">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label className="text-slate-300 text-sm">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={paymentDialogAmount}
                      onChange={e => setPaymentDialogAmount(e.target.value)}
                      className="pl-7 bg-slate-700 border-slate-600 text-white text-lg font-medium placeholder:text-slate-500"
                      placeholder="0.00"
                    />
                  </div>
                  {/* Quick amount buttons */}
                  {remaining > 0 && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPaymentDialogAmount(remaining.toFixed(2))}
                        className="flex-1 bg-slate-700 border-slate-600 hover:bg-amber-500 hover:text-black text-white text-xs"
                      >
                        Full (${remaining.toFixed(2)})
                      </Button>
                      {remaining > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPaymentDialogAmount((remaining / 2).toFixed(2))}
                          className="flex-1 bg-slate-700 border-slate-600 hover:bg-amber-500 hover:text-black text-white text-xs"
                        >
                          Half (${(remaining / 2).toFixed(2)})
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={async () => {
                      if (!booking || paymentDialogSeat === null) return;
                      const seat = paymentDialogSeat;
                      setProcessingPayment(seat);
                      try {
                        const inv = invoices.find((i) => i.seatIndex === seat);
                        if (!inv) throw new Error('No invoice found');
                        const amount = parseFloat(paymentDialogAmount);
                        if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount');
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

                        // Reset tip after payment that includes it
                        if (tipVal > 0) {
                          setTipAmountBySeat({ ...tipAmountBySeat, [seat]: '' });
                          setTipMethodBySeat(prev => { const n = { ...prev }; delete n[seat]; return n; });
                        }

                        if (result.remaining <= 0.01) {
                          // Fully paid — close dialog and reload
                          setPaymentDialogSeat(null);
                          await loadData();
                        } else {
                          // Still remaining — update amount and stay open
                          setPaymentDialogAmount(result.remaining.toFixed(2));
                          // Reload to refresh invoice data in background
                          await loadData();
                        }
                      } catch (err) {
                        alert(err instanceof Error ? err.message : String(err));
                      } finally {
                        setProcessingPayment(null);
                      }
                    }}
                    className={`flex-1 font-bold h-12 ${paymentDialogMethod === null ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-black'}`}
                    disabled={processingPayment === paymentDialogSeat || paymentDialogMethod === null}
                  >
                    {processingPayment === paymentDialogSeat ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                    ) : paymentDialogMethod === null ? (
                      'Select Payment Method'
                    ) : (
                      `Pay $${paymentDialogAmount || '0.00'} by ${paymentDialogMethod === 'GIFT_CARD' ? 'Gift Card' : paymentDialogMethod === 'CARD' ? 'Card' : 'Cash'}`
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPaymentDialogSeat(null)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    Close
                  </Button>
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
