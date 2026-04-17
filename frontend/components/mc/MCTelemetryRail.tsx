import React, { useEffect, useState } from 'react';
import { MCStatDot } from './MCStatDot';

interface MCTelemetryRailProps {
  bookingsCount: number;
  roomsCount: number;
  activeCount: number;
  lastSync?: Date;
  apiHealthy?: boolean;
}

function formatUptime(startMs: number): string {
  const diff = Date.now() - startMs;
  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function MCTelemetryRail({
  bookingsCount,
  roomsCount,
  activeCount,
  lastSync,
  apiHealthy = true,
}: MCTelemetryRailProps) {
  const [mountedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lastSyncLabel = lastSync
    ? lastSync.toLocaleTimeString('en-CA', { hour12: false, timeZone: 'America/Halifax' })
    : '--';

  const rows: Array<{ label: string; value: React.ReactNode; dot?: 'cyan' | 'purple' | 'gray' | 'magenta' }> = [
    { label: 'SYSTEM', value: apiHealthy ? 'online' : 'degraded', dot: apiHealthy ? 'cyan' : 'magenta' },
    { label: 'UPTIME', value: formatUptime(mountedAt) },
    { label: 'API', value: apiHealthy ? 'reachable' : 'unreachable', dot: apiHealthy ? 'cyan' : 'magenta' },
    { label: 'TZ', value: tz.split('/').pop()?.replace('_', ' ') || tz },
    { label: 'VENUE', value: 'America/Halifax' },
    { label: 'ROOMS', value: `${roomsCount}` },
    { label: 'LIVE', value: `${activeCount}`, dot: activeCount > 0 ? 'cyan' : 'gray' },
    { label: 'LOAD', value: `${bookingsCount} bookings` },
    { label: 'SYNC', value: lastSyncLabel },
  ];

  return (
    <aside
      className="hidden 2xl:flex fixed right-0 top-0 bottom-0 flex-col z-30 pointer-events-none"
      style={{ width: '220px', paddingTop: '88px', paddingBottom: '24px' }}
      aria-label="System telemetry rail"
    >
      <div className="flex flex-col h-full pr-6 pl-4 pointer-events-auto">
        <div className="mc-section-label mb-1">Telemetry</div>
        <div className="mc-meta-dim mc-mono mb-4">v2026.04</div>

        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="mc-mono text-[11px] font-medium text-[color:var(--mc-gray-dim)] tracking-wider">
                {row.label}
              </span>
              <span className="flex items-center gap-2 mc-mono text-[12px] font-medium text-[color:var(--mc-white)]">
                {row.dot && <MCStatDot variant={row.dot} pulse={row.dot === 'cyan'} />}
                <span className="truncate max-w-[120px]">{row.value}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6 border-t border-[color:var(--mc-divider-soft)]">
          <div className="mc-meta-dim mc-mono leading-relaxed">
            {'// mission-control'}
            <br />
            {'// dashboard.k1g'}
          </div>
        </div>
      </div>
    </aside>
  );
}
