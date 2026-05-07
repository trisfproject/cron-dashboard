'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatDate, formatDuration } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

function compareValues(left, right, direction) {
  if (left === right) {
    return 0;
  }

  return (left > right ? 1 : -1) * direction;
}

export function InteractiveLogsTable({ logs = [] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('timestamp_desc');
  const safeLogs = Array.isArray(logs) ? logs : [];

  const filteredLogs = useMemo(() => {
    const search = query.trim().toLowerCase();
    const [field, directionValue] = sort.split('_');
    const direction = directionValue === 'asc' ? 1 : -1;

    return safeLogs
      .filter((log) => {
        const matchesStatus = status === '' ? true : Number(log?.status) === Number(status);
        const haystack = [
          log?.cron_name,
          log?.server,
          log?.env,
          log?.command,
          log?.timestamp
        ].join(' ').toLowerCase();

        return matchesStatus && (search ? haystack.includes(search) : true);
      })
      .sort((left, right) => {
        if (field === 'duration') {
          return compareValues(Number(left?.duration || 0), Number(right?.duration || 0), direction);
        }

        if (field === 'status') {
          return compareValues(Number(left?.status ?? 99), Number(right?.status ?? 99), direction);
        }

        return compareValues(String(left?.timestamp || ''), String(right?.timestamp || ''), direction);
      });
  }, [query, safeLogs, sort, status]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_180px_190px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Search command, server, env"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All statuses</option>
          <option value="0">Success</option>
          <option value="1">Failed</option>
          <option value="2">Warning</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="timestamp_desc">Newest first</option>
          <option value="timestamp_asc">Oldest first</option>
          <option value="duration_desc">Slowest first</option>
          <option value="duration_asc">Fastest first</option>
          <option value="status_desc">Status high to low</option>
          <option value="status_asc">Status low to high</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Server</th>
              <th className="px-4 py-3">Env</th>
              <th className="px-4 py-3">Command</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.map((log, index) => (
              <tr key={log?.id ?? `${log?.cron_name ?? 'log'}-${index}`} className="align-top">
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={log?.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDuration(log?.duration ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(log?.timestamp)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log?.server ?? '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{log?.env ?? '-'}</td>
                <td className="min-w-[28rem] px-4 py-3">
                  <details>
                    <summary className="cursor-pointer truncate font-mono text-xs text-slate-700">{log?.command ?? '-'}</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-100">{log?.command ?? '-'}</pre>
                  </details>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No executions match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
