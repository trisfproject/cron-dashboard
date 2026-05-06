import Link from 'next/link';
import { getCronList } from '@/lib/api';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function CronListPage() {
  const { jobs } = await getCronList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">Cron jobs</h1>
        <p className="mt-1 text-sm text-slate-500">Grouped by cron name and server, ordered by most recent execution.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-4 py-3">Cron</th>
                <th className="px-4 py-3">Server</th>
                <th className="px-4 py-3">Env</th>
                <th className="px-4 py-3">Last status</th>
                <th className="px-4 py-3">Last run</th>
                <th className="px-4 py-3">Avg duration</th>
                <th className="px-4 py-3">Success rate</th>
                <th className="px-4 py-3">Runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={`${job.cron_name}-${job.server}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                    <Link className="hover:text-blue-700" href={`/cron/${encodeURIComponent(job.cron_name)}?server=${encodeURIComponent(job.server)}`}>
                      {job.cron_name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{job.server}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{job.env}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={job.last_status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(job.last_run)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDuration(job.avg_duration)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatPercent(job.success_rate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatNumber(job.total_runs)}</td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>No cron jobs have been ingested yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
