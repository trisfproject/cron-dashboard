import { formatDate, formatDuration } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

export function LogsTable({ logs }) {
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
            {logs.map((log) => (
              <tr key={log.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{log.cron_name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log.server}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log.env}</td>
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={log.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDuration(log.duration)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(log.timestamp)}</td>
                <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-600">{log.command}</td>
              </tr>
            ))}
            {logs.length === 0 ? (
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

