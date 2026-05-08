import { formatDate, formatDuration } from '@/lib/format';
import { EnvironmentBadge, ServiceGroupBadge } from './EnvironmentBadge';
import { ExecutionOutputInspector } from './ExecutionOutputInspector';
import { StatusBadge } from './StatusBadge';

export function LogsTable({ logs = [], variant = 'table' }) {
  const safeLogs = Array.isArray(logs) ? logs : [];

  if (variant === 'activity') {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {safeLogs.map((log, index) => (
            <div key={log?.id ?? `${log?.cron_name ?? 'log'}-${index}`} className="space-y-3 px-4 py-3">
              <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <div className="flex items-center gap-2">
                  <StatusBadge status={log?.status} />
                  {log?.env ? <EnvironmentBadge env={log.env} /> : null}
                  <ServiceGroupBadge serviceGroup={log?.service_group} />
                </div>
                <div className="min-w-0">
                  <p className="break-words font-medium text-ink sm:truncate">{log?.cron_name ?? '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">{log?.server ?? '-'}</p>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm sm:flex-col sm:items-end sm:gap-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{formatDuration(log?.duration ?? 0)}</span>
                  <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(log?.timestamp)}</span>
                </div>
              </div>
              <ExecutionOutputInspector log={log} compact />
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
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Command</th>
              <th className="px-4 py-3">Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeLogs.map((log, index) => (
              <tr key={log?.id ?? `${log?.cron_name ?? 'log'}-${index}`} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{log?.cron_name ?? '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log?.server ?? '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log?.env ? <EnvironmentBadge env={log.env} /> : '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600"><ServiceGroupBadge serviceGroup={log?.service_group} />{!log?.service_group ? '-' : null}</td>
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={log?.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDuration(log?.duration ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(log?.timestamp)}</td>
                <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-600">{log?.command ?? '-'}</td>
                <td className="min-w-[24rem] px-4 py-3">
                  <ExecutionOutputInspector log={log} compact />
                </td>
              </tr>
            ))}
            {safeLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>No logs found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
