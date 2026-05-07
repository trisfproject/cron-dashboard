import './globals.css';
import Link from 'next/link';
import { Activity, Bell, ListChecks } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'Cron Dashboard',
  description: 'Production cron monitoring dashboard'
};

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem('nyx-theme') || 'system';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = stored === 'system' ? (systemDark ? 'dark' : 'light') : stored;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.dataset.theme = stored;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.theme = 'system';
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <div className="flex min-h-screen flex-col bg-surface">
            <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-800 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/85">
              <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 md:flex-row md:items-center md:justify-between md:gap-3 md:py-4 lg:px-8">
                <Link href="/" className="flex min-h-12 items-center justify-center md:min-h-10 md:justify-start">
                  <BrandMark />
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-slate-600 sm:gap-2">
                    <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100" href="/">
                      <Activity className="h-4 w-4" aria-hidden="true" />
                      Dashboard
                    </Link>
                    <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100" href="/cron">
                      <ListChecks className="h-4 w-4" aria-hidden="true" />
                      Cron
                    </Link>
                    <Link className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-100" href="/alerts">
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      Alerts
                    </Link>
                  </nav>
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-5 sm:px-6 sm:py-8 lg:px-8">{children}</main>
            <footer className="border-t border-slate-200/70 bg-white/60 px-4 py-[calc(0.875rem+env(safe-area-inset-bottom))] text-center text-xs text-slate-500 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/50 dark:text-slate-400 sm:px-6">
              <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-1 sm:flex-row sm:justify-between">
                <p className="font-medium tracking-normal text-slate-600 dark:text-slate-300">NYX × trisf.bot</p>
                <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <span>Production</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>WIB</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>Live Monitoring</span>
                </p>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
