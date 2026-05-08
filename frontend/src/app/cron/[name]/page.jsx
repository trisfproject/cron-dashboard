'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, BarChart3, Clock3, Gauge, Radio, RotateCcw, ShieldCheck, Timer, Zap } from 'lucide-react';
import { FailureWarningChart, DurationChart, ThroughputChart, TimelineChart } from '@/components/TimelineChart';
import { InteractiveLogsTable } from '@/components/InteractiveLogsTable';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { MetricCard } from '@/components/MetricCard';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { getLogs, getStats } from '@/lib/api';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FILTER = { type: 'window', value: '30m' };
const VALID_WINDOWS = new Set(['5m', '15m', '30m', '1h', '4h']);
const VALID_RANGES = new Set(['today', '7d', '30d']);
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function safeDecode(value = '') {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseJakartaDateTime(value) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) {
    const date = new Date(`${value}:00.000+07:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(value || '')) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function isValidCustomRange(range) {
  const start = parseJakartaDateTime(range?.start);
  const end = parseJakartaDateTime(range?.end);

  return Boolean(start && end && end > start && end.getTime() - start.getTime() <= 365 * DAY_MS);
}

function normalizeStatsResponse(data) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;

  return {
    summary: source?.summary && typeof source.summary === 'object' ? source.summary : {},
    timeline: Array.isArray(source?.timeline) ? source.timeline : [],
    interval: source?.interval || 'hour'
  };
}

function normalizeLogsResponse(data) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;
  return Array.isArray(source?.logs) ? source.logs : [];
}

function percentile(values, percentileValue) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);

  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function getWindowHours(filter, customRange) {
  if (isValidCustomRange(customRange)) {
    const start = parseJakartaDateTime(customRange.start);
    const end = parseJakartaDateTime(customRange.end);
    return Math.max((end.getTime() - start.getTime()) / 3600000, 1 / 60);
  }

  if (filter.type === 'window') {
    return {
      '5m': 5 / 60,
      '15m': 15 / 60,
      '30m': 0.5,
      '1h': 1,
      '4h': 4
    }[filter.value] || 0.5;
  }

  if (filter.value === 'today') {
    const jakartaNow = new Date(Date.now() + JAKARTA_OFFSET_MS);
    return Math.max(jakartaNow.getUTCHours() + jakartaNow.getUTCMinutes() / 60, 1);
  }

  return filter.value === '30d' ? 24 * 30 : 24 * 7;
}

function CronDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawCronName = Array.isArray(params?.name) ? params.name.join('/') : params?.name || '';
  const cronName = safeDecode(rawCronName);
  const server = searchParams?.get('server') || '';
  const env = searchParams?.get('env') || '';
  const serviceGroup = searchParams?.get('service_group') || '';
  const initialWindow = searchParams?.get('window');
  const initialRange = searchParams?.get('range');
  const initialStart = searchParams?.get('start');
  const initialEnd = searchParams?.get('end');
  const initialCustomRange = initialStart && initialEnd ? { start: initialStart, end: initialEnd } : null;
  const initialFilter = initialCustomRange
    ? { type: 'custom', value: 'custom' }
    : VALID_RANGES.has(initialRange)
      ? { type: 'range', value: initialRange }
      : { type: 'window', value: VALID_WINDOWS.has(initialWindow) ? initialWindow : DEFAULT_FILTER.value };

  const [filter, setFilter] = useState(initialFilter);
  const [customRange, setCustomRange] = useState(isValidCustomRange(initialCustomRange) ? initialCustomRange : null);
  const [stats, setStats] = useState({ summary: {}, timeline: [], interval: 'hour' });
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [liveMode, setLiveMode] = useState(initialFilter.type !== 'custom');

  useEffect(() => {
    if (!refreshInterval || !liveMode) {
      return undefined;
    }

    const timer = setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [liveMode, refreshInterval]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setLoading(true);
      setError(null);

      try {
        const timeParams = isValidCustomRange(customRange)
          ? { start: customRange.start, end: customRange.end }
          : { [filter.type]: filter.value };
        const scopeParams = {
          cron_name: cronName,
          ...(server ? { server } : {}),
          ...(env ? { env } : {}),
          ...(serviceGroup ? { service_group: serviceGroup } : {})
        };
        const [statsData, logsData] = await Promise.all([
          getStats({ ...timeParams, ...scopeParams }),
          getLogs({ ...timeParams, ...scopeParams, limit: 500 })
        ]);

        if (cancelled) {
          return;
        }

        setStats(normalizeStatsResponse(statsData));
        setLogs(normalizeLogsResponse(logsData));
      } catch (fetchError) {
        if (!cancelled) {
          console.error('Failed to fetch cron detail:', fetchError);
          setError(fetchError?.message || 'Failed to load cron detail');
          setStats({ summary: {}, timeline: [], interval: 'hour' });
          setLogs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasLoaded(true);
        }
      }
    }

    if (cronName) {
      loadDetail();
    }

    return () => {
      cancelled = true;
    };
  }, [cronName, customRange, env, filter, refreshTick, server, serviceGroup]);

  const summary = stats?.summary ?? {};
  const timeline = Array.isArray(stats?.timeline) ? stats.timeline : [];
  const totalRuns = Number(summary.total_runs || 0);
  const failed = Number(summary.failed_count || 0);
  const warning = Number(summary.warning_count || 0);
  const averageDuration = Number(summary.average_duration || 0);
  const p95Duration = useMemo(() => percentile(logs.map((log) => log?.duration), 95), [logs]);
  const windowHours = getWindowHours(filter, customRange);
  const runsPerHour = totalRuns > 0 ? totalRuns / windowHours : 0;
  const lastLog = logs[0];
  const durationData = useMemo(() => [...logs].reverse().map((log) => ({
    timestamp: formatDate(log?.timestamp),
    duration: Number(log?.duration || 0)
  })), [logs]);
  const hasData = totalRuns > 0 || logs.length > 0;
  const isCustom = filter.type === 'custom';

  function applyCustomRange(nextCustomRange) {
    if (isValidCustomRange(nextCustomRange)) {
      setCustomRange(nextCustomRange);
      setFilter({ type: 'custom', value: 'custom' });
      setLiveMode(false);
    }
  }

  function resetZoom() {
    setCustomRange(null);
    setFilter(DEFAULT_FILTER);
    setLiveMode(true);
  }

  if (loading && !hasLoaded) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-normal text-ink">{cronName || 'Cron detail'}</h1>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">Loading cron detail...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-normal text-ink">{cronName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{server ? `Server: ${server}` : 'All servers'} · exact cron name match</span>
            {env ? <EnvironmentBadge env={env} /> : null}
            <ServiceGroupBadge serviceGroup={serviceGroup} />
          </div>
        </div>
        <TimeRangeFilter
          selectedFilter={filter}
          customRange={customRange}
          refreshInterval={refreshInterval}
          onFilterChange={(nextFilter) => {
            setCustomRange(null);
            setFilter(nextFilter);
            setLiveMode(true);
          }}
          onCustomRangeChange={applyCustomRange}
          onRefreshIntervalChange={setRefreshInterval}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!error && !hasData ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          No executions found for this exact cron name in the selected time window.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!liveMode && isCustom) {
              resetZoom();
              return;
            }

            setLiveMode((value) => !value);
          }}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            liveMode ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Radio className="h-4 w-4" aria-hidden="true" />
          {liveMode ? 'Live' : 'Paused'}
        </button>
        <button
          type="button"
          onClick={resetZoom}
          disabled={!isCustom && filter.type === DEFAULT_FILTER.type && filter.value === DEFAULT_FILTER.value}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset Zoom
        </button>
        {loading ? <span className="text-sm text-slate-500">Refreshing...</span> : null}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label="Executions" value={hasData ? formatNumber(totalRuns) : 'No data'} subtext="Selected time window" />
        <MetricCard icon={ShieldCheck} label="Success rate" value={hasData ? formatPercent(summary.success_rate ?? 0) : 'No data'} subtext={`${formatNumber(failed)} failures · ${formatNumber(warning)} warnings`} />
        <MetricCard icon={Clock3} label="Average duration" value={hasData ? formatDuration(averageDuration) : 'No data'} subtext="Mean runtime" />
        <MetricCard icon={Timer} label="P95 duration" value={hasData ? formatDuration(p95Duration) : 'No data'} subtext="From visible execution history" />
        <MetricCard icon={AlertTriangle} label="Failed count" value={hasData ? formatNumber(failed) : 'No data'} subtext={`${formatNumber(warning)} warnings`} />
        <MetricCard icon={Zap} label="Runs/hour" value={hasData ? formatNumber(runsPerHour, 2) : 'No data'} subtext="Throughput in selected window" />
        <MetricCard icon={Gauge} label="Last execution" value={lastLog ? formatDate(lastLog.timestamp) : 'No data'} subtext={lastLog ? formatDuration(lastLog.duration) : 'No matching run'} />
        <MetricCard icon={BarChart3} label="Window" value={isCustom ? 'Custom' : filter.value.toUpperCase()} subtext={`Grouped by ${stats.interval || 'hour'}`} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">Execution status trend</h2>
          <p className="mt-1 text-sm text-slate-500">Drag across the chart to zoom this cron job into an exact WIB window.</p>
        </div>
        <TimelineChart data={timeline} interval={stats.interval} onRangeSelect={applyCustomRange} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink">Duration trend</h2>
            <p className="mt-1 text-sm text-slate-500">Actual execution duration history in WIB.</p>
          </div>
          <DurationChart data={durationData} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink">Throughput trend</h2>
            <p className="mt-1 text-sm text-slate-500">Runs per normalized time bucket.</p>
          </div>
          <ThroughputChart data={timeline} />
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">Warning and failure timeline</h2>
          <p className="mt-1 text-sm text-slate-500">Non-success outcomes for this exact cron command.</p>
        </div>
        <FailureWarningChart data={timeline} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Execution history</h2>
          <p className="mt-1 text-sm text-slate-500">Searchable, sortable raw executions with full command visibility.</p>
        </div>
        <InteractiveLogsTable logs={logs} />
      </section>
    </div>
  );
}

export default function CronDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading cron detail...</div>}>
      <CronDetailContent />
    </Suspense>
  );
}
