import React from 'react';
import { MCStatDot } from './MCStatDot';

interface LegendItem {
  label: string;
  variant: 'cyan' | 'purple' | 'magenta' | 'gray' | 'dim';
}

interface MCHeroProps {
  number: number | string;
  label: string;
  sublabel?: string;
  legend?: LegendItem[];
  /** Show magenta accent underline below number (like GitHub HQ "Collaborations Today") */
  accent?: boolean;
  /** Muted variant — used for secondary stats (left-most card in reference) */
  muted?: boolean;
}

export function MCHero({ number, label, sublabel, legend, accent = false, muted = false }: MCHeroProps) {
  const formatted = typeof number === 'number' ? number.toLocaleString() : number;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mc-panel-label">{label}</h1>
        <div
          key={String(formatted)}
          className={`mc-hero-number mc-tick ${muted ? 'mc-hero-number-muted' : ''}`}
          aria-live="polite"
        >
          {formatted}
        </div>
        {accent && <span className="mc-hero-underline" aria-hidden="true" />}
        {sublabel && (
          <div className="mt-2 text-[11px] text-[color:var(--mc-gray)]">{sublabel}</div>
        )}
      </div>

      {legend && legend.length > 0 && (
        <ul className="flex flex-col gap-2 pt-3 border-t border-[color:var(--mc-divider-soft)]">
          {legend.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px] text-[color:var(--mc-gray)]">
              <MCStatDot variant={item.variant} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

