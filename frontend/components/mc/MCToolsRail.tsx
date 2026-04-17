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
}

/**
 * Horizontal rail of navigation "tools" — replaces the previous chip row.
 * Each item supports a count badge and role gating via `hidden`.
 * Renders inline in main content (not viewport-fixed) so it doesn't collide
 * with the existing 2xl viewport-edge side rails.
 */
export function MCToolsRail({ items }: MCToolsRailProps) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <nav
      className="mc-panel flex items-stretch gap-0 py-0 px-0 overflow-x-auto"
      style={{ padding: 0 }}
      aria-label="Tools"
    >
      {visible.map((item, idx) => {
        const content = <MCToolsRailButton item={item} />;
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

function MCToolsRailButton({ item }: { item: MCToolsRailItem }) {
  return (
    <span
      className={`flex-1 min-w-[120px] flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
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
      <span className="flex flex-col min-w-0">
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
            className="mc-mono text-[11px] truncate"
            style={{
              color: item.alert ? 'var(--mc-text-accent-pink)' : 'var(--mc-text-accent-teal)',
            }}
          >
            {item.badge} pending
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
