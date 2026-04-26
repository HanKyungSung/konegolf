import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { LogLine, LogLevel } from '@/hooks/use-mock-log-tail';

const LEVEL_COLOR: Record<LogLevel, string> = {
  DEBUG: 'var(--mc-text-meta-dim)',
  INFO: 'var(--mc-cyan)',
  WARN: 'var(--mc-amber)',
  ERROR: 'var(--mc-magenta)',
};

interface MCLogDetailDialogProps {
  line: LogLine | null;
  onOpenChange: (open: boolean) => void;
}

function fmtTs(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Game-style HUD popover for inspecting a single log line.
 * Scale-fade entrance, mc-cyan border glow, monospace body.
 */
export function MCLogDetailDialog({ line, onOpenChange }: MCLogDetailDialogProps) {
  const open = line !== null;
  const accent = line ? LEVEL_COLOR[line.level] : 'var(--mc-cyan)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="mc-log-popup sm:max-w-[520px] p-0 border-0 bg-transparent shadow-none data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-200"
      >
        {line && (
          <div
            className="relative rounded-sm overflow-hidden"
            style={{
              background:
                'linear-gradient(180deg, rgba(15,22,40,0.96) 0%, rgba(8,12,22,0.96) 100%)',
              border: `1px solid ${accent}`,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.4), 0 0 24px -2px ${accent}, inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0"
              style={{
                height: 1,
                background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
              }}
            />

            <div
              className="px-5 py-3 flex items-center gap-3 border-b"
              style={{ borderColor: 'var(--mc-divider)' }}
            >
              <span
                className="mc-mono text-[11px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-sm"
                style={{
                  color: accent,
                  border: `1px solid ${accent}`,
                  background: 'rgba(0,0,0,0.3)',
                }}
              >
                {line.level}
              </span>
              <DialogTitle asChild>
                <span
                  className="mc-mono text-[12px] uppercase tracking-wider"
                  style={{ color: 'var(--mc-text-primary)' }}
                >
                  {line.source}
                </span>
              </DialogTitle>
              <span className="flex-1" />
              <span
                className="mc-mono text-[11px]"
                style={{ color: 'var(--mc-text-meta-dim)' }}
              >
                {fmtTs(line.ts)}
              </span>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <div className="mc-section-label mb-1">// MESSAGE</div>
                <div
                  className="mc-mono text-[12px] break-words"
                  style={{ color: 'var(--mc-text-primary)' }}
                >
                  {line.message}
                </div>
              </div>

              {(line.requestId || line.status !== undefined || line.durationMs !== undefined || line.userId) && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mc-mono text-[11px]">
                  {line.requestId && (
                    <Field label="request_id" value={line.requestId} />
                  )}
                  {line.status !== undefined && (
                    <Field label="status" value={String(line.status)} />
                  )}
                  {line.durationMs !== undefined && (
                    <Field label="duration_ms" value={String(line.durationMs)} />
                  )}
                  {line.userId && <Field label="user_id" value={line.userId} />}
                </div>
              )}

              {line.payload && (
                <div>
                  <div className="mc-section-label mb-1">// PAYLOAD</div>
                  <pre
                    className="mc-mono text-[11px] leading-[1.5] p-3 rounded-sm overflow-auto max-h-[180px]"
                    style={{
                      color: 'var(--mc-text-primary)',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid var(--mc-divider-soft)',
                    }}
                  >
                    {JSON.stringify(line.payload, null, 2)}
                  </pre>
                </div>
              )}

              {line.stack && (
                <div>
                  <div className="mc-section-label mb-1">// STACK</div>
                  <pre
                    className="mc-mono text-[11px] leading-[1.5] p-3 rounded-sm overflow-auto max-h-[180px]"
                    style={{
                      color: 'var(--mc-magenta)',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(244,122,165,0.35)',
                    }}
                  >
                    {line.stack}
                  </pre>
                </div>
              )}
            </div>

            <div
              className="px-5 py-2.5 flex items-center justify-between border-t"
              style={{ borderColor: 'var(--mc-divider)' }}
            >
              <span
                className="mc-mono text-[10px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--mc-text-meta-dim)' }}
              >
                id · {line.id}
              </span>
              <span
                className="mc-mono text-[10px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--mc-text-meta-dim)' }}
              >
                esc to close
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span style={{ color: 'var(--mc-text-meta-dim)' }}>{label}</span>
      <span
        className="truncate"
        style={{ color: 'var(--mc-text-primary)' }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
