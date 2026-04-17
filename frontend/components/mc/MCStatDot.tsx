import React from 'react';

type Variant = 'cyan' | 'purple' | 'magenta' | 'gray' | 'dim';

interface MCStatDotProps {
  variant?: Variant;
  pulse?: boolean;
  className?: string;
}

export function MCStatDot({ variant = 'cyan', pulse = false, className = '' }: MCStatDotProps) {
  return (
    <span
      className={`mc-dot mc-dot-${variant} ${pulse ? 'mc-pulse' : ''} ${className}`}
      aria-hidden="true"
    />
  );
}
