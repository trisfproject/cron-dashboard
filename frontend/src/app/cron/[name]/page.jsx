'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, BarChart3, Bell, CheckCircle2, Clock3, Eye, Gauge, Radio, RotateCcw, ShieldCheck, Timer, Wrench, Zap } from 'lucide-react';
import { FailureWarningChart, DurationChart, ThroughputChart, TimelineChart } from '@/components/TimelineChart';
import { InteractiveLogsTable } from '@/components/InteractiveLogsTable';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { MetricCard } from '@/components/MetricCard';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { acknowledgeIncident, createMaintenanceWindow, disableMaintenanceWindow, getCurrentUser, getIncidents, getLogs, getMaintenanceWindows, getStats } from '@/lib/api';
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { isAdminOrHigher } from '@/lib/rbac';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FILTER = { type: 'window', value: '30m' };
const INCIDENT_PAGE_SIZE = 10;
const MAINTENANCE_DURATIONS = [
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: 'Custom', value: 'custom' }
];
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

function normalizeIncidentsResponse(data) {
  return {
    incidents: Array.isArray(data?.incidents) ? data.incidents : [],
    has_more: Boolean(data?.has_more),
    next_offset: Number(data?.next_offset || 0)
  };
}

function incidentTime(value) {
  const text = String(value || '');
  const match = text.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
  return match ? match[1] : '-';
}

function incidentStyle(type) {
  return {
    triggered: {
      icon: AlertTriangle,
      label: 'Triggered',
      className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900'
    },
    alert_triggered: {
      icon: AlertTriangle,
      label: 'Alert triggered',
      className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900'
    },
    missing_detected: {
      icon: AlertTriangle,
      label: 'Missing detected',
      className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900'
    },
    reminder_sent: {
      icon: Bell,
      label: 'Reminder sent',
      className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900'
    },
    resolved: {
      icon: CheckCircle2,
      label: 'Resolved',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900'
    },
    alert_resolved: {
      icon: CheckCircle2,
      label: 'Alert resolved',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900'
    },
    heartbeat_recovered: {
      icon: CheckCircle2,
      label: 'Recovered',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900'
    },
    maintenance_enabled: {
      icon: Wrench,
      label: 'Maintenance enabled',
      className: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900'
    },
    maintenance_disabled: {
      icon: Wrench,
      label: 'Maintenance disabled',
      className: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800'
    },
    maintenance_expired: {
      icon: Wrench,
      label: 'Maintenance expired',
      className: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800'
    },
    incident_acknowledged: {
      icon: Eye,
      label: 'Acknowledged',
      className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900'
    },
    incident_note_added: {
      icon: Bell,
      label: 'Note added',
      className: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900'
    }
  }[type] || {
    icon: Activity,
    label: String(type || 'Event').replaceAll('_', ' '),
    className: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800'
  };
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
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsLoadingMore, setIncidentsLoadingMore] = useState(false);
  const [incidentsError, setIncidentsError] = useState(null);
  const [hasMoreIncidents, setHasMoreIncidents] = useState(false);
  const [nextIncidentOffset, setNextIncidentOffset] = useState(0);
  const [incidentRefreshTick, setIncidentRefreshTick] = useState(0);
  const [ackNotes, setAckNotes] = useState({});
  const [ackSavingId, setAckSavingId] = useState(null);
  const [ackError, setAckError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [maintenanceWindows, setMaintenanceWindows] = useState([]);
  const [maintenanceDuration, setMaintenanceDuration] = useState(60);
  const [customMaintenanceMinutes, setCustomMaintenanceMinutes] = useState(120);
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState(null);
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

  useEffect(() => {
    let cancelled = false;

    async function loadIncidents() {
      setIncidentsLoading(true);
      setIncidentsError(null);

      try {
        const data = await getIncidents({
          cron: cronName,
          ...(env ? { env } : {}),
          ...(serviceGroup ? { service_group: serviceGroup } : {}),
          limit: INCIDENT_PAGE_SIZE,
          offset: 0
        });
        const next = normalizeIncidentsResponse(data);

        if (!cancelled) {
          setIncidents(next.incidents);
          setHasMoreIncidents(next.has_more);
          setNextIncidentOffset(next.next_offset);
        }
      } catch (incidentError) {
        if (!cancelled) {
          console.error('Failed to fetch incident timeline:', incidentError);
          setIncidentsError(incidentError?.message || 'Failed to load incident timeline');
          setIncidents([]);
          setHasMoreIncidents(false);
          setNextIncidentOffset(0);
        }
      } finally {
        if (!cancelled) {
          setIncidentsLoading(false);
        }
      }
    }

    if (cronName) {
      loadIncidents();
    }

    return () => {
      cancelled = true;
    };
  }, [cronName, env, incidentRefreshTick, serviceGroup]);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((data) => {
        if (!cancelled) {
          setCurrentUser(data?.user || null);
        }
      })
      .catch((userError) => {
        console.error('Failed to load current user:', userError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshMaintenance() {
    const data = await getMaintenanceWindows({
      cron_name: cronName,
      ...(server ? { server } : {}),
      ...(env ? { env } : {}),
      ...(serviceGroup ? { service_group: serviceGroup } : {})
    });
    setMaintenanceWindows(Array.isArray(data?.maintenance_windows) ? data.maintenance_windows : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadMaintenance() {
      try {
        const data = await getMaintenanceWindows({
          cron_name: cronName,
          ...(server ? { server } : {}),
          ...(env ? { env } : {}),
          ...(serviceGroup ? { service_group: serviceGroup } : {})
        });

        if (!cancelled) {
          setMaintenanceWindows(Array.isArray(data?.maintenance_windows) ? data.maintenance_windows : []);
        }
      } catch (maintenanceLoadError) {
        if (!cancelled) {
          console.error('Failed to load maintenance status:', maintenanceLoadError);
        }
      }
    }

    if (cronName) {
      loadMaintenance();
    }

    return () => {
      cancelled = true;
    };
  }, [cronName, env, server, serviceGroup]);

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
  const activeMaintenance = maintenanceWindows[0] || null;
  const isAdmin = isAdminOrHigher(currentUser);
  const canAcknowledge = isAdminOrHigher(currentUser) || ['user', 'operator'].includes(currentUser?.role);

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

  async function loadMoreIncidents() {
    if (incidentsLoadingMore || !hasMoreIncidents) {
      return;
    }

    setIncidentsLoadingMore(true);
    setIncidentsError(null);

    try {
      const data = await getIncidents({
        cron: cronName,
        ...(env ? { env } : {}),
        ...(serviceGroup ? { service_group: serviceGroup } : {}),
        limit: INCIDENT_PAGE_SIZE,
        offset: nextIncidentOffset
      });
      const next = normalizeIncidentsResponse(data);

      setIncidents((current) => [...current, ...next.incidents]);
      setHasMoreIncidents(next.has_more);
      setNextIncidentOffset(next.next_offset);
    } catch (incidentError) {
      console.error('Failed to load older incident events:', incidentError);
      setIncidentsError(incidentError?.message || 'Failed to load older incidents');
    } finally {
      setIncidentsLoadingMore(false);
    }
  }

  async function enableMaintenance() {
    setMaintenanceSaving(true);
    setMaintenanceError(null);

    try {
      const duration = maintenanceDuration === 'custom'
        ? Number(customMaintenanceMinutes || 0)
        : Number(maintenanceDuration);

      if (!duration || duration < 1) {
        throw new Error('Choose a maintenance duration.');
      }

      await createMaintenanceWindow({
        cron_name: cronName,
        ...(server ? { server } : {}),
        ...(env ? { env } : {}),
        ...(serviceGroup ? { service_group: serviceGroup } : {}),
        duration_minutes: duration,
        reason: maintenanceReason || undefined
      });
      setMaintenanceReason('');
      await refreshMaintenance();
      setIncidentRefreshTick((value) => value + 1);
    } catch (saveError) {
      setMaintenanceError(saveError?.message || 'Failed to enable maintenance');
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function disableMaintenance(id) {
    setMaintenanceSaving(true);
    setMaintenanceError(null);

    try {
      await disableMaintenanceWindow(id);
      await refreshMaintenance();
      setIncidentRefreshTick((value) => value + 1);
    } catch (disableError) {
      setMaintenanceError(disableError?.message || 'Failed to disable maintenance');
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function acknowledgeTimelineIncident(alertEventId) {
    if (!alertEventId || ackSavingId) {
      return;
    }

    setAckSavingId(alertEventId);
    setAckError(null);

    try {
      await acknowledgeIncident(alertEventId, ackNotes[alertEventId] || '');
      setAckNotes((current) => {
        const next = { ...current };
        delete next[alertEventId];
        return next;
      });
      setIncidentRefreshTick((value) => value + 1);
    } catch (acknowledgeError) {
      setAckError(acknowledgeError?.message || 'Failed to acknowledge incident');
    } finally {
      setAckSavingId(null);
    }
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

      {activeMaintenance ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Maintenance active</p>
                <p className="mt-1">
                  Notifications are silenced until {activeMaintenance.expires_at} WIB
                  {activeMaintenance.remaining_minutes !== null ? ` (${activeMaintenance.remaining_minutes}m remaining)` : ''}.
                </p>
                {activeMaintenance.reason ? <p className="mt-1 text-blue-700 dark:text-blue-200">{activeMaintenance.reason}</p> : null}
              </div>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => disableMaintenance(activeMaintenance.id)}
                disabled={maintenanceSaving}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
              >
                Disable
              </button>
            ) : null}
          </div>
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

      {isAdmin ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink">Maintenance Mode</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_1fr_auto] md:items-end">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Duration</span>
              <select
                value={maintenanceDuration}
                onChange={(event) => setMaintenanceDuration(event.target.value === 'custom' ? 'custom' : Number(event.target.value))}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950"
              >
                {MAINTENANCE_DURATIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {maintenanceDuration === 'custom' ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">Minutes</span>
                <input
                  type="number"
                  min="1"
                  max="10080"
                  value={customMaintenanceMinutes}
                  onChange={(event) => setCustomMaintenanceMinutes(event.target.value)}
                  className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950"
                />
              </label>
            ) : <div className="hidden md:block" />}
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Reason</span>
              <input
                type="text"
                value={maintenanceReason}
                onChange={(event) => setMaintenanceReason(event.target.value)}
                placeholder="Deployment, infrastructure work..."
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950"
              />
            </label>
            <button
              type="button"
              onClick={enableMaintenance}
              disabled={maintenanceSaving}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {activeMaintenance ? 'Extend Silence' : 'Silence Alerts'}
            </button>
          </div>
          {maintenanceError ? <p className="mt-2 text-sm text-rose-600">{maintenanceError}</p> : null}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-4">
        <MetricCard compact icon={Activity} label="Executions" value={hasData ? formatNumber(totalRuns) : 'No data'} subtext="Selected time window" />
        <MetricCard compact icon={ShieldCheck} label="Success rate" value={hasData ? formatPercent(summary.success_rate ?? 0) : 'No data'} subtext={`${formatNumber(failed)} failures · ${formatNumber(warning)} warnings`} />
        <MetricCard compact icon={Clock3} label="Average duration" value={hasData ? formatDuration(averageDuration) : 'No data'} subtext="Mean runtime" />
        <MetricCard compact icon={Timer} label="P95 duration" value={hasData ? formatDuration(p95Duration) : 'No data'} subtext="From visible execution history" />
        <MetricCard compact icon={AlertTriangle} label="Failed count" value={hasData ? formatNumber(failed) : 'No data'} subtext={`${formatNumber(warning)} warnings`} />
        <MetricCard compact icon={Zap} label="Runs/hour" value={hasData ? formatNumber(runsPerHour, 2) : 'No data'} subtext="Throughput in selected window" />
        <MetricCard compact icon={Gauge} label="Last execution" value={lastLog ? formatDate(lastLog.timestamp) : 'No data'} subtext={lastLog ? formatDuration(lastLog.duration) : 'No matching run'} valueClassName="text-[0.8rem] sm:text-sm md:text-sm lg:text-3xl" />
        <MetricCard compact icon={BarChart3} label="Window" value={isCustom ? 'Custom' : filter.value.toUpperCase()} subtext={`Grouped by ${stats.interval || 'hour'}`} />
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Incident Timeline</h2>
            <p className="mt-1 text-sm text-slate-500">Alert and heartbeat lifecycle history for this cron.</p>
          </div>
          <span className="text-xs text-slate-500">{incidents.length} event{incidents.length === 1 ? '' : 's'} loaded</span>
        </div>

        {incidentsError ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {incidentsError}
          </div>
        ) : null}

        {ackError ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {ackError}
          </div>
        ) : null}

        {incidentsLoading && incidents.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading incident timeline...</div>
        ) : null}

        {!incidentsLoading && incidents.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No incident events recorded for this cron yet.</div>
        ) : null}

        {incidents.length > 0 ? (
          <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
            {incidents.map((incident, index) => {
              const style = incidentStyle(incident.type);
              const Icon = style.icon;
              const downtime = incident.downtime_minutes !== null && incident.downtime_minutes !== undefined
                ? `downtime ${incident.downtime_minutes}m`
                : null;
              const schedule = incident.metadata?.schedule;
              const acknowledgedBy = incident.acknowledged_by_name || incident.acknowledged_by_email;
              const ackDraft = ackNotes[incident.alert_event_id] || '';
              const isAcknowledgedIncident = incident.alert_state === 'acknowledged';
              const canAcknowledgeIncident = canAcknowledge
                && incident.alert_event_id
                && ['active', 'acknowledged'].includes(incident.alert_state)
                && incidents.findIndex((item) => item.alert_event_id === incident.alert_event_id) === index;

              return (
                <li key={incident.id} className="relative">
                  <span className="absolute -left-[1.42rem] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
                    <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">{incidentTime(incident.occurred_at)}</span>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ${style.className}`}>
                          {style.label}
                        </span>
                        {incident.severity ? (
                          <span className="text-xs text-slate-500">{incident.severity}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-medium text-ink">{incident.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{incident.reason || 'Incident lifecycle event'}</p>
                      {schedule || downtime ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {[downtime, schedule].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                      {incident.alert_state === 'acknowledged' && acknowledgedBy ? (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                          Acknowledged by {acknowledgedBy}{incident.acknowledged_at ? ` at ${incident.acknowledged_at} WIB` : ''}
                          {incident.acknowledgement_note ? ` · ${incident.acknowledgement_note}` : ''}
                        </p>
                      ) : null}
                      {canAcknowledgeIncident ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <input
                            type="text"
                            value={ackDraft}
                            onChange={(event) => setAckNotes((current) => ({ ...current, [incident.alert_event_id]: event.target.value }))}
                            placeholder={isAcknowledgedIncident ? 'Add handling note' : 'Optional note'}
                            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-800 dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() => acknowledgeTimelineIncident(incident.alert_event_id)}
                            disabled={ackSavingId === incident.alert_event_id || (isAcknowledgedIncident && !ackDraft.trim())}
                            className="inline-flex min-h-10 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                          >
                            {ackSavingId === incident.alert_event_id ? 'Saving...' : isAcknowledgedIncident ? 'Add Note' : 'Acknowledge'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{incident.occurred_at} WIB</span>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        {hasMoreIncidents ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={loadMoreIncidents}
              disabled={incidentsLoadingMore}
              className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {incidentsLoadingMore ? 'Loading older incidents...' : 'Load More'}
            </button>
          </div>
        ) : null}
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
