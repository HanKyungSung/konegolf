import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clockIn, clockOut, checkClockStatus } from '@/services/pos-api';
import type { ClockInResponse, ClockOutResponse, ClockStatusResponse } from '@/services/pos-api';

type Phase = 'pin' | 'status' | 'result';

interface ResultData {
  type: 'clock-in' | 'clock-out';
  employeeName: string;
  clockIn: string;
  clockOut?: string;
  duration?: { hours: number; minutes: number };
}

export default function POSClock() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [phase, setPhase] = useState<Phase>('pin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusData, setStatusData] = useState<ClockStatusResponse | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);

  const handleDigit = useCallback((digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
      setError('');
    }
  }, [pin]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setError('');
  }, []);

  const resetToPin = useCallback(() => {
    setPin('');
    setPhase('pin');
    setError('');
    setStatusData(null);
    setResultData(null);
  }, []);

  const handleSubmitPin = useCallback(async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const status = await checkClockStatus(pin);
      setStatusData(status);
      setPhase('status');
    } catch (err: any) {
      setError(err.message || 'Invalid PIN');
    } finally {
      setLoading(false);
    }
  }, [pin]);

  const handleClockIn = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await clockIn(pin);
      setResultData({
        type: 'clock-in',
        employeeName: result.employeeName,
        clockIn: result.clockIn,
      });
      setPhase('result');
      setTimeout(resetToPin, 5000);
    } catch (err: any) {
      setError(err.message || 'Clock-in failed');
    } finally {
      setLoading(false);
    }
  }, [pin, resetToPin]);

  const handleClockOut = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await clockOut(pin);
      setResultData({
        type: 'clock-out',
        employeeName: result.employeeName,
        clockIn: result.clockIn,
        clockOut: result.clockOut,
        duration: result.duration,
      });
      setPhase('result');
      setTimeout(resetToPin, 5000);
    } catch (err: any) {
      setError(err.message || 'Clock-out failed');
    } finally {
      setLoading(false);
    }
  }, [pin, resetToPin]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Halifax',
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate('/pos/dashboard')}
          className="text-slate-500 hover:text-slate-300 text-sm"
        >
          ← Back to POS
        </button>
      </div>

      <h1 className="text-slate-400 text-lg font-medium mb-8 tracking-wide uppercase">
        Employee Clock In / Out
      </h1>

      {/* ── PIN Entry Phase ── */}
      {phase === 'pin' && (
        <div className="w-full max-w-xs space-y-6">
          {/* PIN Display */}
          <div className="bg-slate-800 rounded-xl p-6 text-center border border-slate-700">
            <p className="text-slate-500 text-xs mb-3 uppercase tracking-wider">Enter your PIN</p>
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-colors ${
                    i < pin.length ? 'bg-blue-400' : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
              <button
                key={digit}
                onClick={() => handleDigit(digit)}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-semibold rounded-xl h-16 transition-colors border border-slate-700"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm font-medium rounded-xl h-16 transition-colors border border-slate-700"
            >
              Clear
            </button>
            <button
              onClick={() => handleDigit('0')}
              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-semibold rounded-xl h-16 transition-colors border border-slate-700"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm font-medium rounded-xl h-16 transition-colors border border-slate-700"
            >
              ⌫
            </button>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmitPin}
            disabled={pin.length < 4 || loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl h-14 text-lg transition-colors"
          >
            {loading ? 'Checking...' : 'Submit'}
          </button>
        </div>
      )}

      {/* ── Status Phase (choose clock in or out) ── */}
      {phase === 'status' && statusData && (
        <div className="w-full max-w-xs space-y-6">
          <div className="bg-slate-800 rounded-xl p-6 text-center border border-slate-700">
            <p className="text-slate-400 text-sm mb-1">Welcome,</p>
            <p className="text-white text-2xl font-bold mb-4">{statusData.employeeName}</p>

            {statusData.isClockedIn ? (
              <div className="bg-green-900/30 border border-green-800 rounded-lg p-3">
                <p className="text-green-400 text-sm">
                  Clocked in since {formatTime(statusData.clockIn!)}
                </p>
              </div>
            ) : (
              <div className="bg-slate-700/50 rounded-lg p-3">
                <p className="text-slate-400 text-sm">Not currently clocked in</p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {!statusData.isClockedIn ? (
              <button
                onClick={handleClockIn}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white font-semibold rounded-xl h-14 text-lg transition-colors"
              >
                {loading ? 'Processing...' : '🟢  Clock In'}
              </button>
            ) : (
              <button
                onClick={handleClockOut}
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 text-white font-semibold rounded-xl h-14 text-lg transition-colors"
              >
                {loading ? 'Processing...' : '🔴  Clock Out'}
              </button>
            )}

            <button
              onClick={resetToPin}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 font-medium rounded-xl h-12 transition-colors border border-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Result Phase ── */}
      {phase === 'result' && resultData && (
        <div className="w-full max-w-xs space-y-6">
          <div className={`rounded-xl p-8 text-center border ${
            resultData.type === 'clock-in'
              ? 'bg-green-900/20 border-green-800'
              : 'bg-orange-900/20 border-orange-800'
          }`}>
            <div className="text-5xl mb-4">
              {resultData.type === 'clock-in' ? '✅' : '👋'}
            </div>
            <p className="text-white text-xl font-bold mb-1">{resultData.employeeName}</p>
            <p className={`text-lg font-semibold ${
              resultData.type === 'clock-in' ? 'text-green-400' : 'text-orange-400'
            }`}>
              {resultData.type === 'clock-in' ? 'Clocked In' : 'Clocked Out'}
            </p>

            {resultData.type === 'clock-in' && (
              <p className="text-slate-400 text-sm mt-3">
                Started at {formatTime(resultData.clockIn)}
              </p>
            )}

            {resultData.type === 'clock-out' && resultData.duration && (
              <div className="mt-3 space-y-1">
                <p className="text-slate-400 text-sm">
                  {formatTime(resultData.clockIn)} → {formatTime(resultData.clockOut!)}
                </p>
                <p className="text-white font-medium">
                  Total: {resultData.duration.hours}h {resultData.duration.minutes}m
                </p>
              </div>
            )}
          </div>

          <p className="text-slate-600 text-xs text-center">Returning to PIN screen in a few seconds...</p>

          <button
            onClick={resetToPin}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 font-medium rounded-xl h-12 transition-colors border border-slate-700"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
