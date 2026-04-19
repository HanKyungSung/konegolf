import React, { useState } from 'react';
import { useWsEvent } from '@/hooks/use-websocket';

interface PiHealthPayload {
  reachable: boolean;
  modelLoaded?: boolean;
  error?: string;
  responseTimeMs?: number;
}

/**
 * Staff-facing Pi OCR health indicator. Hidden while healthy to keep the
 * header clean; shows amber ("OCR loading") when the Pi is reachable but
 * the model isn't loaded, and red ("OCR down") when it can't be reached.
 *
 * Drives off the `ocr.pi_health_changed` WS event — purely push-based.
 */
export function PiHealthDot({ className = '' }: { className?: string }) {
  const [health, setHealth] = useState<PiHealthPayload | null>(null);

  useWsEvent<PiHealthPayload>('ocr.pi_health_changed', (evt) => {
    setHealth(evt.payload);
  });

  if (!health) return null;
  if (health.reachable && health.modelLoaded) return null;

  const isAmber = health.reachable && !health.modelLoaded;
  const color = isAmber ? 'bg-amber-500' : 'bg-red-500';
  const label = isAmber ? 'OCR loading' : 'OCR down';
  const title = health.reachable
    ? 'Receipt OCR Pi reachable but model not loaded'
    : `Receipt OCR Pi unreachable${health.error ? `: ${health.error}` : ''}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}
      title={title}
      aria-label={title}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export default PiHealthDot;
