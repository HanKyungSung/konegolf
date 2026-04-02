import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { clockIn, clockOut, checkClockStatus } from '@/services/pos-api';

const TIMEZONE = 'America/Halifax';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

interface ClockModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'pin' | 'status' | 'result';

interface StatusData {
  employeeName: string;
  isClockedIn: boolean;
  clockIn: string | null;
}

interface ResultData {
  type: 'in' | 'out';
  employeeName: string;
  clockIn: string;
  clockOut?: string;
}

export default function ClockModal({ isOpen, onClose }: ClockModalProps) {
  const [phase, setPhase] = useState<Phase>('pin');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);

  const reset = useCallback(() => {
    setPhase('pin');
    setPin('');
    setError('');
    setLoading(false);
    setStatusData(null);
    setResultData(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePinSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const status = await checkClockStatus(pin);
      setStatusData({
        employeeName: status.employeeName,
        isClockedIn: status.isClockedIn,
        clockIn: status.clockIn,
      });
      setPhase('status');
    } catch (err: any) {
      setError(err.message || 'Invalid PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await clockIn(pin);
      setResultData({
        type: 'in',
        employeeName: result.employeeName,
        clockIn: result.clockIn,
      });
      setPhase('result');
      // Auto-close after 3 seconds
      setTimeout(handleClose, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to clock in');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await clockOut(pin);
      setResultData({
        type: 'out',
        employeeName: result.employeeName,
        clockIn: result.clockIn,
        clockOut: result.clockOut,
      });
      setPhase('result');
      setTimeout(handleClose, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to clock out');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (digit: string) => {
    if (pin.length < 6) setPin(prev => prev + digit);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-sm shadow-2xl">

        {/* PIN Entry Phase */}
        {phase === 'pin' && (
          <>
            <h2 className="text-lg font-bold text-white text-center mb-4">Enter Your PIN</h2>

            {/* PIN dots */}
            <div className="flex justify-center gap-2 mb-4">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < pin.length ? 'bg-blue-400' : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center mb-3">{error}</p>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map(key => (
                <button
                  key={key || 'empty'}
                  disabled={!key || loading}
                  onClick={() => {
                    if (key === '⌫') setPin(prev => prev.slice(0, -1));
                    else if (key) handleKeyPress(key);
                  }}
                  className={`h-14 rounded-lg text-xl font-semibold transition-colors ${
                    !key
                      ? 'invisible'
                      : key === '⌫'
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-700 text-white hover:bg-slate-600 active:bg-slate-500'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handlePinSubmit}
                disabled={pin.length < 4 || loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500"
              >
                {loading ? '...' : 'Submit'}
              </Button>
            </div>
          </>
        )}

        {/* Status Phase */}
        {phase === 'status' && statusData && (
          <>
            <h2 className="text-lg font-bold text-white text-center mb-1">
              {statusData.employeeName}
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              {statusData.isClockedIn
                ? `Clocked in since ${formatTime(statusData.clockIn!)}`
                : 'Not currently clocked in'}
            </p>

            {error && (
              <p className="text-red-400 text-sm text-center mb-3">{error}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">
                Back
              </Button>
              {statusData.isClockedIn ? (
                <Button
                  onClick={handleClockOut}
                  disabled={loading}
                  className="flex-1 bg-orange-600 hover:bg-orange-500"
                >
                  {loading ? '...' : 'Clock Out'}
                </Button>
              ) : (
                <Button
                  onClick={handleClockIn}
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                >
                  {loading ? '...' : 'Clock In'}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Result Phase */}
        {phase === 'result' && resultData && (
          <div className="text-center">
            <p className="text-4xl mb-3">{resultData.type === 'in' ? '✅' : '👋'}</p>
            <h2 className="text-lg font-bold text-white mb-1">
              {resultData.employeeName}
            </h2>
            <p className="text-emerald-400 font-medium mb-1">
              {resultData.type === 'in' ? 'Clocked In' : 'Clocked Out'}
            </p>
            {resultData.type === 'in' && (
              <p className="text-slate-400 text-sm">
                at {formatTime(resultData.clockIn)}
              </p>
            )}
            {resultData.type === 'out' && resultData.clockOut && (
              <p className="text-slate-400 text-sm">
                {formatTime(resultData.clockIn)} → {formatTime(resultData.clockOut)}
                {' · '}
                {formatDuration(resultData.clockIn, resultData.clockOut)}
              </p>
            )}
            <p className="text-slate-500 text-xs mt-4">Closing automatically...</p>
          </div>
        )}
      </div>
    </div>
  );
}
