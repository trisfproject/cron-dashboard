'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ListChecks, Radio, RotateCcw } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { TimelineChart } from '@/components/TimelineChart';
import { LogsTable } from '@/components/LogsTable';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { getLogs, getStats } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

const emptyStats = {
  summary: {},
  timeline: [],
  mode: 'window',
  window: '30m',
  interval: '1m'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_WINDOWS = new Set(['5m', '15m', '30m', '1h', '4h']);
const VALID_RANGES = new Set(['today', '7d', '30d']);
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

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

function formatJakartaOffset(date) {
  const jakartaDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  const pad = (value) => String(value).padStart(2, '0');

  return `${jakartaDate.getUTCFullYear()}-${pad(jakartaDate.getUTCMonth() + 1)}-${pad(jakartaDate.getUTCDate())}T${pad(jakartaDate.getUTCHours())}:${pad(jakartaDate.getUTCMinutes())}:${pad(jakartaDate.getUTCSeconds())}+07:00`;
}

function formatJakartaDisplay(value) {
  const date = parseJakartaDateTime(value);

  if (!date) {
    return value;
  }

  return formatJakartaOffset(date).slice(0, 19).replace('T', ' ');
}

function isValidCustomRange(range) {
  const start = parseJakartaDateTime(range?.start);
  const end = parseJakartaDateTime(range?.end);

  if (!start || !end) {
    return false;
  }

  const duration = end.getTime() - start.getTime();

  return duration > 0 && duration <= 365 * DAY_MS;
}

function shiftCustomRange(range, direction) {
  const start = parseJakartaDateTime(range?.start);
  const end = parseJakartaDateTime(range?.end);

  if (!start || !end || end <= start) {
    return null;
  }

  const duration = end.getTime() - start.getTime();
  const delta = direction * duration;

  return {
    start: formatJakartaOffset(new Date(start.getTime() + delta)),
    end: formatJakartaOffset(new Date(end.getTime() + delta))
  };
}

function normalizeStatsResponse(data, range) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;

  return {
    summary: source?.summary && typeof source.summary === 'object' ? source.summary : {},
    timeline: Array.isArray(source?.timeline) ? source.timeline : [],
    mode: source?.mode || 'window',
    window: source?.window || null,
    range: source?.range || range,
    interval: source?.interval || 'hour'
  };
}

function normalizeLogsResponse(data) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;
  return Array.isArray(source?.logs) ? source.logs : [];
}

function DashboardContent({ initialFilter = { type: 'window', value: '30m' }, initialCustomRange = null }) {
  const [filter, setFilter] = useState(initialFilter);
  const [customRange, setCustomRange] = useState(isValidCustomRange(initialCustomRange) ? initialCustomRange : null);
  const [stats, setStats] = useState(emptyStats);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [liveMode, setLiveMode] = useState(initialFilter.type !== 'custom');
  const [hasLoaded, setHasLoaded] = useState(false);
  const selectionTimerRef = useRef(null);

  useEffect(() => {
    setFilter(initialFilter);
    setCustomRange(isValidCustomRange(initialCustomRange) ? initialCustomRange : null);
    setLiveMode(initialFilter.type !== 'custom');
  }, [initialFilter.type, initialFilter.value, initialCustomRange?.start, initialCustomRange?.end]);

  useEffect(() => {
    if (!refreshInterval || !liveMode) {
      return undefined;
    }

    const timer = setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval, liveMode]);

  useEffect(() => () => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    async function loadDashboard() {
      try {
        const customParams = isValidCustomRange(customRange)
          ? { start: customRange.start, end: customRange.end }
          : null;
        const params = customParams || { [filter.type]: filter.value };

        const [statsData, logsData] = await Promise.all([
          getStats(params),
          getLogs({ ...params, limit: 20 })
        ]);

        if (process.env.NODE_ENV === 'development') {
          console.log('stats response', statsData);
          console.log('logs response', logsData);
        }

        if (cancelled) {
          return;
        }

        setStats(normalizeStatsResponse(statsData, filter.value));
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
          setHasLoaded(true);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [filter, customRange, refreshTick]);

  function applyCustomRange(nextCustomRange) {
    if (isValidCustomRange(nextCustomRange)) {
      setCustomRange(nextCustomRange);
      setFilter({ type: 'custom', value: 'custom' });
      setLiveMode(false);
    }
  }

  function applySelectedTimelineRange(nextCustomRange) {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }

    selectionTimerRef.current = setTimeout(() => {
      applyCustomRange(nextCustomRange);
    }, 250);
  }

  function resetZoom() {
    setCustomRange(null);
    setFilter({ type: 'window', value: '30m' });
    setLiveMode(true);
  }

  function panCustomRange(direction) {
    const nextRange = shiftCustomRange(customRange, direction);

    if (nextRange) {
      applyCustomRange(nextRange);
    }
  }

  if (loading && !hasLoaded) {
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
  const timelineInterval = stats?.interval || 'hour';
  const logsArray = Array.isArray(logs) ? logs : [];
  const isCustom = filter.type === 'custom';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live health and execution trends across monitored cron jobs.</p>
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
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Timeline</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isCustom && customRange?.start && customRange?.end && `Custom window from ${formatJakartaDisplay(customRange.start)} to ${formatJakartaDisplay(customRange.end)} WIB.`}
            {!isCustom && filter.type === 'window' && `Rolling ${filter.value.toUpperCase()} realtime window.`}
            {!isCustom && filter.type === 'range' && filter.value === 'today' && 'Today in WIB, grouped by hour.'}
            {!isCustom && filter.type === 'range' && filter.value === '7d' && 'Last seven days, grouped by hour.'}
            {!isCustom && filter.type === 'range' && filter.value === '30d' && 'Last thirty days, grouped by day.'}
            {loading ? ' Refreshing...' : ''}
          </p>
          </div>
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
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                liveMode
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="Toggle live mode"
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              {liveMode ? 'Live' : 'Paused'}
            </button>
            <button
              type="button"
              onClick={() => panCustomRange(-1)}
              disabled={!isCustom}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              title="Pan backward by the selected window"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Pan
            </button>
            <button
              type="button"
              onClick={() => panCustomRange(1)}
              disabled={!isCustom}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              title="Pan forward by the selected window"
            >
              Pan
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              disabled={!isCustom && filter.type === 'window' && filter.value === '30m'}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              title="Reset zoom to the default 30m live window"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Zoom
            </button>
          </div>
        </div>
        <TimelineChart data={timeline} interval={timelineInterval} onRangeSelect={applySelectedTimelineRange} />
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
  const window = searchParams?.get('window');
  const range = searchParams?.get('range');
  const start = searchParams?.get('start');
  const end = searchParams?.get('end');
  const initialCustomRange = start && end ? { start, end } : null;
  const initialFilter = initialCustomRange
    ? { type: 'custom', value: 'custom' }
    : VALID_RANGES.has(range)
      ? { type: 'range', value: range }
      : { type: 'window', value: VALID_WINDOWS.has(window) ? window : '30m' };

  return <DashboardContent initialFilter={initialFilter} initialCustomRange={initialCustomRange} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <DashboardWithSearchParams />
    </Suspense>
  );
}
