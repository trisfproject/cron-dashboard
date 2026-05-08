'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, DatabaseZap, ListChecks, Radio, RotateCcw, TrendingUp } from 'lucide-react';
import { AlertSeverityBadge, AlertStateBadge } from '@/components/AlertBadge';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { MetricCard } from '@/components/MetricCard';
import { TimelineChart } from '@/components/TimelineChart';
import { LogsTable } from '@/components/LogsTable';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { getAlerts, getAuditLogs, getCurrentUser, getLogs, getScopeOptions, getStats } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

const emptyStats = {
  summary: {},
  timeline: [],
  insights: {
    problematic_jobs: [],
    slowest_jobs: []
  },
  mode: 'window',
  window: '30m',
  interval: '1m'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_PAGE_SIZE = 10;
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

function getWindowMinutes(filter, customRange) {
  if (isValidCustomRange(customRange)) {
    const start = parseJakartaDateTime(customRange.start);
    const end = parseJakartaDateTime(customRange.end);
    return Math.max((end.getTime() - start.getTime()) / 60000, 1);
  }

  if (filter.type === 'window') {
    return {
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240
    }[filter.value] || 30;
  }

  if (filter.value === 'today') {
    const jakartaNow = new Date(Date.now() + JAKARTA_OFFSET_MS);
    return Math.max(jakartaNow.getUTCHours() * 60 + jakartaNow.getUTCMinutes(), 1);
  }

  return filter.value === '30d' ? 30 * 24 * 60 : 7 * 24 * 60;
}

function parseWibTimestamp(value) {
  if (!value) {
    return null;
  }

  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}+07:00`
    : value;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(value) {
  const date = parseWibTimestamp(value);

  if (!date) {
    return 'No ingest';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function getSystemHealth(summary) {
  const totalRuns = Number(summary?.total_runs || 0);
  const failedCount = Number(summary?.failed_count || 0);
  const warningRate = Number(summary?.warning_rate || 0);
  const lastIngest = parseWibTimestamp(summary?.last_ingest_at);
  const staleMinutes = lastIngest ? (Date.now() - lastIngest.getTime()) / 60000 : Infinity;

  if (!totalRuns || failedCount > 0 || staleMinutes > 30 || warningRate >= 25) {
    return { label: 'Critical', className: 'bg-rose-50 text-rose-700 ring-rose-200' };
  }

  if (warningRate >= 10 || staleMinutes > 10) {
    return { label: 'Degraded', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
  }

  return { label: 'Healthy', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
}

function getSystemHealthContext(summary, healthLabel) {
  const totalRuns = Number(summary?.total_runs || 0);
  const failedCount = Number(summary?.failed_count || 0);
  const warningRate = Number(summary?.warning_rate || 0);
  const lastIngest = parseWibTimestamp(summary?.last_ingest_at);
  const staleMinutes = lastIngest ? (Date.now() - lastIngest.getTime()) / 60000 : Infinity;

  if (healthLabel === 'Critical') {
    if (!totalRuns) return 'No executions in window';
    if (failedCount > 0) return `${formatNumber(failedCount)} failed runs detected`;
    if (staleMinutes > 30) return 'Ingest freshness is critical';
    if (warningRate >= 25) return 'Warning rate is critical';
  }

  if (healthLabel === 'Degraded') {
    if (warningRate >= 10) return 'Degraded due to elevated warning rate';
    if (staleMinutes > 10) return 'Degraded due to ingest freshness';
  }

  return 'No active health degradation';
}

function getCronHealthSeverity(job) {
  const failed = Number(job?.failed_count || 0);
  const warnings = Number(job?.warning_count || 0);
  const successRate = Number(job?.success_rate || 0);

  if (failed > 0 || successRate < 90) {
    return { label: 'Critical', score: 3, className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900' };
  }

  if (successRate < 98) {
    return { label: 'Degraded', score: 2, className: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:ring-orange-900' };
  }

  if (warnings > 0) {
    return { label: 'Warning', score: 1, className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900' };
  }

  return { label: 'Healthy', score: 0, className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900' };
}

function rankCronHealthJobs(jobs) {
  return [...jobs]
    .map((job) => ({ ...job, health: getCronHealthSeverity(job) }))
    .sort((left, right) => {
      const healthDelta = right.health.score - left.health.score;

      if (healthDelta !== 0) {
        return healthDelta;
      }

      const failureDelta = Number(right.failed_count || 0) - Number(left.failed_count || 0);

      if (failureDelta !== 0) {
        return failureDelta;
      }

      const warningDelta = Number(right.warning_count || 0) - Number(left.warning_count || 0);

      if (warningDelta !== 0) {
        return warningDelta;
      }

      return Number(left.success_rate || 0) - Number(right.success_rate || 0);
    });
}

function getPerformanceSeverity(job) {
  const avgDuration = Number(job?.avg_duration || 0);
  const maxDuration = Number(job?.max_duration || 0);

  if (avgDuration >= 60000 || maxDuration >= 120000) {
    return { label: 'Slow', className: 'bg-rose-50 text-rose-700 ring-rose-200' };
  }

  if (avgDuration >= 10000 || maxDuration >= 30000) {
    return { label: 'Elevated', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
  }

  return { label: 'Normal', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
}

function normalizeStatsResponse(data, range) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;

  return {
    summary: source?.summary && typeof source.summary === 'object' ? source.summary : {},
    timeline: Array.isArray(source?.timeline) ? source.timeline : [],
    insights: source?.insights && typeof source.insights === 'object' ? source.insights : emptyStats.insights,
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

function mergeLogs(existingLogs, nextLogs) {
  const seen = new Set();
  const merged = [];

  for (const log of [...existingLogs, ...nextLogs]) {
    const key = log?.id ?? log?.hash ?? `${log?.cron_name}-${log?.server}-${log?.timestamp}`;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(log);
    }
  }

  return merged;
}

function DashboardContent({ initialFilter = { type: 'window', value: '30m' }, initialCustomRange = null, initialScope = { env: '', service_group: '' } }) {
  const [filter, setFilter] = useState(initialFilter);
  const [customRange, setCustomRange] = useState(isValidCustomRange(initialCustomRange) ? initialCustomRange : null);
  const [stats, setStats] = useState(emptyStats);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [auditFeed, setAuditFeed] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [scope, setScope] = useState(initialScope);
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [logsError, setLogsError] = useState(null);
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
    setScope(initialScope);
  }, [initialScope.env, initialScope.service_group]);

  useEffect(() => {
    let cancelled = false;

    getScopeOptions()
      .then((data) => {
        if (!cancelled) {
          setScopeOptions({
            environments: Array.isArray(data?.environments) ? data.environments : [],
            service_groups: Array.isArray(data?.service_groups) ? data.service_groups : []
          });
        }
      })
      .catch((scopeError) => {
        console.error('Failed to load scope options:', scopeError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        const scopeParams = {
          ...(scope.env ? { env: scope.env } : {}),
          ...(scope.service_group ? { service_group: scope.service_group } : {})
        };

        const [statsData, logsData, userData] = await Promise.all([
          getStats({ ...params, ...scopeParams }),
          getLogs({ ...params, ...scopeParams, limit: LOG_PAGE_SIZE, offset: 0 }),
          getCurrentUser()
        ]);
        const user = userData?.user || null;
        const [alertsData, auditData] = user?.role === 'admin'
          ? await Promise.all([
            getAlerts({ state: 'active', limit: 5, ...scopeParams }).catch((alertError) => {
            console.error('Failed to fetch active alerts:', alertError);
            return { alerts: [] };
            }),
            getAuditLogs({ limit: 5 }).catch((auditError) => {
              console.error('Failed to fetch audit feed:', auditError);
              return { audit_logs: [] };
            })
          ])
          : [{ alerts: [] }, { audit_logs: [] }];

        if (process.env.NODE_ENV === 'development') {
          console.log('stats response', statsData);
          console.log('logs response', logsData);
        }

        if (cancelled) {
          return;
        }

        setStats(normalizeStatsResponse(statsData, filter.value));
        setCurrentUser(user);
        const nextLogs = normalizeLogsResponse(logsData);
        setLogs(nextLogs);
        setHasMoreLogs(nextLogs.length === LOG_PAGE_SIZE);
        setAlerts(Array.isArray(alertsData?.alerts) ? alertsData.alerts : []);
        setAuditFeed(Array.isArray(auditData?.audit_logs) ? auditData.audit_logs : []);
        setLogsError(null);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);

        if (!cancelled) {
          setError(error?.message || 'Failed to load dashboard');
          setStats(emptyStats);
          setCurrentUser(null);
          setLogs([]);
          setAlerts([]);
          setAuditFeed([]);
          setHasMoreLogs(false);
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
  }, [filter, customRange, refreshTick, scope.env, scope.service_group]);

  function applyCustomRange(nextCustomRange) {
    if (isValidCustomRange(nextCustomRange)) {
      setCustomRange(nextCustomRange);
      setFilter({ type: 'custom', value: 'custom' });
      setLiveMode(false);
    }
  }

  async function loadMoreLogs() {
    if (logsLoadingMore || !hasMoreLogs) {
      return;
    }

    setLogsLoadingMore(true);
    setLogsError(null);

    try {
      const customParams = isValidCustomRange(customRange)
        ? { start: customRange.start, end: customRange.end }
        : null;
      const params = customParams || { [filter.type]: filter.value };
      const scopeParams = {
        ...(scope.env ? { env: scope.env } : {}),
        ...(scope.service_group ? { service_group: scope.service_group } : {})
      };
      const logsData = await getLogs({
        ...params,
        ...scopeParams,
        limit: LOG_PAGE_SIZE,
        offset: logs.length
      });
      const nextLogs = normalizeLogsResponse(logsData);

      setLogs((currentLogs) => mergeLogs(currentLogs, nextLogs));
      setHasMoreLogs(nextLogs.length === LOG_PAGE_SIZE);
    } catch (error) {
      console.error('Failed to load more logs:', error);
      setLogsError(error?.message || 'Failed to load more logs');
    } finally {
      setLogsLoadingMore(false);
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

  function updateScope(key, value) {
    const nextScope = { ...scope, [key]: value };
    setScope(nextScope);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextScope.env) url.searchParams.set('env', nextScope.env);
      else url.searchParams.delete('env');
      if (nextScope.service_group) url.searchParams.set('service_group', nextScope.service_group);
      else url.searchParams.delete('service_group');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
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
  const insights = stats?.insights && typeof stats.insights === 'object' ? stats.insights : {};
  const problematicJobs = Array.isArray(insights.problematic_jobs) ? insights.problematic_jobs : [];
  const rankedHealthJobs = rankCronHealthJobs(problematicJobs);
  const attentionHealthJobs = rankedHealthJobs.filter((job) => Number(job?.health?.score || 0) > 0);
  const slowestJobs = Array.isArray(insights.slowest_jobs) ? insights.slowest_jobs : [];
  const logsArray = Array.isArray(logs) ? logs : [];
  const activeAlerts = Array.isArray(alerts) ? alerts : [];
  const isCustom = filter.type === 'custom';
  const windowMinutes = getWindowMinutes(filter, customRange);
  const totalRuns = Number(summary.total_runs || 0);
  const throughput = windowMinutes <= 60
    ? totalRuns / Math.max(windowMinutes, 1)
    : totalRuns / Math.max(windowMinutes / 60, 1);
  const throughputUnit = windowMinutes <= 60 ? 'runs/min' : 'runs/hour';
  const health = getSystemHealth(summary);
  const healthContext = getSystemHealthContext(summary, health.label);
  const healthIconClass = {
    Healthy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    Degraded: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    Critical: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
  }[health.label] || 'bg-slate-100 text-slate-700';

  return (
    <div className="space-y-6 sm:space-y-8">
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

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,14rem)_1fr] sm:items-center">
          <select
            value={scope.env}
            onChange={(event) => updateScope('env', event.target.value)}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950"
            aria-label="Environment filter"
          >
            <option value="">All environments</option>
            {scopeOptions.environments.map((option) => (
              <option key={option.value} value={option.value}>{option.value}</option>
            ))}
          </select>
          <select
            value={scope.service_group}
            onChange={(event) => updateScope('service_group', event.target.value)}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950"
            aria-label="Service group filter"
          >
            <option value="">All service groups</option>
            {scopeOptions.service_groups.map((option) => (
              <option key={option.value} value={option.value}>{option.value}</option>
            ))}
          </select>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
            {scope.env ? <EnvironmentBadge env={scope.env} /> : <span>All environments</span>}
            {scope.service_group ? <ServiceGroupBadge serviceGroup={scope.service_group} /> : <span>All services</span>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        <MetricCard
          icon={AlertTriangle}
          label="Warning rate"
          value={formatPercent(summary.warning_rate ?? 0)}
          subtext={`${formatNumber(summary.warning_count ?? 0)} warning runs`}
        />
        <MetricCard
          icon={DatabaseZap}
          label="Last ingest"
          value={formatRelativeTime(summary.last_ingest_at)}
          subtext={summary.last_ingest_at ? `${formatJakartaDisplay(`${summary.last_ingest_at.replace(' ', 'T')}+07:00`)} WIB` : 'No execution received'}
        />
        <MetricCard
          icon={TrendingUp}
          label="Throughput"
          value={formatNumber(throughput, 2)}
          subtext={throughputUnit}
        />
        <div className="min-h-[7.25rem] rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:min-h-[9.25rem] sm:p-5">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-sm sm:normal-case sm:tracking-normal">System health</p>
              <p className={`mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold leading-none tracking-normal ring-1 sm:mt-2 sm:text-base ${health.className}`}>
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current sm:h-2 sm:w-2" aria-hidden="true" />
                {health.label}
              </p>
            </div>
            <div className={`shrink-0 rounded-md p-1.5 sm:p-2 ${healthIconClass}`}>
              <Activity className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2 text-xs leading-snug text-slate-500 sm:mt-3 sm:text-sm">{healthContext}</p>
        </div>
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

      <section className="grid gap-4 xl:grid-cols-2">
        {currentUser?.role === 'admin' ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">Active Alerts</h2>
              <p className="mt-1 text-sm text-slate-500">Realtime alert lifecycle across reliability, duration, retries, and cron silence rules.</p>
            </div>
            <Link href="/alerts" className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
              View history
            </Link>
          </div>
          <div className="space-y-3 md:hidden">
            {activeAlerts.map((alert) => (
              <article key={alert.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-ink">{alert.cron_name || 'All monitored cron jobs'}</p>
                  <AlertSeverityBadge severity={alert.severity} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                  <ServiceGroupBadge serviceGroup={alert.service_group} />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{alert.reason}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <AlertStateBadge state={alert.state} />
                  <span>{alert.triggered_at || '-'}</span>
                </div>
              </article>
            ))}
            {activeAlerts.length === 0 ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-8 text-center text-sm text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">No active alerts. Cron monitoring is quiet.</div>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cron</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Triggered</th>
                  <th className="px-3 py-2">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeAlerts.map((alert) => (
                  <tr key={alert.id} className="align-top">
                    <td className="max-w-[18rem] truncate px-3 py-2 font-medium text-ink">{alert.cron_name || 'All monitored cron jobs'}</td>
                    <td className="whitespace-nowrap px-3 py-2"><AlertSeverityBadge severity={alert.severity} /></td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex gap-1.5">
                        {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                        <ServiceGroupBadge serviceGroup={alert.service_group} />
                      </div>
                    </td>
                    <td className="min-w-[24rem] px-3 py-2 text-slate-600 dark:text-slate-300">{alert.reason}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{alert.triggered_at || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2"><AlertStateBadge state={alert.state} /></td>
                  </tr>
                ))}
                {activeAlerts.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-emerald-700 dark:text-emerald-200" colSpan={6}>No active alerts. Cron monitoring is quiet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}

        {currentUser?.role === 'admin' ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Operational Activity</h2>
              <p className="mt-1 text-sm text-slate-500">Recent administrative and incident-management events.</p>
            </div>
            <Link href="/audit" className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
              Audit log
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {auditFeed.map((event) => (
              <div key={event.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[12rem_1fr_auto] sm:items-center">
                <p className="font-medium text-ink">{event.action}</p>
                <p className="text-slate-500">{event.user_email || 'System'} / {event.target_label || event.target_type || 'NYX'}</p>
                <p className="text-xs text-slate-500">{event.created_at}</p>
              </div>
            ))}
            {auditFeed.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">No recent operational activity.</div> : null}
          </div>
        </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink">Cron Health Overview</h2>
            <p className="mt-1 text-sm text-slate-500">Operational reliability across monitored cron jobs.</p>
          </div>
          <div className="space-y-3 md:hidden">
            {attentionHealthJobs.map((job, index) => (
              <article key={`${job?.cron_name ?? 'cron'}-${index}-mobile`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-ink">{job?.cron_name ?? '-'}</p>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ring-1 ${job.health.className}`}>{job.health.label}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {job?.env ? <EnvironmentBadge env={job.env} /> : null}
                  <ServiceGroupBadge serviceGroup={job?.service_group} />
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
                  <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Success rate</p>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatPercent(job?.success_rate ?? 0)}</p>
                  </div>
                  <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Warnings</p>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatNumber(job?.warning_count ?? 0)}</p>
                  </div>
                  <div className="rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    <p className="text-xs text-slate-500">Failed</p>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{formatNumber(job?.failed_count ?? 0)}</p>
                  </div>
                </div>
              </article>
            ))}
            {attentionHealthJobs.length === 0 ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-8 text-center text-sm text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">All monitored cron jobs are healthy.</div>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cron</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Success</th>
                  <th className="px-3 py-2">Warnings</th>
                  <th className="px-3 py-2">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attentionHealthJobs.map((job, index) => (
                  <tr key={`${job?.cron_name ?? 'cron'}-${index}`}>
                    <td className="max-w-[18rem] truncate px-3 py-2 font-medium text-ink">{job?.cron_name ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${job.health.className}`}>{job.health.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex gap-1.5">
                        {job?.env ? <EnvironmentBadge env={job.env} /> : null}
                        <ServiceGroupBadge serviceGroup={job?.service_group} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{formatPercent(job?.success_rate ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{formatNumber(job?.warning_count ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{formatNumber(job?.failed_count ?? 0)}</td>
                  </tr>
                ))}
                {attentionHealthJobs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-emerald-700 dark:text-emerald-200" colSpan={6}>All monitored cron jobs are healthy.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink">Slowest cron jobs</h2>
            <p className="mt-1 text-sm text-slate-500">Highest average duration in the selected timeframe.</p>
          </div>
          <div className="space-y-3 md:hidden">
            {slowestJobs.map((job, index) => {
              const severity = getPerformanceSeverity(job);

              return (
                <article key={`${job?.cron_name ?? 'cron'}-${index}-mobile`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-semibold text-ink">{job?.cron_name ?? '-'}</p>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ring-1 ${severity.className}`}>{severity.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Avg</p>
                      <p className="mt-1 font-medium text-slate-700">{formatDuration(job?.avg_duration ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Max</p>
                      <p className="mt-1 font-medium text-slate-700">{formatDuration(job?.max_duration ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Runs</p>
                      <p className="mt-1 font-medium text-slate-700">{formatNumber(job?.total_runs ?? 0)}</p>
                    </div>
                  </div>
                </article>
              );
            })}
            {slowestJobs.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500 dark:bg-slate-950">No duration data in this timeframe.</div>
            ) : null}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cron</th>
                  <th className="px-3 py-2">Avg duration</th>
                  <th className="px-3 py-2">Max duration</th>
                  <th className="px-3 py-2">Runs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slowestJobs.map((job, index) => (
                  <tr key={`${job?.cron_name ?? 'cron'}-${index}`}>
                    <td className="max-w-[18rem] truncate px-3 py-2 font-medium text-ink">{job?.cron_name ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDuration(job?.avg_duration ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDuration(job?.max_duration ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatNumber(job?.total_runs ?? 0)}</td>
                  </tr>
                ))}
                {slowestJobs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-500" colSpan={4}>No duration data in this timeframe.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Recent logs</h2>
            <p className="mt-1 text-sm text-slate-500">Latest ingested executions. Showing {formatNumber(logsArray.length)} entries.</p>
          </div>
        </div>
        <LogsTable logs={logsArray} variant="activity" />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm shadow-sm">
          {logsError ? <p className="text-rose-700">{logsError}</p> : null}
          {logsLoadingMore ? (
            <div className="flex w-full max-w-md flex-col gap-2">
              <div className="h-3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <p className="text-center text-slate-500">Loading more logs...</p>
            </div>
          ) : hasMoreLogs ? (
            <button
              type="button"
              onClick={loadMoreLogs}
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Load More
            </button>
          ) : (
            <p className="text-slate-500">No more logs</p>
          )}
        </div>
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
  const env = searchParams?.get('env') || '';
  const serviceGroup = searchParams?.get('service_group') || '';
  const initialCustomRange = start && end ? { start, end } : null;
  const initialFilter = initialCustomRange
    ? { type: 'custom', value: 'custom' }
    : VALID_RANGES.has(range)
      ? { type: 'range', value: range }
      : { type: 'window', value: VALID_WINDOWS.has(window) ? window : '30m' };

  return <DashboardContent initialFilter={initialFilter} initialCustomRange={initialCustomRange} initialScope={{ env, service_group: serviceGroup }} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <DashboardWithSearchParams />
    </Suspense>
  );
}
