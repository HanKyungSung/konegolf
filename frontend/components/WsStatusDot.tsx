import React from 'react';
import { useWebSocket } from '@/hooks/use-websocket';

/**
 * Small connection indicator — green (live), amber (reconnecting / polling
 * fallback), red (closed). Hover shows a human-readable status.
 */
export function WsStatusDot({ className = '' }: { className?: string }) {
  const { status, isPollingFallback } = useWebSocket();

  let color = 'bg-gray-400';
  let label = 'Offline';
  if (status === 'open') {
    color = 'bg-emerald-500';
    label = 'Live';
  } else if (isPollingFallback) {
    color = 'bg-amber-500';
    label = 'Polling (WS down)';
  } else if (status === 'connecting' || status === 'reconnecting') {
    color = 'bg-amber-500';
    label = status === 'connecting' ? 'Connecting…' : 'Reconnecting…';
  } else {
    color = 'bg-red-500';
    label = 'Disconnected';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}
      title={`Realtime: ${label}`}
      aria-label={`Realtime status: ${label}`}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export default WsStatusDot;
