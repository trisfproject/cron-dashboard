import './globals.css';
import Link from 'next/link';
import { Activity, ListChecks } from 'lucide-react';

export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'Cron Dashboard',
  description: 'Production cron monitoring dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-surface">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <Link href="/" className="flex items-center gap-3">
                <span className="rounded-md bg-ink p-2 text-white">
                  <Activity className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-lg font-semibold text-ink">Cron Dashboard</span>
              </Link>
              <nav className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Link className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100" href="/">
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  Dashboard
                </Link>
                <Link className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100" href="/cron">
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  Cron
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

