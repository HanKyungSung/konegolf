import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Percent } from 'lucide-react';

interface MCTaxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRate: number;
  onSave: (rate: number) => Promise<void> | void;
}

/**
 * Small animated dialog for editing the global tax rate.
 * Uses the shared Radix Dialog (fade + zoom entrance/exit built in).
 */
export function MCTaxDialog({ open, onOpenChange, currentRate, onSave }: MCTaxDialogProps) {
  const [value, setValue] = useState(String(currentRate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(String(currentRate));
      setError(null);
      setSaving(false);
    }
  }, [open, currentRate]);

  const handleSave = async () => {
    const rate = parseFloat(value);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      setError('Enter a rate between 0 and 100');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(rate);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mc-dialog-content sm:max-w-[360px] duration-300 data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Percent className="h-4 w-4 text-[color:var(--mc-cyan)]" />
            Global Tax Rate
          </DialogTitle>
          <DialogDescription className="text-[color:var(--mc-text-meta,#94a3b8)]">
            Applied to all bookings and menu orders.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <input
            autoFocus
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            className="mc-input flex-1 text-xl font-semibold mc-mono tabular-nums"
            step="0.1"
            min="0"
            max="100"
          />
          <span className="mc-meta text-lg">%</span>
        </div>

        {error && (
          <p className="text-[color:var(--mc-text-accent-pink,#ff5caa)] text-xs mc-mono">{error}</p>
        )}

        <DialogFooter className="sm:justify-end gap-2">
          <button
            type="button"
            className="mc-btn"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="mc-btn mc-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
