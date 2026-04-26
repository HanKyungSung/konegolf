import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { AttentionItem, AttentionKind } from './MCAttentionBell';
import { MCPanelHeader } from './MCSection';

interface MCAttentionListProps {
  items: AttentionItem[];
  readIds?: Set<string>;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onOpenItem?: (item: AttentionItem) => void;
  /** Override the heading. Defaults to "// ATTENTION · N OPEN". */
  heading?: React.ReactNode;
  /** Extra class on the scroll container (e.g. set max-height). */
  listClassName?: string;
  /** Hide the header bar entirely. */
  hideHeader?: boolean;
  /** Optional id for aria-labelledby when this list acts as a dialog body. */
  headingId?: string;
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

/**
 * Shared renderer for attention items. Used by MCAttentionBell's popover
 * and the wallboard Attention panel — single source of truth for row
 * markup, empty state, and relative-time ticking.
 */
export function MCAttentionList({
  items,
  readIds,
  onMarkRead,
  onMarkAllRead,
  onOpenItem,
  heading,
  listClassName = 'max-h-[60vh] overflow-y-auto',
  hideHeader = false,
  headingId,
}: MCAttentionListProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const read = readIds ?? new Set<string>();
  const unreadCount = items.filter((i) => !read.has(i.id)).length;
  const isIdle = items.length === 0;

  const defaultHeading = (
    <>// ATTENTION{items.length > 0 ? ` · ${items.length} OPEN` : ''}</>
  );
  const scrollClassName = `${listClassName} mc-scroll-thin`;

  return (
    <>
      {!hideHeader && (
        <MCPanelHeader
          label={heading ?? defaultHeading}
          headingId={headingId}
          as="div"
          border
          flush
          className="px-4 py-3"
          right={unreadCount > 0 && onMarkAllRead ? (
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
          ) : null}
        />
      )}

      {isIdle ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 flex-1">
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
        <ul role="list" aria-live="polite" className={scrollClassName}>
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
    </>
  );
}
