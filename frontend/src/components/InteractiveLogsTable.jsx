'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { formatDate, formatDuration } from '@/lib/format';
import { ExecutionOutputInspector } from './ExecutionOutputInspector';
import { StatusBadge } from './StatusBadge';

function compareValues(left, right, direction) {
  if (left === right) {
    return 0;
  }

  return (left > right ? 1 : -1) * direction;
}

function statusAccent(status) {
  return {
    0: 'border-l-emerald-500',
    1: 'border-l-rose-500',
    2: 'border-l-amber-500'
  }[Number(status)] || 'border-l-slate-400';
}

function statusDetail(status) {
  return {
    0: 'Execution completed successfully.',
    1: 'Failure captured for this execution. Review command context and upstream output.',
    2: 'Warning captured for this execution. Check partial failures, retries, or degraded dependencies.'
  }[Number(status)] || 'Unknown execution status.';
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

      <div className="space-y-3 p-3 md:hidden">
        {filteredLogs.map((log, index) => (
          <article
            key={log?.id ?? `${log?.cron_name ?? 'log'}-${index}`}
            className={`space-y-3 rounded-lg border border-l-4 border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${statusAccent(log?.status)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <StatusBadge status={log?.status} />
              <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(log?.timestamp)}</span>
            </div>
            <div>
              <p className="break-words font-medium text-ink">{log?.cron_name ?? '-'}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                  {log?.server ?? '-'}
                </span>
                <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                  {log?.env ?? '-'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Duration</span>
              <span className="font-medium text-slate-700">{formatDuration(log?.duration ?? 0)}</span>
            </div>
            <details>
              <summary className="min-h-10 cursor-pointer rounded-md py-2 text-sm font-medium text-blue-700 dark:text-blue-300">Execution details</summary>
              <div className="space-y-3 pt-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Command</p>
                  <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-100">{log?.command ?? '-'}</pre>
                </div>
                <ExecutionOutputInspector log={log} compact />
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>
                    <p className="font-medium text-slate-600 dark:text-slate-300">Created</p>
                    <p className="mt-1 break-words">{formatDate(log?.created_at)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-600 dark:text-slate-300">Hash</p>
                    <p className="mt-1 break-all font-mono">{log?.hash ?? '-'}</p>
                  </div>
                </div>
                <p className="rounded-md bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                  {statusDetail(log?.status)}
                </p>
              </div>
            </details>
          </article>
        ))}
        {filteredLogs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">No executions match the current filters.</div>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Server</th>
              <th className="px-4 py-3">Env</th>
              <th className="px-4 py-3">Command</th>
              <th className="px-4 py-3">Output</th>
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
                <td className="min-w-[28rem] px-4 py-3">
                  <ExecutionOutputInspector log={log} />
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No executions match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
