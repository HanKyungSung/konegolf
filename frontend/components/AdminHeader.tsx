import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { buttonStyles } from '@/styles/buttonStyles';
import { useAuth } from '@/hooks/use-auth';
import { Menu, X } from 'lucide-react';

interface NavItem {
  label: string;
  to?: string;         // For Link-based navigation
  onClick?: () => void; // For callback-based navigation
  show?: boolean;       // Conditional visibility (default: true)
}

interface AdminHeaderProps {
  /** Main title text */
  title: string;
  /** Subtitle text shown next to title on desktop */
  subtitle?: string;
  /** Navigation items shown before logout */
  navItems?: NavItem[];
  /** Visual variant */
  variant?: 'pos' | 'admin' | 'mc';
  /** Whether header is sticky */
  sticky?: boolean;
  /** [mc variant only] extra content rendered in the right cluster
   *  before the user identity + logout (e.g. clock pill, health dot) */
  mcRightExtras?: React.ReactNode;
}

export function AdminHeader({
  title,
  subtitle,
  navItems = [],
  variant = 'pos',
  sticky = false,
  mcRightExtras,
}: AdminHeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const visibleNavItems = navItems.filter(item => item.show !== false);

  // Mission Control variant — minimal dark header that blends with the MC dashboard
  if (variant === 'mc') {
    return (
      <header
        className={`border-b border-[color:var(--mc-divider-soft)] bg-[color:var(--mc-bg)] ${sticky ? 'sticky top-0 z-50' : ''}`}
      >
        <div className="mx-auto px-4 sm:px-8 2xl:pl-[224px] 2xl:pr-[244px] max-w-[1800px] 2xl:max-w-none">
          <div className="flex items-center justify-between h-14">
            {/* Left: wordmark + live tick */}
            <Link to="/" className="flex items-center gap-3 min-w-0 group">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mc-pulse"
                style={{ background: 'var(--mc-cyan)' }}
                aria-hidden
              />
              <h1 className="text-[15px] font-semibold tracking-wide text-[color:var(--mc-white)] group-hover:text-[color:var(--mc-cyan)] transition-colors truncate">
                {title}
              </h1>
              {subtitle && (
                <span className="mc-mono text-xs text-[color:var(--mc-gray)] hidden md:inline">
                  {subtitle}
                </span>
              )}
            </Link>

            {/* Right: desktop nav */}
            <div className="hidden sm:flex items-center gap-2">
              {mcRightExtras}
              {visibleNavItems.map((item, i) =>
                item.to ? (
                  <Link key={i} to={item.to}>
                    <button className="mc-chip">{item.label}</button>
                  </Link>
                ) : (
                  <button key={i} className="mc-chip" onClick={item.onClick}>
                    {item.label}
                  </button>
                )
              )}
              <span className="mc-mono text-[12px] text-[color:var(--mc-text-meta)] truncate max-w-[200px] px-2">
                {user?.email || user?.name}
              </span>
              <button
                className="mc-chip"
                style={{ color: 'var(--mc-magenta)', borderColor: 'rgba(244,122,165,0.35)' }}
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>

            {/* Right: mobile hamburger */}
            <button
              className="sm:hidden p-2 text-[color:var(--mc-gray)] hover:text-[color:var(--mc-white)]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-[color:var(--mc-divider-soft)] bg-[color:var(--mc-bg)]">
            <div className="px-4 py-3 flex flex-col gap-2">
              <div className="mc-mono text-xs text-[color:var(--mc-gray)] pb-2 border-b border-[color:var(--mc-divider-soft)]">
                {user?.email || user?.name}
              </div>
              {visibleNavItems.map((item, i) =>
                item.to ? (
                  <Link
                    key={i}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block"
                  >
                    <button className="mc-chip w-full justify-start">{item.label}</button>
                  </Link>
                ) : (
                  <button
                    key={i}
                    className="mc-chip w-full justify-start"
                    onClick={() => {
                      item.onClick?.();
                      setMobileMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                )
              )}
              <button
                className="mc-chip w-full justify-start"
                style={{ color: 'var(--mc-magenta)', borderColor: 'rgba(244,122,165,0.35)' }}
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </header>
    );
  }

  const headerBg = variant === 'admin'
    ? 'bg-slate-900/80 backdrop-blur-sm'
    : 'bg-slate-800';

  const containerClass = variant === 'admin'
    ? 'max-w-7xl mx-auto px-3 sm:px-6 lg:px-8'
    : 'container mx-auto px-3 sm:px-6';

  return (
    <header className={`border-b border-slate-700 ${headerBg} ${sticky ? 'sticky top-0 z-50' : ''}`}>
      <div className={containerClass}>
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Title */}
          <Link to="/" className="flex items-center min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent truncate">
              {title}
            </h1>
            {subtitle && (
              <span className="ml-2 text-sm text-slate-400 hidden md:inline">{subtitle}</span>
            )}
          </Link>

          {/* Right: Desktop nav */}
          <div className="hidden sm:flex items-center gap-3 sm:gap-4">
            {visibleNavItems.map((item, i) => (
              item.to ? (
                <Link key={i} to={item.to}>
                  <Button variant="outline" size="sm" className={buttonStyles.headerNav}>
                    {item.label}
                  </Button>
                </Link>
              ) : (
                <Button key={i} variant="outline" size="sm" className={buttonStyles.headerNav} onClick={item.onClick}>
                  {item.label}
                </Button>
              )
            ))}
            <span className="text-sm text-slate-300 truncate max-w-[160px]">
              {variant === 'admin' ? `Admin: ${user?.name}` : user?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className={buttonStyles.headerLogout}
            >
              {variant === 'admin' ? 'Sign Out' : 'Logout'}
            </Button>
          </div>

          {/* Right: Mobile hamburger */}
          <button
            className="sm:hidden p-2 text-slate-300 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-700 bg-slate-800/95 backdrop-blur-sm">
          <div className="px-4 py-3 space-y-2">
            <div className="text-sm text-slate-400 pb-1 border-b border-slate-700 mb-2">
              {variant === 'admin' ? user?.name : user?.email}
            </div>
            {visibleNavItems.map((item, i) => (
              item.to ? (
                <Link key={i} to={item.to} onClick={() => setMobileMenuOpen(false)} className="block">
                  <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700">
                    {item.label}
                  </Button>
                </Link>
              ) : (
                <Button key={i} variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => { item.onClick?.(); setMobileMenuOpen(false); }}>
                  {item.label}
                </Button>
              )
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-slate-700"
            >
              {variant === 'admin' ? 'Sign Out' : 'Logout'}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}