import React, { useState, useRef, useEffect } from 'react';
import { Plus, ShoppingBag, Gift, ChevronUp } from 'lucide-react';

interface MCActionDockProps {
  /** Primary action — Create Booking */
  onCreateBooking: () => void;
  /** Secondary — Quick Sale (opens new booking with walk-in setup) */
  onQuickSale: () => void;
  /** Secondary — Gift Card sale */
  onGiftCard: () => void;
  /** Hide entirely (e.g. SALES role) */
  hidden?: boolean;
}

/**
 * Floating action dock — replaces the previous two-FAB cluster.
 * One primary CTA (Create Booking) and a popover for secondary actions
 * (Quick Sale, Gift Card). Keeps all create-actions in one discoverable spot.
 */
export function MCActionDock({
  onCreateBooking,
  onQuickSale,
  onGiftCard,
  hidden,
}: MCActionDockProps) {
  const [open, setOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!dockRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (hidden) return null;

  return (
    <div ref={dockRef} className="mc-fab-cluster">
      {open && (
        <>
          <button
            className="mc-fab mc-fab-secondary"
            onClick={() => {
              setOpen(false);
              onGiftCard();
            }}
          >
            <Gift className="h-3.5 w-3.5" /> Gift Card
          </button>
          <button
            className="mc-fab mc-fab-secondary"
            onClick={() => {
              setOpen(false);
              onQuickSale();
            }}
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Quick Sale
          </button>
        </>
      )}
      <div className="flex gap-2">
        <button
          className="mc-fab"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close more actions' : 'More actions'}
          aria-expanded={open}
          style={{ paddingLeft: '0.85rem', paddingRight: '0.85rem' }}
        >
          <ChevronUp
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
        <button className="mc-fab mc-fab-primary" onClick={onCreateBooking}>
          <Plus className="h-3.5 w-3.5" /> Create Booking
        </button>
      </div>
    </div>
  );
}
