import React from 'react';
import { Link } from 'react-router-dom';
import { Camera, ClipboardList, Clock, Search, Users, Utensils } from 'lucide-react';

export interface MCToolsRailItem {
  /** Stable key */
  id: string;
  /** Visible label */
  label: string;
  /** Lucide icon */
  icon: React.ReactNode;
  /** Internal route to navigate to */
  to?: string;
  /** Callback (if no `to`) */
  onClick?: () => void;
  /** Hide this item (e.g. role gate) */
  hidden?: boolean;
  /** Optional badge number (shown if > 0) */
  badge?: number;
  /** Treat badge as an alert (magenta) rather than info (cyan) */
  alert?: boolean;
  /** Currently-active indicator (matches current URL) */
  active?: boolean;
}

interface MCToolsRailProps {
  items: MCToolsRailItem[];
  variant?: 'horizontal' | 'vertical';
}

/**
 * Navigation rail of "tools" — horizontal by default, or vertical (stacked
 * full-width rows) when embedded inside a panel.
 * Each item supports a count badge and role gating via `hidden`.
 */
export function MCToolsRail({ items, variant = 'horizontal' }: MCToolsRailProps) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  if (variant === 'vertical') {
    return (
      <nav className="flex flex-col" aria-label="Tools">
        {visible.map((item, idx) => {
          const content = <MCToolsRailButton item={item} variant="vertical" />;
          const separator =
            idx > 0 ? (
              <span
                aria-hidden
                className="block mx-4"
                style={{ height: 1, background: 'var(--mc-divider-soft)' }}
              />
            ) : null;
          if (item.to) {
            return (
              <React.Fragment key={item.id}>
                {separator}
                <Link to={item.to} className="contents">
                  {content}
                </Link>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={item.id}>
              {separator}
              <button type="button" onClick={item.onClick} className="contents">
                {content}
              </button>
            </React.Fragment>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="mc-panel flex items-stretch gap-0 py-0 px-0 overflow-x-auto"
      style={{ padding: 0 }}
      aria-label="Tools"
    >
      {visible.map((item, idx) => {
        const content = <MCToolsRailButton item={item} variant="horizontal" />;
        const separator =
          idx > 0 ? (
            <span
              aria-hidden
              className="self-stretch my-3"
              style={{ width: 1, background: 'var(--mc-divider)' }}
            />
          ) : null;
        if (item.to) {
          return (
            <React.Fragment key={item.id}>
              {separator}
              <Link to={item.to} className="contents">
                {content}
              </Link>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={item.id}>
            {separator}
            <button type="button" onClick={item.onClick} className="contents">
              {content}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function MCToolsRailButton({
  item,
  variant = 'horizontal',
}: {
  item: MCToolsRailItem;
  variant?: 'horizontal' | 'vertical';
}) {
  const isVertical = variant === 'vertical';
  return (
    <span
      className={`${
        isVertical ? 'w-full' : 'flex-1 min-w-[120px]'
      } flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
        item.active ? 'bg-[color:var(--mc-surface-raised)]' : 'hover:bg-[color:var(--mc-surface-raised)]'
      }`}
    >
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-sm flex-shrink-0"
        style={{
          background: item.active ? 'rgba(29, 224, 197, 0.12)' : 'transparent',
          color: item.active ? 'var(--mc-cyan)' : 'var(--mc-text-label)',
        }}
        aria-hidden
      >
        {item.icon}
      </span>
      <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
        <span
          className="text-[13px] font-semibold truncate"
          style={{
            color: item.active ? 'var(--mc-text-hero)' : 'var(--mc-text-primary)',
          }}
        >
          {item.label}
        </span>
        {typeof item.badge === 'number' && item.badge > 0 && (
          <span
            className="mc-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded flex-shrink-0"
            style={{
              color: item.alert ? 'var(--mc-text-accent-pink)' : 'var(--mc-text-accent-teal)',
              background: item.alert
                ? 'rgba(255, 92, 170, 0.12)'
                : 'rgba(29, 224, 197, 0.12)',
            }}
          >
            {item.badge}
          </span>
        )}
      </span>
    </span>
  );
}

/** Re-export commonly-used icons so callers don't need to import lucide separately. */
export const MCToolsRailIcons = {
  Camera,
  ClipboardList,
  Clock,
  Search,
  Users,
  Utensils,
};
