import { DurationChart } from '@/components/TimelineChart';
import { LogsTable } from '@/components/LogsTable';
import { MetricCard } from '@/components/MetricCard';
import { getLogs } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { Activity, Clock3, Server, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function CronDetailPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const cronName = resolvedParams.name;
  const server = resolvedSearchParams?.server;
  const status = resolvedSearchParams?.status;
  const limit = resolvedSearchParams?.limit || 200;
  let logs = [];
  let error = null;

  try {
    const response = await getLogs({ cron_name: cronName, server, status, limit });
    logs = Array.isArray(response?.logs) ? response.logs : [];
  } catch (fetchError) {
    console.error('Failed to fetch cron detail logs:', fetchError);
    error = fetchError?.message || 'Failed to load cron logs';
  }

  const total = logs.length;
  const success = logs.filter((log) => Number(log.status) === 0).length;
  const failed = logs.filter((log) => Number(log.status) === 1).length;
  const averageDuration = total === 0 ? 0 : logs.reduce((sum, log) => sum + Number(log.duration || 0), 0) / total;
  const chartData = [...logs]
    .reverse()
    .map((log) => ({
      timestamp: new Date(log.timestamp).toLocaleString(),
      duration: Number(log.duration || 0)
    }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-ink">{cronName}</h1>
        <p className="mt-1 text-sm text-slate-500">{server ? `Server: ${server}` : 'All servers'}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_140px_auto]" action={`/cron/${encodeURIComponent(cronName)}`}>
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="server"
          placeholder="Filter by server"
          defaultValue={server || ''}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="status"
          defaultValue={status || ''}
        >
          <option value="">All statuses</option>
          <option value="0">Success</option>
          <option value="1">Failed</option>
          <option value="2">Warning</option>
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          name="limit"
          defaultValue={String(limit)}
        >
          <option value="50">50 logs</option>
          <option value="100">100 logs</option>
          <option value="200">200 logs</option>
          <option value="500">500 logs</option>
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" type="submit">
          Apply
        </button>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label="Executions" value={formatNumber(total)} subtext="Most recent 200 logs" />
        <MetricCard icon={ShieldCheck} label="Success rate" value={formatPercent(total ? (success / total) * 100 : 0)} subtext={`${formatNumber(failed)} failures`} />
        <MetricCard icon={Clock3} label="Average duration" value={formatDuration(averageDuration)} subtext="For the selected history" />
        <MetricCard icon={Server} label="Scope" value={server || 'All'} subtext="Filtered execution source" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">Duration trend</h2>
          <p className="mt-1 text-sm text-slate-500">Execution duration across recent runs.</p>
        </div>
        <DurationChart data={chartData} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Execution history</h2>
          <p className="mt-1 text-sm text-slate-500">Raw logs for this cron job.</p>
        </div>
        <LogsTable logs={logs} />
      </section>
    </div>
  );
}
