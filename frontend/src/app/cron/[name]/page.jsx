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
  const { logs } = await getLogs({ cron_name: cronName, server, limit: 200 });
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
