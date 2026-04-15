import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ImageOff,
} from 'lucide-react';
import { useAuth } from '../../../hooks/use-auth';

const getApiBase = () => process.env.REACT_APP_API_BASE || 'http://localhost:8080';

interface AnalysisData {
  matchStatus: string;
  extractedAmount: number | null;
  cardLast4: string | null;
  cardType: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  terminalId: string | null;
  approvalCode: string | null;
  mismatchReason: string | null;
  analyzedAt: string;
  modelUsed: string | null;
}

interface ReceiptAnalysisItem {
  paymentId: string;
  method: string;
  amount: number;
  receiptPath: string | null;
  createdAt: string;
  booking: {
    id: string;
    customerName: string;
    startTime: string;
    roomName: string;
  };
  seatIndex: number;
  analysis: AnalysisData | null;
}

interface Summary {
  total: number;
  matched: number;
  mismatch: number;
  unreadable: number;
  pending: number;
  analyzing: number;
  noReceipt: number;
  totalAmount: string;
  matchedAmount: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Halifax',
  });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'MATCHED':
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
          <CheckCircle2 className="w-3 h-3" /> Matched
        </Badge>
      );
    case 'MISMATCH':
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
          <XCircle className="w-3 h-3" /> Mismatch
        </Badge>
      );
    case 'UNREADABLE':
      return (
        <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 gap-1">
          <AlertCircle className="w-3 h-3" /> Unreadable
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
          <Clock className="w-3 h-3" /> Pending
        </Badge>
      );
    case 'ANALYZING':
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30 gap-1">
          <ImageOff className="w-3 h-3" /> No Receipt
        </Badge>
      );
  }
}

export default function ReceiptAnalysisPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [date, setDate] = useState(() => {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/Halifax' }))
      .toISOString()
      .slice(0, 10);
  });
  const [items, setItems] = useState<ReceiptAnalysisItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`${getApiBase()}/api/receipt-analysis?date=${date}`, { credentials: 'include' }),
        fetch(`${getApiBase()}/api/receipt-analysis/summary?startDate=${date}&endDate=${date}`, {
          credentials: 'include',
        }),
      ]);

      if (listRes.ok) {
        const data = await listRes.json();
        setItems(data);
      }
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch receipt analysis data', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchData();
  }, [fetchData, user]);

  const handleReanalyze = async (paymentId: string) => {
    setReanalyzing(paymentId);
    try {
      const res = await fetch(`${getApiBase()}/api/receipt-analysis/${paymentId}/reanalyze`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        // Re-fetch after a short delay to let analysis start
        setTimeout(fetchData, 2000);
      }
    } catch (err) {
      console.error('Re-analysis failed', err);
    } finally {
      setReanalyzing(null);
    }
  };

  const changeDate = (delta: number) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <p>Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Admin
          </Button>
          <h1 className="text-2xl font-bold">Receipt Analysis</h1>
        </div>

        {/* Date Nav */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
          />
          <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-slate-400 font-normal">Total</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-white">{summary.total}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-emerald-500/30">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-emerald-400 font-normal">Matched</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-emerald-400">{summary.matched}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-red-500/30">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-red-400 font-normal">Mismatch</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-red-400">{summary.mismatch}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-500/30">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-slate-400 font-normal">Unreadable</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-slate-400">{summary.unreadable}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-amber-500/30">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-amber-400 font-normal">Pending</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-amber-400">{summary.pending}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-blue-500/30">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-blue-400 font-normal">Analyzing</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-blue-400">{summary.analyzing || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-600/30">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-slate-500 font-normal">No Receipt</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold text-slate-500">{summary.noReceipt}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            No card/gift card payments found for this date.
          </div>
        ) : (
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3 text-right">System $</th>
                  <th className="px-4 py-3 text-right">Receipt $</th>
                  <th className="px-4 py-3">Card</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {items.map((item) => (
                  <React.Fragment key={item.paymentId}>
                    <tr
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() =>
                        setExpandedId(expandedId === item.paymentId ? null : item.paymentId)
                      }
                    >
                      <td className="px-4 py-3 text-sm">{formatTime(item.createdAt)}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {item.booking.customerName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {item.booking.roomName} · S{item.seatIndex}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        ${item.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {item.analysis?.extractedAmount != null
                          ? `$${item.analysis.extractedAmount.toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {item.analysis?.cardLast4 ? (
                          <span className="font-mono">
                            {item.analysis.cardType ? `${item.analysis.cardType} ` : ''}
                            ····{item.analysis.cardLast4}
                          </span>
                        ) : (
                          <span className="text-slate-600">{item.method}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            !item.receiptPath
                              ? 'NO_RECEIPT'
                              : item.analysis?.matchStatus || 'PENDING'
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        {item.receiptPath && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={reanalyzing === item.paymentId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReanalyze(item.paymentId);
                            }}
                          >
                            {reanalyzing === item.paymentId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {/* Expanded Details */}
                    {expandedId === item.paymentId && item.analysis && (
                      <tr className="bg-slate-800/30">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-slate-500 block">Card Type</span>
                              <span>{item.analysis.cardType || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Card Last 4</span>
                              <span className="font-mono">
                                {item.analysis.cardLast4 || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Receipt Date</span>
                              <span>{item.analysis.transactionDate || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Receipt Time</span>
                              <span>{item.analysis.transactionTime || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Terminal ID</span>
                              <span className="font-mono">
                                {item.analysis.terminalId || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Approval Code</span>
                              <span className="font-mono">
                                {item.analysis.approvalCode || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Model</span>
                              <span>{item.analysis.modelUsed || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Analyzed At</span>
                              <span>
                                {new Date(item.analysis.analyzedAt).toLocaleString('en-US', {
                                  timeZone: 'America/Halifax',
                                })}
                              </span>
                            </div>
                            {item.analysis.mismatchReason && (
                              <div className="col-span-full">
                                <span className="text-red-400 block">Mismatch Reason</span>
                                <span className="text-red-300">
                                  {item.analysis.mismatchReason}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
