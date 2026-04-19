import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAttentionMock } from '@/hooks/use-attention-mock';
import {
  MCAttentionBell,
  MCHealthDot,
} from '@/components/mc';

/**
 * Prototype preview for MCAttentionBell. Admin-only. Not linked from
 * the main nav — reached only via direct URL `/pos/dev/attention`.
 */
export default function AttentionPreviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    items,
    readIds,
    unreadCount,
    addItem,
    resolveLatest,
    clearAll,
    markRead,
    markAllRead,
  } = useAttentionMock();

  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen mc-root flex items-center justify-center p-8">
        <div className="text-center">
          <div className="mc-section-label mb-2">// ACCESS DENIED</div>
          <p className="mc-mono text-sm text-[color:var(--mc-text-meta)]">
            Admin only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mc-root">
      {/* Faux MC header strip */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          background: 'var(--mc-bg)',
          borderColor: 'var(--mc-divider)',
        }}
      >
        <div className="mx-auto max-w-[1200px] px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/pos/dashboard')}
            className="mc-mono text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
            style={{ color: 'var(--mc-text-meta)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>

          <div className="flex flex-col items-center">
            <div className="mc-section-label">// DEV PREVIEW</div>
            <div
              className="mc-mono text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--mc-text-meta-dim)' }}
            >
              MCAttentionBell
            </div>
          </div>

          <div
            className="flex items-center gap-3 pl-3"
            style={{ borderLeft: '2px solid var(--mc-divider)' }}
          >
            <MCHealthDot enabled={false} />
            <MCAttentionBell
              items={items}
              readIds={readIds}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
              onOpenItem={(item) => {
                console.log('[AttentionPreview] open item', item);
              }}
            />
          </div>
        </div>
      </header>

      {/* Debug panel */}
      <main className="mx-auto max-w-[1200px] px-6 py-10 space-y-8">
        <section className="mc-panel p-6 space-y-4">
          <div>
            <div className="mc-section-label mb-1">// DEBUG CONTROLS</div>
            <p
              className="mc-mono text-[12px]"
              style={{ color: 'var(--mc-text-meta)' }}
            >
              Click the bell in the header to see the popover.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <DebugButton label="+ Add amber item" onClick={() => addItem('amber')} />
            <DebugButton label="+ Add red item" onClick={() => addItem('red')} />
            <DebugButton label="Resolve latest" onClick={resolveLatest} />
            <DebugButton label="Clear all" onClick={clearAll} />
            <DebugButton label="Mark all read" onClick={markAllRead} />
          </div>

          <div
            className="grid grid-cols-4 gap-4 pt-4 border-t"
            style={{ borderColor: 'var(--mc-divider)' }}
          >
            <Stat label="Items" value={items.length} />
            <Stat label="Unread" value={unreadCount} />
            <Stat
              label="Red"
              value={items.filter((i) => i.severity === 'red').length}
            />
            <Stat
              label="Amber"
              value={items.filter((i) => i.severity === 'amber').length}
            />
          </div>
        </section>

        <section className="mc-panel p-6">
          <div className="mc-section-label mb-3">// CURRENT STATE</div>
          {items.length === 0 ? (
            <p
              className="mc-mono text-[12px]"
              style={{ color: 'var(--mc-text-meta-dim)' }}
            >
              No items. Badge is idle.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--mc-divider-soft)' }}>
              {items.map((item) => {
                const isRead = readIds.has(item.id);
                const pipColor =
                  item.severity === 'red' ? 'var(--mc-magenta)' : 'var(--mc-amber)';
                return (
                  <li
                    key={item.id}
                    className="py-2 flex items-center gap-3 text-[12px] mc-mono"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: pipColor }}
                    />
                    <span
                      className="uppercase tracking-wider text-[10px] flex-shrink-0"
                      style={{ color: pipColor, width: 64 }}
                    >
                      {item.severity}
                    </span>
                    <span style={{ color: 'var(--mc-text-primary)' }}>
                      {item.title}
                    </span>
                    <span
                      className="flex-1 truncate"
                      style={{ color: 'var(--mc-text-meta)' }}
                    >
                      · {item.detail}
                    </span>
                    {isRead && (
                      <span
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--mc-text-meta-dim)' }}
                      >
                        read
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="mc-mono text-[11px]"
          style={{ color: 'var(--mc-text-meta-dim)' }}
        >
          /pos/dev/attention · prototype · data is in-memory only
        </section>
      </main>
    </div>
  );
}

function DebugButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mc-mono text-[12px] uppercase tracking-wider px-3 py-2 rounded-sm transition-colors"
      style={{
        border: '1px solid var(--mc-divider)',
        color: 'var(--mc-text-meta)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--mc-cyan)';
        e.currentTarget.style.borderColor = 'var(--mc-cyan)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--mc-text-meta)';
        e.currentTarget.style.borderColor = 'var(--mc-divider)';
      }}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="mc-mono text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--mc-text-meta-dim)' }}
      >
        {label}
      </span>
      <span
        className="mc-mono text-xl"
        style={{ color: 'var(--mc-text-hero)' }}
      >
        {value}
      </span>
    </div>
  );
}
