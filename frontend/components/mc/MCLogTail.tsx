import React, { useEffect, useRef } from 'react';
import type { LogLine, LogLevel } from '@/hooks/use-mock-log-tail';

interface MCLogTailProps {
  lines: LogLine[];
  /** Optional override for the panel heading. */
  heading?: React.ReactNode;
  /** Filter to a subset of levels. Defaults to all. */
  levels?: LogLevel[];
  /** Click handler for a log line. When provided, rows render as buttons. */
  onLineClick?: (line: LogLine) => void;
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  DEBUG: 'var(--mc-text-meta-dim)',
  INFO: 'var(--mc-cyan)',
  WARN: 'var(--mc-amber)',
  ERROR: 'var(--mc-magenta)',
};

function formatTs(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Compact, scrolling backend log tail. Auto-scrolls to bottom on new lines
 * unless the user has scrolled up (then we hold position).
 */
export function MCLogTail({ lines, heading, levels, onLineClick }: MCLogTailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const filtered = levels ? lines.filter((l) => levels.includes(l.level)) : lines;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stickToBottomRef.current = distanceFromBottom < 24;
  };

  const counts = filtered.reduce(
    (acc, l) => {
      acc[l.level] = (acc[l.level] || 0) + 1;
      return acc;
    },
    {} as Record<LogLevel, number>,
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline justify-between px-1 pb-2 flex-shrink-0">
        <div className="mc-section-label">
          {heading ?? '// BACKEND · LOG TAIL'}
        </div>
        <div className="flex items-center gap-2 mc-mono text-[10px] uppercase tracking-wider">
          {(['ERROR', 'WARN', 'INFO'] as LogLevel[]).map((lvl) =>
            counts[lvl] ? (
              <span key={lvl} style={{ color: LEVEL_COLOR[lvl] }}>
                {lvl[0]}·{counts[lvl]}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto mc-mono text-[11px] leading-[1.45] px-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {filtered.length === 0 ? (
          <div
            className="text-center py-6"
            style={{ color: 'var(--mc-text-meta-dim)' }}
          >
            // awaiting log lines
          </div>
        ) : (
          filtered.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => onLineClick?.(line)}
              disabled={!onLineClick}
              className="mc-log-row flex gap-2 whitespace-nowrap w-full text-left px-1 -mx-1 rounded-sm transition-colors disabled:cursor-default"
              style={{ background: 'transparent' }}
              onMouseEnter={(e) => {
                if (onLineClick) e.currentTarget.style.background = 'rgba(29,224,197,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ color: 'var(--mc-text-meta-dim)' }}>
                {formatTs(line.ts)}
              </span>
              <span
                style={{
                  color: LEVEL_COLOR[line.level],
                  width: 38,
                  flexShrink: 0,
                }}
              >
                {line.level}
              </span>
              <span
                style={{
                  color: 'var(--mc-text-meta)',
                  width: 64,
                  flexShrink: 0,
                }}
              >
                {line.source}
              </span>
              <span
                className="truncate"
                style={{ color: 'var(--mc-text-primary)' }}
                title={line.message}
              >
                {line.message}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
