'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, Bell, ClipboardList, ListChecks, Users } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { LogoutButton } from '@/components/LogoutButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getCurrentUser } from '@/lib/api';

export function AppShell({ children }) {
  const pathname = usePathname();
  const authScreen = pathname === '/login';
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (authScreen) {
      return undefined;
    }

    let cancelled = false;

    getCurrentUser()
      .then((data) => {
        if (!cancelled) {
          setUser(data?.user || null);
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

  const isAdmin = user?.role === 'admin';

  if (authScreen) {
    return (
      <div className="min-h-screen bg-surface px-4 py-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-800 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/85">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 md:flex-row md:items-center md:justify-between md:gap-3 md:py-4 lg:px-8">
          <Link href="/" className="flex min-h-12 items-center justify-center md:min-h-10 md:justify-start">
            <BrandMark />
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-slate-600 sm:gap-2">
              <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900" href="/">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Dashboard
              </Link>
              <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900" href="/cron">
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Cron
              </Link>
              {isAdmin ? (
                <>
                  <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900" href="/alerts">
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    Alerts
                  </Link>
                  <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900" href="/users">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    Users
                  </Link>
                  <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-900" href="/audit">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                    Audit
                  </Link>
                </>
              ) : null}
            </nav>
            {user ? (
              <Link href="/account" className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900">
                <span className="max-w-[10rem] truncate font-medium text-slate-700 dark:text-slate-200">{user.name || user.email}</span>
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
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-5 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <footer className="border-t border-slate-200/70 bg-white/60 px-4 py-[calc(0.875rem+env(safe-area-inset-bottom))] text-center text-xs text-slate-500 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/50 dark:text-slate-400 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-center">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-medium tracking-normal text-slate-600 dark:text-slate-300">
            <span>NYX x trisf.bot</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-normal text-slate-500 dark:text-slate-400">DevSecOps</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="font-normal text-slate-500 dark:text-slate-400">TechDev</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
