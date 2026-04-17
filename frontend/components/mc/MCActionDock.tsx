import React from 'react';
import { Plus, ShoppingBag } from 'lucide-react';

interface MCActionDockProps {
  onCreateBooking: () => void;
  onQuickSale: () => void;
  hidden?: boolean;
}

/**
 * Inline action dock — Create Booking + Quick Sale.
 * Rendered under the Active Sessions hero so primary creates live next to
 * the live-session signal rather than floating over content.
 */
export function MCActionDock({ onCreateBooking, onQuickSale, hidden }: MCActionDockProps) {
  if (hidden) return null;

  return (
    <div className="mc-action-dock">
      <button
        type="button"
        className="mc-action-btn mc-action-btn-primary"
        onClick={onCreateBooking}
      >
        <Plus className="h-4 w-4" />
        <span>Create Booking</span>
      </button>
      <button
        type="button"
        className="mc-action-btn"
        onClick={onQuickSale}
      >
        <ShoppingBag className="h-4 w-4" />
        <span>Quick Sale</span>
      </button>
    </div>
  );
}
