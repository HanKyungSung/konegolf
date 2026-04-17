import React from 'react';

interface MCSectionProps {
  label?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  borderless?: boolean;
  /** Render as a raised panel (filled surface) — default true */
  panel?: boolean;
}

export function MCSection({ label, right, children, className = '', borderless = false, panel = true }: MCSectionProps) {
  const panelCls = panel ? 'mc-panel' : '';
  return (
    <section className={`${panelCls} ${className}`}>
      {(label || right) && (
        <div
          className={`flex items-center justify-between pb-3 mb-5 ${
            borderless ? '' : 'border-b border-[color:var(--mc-divider-soft)]'
          }`}
        >
          {label && <h2 className="mc-section-label">{label}</h2>}
          {right && <div className="flex items-center gap-3">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
