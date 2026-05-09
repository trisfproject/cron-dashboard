import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'NYX Monitoring Platform',
  description: 'Enterprise monitoring platform for operational observability, alerts, and cron reliability',
  icons: {
    icon: [
      { url: '/favicon.ico?v=20260509', sizes: 'any' }
    ],
    shortcut: ['/favicon.ico?v=20260509']
  }
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
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
