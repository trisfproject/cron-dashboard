'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { TimelineChart } from '@/components/TimelineChart';
import { LogsTable } from '@/components/LogsTable';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { getLogs, getStats } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

const emptyStats = {
  summary: {},
  timeline: [],
  range: '7d'
};

function normalizeStatsResponse(data, range) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;

  return {
    summary: source?.summary && typeof source.summary === 'object' ? source.summary : {},
    timeline: Array.isArray(source?.timeline) ? source.timeline : [],
    range: source?.range || range
  };
}

function normalizeLogsResponse(data) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;
  return Array.isArray(source?.logs) ? source.logs : [];
}

function DashboardContent({ initialRange = '7d' }) {
  const [range, setRange] = useState(initialRange);
  const [stats, setStats] = useState(emptyStats);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    async function loadDashboard() {
      try {
        const [statsData, logsData] = await Promise.all([
          getStats({ range }),
          getLogs({ range, limit: 20 })
        ]);

        console.log('stats response', statsData);
        console.log('logs response', logsData);

        if (cancelled) {
          return;
        }

        setStats(normalizeStatsResponse(statsData, range));
        setLogs(normalizeLogsResponse(logsData));
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);

        if (!cancelled) {
          setError(error?.message || 'Failed to load dashboard');
          setStats(emptyStats);
          setLogs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [range]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Live health and execution trends across monitored cron jobs.</p>
          </div>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-8">
          <p className="text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Live health and execution trends across monitored cron jobs.</p>
          </div>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8">
          <div>
            <p className="font-semibold text-red-900">Failed to load dashboard</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <p className="text-xs text-red-600 mt-2">Check browser console for details.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-ink">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Live health and execution trends across monitored cron jobs.</p>
          </div>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-yellow-200 bg-yellow-50 p-8">
          <p className="text-yellow-800">No data available</p>
        </div>
      </div>
    );
  }

  const summary = stats?.summary ?? {};
  const timeline = Array.isArray(stats?.timeline) ? stats.timeline : [];
  const logsArray = Array.isArray(logs) ? logs : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live health and execution trends across monitored cron jobs.</p>
        </div>
        <TimeRangeFilter selectedRange={range} onRangeChange={setRange} />
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard 
          icon={ListChecks} 
          label="Total jobs" 
          value={formatNumber(summary.total_jobs ?? 0)} 
          subtext={`${formatNumber(summary.total_runs ?? 0)} runs captured`} 
        />
        <MetricCard 
          icon={CheckCircle2} 
          label="Success rate" 
          value={formatPercent(summary.success_rate ?? 0)} 
          subtext={`${formatNumber(summary.success_count ?? 0)} successful runs`} 
        />
        <MetricCard 
          icon={AlertTriangle} 
          label="Failed count" 
          value={formatNumber(summary.failed_count ?? 0)} 
          subtext={`${formatNumber(summary.warning_count ?? 0)} warnings`} 
        />
        <MetricCard 
          icon={Clock3} 
          label="Average duration" 
          value={formatDuration(summary.average_duration ?? 0)} 
          subtext="Across all ingested logs" 
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">Timeline</h2>
          <p className="mt-1 text-sm text-slate-500">
            {range === 'today' && 'Hourly run outcomes from today.'}
            {range === '7d' && 'Hourly run outcomes from the last seven days.'}
            {range === '30d' && 'Daily run outcomes from the last thirty days.'}
            {range === 'quarter' && 'Daily run outcomes from the last ninety days.'}
            {range === 'year' && 'Monthly run outcomes from the last year.'}
          </p>
        </div>
        <TimelineChart data={timeline} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Recent logs</h2>
          <p className="mt-1 text-sm text-slate-500">Latest ingested executions.</p>
        </div>
        <LogsTable logs={logsArray} />
      </section>
    </div>
  );
}

function DashboardWithSearchParams() {
  const searchParams = useSearchParams();
  const range = searchParams?.get('range') || '7d';

  return <DashboardContent initialRange={range} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <DashboardWithSearchParams />
    </Suspense>
  );
}
