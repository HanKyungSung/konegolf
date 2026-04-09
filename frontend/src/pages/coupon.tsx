import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = process.env.REACT_APP_API_BASE || 'http://localhost:8080';

interface CouponData {
  code: string;
  type: string;
  typeName: string;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  description: string;
  discountAmount: number;
  expiresAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

const statusConfig = {
  ACTIVE: {
    icon: '✅',
    label: 'Active',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    message: 'Show this code or QR to staff at K one Golf to redeem.',
  },
  REDEEMED: {
    icon: '✔️',
    label: 'Redeemed',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10 border-slate-500/30',
    message: 'This coupon has already been used.',
  },
  EXPIRED: {
    icon: '⚠️',
    label: 'Expired',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
    message: 'This coupon has expired.',
  },
};

const typeEmoji: Record<string, string> = {
  BIRTHDAY: '🎂',
  LOYALTY: '⭐',
  CUSTOM: '🎟️',
  VIP: '👑',
  APOLOGY: '💐',
};

export default function CouponPage() {
  const { code } = useParams<{ code: string }>();
  const [coupon, setCoupon] = useState<CouponData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    fetch(`${API}/api/coupons/public/${code}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Coupon not found');
        return r.json();
      })
      .then(setCoupon)
      .catch(() => setError('Coupon not found'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (error || !coupon) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl border border-slate-700">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-white mb-2">Coupon Not Found</h1>
          <p className="text-slate-400 text-sm">
            The coupon code <span className="font-mono text-amber-400">{code}</span> does not exist or may have been removed.
          </p>
          <Link to="/" className="inline-block mt-6 text-sm text-amber-400 hover:text-amber-300 transition-colors">
            ← Back to K one Golf
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[coupon.status];
  const emoji = typeEmoji[coupon.typeName] || '🎟️';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl max-w-sm w-full shadow-xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-yellow-500 p-6 text-center">
          <h1 className="text-2xl font-bold text-white tracking-wide">K ONE GOLF</h1>
          <p className="text-amber-100/90 text-sm mt-1">Coupon</p>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-5">
          {/* Type badge */}
          <div className="inline-flex items-center gap-2 bg-slate-700/50 px-4 py-1.5 rounded-full">
            <span className="text-lg">{emoji}</span>
            <span className="text-sm font-medium text-slate-300">{coupon.type}</span>
          </div>

          {/* Code */}
          <div className="bg-slate-900/50 border-2 border-dashed border-amber-500/40 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Coupon Code</p>
            <p className="text-3xl font-extrabold text-white tracking-[3px]">{coupon.code}</p>
          </div>

          {/* Description & Value */}
          <div>
            <p className="text-base font-semibold text-slate-200">{coupon.description}</p>
            <p className="text-sm text-slate-400 mt-1">
              Value:{' '}
              <span className="text-amber-400 font-bold">
                {coupon.typeName === 'birthday' || coupon.typeName === 'loyalty'
                  ? '1 Hour Free (Tax Included)'
                  : `$${coupon.discountAmount.toFixed(2)}`}
              </span>
            </p>
          </div>

          {/* Status */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${status.bg}`}>
            <span className="text-lg">{status.icon}</span>
            <span className={`font-semibold ${status.color}`}>{status.label}</span>
          </div>

          {/* Message */}
          <p className="text-sm text-slate-400">{status.message}</p>

          {/* Dates */}
          <div className="space-y-1 text-xs text-slate-500 pt-2 border-t border-slate-700">
            <p>Issued: {new Date(coupon.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            {coupon.expiresAt && (
              <p>Expires: {new Date(coupon.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            )}
            {coupon.redeemedAt && (
              <p>Redeemed: {new Date(coupon.redeemedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 text-center">
          <Link to="/" className="text-xs text-slate-500 hover:text-amber-400 transition-colors">
            konegolf.ca
          </Link>
        </div>
      </div>
    </div>
  );
}
