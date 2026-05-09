'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Bell, ClipboardList, Info, ListChecks, Menu, UserCircle, Users, X } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { LogoutButton } from '@/components/LogoutButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { appMetadata } from '@/lib/appMetadata';
import { getCurrentUser, recordPasswordReminderShown } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: Activity, adminOnly: false },
  { href: '/cron', label: 'Cron', icon: ListChecks, adminOnly: false },
  { href: '/alerts', label: 'Alerts', icon: Bell, adminOnly: true },
  { href: '/users', label: 'Users', icon: Users, adminOnly: true },
  { href: '/audit', label: 'Audit', icon: ClipboardList, adminOnly: true },
  { href: '/about', label: 'About', icon: Info, adminOnly: true }
];

function isActivePath(pathname, href) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function passwordReminderMessage(security) {
  const age = Number(security?.password_age_days || 0);

  if (security?.password_reminder_stage === 'force_ready') {
    return `Your password is ${age} days old. Password change enforcement is not active yet, but you should update it now to maintain account security.`;
  }

  if (security?.password_reminder_stage === 'strong_warning') {
    return `Your password is ${age} days old. Please update your password soon to maintain account security.`;
  }

  return 'Your password is over 30 days old. Please update your password to maintain account security.';
}

function AuthBootstrapScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <section className="flex w-full max-w-sm flex-col items-center gap-5 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <BrandMark />
        <div className="space-y-2">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-400" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Validating secure session...</p>
        </div>
      </section>
    </div>
  );
}

export function AppShell({ children }) {
  const pathname = usePathname();
  const authScreen = pathname === '/login';
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(authScreen);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dismissedPasswordReminder, setDismissedPasswordReminder] = useState(false);

  useEffect(() => {
    if (authScreen) {
      setAuthReady(true);
      return undefined;
    }

    let cancelled = false;
    setAuthReady(false);

    getCurrentUser()
      .then((data) => {
        if (!cancelled) {
          if (data?.user) {
            setUser(data.user);
            setAuthReady(true);
          } else {
            setUser(null);
            window.location.assign('/login');
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          window.location.assign('/login');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authScreen]);

  useEffect(() => {
    function handleUserUpdated(event) {
      if (event.detail) {
        setUser(event.detail);
      }
    }

    window.addEventListener('nyx:user-updated', handleUserUpdated);

    return () => {
      window.removeEventListener('nyx:user-updated', handleUserUpdated);
    };
  }, []);

  const isAdmin = user?.role === 'admin';
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const passwordSecurity = user?.password_security;
  const passwordReminderRequired = Boolean(passwordSecurity?.password_reminder_required);
  const passwordReminderKey = user && passwordReminderRequired
    ? `nyx-password-reminder:${user.id}:${passwordSecurity.password_reminder_stage}:${passwordSecurity.password_age_days}`
    : '';
  const showPasswordReminder = passwordReminderRequired && !dismissedPasswordReminder;

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!passwordReminderKey) {
      setDismissedPasswordReminder(false);
      return;
    }

    setDismissedPasswordReminder(sessionStorage.getItem(passwordReminderKey) === 'dismissed');
  }, [passwordReminderKey]);

  useEffect(() => {
    if (!showPasswordReminder || !passwordSecurity) {
      return;
    }

    const auditKey = `${passwordReminderKey}:audited`;
    if (sessionStorage.getItem(auditKey) === '1') {
      return;
    }

    sessionStorage.setItem(auditKey, '1');
    recordPasswordReminderShown({
      stage: passwordSecurity.password_reminder_stage,
      age_days: passwordSecurity.password_age_days
    }).catch(() => {});
  }, [passwordReminderKey, passwordSecurity, showPasswordReminder]);

  function dismissPasswordReminder() {
    if (passwordReminderKey) {
      sessionStorage.setItem(passwordReminderKey, 'dismissed');
    }

    setDismissedPasswordReminder(true);
  }

  useEffect(() => {
    if (!drawerOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerOpen]);

  if (authScreen) {
    return (
      <div className="min-h-screen bg-surface px-4 py-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
        {children}
      </div>
    );
  }

  if (!authReady) {
    return <AuthBootstrapScreen />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-800 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/85">
        <div className="mx-auto flex min-h-[4rem] max-w-7xl items-center justify-between gap-3 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 lg:min-h-[4.5rem] lg:gap-5 lg:px-8">
          <Link href="/" className="mr-1 flex min-h-11 min-w-0 items-center rounded-md pr-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 lg:mr-2 lg:pr-3">
            <BrandMark variant="navbar" />
          </Link>
          <div className="hidden min-w-0 items-center justify-end gap-3 lg:flex">
            <nav className="flex min-w-0 items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    className={`flex min-h-10 items-center gap-2 rounded-md px-3 py-2 transition-colors ${
                      active
                        ? 'bg-slate-100 text-ink dark:bg-slate-900 dark:text-white'
                        : 'hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-900 dark:hover:text-white'
                    }`}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user ? (
              <Link href="/account" className="flex min-h-10 max-w-[13rem] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900">
                <UserCircle className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="truncate font-medium text-slate-700 dark:text-slate-200">{user.name || user.email}</span>
                <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ring-1 ${
                  isAdmin
                    ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900'
                    : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
                }`}
                >
                  {user.role}
                </span>
              </Link>
            ) : null}
            <ThemeToggle />
            <LogoutButton showLabel={false} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white" />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:focus:ring-offset-slate-950 lg:hidden"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="nyx-navigation-drawer"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      {showPasswordReminder ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              <p className="min-w-0 leading-6">
                {passwordReminderMessage(passwordSecurity)}
                <Link href="/account" className="ml-2 font-semibold underline decoration-amber-500/60 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-50">
                  Change password
                </Link>
              </p>
            </div>
            <button
              type="button"
              onClick={dismissPasswordReminder}
              className="flex min-h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          className={`absolute inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          id="nyx-navigation-drawer"
          className={`absolute right-0 top-0 flex h-full w-[min(22rem,calc(100vw-2rem))] max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950 ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
          aria-label="Navigation menu"
        >
          <div className="flex min-h-[4rem] items-center justify-between gap-3 border-b border-slate-200 px-4 pt-[env(safe-area-inset-top)] dark:border-slate-800">
            <Link href="/" className="min-w-0 rounded-md pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950">
              <BrandMark variant="navbar" />
            </Link>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white dark:focus:ring-offset-slate-950"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {user ? (
              <Link href="/account" className="mb-4 flex min-h-14 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                <UserCircle className="h-6 w-6 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink dark:text-slate-100">{user.name || user.email}</span>
                  <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase leading-5 ring-1 ${
                    isAdmin
                      ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900'
                      : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800'
                  }`}
                  >
                    {user.role}
                  </span>
                </span>
              </Link>
            ) : null}
            <nav className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-12 items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900'
                        : 'hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-900 dark:hover:text-white'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <Link
                href="/account"
                className={`flex min-h-12 items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                  isActivePath(pathname, '/account')
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900'
                    : 'hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-900 dark:hover:text-white'
                }`}
                aria-current={isActivePath(pathname, '/account') ? 'page' : undefined}
              >
                <UserCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>Account/Profile</span>
              </Link>
            </nav>
          </div>
          <div className="space-y-3 border-t border-slate-200 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Theme</span>
              <ThemeToggle />
            </div>
            <LogoutButton className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-ink dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white" />
          </div>
        </aside>
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-5 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <footer className="bg-white/70 px-4 text-xs text-slate-500 backdrop-blur dark:bg-slate-950/60 dark:text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl border-t border-slate-200/80 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-3 text-center dark:border-slate-800/50">
          <p className="truncate font-medium tracking-normal">
            <span className="text-slate-600 dark:text-slate-300">NYX v{appMetadata.version} x trisf.bot</span>
            <span className="mx-1.5 text-slate-300 dark:text-slate-700">•</span>
            <span>DevSecOps</span>
            <span className="mx-1.5 text-slate-300 dark:text-slate-700">•</span>
            <span>TechDev</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
