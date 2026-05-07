import Link from 'next/link';
import { getCronList } from '@/lib/api';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function CronListPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const nameFilter = resolvedSearchParams?.cron_name || '';
  const serverFilter = resolvedSearchParams?.server || '';
  const statusFilter = resolvedSearchParams?.status || '';
  const rangeFilter = ['today', '7d', '30d'].includes(resolvedSearchParams?.range)
    ? resolvedSearchParams.range
    : 'today';
  const rangeLabel = {
    today: 'today',
    '7d': 'the last 7 days',
    '30d': 'the last 30 days'
  }[rangeFilter];
  let jobs = [];
  let error = null;

  try {
    const response = await getCronList({ range: rangeFilter });
    jobs = Array.isArray(response?.jobs) ? response.jobs : [];
  } catch (fetchError) {
    console.error('Failed to fetch cron list:', fetchError);
    error = fetchError?.message || 'Failed to load cron jobs';
  }

  const filteredJobs = jobs.filter((job) => {
    const cronName = String(job?.cron_name ?? '');
    const server = String(job?.server ?? '');
    const matchesName = nameFilter ? cronName.toLowerCase().includes(nameFilter.toLowerCase()) : true;
    const matchesServer = serverFilter ? server.toLowerCase().includes(serverFilter.toLowerCase()) : true;
    const matchesStatus = statusFilter !== '' ? Number(job.last_status) === Number(statusFilter) : true;

    return matchesName && matchesServer && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Cron jobs</h1>
        <p className="mt-1 text-sm text-slate-500">Daily cron health overview. Metrics calculated from {rangeLabel} in WIB.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_160px_180px_auto]" action="/cron">
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="cron_name"
          placeholder="Filter by cron name"
          defaultValue={nameFilter}
        />
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="server"
          placeholder="Filter by server"
          defaultValue={serverFilter}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="range"
          defaultValue={rangeFilter}
        >
          <option value="today">Today</option>
          <option value="7d">7D</option>
          <option value="30d">30D</option>
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="status"
          defaultValue={statusFilter}
        >
          <option value="">All statuses</option>
          <option value="0">Success</option>
          <option value="1">Failed</option>
          <option value="2">Warning</option>
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" type="submit">
          Apply
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
          Last status, last run freshness, runs, success rate, and average duration are calculated only from {rangeLabel} using the Asia/Jakarta day boundary.
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {filteredJobs.map((job, index) => (
            <article key={`${job?.cron_name ?? 'cron'}-${job?.server ?? 'server'}-mobile-${index}`} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <Link className="min-w-0 break-words font-medium text-ink hover:text-blue-700" href={`/cron/${encodeURIComponent(job?.cron_name ?? '')}?server=${encodeURIComponent(job?.server ?? '')}`}>
                  {job?.cron_name ?? '-'}
                </Link>
                <StatusBadge status={job?.last_status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Server</p>
                  <p className="mt-1 truncate text-slate-700">{job?.server ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Env</p>
                  <p className="mt-1 truncate text-slate-700">{job?.env ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Runs</p>
                  <p className="mt-1 font-medium text-slate-700">{formatNumber(job?.total_runs ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Success</p>
                  <p className="mt-1 font-medium text-slate-700">{formatPercent(job?.success_rate ?? 0)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <span>Avg duration: {formatDuration(job?.avg_duration ?? 0)}</span>
                <span>Last run: {formatDate(job?.last_run)}</span>
              </div>
            </article>
          ))}
          {filteredJobs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No cron executions found for {rangeLabel}.</div>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-4 py-3">Cron</th>
                <th className="px-4 py-3">Server</th>
                <th className="px-4 py-3">Env</th>
                <th className="px-4 py-3">Last status</th>
                <th className="px-4 py-3">Last run freshness</th>
                <th className="px-4 py-3">Avg duration</th>
                <th className="px-4 py-3">Success rate</th>
                <th className="px-4 py-3">Runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.map((job, index) => (
                <tr key={`${job?.cron_name ?? 'cron'}-${job?.server ?? 'server'}-${index}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                    <Link className="hover:text-blue-700" href={`/cron/${encodeURIComponent(job?.cron_name ?? '')}?server=${encodeURIComponent(job?.server ?? '')}`}>
                      {job?.cron_name ?? '-'}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{job?.server ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{job?.env ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={job?.last_status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(job?.last_run)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDuration(job?.avg_duration ?? 0)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatPercent(job?.success_rate ?? 0)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatNumber(job?.total_runs ?? 0)}</td>
                </tr>
              ))}
              {filteredJobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>No cron executions found for {rangeLabel}.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
