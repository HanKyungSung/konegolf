import React, { useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { MCAttentionList } from './MCAttentionList';

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

export function MCAttentionBell({
  items,
  readIds,
  onMarkRead,
  onMarkAllRead,
  onOpenItem,
}: MCAttentionBellProps) {
  const [open, setOpen] = useState(false);

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
          style={{
            boxShadow:
              '0 8px 32px rgba(29, 224, 197, 0.08), 0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <MCAttentionList
            items={items}
            readIds={read}
            onMarkRead={onMarkRead}
            onMarkAllRead={onMarkAllRead}
            onOpenItem={onOpenItem}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
