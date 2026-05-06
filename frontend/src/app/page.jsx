import { AlertTriangle, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { TimelineChart } from '@/components/TimelineChart';
import { LogsTable } from '@/components/LogsTable';
import { getLogs, getStats } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [{ summary, timeline }, { logs }] = await Promise.all([
    getStats(),
    getLogs({ limit: 20 })
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live health and execution trends across monitored cron jobs.</p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ListChecks} label="Total jobs" value={formatNumber(summary.total_jobs)} subtext={`${formatNumber(summary.total_runs)} runs captured`} />
        <MetricCard icon={CheckCircle2} label="Success rate" value={formatPercent(summary.success_rate)} subtext={`${formatNumber(summary.success_count)} successful runs`} />
        <MetricCard icon={AlertTriangle} label="Failed count" value={formatNumber(summary.failed_count)} subtext={`${formatNumber(summary.warning_count)} warnings`} />
        <MetricCard icon={Clock3} label="Average duration" value={formatDuration(summary.average_duration)} subtext="Across all ingested logs" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">Timeline</h2>
          <p className="mt-1 text-sm text-slate-500">Hourly run outcomes from the last seven days.</p>
        </div>
        <TimelineChart data={timeline} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Recent logs</h2>
          <p className="mt-1 text-sm text-slate-500">Latest ingested executions.</p>
        </div>
        <LogsTable logs={logs} />
      </section>
    </div>
  );
}
