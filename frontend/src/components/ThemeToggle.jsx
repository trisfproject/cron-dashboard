'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
              active ? 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white dark:bg-blue-500 dark:text-white dark:hover:bg-blue-500' : ''
            }`}
            title={`Use ${option.label} theme`}
            aria-label={`Use ${option.label} theme`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
