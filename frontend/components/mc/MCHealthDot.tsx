import React, { useEffect, useState } from 'react';
import { getOcrHealth } from '@/services/pos-api';

type Status = 'healthy' | 'offline' | 'unknown';

interface MCHealthDotProps {
  /** Polling interval in milliseconds (default 30s) */
  intervalMs?: number;
  /** If true, component fetches and polls. If false, renders nothing. */
  enabled?: boolean;
}

const COLORS: Record<Status, string> = {
  healthy: 'var(--mc-green)',
  offline: 'var(--mc-magenta)',
  unknown: 'var(--mc-text-meta-dim)',
};

/**
 * Tiny pulsing dot that surfaces Pi5 OCR service health.
 * Rendered in the command bar for ADMINs. Polls /api/receipt-analysis/health.
 */
export function MCHealthDot({ intervalMs = 30_000, enabled = true }: MCHealthDotProps) {
  const [status, setStatus] = useState<Status>('unknown');
  const [lastProbe, setLastProbe] = useState<Date | null>(null);
  const [pendingRetries, setPendingRetries] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const probe = async () => {
      try {
        const data = await getOcrHealth();
        if (cancelled) return;
        setLastProbe(new Date());
        setPendingRetries(
          typeof data.pendingRetries === 'number' ? data.pendingRetries : 0,
        );
        setStatus(data.reachable ? 'healthy' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };

    probe();
    const handle = window.setInterval(probe, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [intervalMs, enabled]);

  if (!enabled) return null;

  const tooltip = [
    `OCR: ${status}`,
    lastProbe ? `Last probe: ${lastProbe.toLocaleTimeString()}` : null,
    pendingRetries > 0 ? `${pendingRetries} pending retries` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-sm"
      style={{
        border: '1px solid var(--mc-divider)',
        background: 'transparent',
      }}
      title={tooltip}
      aria-label={tooltip}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${status === 'healthy' ? 'mc-pulse' : ''}`}
        style={{ background: COLORS[status] }}
        aria-hidden
      />
      <span className="mc-mono text-[11px] text-[color:var(--mc-text-meta)] uppercase tracking-wider">
        OCR
      </span>
    </div>
  );
}
