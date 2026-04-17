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
}

export function MCHero({ number, label, sublabel, legend }: MCHeroProps) {
  const formatted = typeof number === 'number' ? number.toLocaleString() : number;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mc-hero-label">{label}</h1>
        <div
          key={String(formatted)}
          className="mc-hero-number mc-tick mt-2"
          aria-live="polite"
        >
          {formatted}
        </div>
        {sublabel && (
          <div className="mt-2 text-xs text-[color:var(--mc-gray)]">{sublabel}</div>
        )}
      </div>

      {legend && legend.length > 0 && (
        <ul className="flex flex-col gap-3 pt-4 border-t border-[color:var(--mc-divider-soft)]">
          {legend.map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-xs text-[color:var(--mc-gray)]">
              <MCStatDot variant={item.variant} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
