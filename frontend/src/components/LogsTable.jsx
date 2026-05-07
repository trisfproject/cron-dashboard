import { formatDate, formatDuration } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

export function LogsTable({ logs = [], variant = 'table' }) {
  const safeLogs = Array.isArray(logs) ? logs : [];

  if (variant === 'activity') {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {safeLogs.map((log, index) => (
            <div key={log?.id ?? `${log?.cron_name ?? 'log'}-${index}`} className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="flex items-center gap-2">
                <StatusBadge status={log?.status} />
                {log?.env ? (
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {log.env}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{log?.cron_name ?? '-'}</p>
                <p className="mt-1 text-xs text-slate-500">{log?.server ?? '-'}</p>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm sm:flex-col sm:items-end sm:gap-1">
                <span className="font-medium text-slate-700">{formatDuration(log?.duration ?? 0)}</span>
                <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(log?.timestamp)}</span>
              </div>
            </div>
          ))}
          {safeLogs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No logs found.</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Cron</th>
              <th className="px-4 py-3">Server</th>
              <th className="px-4 py-3">Env</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Command</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeLogs.map((log, index) => (
              <tr key={log?.id ?? `${log?.cron_name ?? 'log'}-${index}`} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{log?.cron_name ?? '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log?.server ?? '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log?.env ?? '-'}</td>
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={log?.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDuration(log?.duration ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(log?.timestamp)}</td>
                <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-600">{log?.command ?? '-'}</td>
              </tr>
            ))}
            {safeLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No logs found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
