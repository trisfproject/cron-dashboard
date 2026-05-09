'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Clock3, Gauge, RotateCcw, ShieldCheck, TimerReset } from 'lucide-react';
import { formatApiError, getReliabilityReport, getScopeOptions } from '@/lib/api';
import { formatNumber, formatPercent } from '@/lib/format';

const VALID_RANGES = new Set(['today', '7d', '30d']);
const VALID_SORTS = new Set(['downtime', 'incidents']);
const selectClass = 'h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200';

function formatMinutes(value) {
  const minutes = Number(value || 0);

  if (minutes < 60) {
    return `${formatNumber(minutes, minutes % 1 === 0 ? 0 : 1)}m`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `${formatNumber(hours, 1)}h`;
  }

  return `${formatNumber(hours / 24, 1)}d`;
}

function rangeLabel(range) {
  return {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days'
  }[range] || 'Last 7 days';
}

function metricSubtext(range, scope) {
  const parts = [rangeLabel(range)];
  if (scope.env) parts.push(scope.env);
  if (scope.service_group) parts.push(scope.service_group);
  return parts.join(' / ');
}

function SummaryCard({ icon: Icon, label, value, subtext }) {
  return (
    <section className="min-h-[7.5rem] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 break-words text-2xl font-semibold leading-tight tracking-normal text-ink">{value}</p>
        </div>
        <span className="rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-500 dark:text-slate-400">{subtext}</p>
    </section>
  );
}

function TrendBars({ trend }) {
  const maxValue = Math.max(1, ...trend.map((row) => Math.max(Number(row.incidents || 0), Number(row.recoveries || 0))));
  const totalActivity = trend.reduce((sum, row) => sum + Number(row.incidents || 0) + Number(row.recoveries || 0), 0);

  if (trend.length === 0 || totalActivity === 0) {
    return <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No incident trend data for this range.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[36rem] items-end gap-3 px-4 py-5">
        {trend.map((row) => {
          const incidents = Number(row.incidents || 0);
          const recoveries = Number(row.recoveries || 0);
          const incidentHeight = incidents > 0 ? Math.max(4, (incidents / maxValue) * 96) : 0;
          const recoveryHeight = recoveries > 0 ? Math.max(4, (recoveries / maxValue) * 96) : 0;

          return (
            <div key={row.day} className="flex min-w-16 flex-1 flex-col items-center gap-2">
              <div className="flex h-28 items-end gap-1.5">
                <span
                  className="w-3 rounded-t bg-rose-500 dark:bg-rose-400"
                  style={{ height: `${incidentHeight}px` }}
                  title={`${incidents} incidents`}
                />
                <span
                  className="w-3 rounded-t bg-emerald-500 dark:bg-emerald-400"
                  style={{ height: `${recoveryHeight}px` }}
                  title={`${recoveries} recoveries`}
                />
              </div>
              <p className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">{row.day.slice(5)}</p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-500" /> Incidents</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Recoveries</span>
      </div>
    </div>
  );
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState(null);
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = useMemo(() => {
    const range = searchParams.get('range');
    const sort = searchParams.get('sort');
    return {
      range: VALID_RANGES.has(range) ? range : '7d',
      env: searchParams.get('env') || '',
      service_group: searchParams.get('service_group') || '',
      sort: VALID_SORTS.has(sort) ? sort : 'downtime'
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      getReliabilityReport(filters),
      getScopeOptions().catch(() => ({ environments: [], service_groups: [] }))
    ])
      .then(([reportData, scopeData]) => {
        if (cancelled) return;
        setReport(reportData);
        setScopeOptions({
          environments: Array.isArray(scopeData?.environments) ? scopeData.environments : [],
          service_groups: Array.isArray(scopeData?.service_groups) ? scopeData.service_groups : []
        });
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(formatApiError(fetchError, 'Failed to load reliability report'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  function applyFilters(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();

    for (const key of ['range', 'env', 'service_group', 'sort']) {
      const value = form.get(key);
      if (value) query.set(key, value);
    }

    router.push(`/reports?${query.toString()}`);
  }

  const summary = report?.summary || {};
  const scopeText = metricSubtext(filters.range, filters);
  const problematicCrons = Array.isArray(report?.problematic_crons) ? report.problematic_crons : [];
  const trend = Array.isArray(report?.trend) ? report.trend : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Reports</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operational reliability, incident recovery, and downtime visibility.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <form
        key={`${filters.range}:${filters.env}:${filters.service_group}:${filters.sort}`}
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-[repeat(9,minmax(0,1fr))]"
        onSubmit={applyFilters}
      >
        <select className={`${selectClass} lg:col-span-2`} name="range" defaultValue={filters.range}>
          <option value="today">Today</option>
          <option value="7d">7D</option>
          <option value="30d">30D</option>
        </select>
        <select className={`${selectClass} lg:col-span-2`} name="env" defaultValue={filters.env}>
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={`${selectClass} lg:col-span-2`} name="service_group" defaultValue={filters.service_group}>
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={`${selectClass} lg:col-span-2`} name="sort" defaultValue={filters.sort}>
          <option value="downtime">Sort by downtime</option>
          <option value="incidents">Sort by incidents</option>
        </select>
        <button className="h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-950 sm:col-span-2 lg:col-span-1" type="submit">
          Apply
        </button>
      </form>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Loading reliability report...
        </div>
      ) : null}

      {!loading ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard icon={ShieldCheck} label="Availability" value={formatPercent(summary.availability_percent)} subtext={scopeText} />
            <SummaryCard icon={AlertTriangle} label="Total incidents" value={formatNumber(summary.total_incidents)} subtext={`${formatNumber(summary.total_alerts)} alert records`} />
            <SummaryCard icon={Clock3} label="Total downtime" value={formatMinutes(summary.total_downtime_minutes)} subtext={scopeText} />
            <SummaryCard icon={TimerReset} label="MTTR" value={formatMinutes(summary.mttr_minutes)} subtext={`${formatNumber(summary.total_recoveries)} recoveries`} />
            <SummaryCard icon={Gauge} label="Total alerts" value={formatNumber(summary.total_alerts)} subtext="Alert history in range" />
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Most Problematic Cron</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ranked by {filters.sort === 'incidents' ? 'incident count' : 'downtime'} for {rangeLabel(filters.range).toLowerCase()}.</p>
              </div>
              <RotateCcw className="hidden h-5 w-5 text-slate-400 sm:block" aria-hidden="true" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Cron</th>
                    <th className="px-4 py-3">Environment</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Incidents</th>
                    <th className="px-4 py-3 text-right">Downtime</th>
                    <th className="px-4 py-3 text-right">Avg recovery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {problematicCrons.map((row) => (
                    <tr key={`${row.cron_name}-${row.env}-${row.service_group}`} className="align-top">
                      <td className="max-w-[24rem] break-words px-4 py-3 font-medium text-ink">{row.cron_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.env || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.service_group || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100">{formatNumber(row.incident_count)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{formatMinutes(row.total_downtime_minutes)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{formatMinutes(row.avg_recovery_minutes)}</td>
                    </tr>
                  ))}
                  {problematicCrons.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>No incident activity found for this range.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-ink">Incident Trend</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Daily incident starts and recoveries in WIB.</p>
            </div>
            <TrendBars trend={trend} />
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={(
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        Loading reliability report...
      </div>
    )}
    >
      <ReportsContent />
    </Suspense>
  );
}
