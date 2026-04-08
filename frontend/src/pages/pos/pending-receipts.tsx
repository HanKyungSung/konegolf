import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { getPendingReceipts, PendingReceipt } from '@/services/pos-api';
import ReceiptCaptureModal from './receipt-capture-modal';

interface PendingReceiptsPageProps {
  onBack: () => void;
}

export default function PendingReceiptsPage({ onBack }: PendingReceiptsPageProps) {
  const [receipts, setReceipts] = useState<PendingReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'America/Halifax' });
  });
  const [capturePaymentId, setCapturePaymentId] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPendingReceipts(selectedDate);
      setReceipts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const navigateDate = (direction: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + direction);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Halifax',
    });
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-300 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-5 h-5 text-amber-400" />
            Pending Receipts
          </h1>
          <div className="w-16" />
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-center gap-4 mt-3">
          <button onClick={() => navigateDate(-1)} className="p-2 text-slate-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-slate-300 min-w-[120px] text-center">
            {formatDisplayDate(selectedDate)}
          </span>
          <button onClick={() => navigateDate(1)} className="p-2 text-slate-400 hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-lg mx-auto space-y-3">
        {/* Counter */}
        <div className="text-center mb-4">
          {!loading && (
            <span className={`text-2xl font-bold ${receipts.length === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {receipts.length}
            </span>
          )}
          <span className="text-slate-400 text-sm ml-2">
            {receipts.length === 0 ? 'All caught up!' : 'remaining'}
          </span>
        </div>

        {loading && (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        )}

        {error && (
          <div className="text-center py-8 text-red-400">{error}</div>
        )}

        {!loading && receipts.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-slate-400">No pending receipts for this day</p>
          </div>
        )}

        {receipts.map((receipt) => (
          <div
            key={receipt.paymentId}
            className="bg-slate-800 rounded-lg border border-slate-700 p-4 flex items-center justify-between"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span>{receipt.booking.roomName}</span>
                <span>•</span>
                <span>{formatTime(receipt.booking.startTime)}</span>
              </div>
              <div className="font-medium">{receipt.booking.customerName}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">💳 {receipt.method === 'GIFT_CARD' ? 'Gift Card' : 'Card'}</span>
                <span className="text-amber-400 font-medium">${receipt.amount.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={() => setCapturePaymentId(receipt.paymentId)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition-colors"
            >
              <Camera className="w-4 h-4" />
              Add
            </button>
          </div>
        ))}
      </div>

      {/* Capture modal */}
      {capturePaymentId && (
        <ReceiptCaptureModal
          paymentId={capturePaymentId}
          onClose={() => setCapturePaymentId(null)}
          onUploaded={loadReceipts}
        />
      )}
    </div>
  );
}
