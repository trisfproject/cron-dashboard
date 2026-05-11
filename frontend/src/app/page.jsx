'use client';

import { Fragment, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, DatabaseZap, ListChecks, Radio, RotateCcw, TrendingUp } from 'lucide-react';
import { AlertSeverityBadge, AlertStateBadge } from '@/components/AlertBadge';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { MetricCard } from '@/components/MetricCard';
import { TimelineChart } from '@/components/TimelineChart';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { getAlerts, getCurrentUser, getIncidents, getMaintenanceWindows, getScopeOptions, getStats } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

const emptyStats = {
  summary: {},
  timeline: [],
  insights: {
    problematic_jobs: [],
    slowest_jobs: []
  },
  heartbeat: {
    summary: {},
    schedules: []
  },
  mode: 'window',
  window: '30m',
  interval: '1m'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 800;
const POLL_INTERVALS = {
  stats: 10000,
  alerts: 10000,
  auth: 60000,
  incidents: 30000,
  maintenance: 60000
};
const VALID_RELIABILITY_CLASSES = new Set(['outage', 'degraded', 'informational']);
const LIFECYCLE_ALERT_TYPES = new Set([
  'alert_resolved',
  'reminder_sent',
  'incident_acknowledged',
  'incident_note_added',
  'maintenance_enabled',
  'maintenance_disabled',
  'maintenance_expired'
]);
const OUTAGE_ALERT_TYPES = new Set(['missing_cron', 'failed_threshold', 'cron_silence', 'missing_detected', 'heartbeat_recovered']);
const DEGRADED_ALERT_TYPES = new Set(['success_rate_degradation', 'retry_storm', 'duration_anomaly', 'warning_threshold']);
const ALERT_RELIABILITY_SECTIONS = [
  {
    key: 'outage',
    label: 'Outages',
    description: 'Availability impact, downtime, MTTR/SLA exposure',
    Icon: AlertTriangle,
    badgeClass: 'bg-rose-600 text-white ring-rose-600 dark:bg-rose-500 dark:ring-rose-500',
    headerClass: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-100',
    cardClass: 'border-rose-200 bg-rose-50/80 shadow-sm dark:border-rose-900 dark:bg-rose-950/35',
    rowClass: 'bg-rose-50/45 dark:bg-rose-950/20',
    iconClass: 'text-rose-600 dark:text-rose-300'
  },
  {
    key: 'degraded',
    label: 'Degraded',
    description: 'Reliability degradation or non-outage incident',
    Icon: TrendingUp,
    badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-900',
    headerClass: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100',
    cardClass: 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/25',
    rowClass: 'bg-amber-50/35 dark:bg-amber-950/15',
    iconClass: 'text-amber-600 dark:text-amber-300'
  },
  {
    key: 'informational',
    label: 'Informational',
    description: 'Lifecycle or acknowledgement context only',
    Icon: Activity,
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:ring-sky-900',
    headerClass: 'border-sky-100 bg-sky-50/70 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/20 dark:text-sky-100',
    cardClass: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70',
    rowClass: 'bg-white dark:bg-slate-950/30',
    iconClass: 'text-sky-600 dark:text-sky-300'
  }
];
const HEARTBEAT_STATUS_META = {
  healthy: {
    label: 'Healthy',
    Icon: CheckCircle2,
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900',
    cardClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
    rowClass: '',
    description: 'On schedule'
  },
  delayed: {
    label: 'Delayed',
    Icon: Clock3,
    badgeClass: 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-100 dark:ring-yellow-900',
    cardClass: 'bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-100 dark:ring-yellow-900',
    rowClass: 'bg-yellow-50/35 dark:bg-yellow-950/15',
    description: 'Late, inside tolerance'
  },
  unstable: {
    label: 'Unstable',
    Icon: AlertTriangle,
    badgeClass: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-100 dark:ring-orange-900',
    cardClass: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-100 dark:ring-orange-900',
    rowClass: 'bg-orange-50/35 dark:bg-orange-950/15',
    description: 'Schedule jitter'
  },
  missing: {
    label: 'Missing',
    Icon: AlertTriangle,
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900',
    cardClass: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900',
    rowClass: 'bg-rose-50/45 dark:bg-rose-950/20',
    description: 'Past tolerance'
  },
  recovering: {
    label: 'Recovering',
    Icon: RotateCcw,
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:ring-sky-900',
    cardClass: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900',
    rowClass: 'bg-sky-50/35 dark:bg-sky-950/15',
    description: 'Recently restored'
  },
  invalid_schedule: {
    label: 'Invalid',
    Icon: AlertTriangle,
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900',
    cardClass: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    rowClass: 'bg-amber-50/35 dark:bg-amber-950/15',
    description: 'Configuration issue'
  }
};
const HEARTBEAT_STATUS_ORDER = ['healthy', 'delayed', 'unstable', 'missing', 'recovering'];
const TIMELINE_MARKER_META = {
  failure_spike: {
    title: 'Failure spike',
    shortLabel: 'Fail',
    color: '#f43f5e'
  },
  warning_surge: {
    title: 'Warning surge',
    shortLabel: 'Warn',
    color: '#f97316'
  },
  recovery: {
    title: 'Recovery',
    shortLabel: 'Rec',
    color: '#3b82f6'
  },
  maintenance: {
    title: 'Maintenance event',
    shortLabel: 'Maint',
    color: '#8b5cf6'
  }
};
const TIMELINE_FAILURE_MARKER_THRESHOLD = 1;
const TIMELINE_WARNING_MARKER_THRESHOLD = 2;
const VALID_WINDOWS = new Set(['5m', '15m', '30m', '1h', '4h']);
const VALID_RANGES = new Set(['today', '7d', '30d']);
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function pollingDebug(message, metadata = {}) {
  console.debug(`[NYX polling] ${message}`, metadata);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /aborted|abort/i.test(error?.message || '');
}

function resourceLabel(resource) {
  return {
    stats: 'Stats',
    alerts: 'Alerts',
    incidents: 'Incident context',
    auth: 'Session',
    maintenance: 'Maintenance status'
  }[resource] || 'Dashboard data';
}

function getAlertReliabilityClass(alert = {}) {
  const reliabilityClass = String(alert.reliability_class || '').toLowerCase();
  const impactType = String(alert.impact_type || '').toLowerCase();

  if (VALID_RELIABILITY_CLASSES.has(reliabilityClass)) {
    return reliabilityClass;
  }

  if (VALID_RELIABILITY_CLASSES.has(impactType)) {
    return impactType;
  }

  const type = String(alert.type || alert.incident_type || '').toLowerCase();
  const severity = String(alert.severity || '').toLowerCase();

  if (LIFECYCLE_ALERT_TYPES.has(type)) {
    return 'informational';
  }

  if (OUTAGE_ALERT_TYPES.has(type)) {
    return 'outage';
  }

  if (DEGRADED_ALERT_TYPES.has(type)) {
    return 'degraded';
  }

  if (severity === 'critical') {
    return 'outage';
  }

  if (severity === 'warning') {
    return 'degraded';
  }

  return 'informational';
}

function groupAlertsByReliability(alerts = []) {
  const grouped = ALERT_RELIABILITY_SECTIONS.reduce((acc, section) => {
    acc[section.key] = [];
    return acc;
  }, {});

  alerts.forEach((alert) => {
    grouped[getAlertReliabilityClass(alert)].push(alert);
  });

  return ALERT_RELIABILITY_SECTIONS.map((section) => ({
    ...section,
    alerts: grouped[section.key] || []
  }));
}

function heartbeatStatusMeta(status) {
  return HEARTBEAT_STATUS_META[status] || {
    label: status ? String(status).replaceAll('_', ' ') : 'Unknown',
    Icon: Activity,
    badgeClass: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
    cardClass: 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
    rowClass: '',
    description: 'State unavailable'
  };
}

function parseWibDate(value) {
  if (!value) {
    return null;
  }

  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}+07:00`
    : value;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function bucketForTimelineDate(value, interval = 'hour') {
  const date = parseWibDate(value);

  if (!date) {
    return null;
  }

  const jakartaDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  const year = jakartaDate.getUTCFullYear();
  const month = jakartaDate.getUTCMonth() + 1;
  const day = jakartaDate.getUTCDate();
  const hour = jakartaDate.getUTCHours();
  const minute = jakartaDate.getUTCMinutes();
  const second = jakartaDate.getUTCSeconds();
  const datePart = `${year}-${padDatePart(month)}-${padDatePart(day)}`;

  if (interval === 'day') {
    return datePart;
  }

  if (interval === 'hour') {
    return `${datePart} ${padDatePart(hour)}:00:00`;
  }

  if (interval === '15m') {
    return `${datePart} ${padDatePart(hour)}:${padDatePart(Math.floor(minute / 15) * 15)}:00`;
  }

  if (interval === '5m') {
    return `${datePart} ${padDatePart(hour)}:${padDatePart(Math.floor(minute / 5) * 5)}:00`;
  }

  if (interval === '1m') {
    return `${datePart} ${padDatePart(hour)}:${padDatePart(minute)}:00`;
  }

  if (interval === '30s') {
    return `${datePart} ${padDatePart(hour)}:${padDatePart(minute)}:${padDatePart(Math.floor(second / 30) * 30)}`;
  }

  if (interval === '10s') {
    return `${datePart} ${padDatePart(hour)}:${padDatePart(minute)}:${padDatePart(Math.floor(second / 10) * 10)}`;
  }

  return `${datePart} ${padDatePart(hour)}:${padDatePart(minute)}:00`;
}

function timelineMarker(type, bucket, description, overrides = {}) {
  const meta = TIMELINE_MARKER_META[type];

  if (!meta || !bucket) {
    return null;
  }

  return {
    type,
    bucket,
    title: overrides.title || meta.title,
    shortLabel: meta.shortLabel,
    color: meta.color,
    description
  };
}

function timelineBucketValues(item = {}) {
  return {
    bucket: item.bucket,
    total: Number(item.total || 0),
    failed: Number(item.failed || 0),
    warning: Number(item.warning || 0)
  };
}

function hasFailureSpike(item = {}) {
  return timelineBucketValues(item).failed > TIMELINE_FAILURE_MARKER_THRESHOLD;
}

function hasWarningSurge(item = {}) {
  return timelineBucketValues(item).warning > TIMELINE_WARNING_MARKER_THRESHOLD;
}

function hasPlottedFailure(item = {}) {
  return timelineBucketValues(item).failed > 0;
}

function hasReducedAnomaly(current = {}, previous = {}) {
  const currentValues = timelineBucketValues(current);
  const previousValues = timelineBucketValues(previous);
  const previousHadAnomaly = previousValues.failed > TIMELINE_FAILURE_MARKER_THRESHOLD
    || previousValues.warning > TIMELINE_WARNING_MARKER_THRESHOLD;

  if (!previousHadAnomaly) {
    return false;
  }

  return currentValues.failed < previousValues.failed || currentValues.warning < previousValues.warning;
}

function timelineMarkersFromBuckets(timeline = []) {
  return timeline.flatMap((item) => {
    const { bucket, failed, warning } = timelineBucketValues(item);
    const markers = [];

    if (hasFailureSpike(item)) {
      markers.push(timelineMarker(
        'failure_spike',
        bucket,
        `${formatNumber(failed)} failed run${failed === 1 ? '' : 's'} in this bucket`
      ));
    }

    if (hasWarningSurge(item)) {
      markers.push(timelineMarker(
        'warning_surge',
        bucket,
        `${formatNumber(warning)} warning run${warning === 1 ? '' : 's'} in this bucket`
      ));
    }

    return markers.filter(Boolean);
  });
}

function timelineMarkersFromIncidents(incidents = [], interval = 'hour', timelineByBucket = new Map(), orderedTimeline = []) {
  return incidents.map((incident) => {
    const bucket = bucketForTimelineDate(incident.occurred_at || incident.created_at || incident.started_at, interval);
    const plottedBucket = timelineByBucket.get(bucket);

    if (!plottedBucket) {
      return null;
    }

    const reliabilityClass = String(incident.reliability_class || incident.impact_type || '').toLowerCase();
    const type = String(incident.type || incident.event_type || '').toLowerCase();
    const incidentType = String(incident.incident_type || '').replaceAll('_', ' ');
    const label = incident.cron_name || incident.title || incident.reason || 'Operational event';

    if (['alert_resolved', 'heartbeat_recovered'].includes(type) || incident.incident_status === 'resolved') {
      const currentIndex = orderedTimeline.findIndex((item) => item.bucket === bucket);
      const previousBucket = currentIndex > 0 ? orderedTimeline[currentIndex - 1] : null;

      if (!hasReducedAnomaly(plottedBucket, previousBucket)) {
        return null;
      }

      return timelineMarker('recovery', bucket, `${label} recovered after visible anomaly reduction`, { title: 'Recovery marker' });
    }

    if (type.startsWith('maintenance_')) {
      if (timelineBucketValues(plottedBucket).total === 0) {
        return null;
      }

      return timelineMarker('maintenance', bucket, incident.reason || incident.title || 'Maintenance lifecycle event aligned with visible activity', { title: 'Maintenance marker' });
    }

    if ((reliabilityClass === 'outage' || incident.severity === 'critical') && hasPlottedFailure(plottedBucket)) {
      return timelineMarker('failure_spike', bucket, `${label}: ${incidentType || 'outage-class incident'}`, { title: 'Outage marker' });
    }

    return null;
  }).filter(Boolean);
}

function buildTimelineMarkers(timeline = [], incidents = [], interval = 'hour') {
  const seen = new Set();
  const orderedTimeline = Array.isArray(timeline) ? timeline : [];
  const timelineByBucket = new Map(orderedTimeline.map((item) => [item.bucket, item]));

  return [
    ...timelineMarkersFromBuckets(orderedTimeline),
    ...timelineMarkersFromIncidents(incidents, interval, timelineByBucket, orderedTimeline)
  ]
    .filter((marker) => {
      const key = `${marker.type}:${marker.bucket}:${marker.title}:${marker.description}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

async function retryOnce(label, requestFactory) {
  try {
    return await requestFactory();
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    pollingDebug('retrying fetch', { label, error: error?.message });
    await wait(RETRY_DELAY_MS);

    try {
      const result = await requestFactory();
      pollingDebug('fetch recovered', { label });
      return result;
    } catch (retryError) {
      throw retryError;
    }
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

function normalizeStatsResponse(data, range) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;

  return {
    summary: source?.summary && typeof source.summary === 'object' ? source.summary : {},
    timeline: Array.isArray(source?.timeline) ? source.timeline : [],
    insights: source?.insights && typeof source.insights === 'object' ? source.insights : emptyStats.insights,
    heartbeat: source?.heartbeat && typeof source.heartbeat === 'object' ? source.heartbeat : emptyStats.heartbeat,
    mode: source?.mode || 'window',
    window: source?.window || null,
    range: source?.range || range,
    interval: source?.interval || 'hour'
  };
}

function DashboardContent({ initialFilter = { type: 'window', value: '30m' }, initialCustomRange = null, initialScope = { env: '', service_group: '' } }) {
  const [filter, setFilter] = useState(initialFilter);
  const [customRange, setCustomRange] = useState(isValidCustomRange(initialCustomRange) ? initialCustomRange : null);
  const [stats, setStats] = useState(emptyStats);
  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState([]);
  const [scope, setScope] = useState(initialScope);
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
  const [loading, setLoading] = useState(true);
  const [pollWarnings, setPollWarnings] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [liveMode, setLiveMode] = useState(initialFilter.type !== 'custom');
  const [hasLoaded, setHasLoaded] = useState(false);
  const selectionTimerRef = useRef(null);
  const visibleRef = useRef(true);
  const timersRef = useRef({});
  const inFlightRef = useRef({});
  const controllersRef = useRef({});
  const resumePollingRef = useRef(null);

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
    if (typeof document === 'undefined') {
      return undefined;
    }

    visibleRef.current = !document.hidden;

    function onVisibilityChange() {
      visibleRef.current = !document.hidden;

      if (document.hidden) {
        pollingDebug('polling paused');
        Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
        timersRef.current = {};
        Object.entries(controllersRef.current).forEach(([resource, controller]) => {
          controller.abort();
          inFlightRef.current[resource] = false;
          pollingDebug('request aborted', { resource });
        });
        controllersRef.current = {};
        return;
      }

      pollingDebug('polling resumed');
      resumePollingRef.current?.();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => () => {
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
    }
  }, []);

  const dashboardParams = useCallback(() => {
    const customParams = isValidCustomRange(customRange)
      ? { start: customRange.start, end: customRange.end }
      : null;
    const params = customParams || { [filter.type]: filter.value };
    const scopeParams = {
      ...(scope.env ? { env: scope.env } : {}),
      ...(scope.service_group ? { service_group: scope.service_group } : {})
    };

    return { params, scopeParams };
  }, [customRange, filter.type, filter.value, scope.env, scope.service_group]);

  useEffect(() => {
    let cancelled = false;

    function setResourceWarning(resource, message) {
      setPollWarnings((current) => ({ ...current, [resource]: message }));
    }

    function clearResourceWarning(resource) {
      setPollWarnings((current) => {
        if (!current[resource]) {
          return current;
        }

        const next = { ...current };
        delete next[resource];
        return next;
      });
    }

    function clearTimer(resource) {
      if (timersRef.current[resource]) {
        window.clearTimeout(timersRef.current[resource]);
        delete timersRef.current[resource];
      }
    }

    function abortResource(resource) {
      const controller = controllersRef.current[resource];

      if (controller) {
        controller.abort();
        delete controllersRef.current[resource];
        inFlightRef.current[resource] = false;
        pollingDebug('request aborted', { resource });
      }
    }

    async function runResource(resource, requestFactory, onSuccess) {
      if (cancelled || !visibleRef.current) {
        pollingDebug('polling paused', { resource });
        return;
      }

      if (inFlightRef.current[resource]) {
        pollingDebug('poll skipped; request still in flight', { resource });
        return;
      }

      const controller = new AbortController();
      controllersRef.current[resource] = controller;
      inFlightRef.current[resource] = true;

      try {
        const data = await retryOnce(resource, () => requestFactory(controller.signal));

        if (cancelled || controller.signal.aborted) {
          return;
        }

        onSuccess(data);
        clearResourceWarning(resource);
      } catch (fetchError) {
        if (isAbortError(fetchError)) {
          pollingDebug('request aborted', { resource });
          return;
        }

        console.warn(`Dashboard ${resource} temporarily unavailable:`, fetchError);

        if (!cancelled) {
          setResourceWarning(resource, `${resourceLabel(resource)} temporarily unavailable. Retrying...`);
        }
      } finally {
        if (controllersRef.current[resource] === controller) {
          delete controllersRef.current[resource];
        }

        inFlightRef.current[resource] = false;
      }
    }

    function runStats() {
      const { params, scopeParams } = dashboardParams();
      return runResource(
        'stats',
        (signal) => getStats({ ...params, ...scopeParams }, { signal }),
        (statsData) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('stats response', statsData);
          }

          setStats(normalizeStatsResponse(statsData, filter.value));
        }
      );
    }

    function runAuth() {
      return runResource(
        'auth',
        (signal) => getCurrentUser({ signal }),
        () => {}
      );
    }

    function runAlerts() {
      const { scopeParams } = dashboardParams();

      return runResource(
        'alerts',
        (signal) => getAlerts({ state: 'open', limit: 5, ...scopeParams }, { signal }),
        (alertsData) => setAlerts(Array.isArray(alertsData?.alerts) ? alertsData.alerts : [])
      );
    }

    function runIncidents() {
      const { scopeParams } = dashboardParams();
      return runResource(
        'incidents',
        (signal) => getIncidents({ limit: 100, ...scopeParams }, { signal }),
        (incidentData) => setIncidents(Array.isArray(incidentData?.incidents) ? incidentData.incidents : [])
      );
    }

    function runMaintenance() {
      const { scopeParams } = dashboardParams();
      return runResource(
        'maintenance',
        (signal) => getMaintenanceWindows({ ...scopeParams }, { signal }),
        (maintenanceData) => setMaintenanceWindows(Array.isArray(maintenanceData?.maintenance_windows) ? maintenanceData.maintenance_windows : [])
      );
    }

    function intervalFor(resource) {
      if (!refreshInterval || !liveMode) {
        return 0;
      }

      return Math.max(refreshInterval, POLL_INTERVALS[resource]);
    }

    function schedule(resource, runner) {
      clearTimer(resource);
      const interval = intervalFor(resource);

      if (!interval) {
        return;
      }

      timersRef.current[resource] = window.setTimeout(async () => {
        await runner();
        schedule(resource, runner);
      }, interval);
    }

    function scheduleAll() {
      schedule('stats', runStats);
      schedule('alerts', runAlerts);
      schedule('incidents', runIncidents);
      schedule('auth', runAuth);
      schedule('maintenance', runMaintenance);
    }

    async function initialLoad() {
      setLoading(true);
      setPollWarnings({});

      await Promise.all([runAuth(), runStats(), runMaintenance(), runIncidents()]);
      await runAlerts();

      if (!cancelled) {
        setLoading(false);
        setHasLoaded(true);
      }
    }

    Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
    timersRef.current = {};
    Object.keys(controllersRef.current).forEach(abortResource);
    resumePollingRef.current = async () => {
      await runAuth();
      runStats();
      runAlerts();
      runIncidents();
      runMaintenance();
      scheduleAll();
    };

    initialLoad();
    scheduleAll();

    return () => {
      cancelled = true;
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
      Object.keys(controllersRef.current).forEach(abortResource);
    };
  }, [dashboardParams, filter.value, liveMode, refreshInterval]);

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
  const timelineMarkers = buildTimelineMarkers(timeline, incidents, timelineInterval);
  const heartbeat = stats?.heartbeat && typeof stats.heartbeat === 'object' ? stats.heartbeat : { summary: {}, schedules: [] };
  const heartbeatSummary = heartbeat.summary || {};
  const heartbeatSchedules = Array.isArray(heartbeat.schedules) ? heartbeat.schedules : [];
  const missingHeartbeatSchedules = heartbeatSchedules.filter((schedule) => schedule.heartbeat_status === 'missing');
  const attentionHeartbeatSchedules = heartbeatSchedules.filter((schedule) => ['missing', 'delayed', 'unstable'].includes(schedule.heartbeat_status));
  const heartbeatAttentionBannerClass = missingHeartbeatSchedules.length > 0
    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
  const pollWarningMessages = Object.values(pollWarnings).filter(Boolean);
  const activeMaintenance = maintenanceWindows[0] || null;
  const visibleHeartbeatSchedules = heartbeatSchedules.slice(0, 6);
  const activeAlerts = Array.isArray(alerts) ? alerts : [];
  const activeAlertSections = groupAlertsByReliability(activeAlerts);
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

      {pollWarningMessages.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠ {pollWarningMessages.slice(0, 2).join(' ')}
        </div>
      ) : null}

      {activeMaintenance ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          🛠 Maintenance active until {activeMaintenance.expires_at} WIB
          {activeMaintenance.remaining_minutes !== null ? ` (${activeMaintenance.remaining_minutes}m remaining)` : ''}.
        </div>
      ) : null}

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
        <TimelineChart data={timeline} interval={timelineInterval} markers={timelineMarkers} onRangeSelect={applySelectedTimelineRange} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Heartbeat Monitoring</h2>
            <p className="mt-1 text-sm text-slate-500">Per-cron schedule adherence, timing drift, and recovery state for monitored entries.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[28rem] lg:grid-cols-6">
            <div className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <p className="font-semibold text-ink">{formatNumber(heartbeatSummary.monitored_schedules || 0)}</p>
              <p className="text-slate-500">Monitored</p>
            </div>
            {HEARTBEAT_STATUS_ORDER.map((status) => {
              const meta = heartbeatStatusMeta(status);
              const Icon = meta.Icon;

              return (
                <div key={status} className={`rounded-md p-2 ring-1 ${meta.cardClass}`}>
                  <div className="flex items-center justify-center gap-1">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <p className="font-semibold">{formatNumber(heartbeatSummary[status] || 0)}</p>
                  </div>
                  <p>{meta.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {attentionHeartbeatSchedules.length > 0 ? (
          <div className={`mb-4 rounded-md border p-3 text-sm ${heartbeatAttentionBannerClass}`}>
            {missingHeartbeatSchedules.length > 0
              ? `${formatNumber(missingHeartbeatSchedules.length)} cron schedule${missingHeartbeatSchedules.length === 1 ? '' : 's'} missing expected heartbeat.`
              : `${formatNumber(attentionHeartbeatSchedules.length)} cron schedule${attentionHeartbeatSchedules.length === 1 ? '' : 's'} showing timing risk before outage escalation.`}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2">Cron</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last heartbeat</th>
                <th className="px-3 py-2">Expected</th>
                <th className="px-3 py-2">Schedule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleHeartbeatSchedules.map((schedule) => {
                const statusMeta = heartbeatStatusMeta(schedule.heartbeat_status);
                const StatusIcon = statusMeta.Icon;

                return (
                  <tr key={schedule.id || schedule.cron_name} className={`align-top ${statusMeta.rowClass}`}>
                    <td className="max-w-[18rem] px-3 py-2">
                      <p className="truncate font-medium text-ink">{schedule.cron_name}</p>
                      <p className="mt-1 text-xs text-slate-500">{schedule.environment || schedule.env || '-'}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium capitalize ring-1 ${statusMeta.badgeClass}`}>
                        <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {statusMeta.label}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">{statusMeta.description}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                      {schedule.last_heartbeat_at ? `${formatRelativeTime(schedule.last_heartbeat_at)} (${schedule.last_heartbeat_at} WIB)` : 'No heartbeat'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                      <p>{schedule.expected_at || '-'}</p>
                      {schedule.heartbeat_lag_minutes ? <p className="mt-1 text-xs text-slate-500">Lag {formatNumber(schedule.heartbeat_lag_minutes)}m</p> : null}
                      {schedule.heartbeat_state_reason ? <p className="mt-1 max-w-[18rem] whitespace-normal text-xs text-slate-500">{schedule.heartbeat_state_reason}</p> : null}
                    </td>
                    <td className="min-w-[16rem] px-3 py-2 text-slate-600 dark:text-slate-300">
                      <p className="font-mono text-xs text-slate-700 dark:text-slate-200">{schedule.schedule_expression || '-'}</p>
                      {schedule.schedule_description ? <p className="mt-1 text-xs text-slate-500">{schedule.schedule_description}</p> : null}
                    </td>
                  </tr>
                );
              })}
              {visibleHeartbeatSchedules.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>No heartbeat schedules registered yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">Active Alerts</h2>
              <p className="mt-1 text-sm text-slate-500">Realtime alert lifecycle across reliability, duration, retries, and cron silence rules.</p>
            </div>
            <Link href="/alerts" className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900 sm:w-auto">
              View history
            </Link>
          </div>
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {activeAlertSections.map((section) => {
              const Icon = section.Icon;

              return (
                <div key={section.key} className={`flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 ${section.headerClass}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${section.iconClass}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{section.label}</p>
                      <p className="truncate text-xs opacity-75">{section.description}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ring-1 ${section.badgeClass}`}>
                    {section.alerts.length}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="space-y-4 md:hidden">
            {activeAlerts.length > 0 ? activeAlertSections.map((section) => {
              const Icon = section.Icon;

              if (section.alerts.length === 0) {
                return null;
              }

              return (
                <section key={section.key} className="space-y-2">
                  <div className={`flex items-center justify-between rounded-md border px-3 py-2 ${section.headerClass}`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${section.iconClass}`} aria-hidden="true" />
                      <h3 className="text-sm font-semibold">{section.label} ({section.alerts.length})</h3>
                    </div>
                  </div>
                  <div className={section.key === 'informational' ? 'space-y-2' : 'space-y-3'}>
                    {section.alerts.map((alert) => (
                      <article key={alert.id} className={`${section.key === 'informational' ? 'space-y-2 rounded-md p-3' : 'space-y-3 rounded-lg p-4'} border ${section.cardClass}`}>
                        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                          <p className={`min-w-0 break-words font-semibold text-ink ${section.key === 'informational' ? 'text-xs' : 'text-sm'}`}>{alert.cron_name || 'All monitored cron jobs'}</p>
                          <span className="shrink-0"><AlertSeverityBadge severity={alert.severity} /></span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                          <ServiceGroupBadge serviceGroup={alert.service_group} />
                        </div>
                        <p className={`break-words text-slate-600 dark:text-slate-300 ${section.key === 'informational' ? 'text-xs' : 'text-sm'}`}>{alert.reason}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <AlertStateBadge state={alert.state} />
                          <span>{alert.triggered_at || '-'}</span>
                          {alert.acknowledged_at ? (
                            <span>Acknowledged by {alert.acknowledged_by_name || alert.acknowledged_by_email || 'operator'} at {alert.acknowledged_at}</span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            }) : (
              <div className="rounded-lg bg-emerald-50 px-3 py-8 text-center text-sm text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">No active alerts. Cron monitoring is quiet.</div>
            )}
          </div>
          <div className="hidden min-w-0 overflow-x-auto rounded-md md:block">
            <table className="min-w-[72rem] divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Cron</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Triggered</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeAlertSections.map((section) => {
                  const Icon = section.Icon;

                  if (section.alerts.length === 0) {
                    return null;
                  }

                  return (
                    <Fragment key={section.key}>
                      <tr className={`${section.headerClass} border-y`}>
                        <td className="px-3 py-2" colSpan={7}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className={`h-4 w-4 shrink-0 ${section.iconClass}`} aria-hidden="true" />
                              <span className="font-semibold">{section.label} ({section.alerts.length})</span>
                              <span className="truncate text-xs opacity-75">{section.description}</span>
                            </div>
                            <span className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ${section.badgeClass}`}>
                              {section.alerts.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {section.alerts.map((alert) => (
                        <tr key={alert.id} className={`align-top ${section.rowClass}`}>
                          <td className={`max-w-[18rem] truncate px-3 font-medium text-ink ${section.key === 'informational' ? 'py-1.5 text-xs' : 'py-2'}`}>{alert.cron_name || 'All monitored cron jobs'}</td>
                          <td className={`whitespace-nowrap px-3 ${section.key === 'informational' ? 'py-1.5' : 'py-2'}`}><AlertSeverityBadge severity={alert.severity} /></td>
                          <td className={`whitespace-nowrap px-3 ${section.key === 'informational' ? 'py-1.5' : 'py-2'}`}>
                            <div className="flex flex-wrap gap-1.5">
                              {alert.env ? <EnvironmentBadge env={alert.env} /> : null}
                              <ServiceGroupBadge serviceGroup={alert.service_group} />
                            </div>
                          </td>
                          <td className={`min-w-[18rem] max-w-[28rem] px-3 text-slate-600 dark:text-slate-300 ${section.key === 'informational' ? 'py-1.5 text-xs' : 'py-2'}`}>
                            <p className="break-words">{alert.reason}</p>
                          </td>
                          <td className={`whitespace-nowrap px-3 text-slate-600 dark:text-slate-300 ${section.key === 'informational' ? 'py-1.5 text-xs' : 'py-2'}`}>{alert.triggered_at || '-'}</td>
                          <td className={`whitespace-nowrap px-3 ${section.key === 'informational' ? 'py-1.5' : 'py-2'}`}><AlertStateBadge state={alert.state} /></td>
                          <td className={`whitespace-nowrap px-3 text-slate-600 dark:text-slate-300 ${section.key === 'informational' ? 'py-1.5 text-xs' : 'py-2'}`}>
                            {alert.acknowledged_at ? (
                              <span>{alert.acknowledged_by_name || alert.acknowledged_by_email || 'operator'} · {alert.acknowledged_at}</span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {activeAlerts.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-emerald-700 dark:text-emerald-200" colSpan={7}>No active alerts. Cron monitoring is quiet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
