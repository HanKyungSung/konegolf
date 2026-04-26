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

interface MCPanelHeaderProps {
  label?: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  border?: boolean;
  tight?: boolean;
  flush?: boolean;
  headingId?: string;
  as?: 'h2' | 'div';
}

export function MCPanelHeader({
  label,
  meta,
  right,
  className = '',
  border = false,
  tight = false,
  flush = false,
  headingId,
  as = 'h2',
}: MCPanelHeaderProps) {
  const title = label
    ? React.createElement(
        as,
        { id: headingId, className: 'mc-section-label' },
        label,
      )
    : null;

  return (
    <div
      className={[
        'mc-panel-header',
        border ? 'mc-panel-header-bordered' : '',
        tight ? 'mc-panel-header-tight' : '',
        flush ? 'mc-panel-header-flush' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(title || meta || right) && (
        <div className="mc-panel-header-title">
          {title}
          {meta && <div className="mc-meta mt-1">{meta}</div>}
        </div>
      )}
      {right && <div className="mc-panel-header-actions">{right}</div>}
    </div>
  );
}

export function MCSection({ label, right, children, className = '', borderless = false, panel = true }: MCSectionProps) {
  const panelCls = panel ? 'mc-panel' : '';
  return (
    <section className={`${panelCls} ${className}`}>
      {(label || right) && (
        <MCPanelHeader label={label} right={right} border={!borderless} />
      )}
      {children}
    </section>
  );
}
