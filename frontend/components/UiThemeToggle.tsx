import React from 'react';
import { MonitorCog } from 'lucide-react';
import { useUiTheme } from '@/hooks/use-ui-theme';

interface UiThemeToggleProps {
  variant?: 'admin' | 'mc' | 'ghost';
  fullWidth?: boolean;
  className?: string;
}

export function UiThemeToggle({
  variant = 'admin',
  fullWidth = false,
  className = '',
}: UiThemeToggleProps) {
  const { isMissionControlTheme, toggleUiTheme } = useUiTheme();
  const activeLabel = isMissionControlTheme ? 'New' : 'Old';
  const nextLabel = isMissionControlTheme ? 'old UI' : 'new Mission Control UI';

  return (
    <button
      type="button"
      className={`kg-theme-toggle kg-theme-toggle--${variant} ${fullWidth ? 'kg-theme-toggle--full' : ''} ${className}`}
      onClick={toggleUiTheme}
      aria-pressed={isMissionControlTheme}
      title={`Switch to ${nextLabel}`}
      aria-label={`UI theme is ${activeLabel}. Switch to ${nextLabel}.`}
    >
      <span className="kg-theme-toggle__icon" aria-hidden>
        <MonitorCog className="h-3.5 w-3.5" />
      </span>
      <span className="kg-theme-toggle__title">Theme</span>
      <span className="kg-theme-toggle__track" aria-hidden>
        <span className="kg-theme-toggle__thumb" />
        <span className="kg-theme-toggle__option kg-theme-toggle__option--old">
          Old
        </span>
        <span className="kg-theme-toggle__option kg-theme-toggle__option--new">
          New
        </span>
      </span>
    </button>
  );
}
