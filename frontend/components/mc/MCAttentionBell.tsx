import React, { useMemo, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type AttentionSeverity = 'amber' | 'red';

export type AttentionKind =
  | 'missing_receipt'
  | 'ocr_stuck'
  | 'pi_unreachable'
  | 'unpaid_past_end'
  | 'clock_open_overnight';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  linkHref?: string;
  subjectId?: string;
  createdAt: string; // ISO
  resolvedAt?: string;
}

interface MCAttentionBellProps {
  items: AttentionItem[];
  readIds?: Set<string>;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onOpenItem?: (item: AttentionItem) => void;
}

const KIND_LABEL: Record<AttentionKind, string> = {
  missing_receipt: 'MISSING RECEIPT',
  ocr_stuck: 'OCR STUCK',
  pi_unreachable: 'OCR PI OFFLINE',
  unpaid_past_end: 'UNPAID · BOOKING ENDED',
  clock_open_overnight: 'CLOCK OPEN OVERNIGHT',
};

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, now - t);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MCAttentionBell({
  items,
  readIds,
  onMarkRead,
  onMarkAllRead,
  onOpenItem,
}: MCAttentionBellProps) {
  const [open, setOpen] = useState(false);

  // tick every 30s so "14m ago" stays current while popover is open
  const [nowTick, setNowTick] = useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const read = readIds ?? new Set<string>();
  const unreadCount = useMemo(
    () => items.filter((i) => !read.has(i.id)).length,
    [items, read],
  );
  const hasRed = useMemo(
    () => items.some((i) => i.severity === 'red' && !read.has(i.id)),
    [items, read],
  );
  const isIdle = items.length === 0;

  const badgeColor = hasRed ? 'var(--mc-magenta)' : 'var(--mc-amber)';
  const bellColor = isIdle
    ? 'var(--mc-text-meta-dim)'
    : hasRed
      ? 'var(--mc-magenta)'
      : 'var(--mc-text-meta)';

  const ariaLabel = isIdle
    ? 'Attention notifications: all clear'
    : `Attention notifications: ${unreadCount} item${unreadCount === 1 ? '' : 's'} need action`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="mc-attn-bell relative inline-flex items-center justify-center w-8 h-8 rounded-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--mc-cyan)]"
          style={{ color: bellColor }}
        >
          <Bell
            className="w-[18px] h-[18px]"
            fill={isIdle ? 'none' : 'currentColor'}
            strokeWidth={isIdle ? 1.75 : 1.25}
          />
          {unreadCount > 0 && (
            <>
              <span
                aria-hidden
                className={`mc-attn-badge ${hasRed ? 'mc-attn-badge--red' : 'mc-attn-badge--amber'} mc-mono`}
                style={{ background: badgeColor }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
              {hasRed && (
                <span
                  aria-hidden
                  className="mc-attn-pulse"
                  style={{ borderColor: 'var(--mc-magenta)' }}
                />
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="mc-attn-popover p-0 border-0 bg-transparent shadow-none"
        style={{ width: 360 }}
      >
        <div
          role="dialog"
          aria-labelledby="mc-attn-heading"
          className="mc-panel overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(29, 224, 197, 0.08), 0 2px 8px rgba(0,0,0,0.4)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--mc-divider)' }}>
            <div id="mc-attn-heading" className="mc-section-label">
              // ATTENTION{items.length > 0 ? ` · ${items.length} OPEN` : ''}
            </div>
            {unreadCount > 0 && onMarkAllRead && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="mc-mono text-[11px] uppercase tracking-wider transition-colors"
                style={{ color: 'var(--mc-text-meta)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mc-cyan)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--mc-text-meta)')}
              >
                Mark all read
              </button>
            )}
          </div>

          {isIdle ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full"
                style={{ border: '1px solid var(--mc-cyan)', color: 'var(--mc-cyan)' }}
              >
                <Check className="w-4 h-4" strokeWidth={2} />
              </span>
              <span className="mc-mono text-[12px]" style={{ color: 'var(--mc-text-meta)' }}>
                All clear.
              </span>
            </div>
          ) : (
            <ul
              role="list"
              aria-live="polite"
              className="max-h-[60vh] overflow-y-auto"
            >
              {items.map((item, idx) => {
                const isRead = read.has(item.id);
                const pipColor =
                  item.severity === 'red' ? 'var(--mc-magenta)' : 'var(--mc-amber)';
                return (
                  <li
                    key={item.id}
                    role="listitem"
                    className="mc-attn-row"
                    style={{
                      borderTop: idx === 0 ? 'none' : '1px solid var(--mc-divider-soft)',
                      opacity: isRead ? 0.6 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!isRead) onMarkRead?.(item.id);
                        onOpenItem?.(item);
                      }}
                      className="w-full text-left px-4 py-3 flex gap-3 items-stretch transition-colors focus:outline-none focus-visible:bg-[color:var(--mc-bg-raised)]"
                    >
                      <span
                        aria-hidden
                        className="flex-shrink-0 w-[3px] rounded-full self-stretch"
                        style={{ background: pipColor, opacity: isRead ? 0.4 : 1 }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className="mc-mono text-[10px] uppercase tracking-[0.12em]"
                            style={{ color: pipColor }}
                          >
                            {KIND_LABEL[item.kind]}
                          </span>
                          <span
                            className="mc-mono text-[11px] flex-shrink-0"
                            style={{ color: 'var(--mc-text-meta-dim)' }}
                          >
                            {formatRelative(item.createdAt, nowTick)}
                          </span>
                        </div>
                        <div
                          className="mc-mono text-[13px] mb-0.5 truncate"
                          style={{ color: 'var(--mc-text-primary)' }}
                        >
                          {item.title}
                        </div>
                        <div
                          className="text-[12px] leading-snug"
                          style={{ color: 'var(--mc-text-meta)' }}
                        >
                          {item.detail}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
