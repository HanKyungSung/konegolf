import React, { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';

export default function POSPinLogin() {
  const { pinLogin } = useAuth();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await pinLogin(pin);
      // Auth context will update and POS routes will show dashboard
    } catch (err: any) {
      setError(err.message || 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [pin, pinLogin]);

  // Submit on Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length >= 4 && !loading) {
      handleSubmit();
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (/^\d$/.test(e.key) && pin.length < 6) {
      handleDigit(e.key);
    }
  }, [pin, loading, handleSubmit, handleBackspace, handleDigit]);

  return (
    <div
      className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Logo / Title */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">K one Golf</h1>
        <p className="text-slate-500 text-sm uppercase tracking-widest">Point of Sale</p>
      </div>

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
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl h-14 text-lg transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>

      <p className="text-slate-700 text-xs mt-8">
        Admin? <a href="/login" className="text-slate-500 hover:text-slate-400 underline">Use email login</a>
      </p>
    </div>
  );
}
