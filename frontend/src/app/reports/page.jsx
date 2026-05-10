'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Bell, Clock3, Gauge, RotateCcw, Search, ShieldCheck, TimerReset } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EnvironmentBadge, ServiceGroupBadge } from '@/components/EnvironmentBadge';
import { TimeRangeFilter } from '@/components/TimeRangeFilter';
import { formatApiError, getReliabilityReport, getScopeOptions, getStats } from '@/lib/api';
import { formatDuration, formatNumber, formatPercent } from '@/lib/format';

const VALID_RANGES = new Set(['today', '7d', '30d']);
const VALID_SORTS = new Set(['downtime', 'incidents']);
const REPORT_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const selectClass = 'h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 sm:w-44 lg:w-48 xl:w-52';
const REPORT_TIME_OPTIONS = [
  { type: 'range', value: 'today', label: 'Today' },
  { type: 'range', value: '7d', label: '7D' },
  { type: 'range', value: '30d', label: '30D' }
];
const DEFAULT_REPORT_FILTER = { type: 'range', value: '7d' };

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

function rangeLabel(range, start = '', end = '') {
  if (start && end) {
    return `${start.replace('T', ' ')} to ${end.replace('T', ' ')}`;
  }

  return {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days'
  }[range] || 'Last 7 days';
}

function normalizeCustomRangeForPicker(filters) {
  if (!filters.start || !filters.end) {
    return null;
  }

  const start = filters.start.length === 10 ? `${filters.start}T00:00` : filters.start;
  const end = filters.end.length === 10 ? `${filters.end}T23:59` : filters.end;
  return { start, end };
}

function metricSubtext(range, scope) {
  const parts = [rangeLabel(range, scope.start, scope.end)];
  if (scope.env) parts.push(scope.env);
  if (scope.service_group) parts.push(scope.service_group);
  return parts.join(' / ');
}

function normalizeStatsResponse(data) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;

  return {
    insights: source?.insights && typeof source.insights === 'object'
      ? source.insights
      : { problematic_jobs: [], slowest_jobs: [] }
  };
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

      if (healthDelta !== 0) return healthDelta;

      const failureDelta = Number(right.failed_count || 0) - Number(left.failed_count || 0);

      if (failureDelta !== 0) return failureDelta;

      const warningDelta = Number(right.warning_count || 0) - Number(left.warning_count || 0);

      if (warningDelta !== 0) return warningDelta;

      return Number(left.success_rate || 0) - Number(right.success_rate || 0);
    });
}

function getPerformanceSeverity(job) {
  const avgDuration = Number(job?.avg_duration || 0);
  const maxDuration = Number(job?.max_duration || 0);

  if (avgDuration >= 60000 || maxDuration >= 120000) {
    return { label: 'Slow', className: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900' };
  }

  if (avgDuration >= 10000 || maxDuration >= 30000) {
    return { label: 'Elevated', className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900' };
  }

  return { label: 'Normal', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900' };
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

function getReliabilityActivityState(triggered, recovered) {
  if (triggered === 0 && recovered > 0) {
    return {
      label: 'Recovery activity only',
      summary: 'Recovered operational signals closed without new activity in this bucket.',
      tone: 'stable'
    };
  }

  if (triggered > recovered && recovered > 0) {
    return {
      label: 'Operational pressure increasing',
      summary: 'Triggered events exceeded recoveries; inspect degraded or outage patterns around this window.',
      tone: 'elevated'
    };
  }

  if (triggered > 0 && recovered === 0) {
    return {
      label: 'Increased operational anomalies',
      summary: 'New reliability activity appeared without same-day recovery events in this bucket.',
      tone: 'elevated'
    };
  }

  if (triggered > 0 && recovered >= triggered) {
    return {
      label: 'Recovery rate stabilizing',
      summary: 'Recovery activity matched or exceeded triggered operational events for this bucket.',
      tone: 'stable'
    };
  }

  return {
    label: 'No reliability activity',
    summary: 'No triggered or recovered operational events were recorded in this bucket.',
    tone: 'neutral'
  };
}

function ReliabilityActivityTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const row = payload[0]?.payload || {};
  const triggered = Number(row.incidents || 0);
  const recovered = Number(row.recoveries || 0);
  const delta = triggered - recovered;
  const balanceLabel = `${delta > 0 ? '+' : ''}${formatNumber(delta)}`;
  const state = getReliabilityActivityState(triggered, recovered);
  const stateClass = state.tone === 'elevated'
    ? 'text-amber-500 dark:text-amber-300'
    : state.tone === 'stable'
      ? 'text-emerald-600 dark:text-emerald-300'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="rounded-md border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 text-sm text-[var(--chart-tooltip-text)] shadow-lg">
      <p className="font-medium">Date: {label}</p>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="text-amber-500 dark:text-amber-300">Triggered events</span>
          <span className="font-semibold">{formatNumber(triggered)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-emerald-600 dark:text-emerald-300">Recovered events</span>
          <span className="font-semibold">{formatNumber(recovered)}</span>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-[var(--chart-tooltip-border)] pt-1">
          <span>Reliability balance</span>
          <span className={`font-semibold ${delta > 0 ? 'text-amber-500 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{balanceLabel}</span>
        </div>
        <div className="border-t border-[var(--chart-tooltip-border)] pt-2">
          <p className={`font-medium ${stateClass}`}>{state.label}</p>
          <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500 dark:text-slate-400">{state.summary}</p>
        </div>
      </div>
    </div>
  );
}

function ReliabilityActivityChart({ trend }) {
  const chartData = trend.map((row) => ({
    ...row,
    incidents: Number(row.incidents || 0),
    recoveries: Number(row.recoveries || 0)
  }));
  const chartFrameRef = useRef(null);
  const [visibleRange, setVisibleRange] = useState({ startIndex: 0, endIndex: Math.max(chartData.length - 1, 0) });
  const [selection, setSelection] = useState(null);
  const [panState, setPanState] = useState(null);
  const [pinchState, setPinchState] = useState(null);
  const totalActivity = chartData.reduce((sum, row) => sum + row.incidents + row.recoveries, 0);
  const totalIncidents = chartData.reduce((sum, row) => sum + row.incidents, 0);
  const totalRecoveries = chartData.reduce((sum, row) => sum + row.recoveries, 0);
  const activityState = getReliabilityActivityState(totalIncidents, totalRecoveries);
  const pressureElevated = activityState.tone === 'elevated';
  const maxIndex = Math.max(chartData.length - 1, 0);
  const normalizedStart = Math.max(0, Math.min(visibleRange.startIndex, maxIndex));
  const normalizedEnd = Math.max(normalizedStart, Math.min(visibleRange.endIndex, maxIndex));
  const isZoomed = normalizedStart > 0 || normalizedEnd < maxIndex;
  const visibleCount = normalizedEnd - normalizedStart + 1;
  const visibleChartData = chartData.slice(normalizedStart, normalizedEnd + 1);
  const selectionStart = selection ? chartData[Math.min(selection.startIndex, selection.endIndex)]?.day : null;
  const selectionEnd = selection ? chartData[Math.max(selection.startIndex, selection.endIndex)]?.day : null;

  useEffect(() => {
    setVisibleRange((current) => {
      const nextMaxIndex = Math.max(chartData.length - 1, 0);
      const startIndex = Math.max(0, Math.min(current.startIndex, nextMaxIndex));
      const endIndex = Math.max(startIndex, Math.min(current.endIndex, nextMaxIndex));

      if (startIndex === current.startIndex && endIndex === current.endIndex) {
        return current;
      }

      return { startIndex, endIndex };
    });
  }, [chartData.length]);

  function normalizeRange(startIndex, endIndex) {
    const nextStart = Math.max(0, Math.min(startIndex, maxIndex));
    const nextEnd = Math.max(nextStart, Math.min(endIndex, maxIndex));

    return { startIndex: nextStart, endIndex: nextEnd };
  }

  function clampRange(startIndex, endIndex) {
    const width = Math.max(0, endIndex - startIndex);
    let nextStart = Math.round(startIndex);
    let nextEnd = Math.round(endIndex);

    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = Math.min(maxIndex, width);
    }

    if (nextEnd > maxIndex) {
      nextEnd = maxIndex;
      nextStart = Math.max(0, maxIndex - width);
    }

    return normalizeRange(nextStart, nextEnd);
  }

  function resetZoom() {
    setVisibleRange({ startIndex: 0, endIndex: maxIndex });
    setSelection(null);
    setPanState(null);
    setPinchState(null);
  }

  function zoomAroundIndex(centerIndex, direction) {
    if (chartData.length <= 2) {
      return;
    }

    const currentCount = normalizedEnd - normalizedStart + 1;
    const nextCount = direction < 0
      ? Math.max(2, Math.round(currentCount * 0.72))
      : Math.min(chartData.length, Math.round(currentCount * 1.32));

    if (nextCount >= chartData.length) {
      resetZoom();
      return;
    }

    const centerRatio = currentCount > 1 ? (centerIndex - normalizedStart) / (currentCount - 1) : 0.5;
    const nextStart = Math.round(centerIndex - (nextCount - 1) * centerRatio);
    const nextEnd = nextStart + nextCount - 1;
    setVisibleRange(clampRange(nextStart, nextEnd));
  }

  function activeIndexFromEvent(event) {
    const labelIndex = chartData.findIndex((item) => item.day === event?.activeLabel);

    if (labelIndex >= 0) {
      return labelIndex;
    }

    const index = Number(event?.activeTooltipIndex);

    if (!Number.isFinite(index)) {
      return null;
    }

    return Math.max(0, Math.min(normalizedStart + index, maxIndex));
  }

  function indexFromPointerEvent(event) {
    const rect = chartFrameRef.current?.getBoundingClientRect();

    if (!rect || chartData.length === 0) {
      return null;
    }

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return Math.round(normalizedStart + ratio * Math.max(visibleCount - 1, 0));
  }

  function handleWheel(event) {
    event.preventDefault();

    if (isZoomed && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const shift = Math.sign(event.deltaX) * Math.max(1, Math.round(visibleCount * 0.12));
      setVisibleRange(clampRange(normalizedStart + shift, normalizedEnd + shift));
      return;
    }

    const centerIndex = indexFromPointerEvent(event) ?? Math.round((normalizedStart + normalizedEnd) / 2);
    zoomAroundIndex(centerIndex, event.deltaY);
  }

  function handleMouseDown(event) {
    const activeIndex = activeIndexFromEvent(event);

    if (activeIndex === null) {
      return;
    }

    if (isZoomed) {
      setPanState({ anchorIndex: activeIndex, startIndex: normalizedStart, endIndex: normalizedEnd });
      setSelection(null);
      setPinchState(null);
      return;
    }

    setSelection({ startIndex: activeIndex, endIndex: activeIndex });
    setPinchState(null);
  }

  function handleMouseMove(event) {
    const activeIndex = activeIndexFromEvent(event);

    if (activeIndex === null) {
      return;
    }

    if (panState) {
      const delta = panState.anchorIndex - activeIndex;
      setVisibleRange(clampRange(panState.startIndex + delta, panState.endIndex + delta));
      return;
    }

    if (selection) {
      setSelection((current) => current ? { ...current, endIndex: activeIndex } : current);
    }
  }

  function handleMouseUp() {
    if (panState) {
      setPanState(null);
      return;
    }

    if (!selection) {
      return;
    }

    const startIndex = Math.min(selection.startIndex, selection.endIndex);
    const endIndex = Math.max(selection.startIndex, selection.endIndex);

    if (endIndex - startIndex >= 1) {
      setVisibleRange({ startIndex, endIndex });
    }

    setSelection(null);
  }

  function handleMouseLeave() {
    setSelection(null);
    setPanState(null);
    setPinchState(null);
  }

  function handleTouchStart(event) {
    if (event.touches.length === 2) {
      const firstIndex = indexFromPointerEvent(event.touches[0]);
      const secondIndex = indexFromPointerEvent(event.touches[1]);
      const distance = Math.abs(event.touches[0].clientX - event.touches[1].clientX);

      if (firstIndex === null || secondIndex === null || distance <= 0) {
        return;
      }

      setPinchState({
        distance,
        centerIndex: Math.round((firstIndex + secondIndex) / 2),
        startIndex: normalizedStart,
        endIndex: normalizedEnd
      });
      setSelection(null);
      setPanState(null);
      return;
    }

    if (event.touches.length !== 1) {
      return;
    }

    const activeIndex = indexFromPointerEvent(event.touches[0]);

    if (activeIndex === null) {
      return;
    }

    if (isZoomed) {
      setPanState({ anchorIndex: activeIndex, startIndex: normalizedStart, endIndex: normalizedEnd });
      setSelection(null);
      setPinchState(null);
      return;
    }

    setSelection({ startIndex: activeIndex, endIndex: activeIndex });
    setPinchState(null);
  }

  function handleTouchMove(event) {
    if (event.touches.length === 2 && pinchState) {
      const distance = Math.abs(event.touches[0].clientX - event.touches[1].clientX);

      if (distance <= 0) {
        return;
      }

      event.preventDefault();

      const initialCount = pinchState.endIndex - pinchState.startIndex + 1;
      const nextCount = Math.max(2, Math.min(chartData.length, Math.round(initialCount * (pinchState.distance / distance))));

      if (nextCount >= chartData.length) {
        resetZoom();
        return;
      }

      const centerRatio = initialCount > 1 ? (pinchState.centerIndex - pinchState.startIndex) / (initialCount - 1) : 0.5;
      const nextStart = Math.round(pinchState.centerIndex - (nextCount - 1) * centerRatio);
      const nextEnd = nextStart + nextCount - 1;
      setVisibleRange(clampRange(nextStart, nextEnd));
      return;
    }

    if (event.touches.length !== 1 || (!selection && !panState)) {
      return;
    }

    const activeIndex = indexFromPointerEvent(event.touches[0]);

    if (activeIndex === null) {
      return;
    }

    event.preventDefault();

    if (panState) {
      const delta = panState.anchorIndex - activeIndex;
      setVisibleRange(clampRange(panState.startIndex + delta, panState.endIndex + delta));
      return;
    }

    setSelection((current) => current ? { ...current, endIndex: activeIndex } : current);
  }

  function handleTouchEnd() {
    if (pinchState) {
      setPinchState(null);
      return;
    }

    handleMouseUp();
  }

  if (trend.length === 0 || totalActivity === 0) {
    return <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No reliability activity data for this range.</div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {formatNumber(totalIncidents)} triggered events / {formatNumber(totalRecoveries)} recovered events
        </p>
        <span className={`w-fit rounded-md px-2 py-1 text-xs font-medium ring-1 ${
          pressureElevated
            ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900'
            : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900'
        }`}
        >
          {activityState.label}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div
          ref={chartFrameRef}
          className={`h-72 min-w-[36rem] touch-none px-3 py-5 sm:h-80 ${isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
          onWheel={handleWheel}
          onDoubleClick={resetZoom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleChartData}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--chart-axis)" minTickGap={28} tickFormatter={(value) => String(value).slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--chart-axis)" allowDecimals={false} width={42} tickCount={5} />
              <Tooltip content={<ReliabilityActivityTooltip />} />
              <Line
                type="monotone"
                dataKey="incidents"
                name="Triggered events"
                stroke="#f59e0b"
                strokeWidth={2.25}
                dot={{ r: 4, strokeWidth: 2, fill: 'var(--chart-tooltip-bg)' }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                isAnimationActive
                animationDuration={220}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="recoveries"
                name="Recovered events"
                stroke="#10b981"
                strokeWidth={2.25}
                dot={{ r: 4, strokeWidth: 2, fill: 'var(--chart-tooltip-bg)' }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                isAnimationActive
                animationDuration={220}
                animationEasing="ease-out"
              />
              {selectionStart && selectionEnd ? (
                <ReferenceArea x1={selectionStart} x2={selectionEnd} strokeOpacity={0.2} fill="#2563eb" fillOpacity={0.14} />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 px-4 py-3 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Triggered events</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Recovered events</span>
        <span className="text-slate-400 dark:text-slate-500">
          {isZoomed ? 'Drag to pan the focused window, scroll to zoom, double-click to reset.' : 'Drag across the plot to zoom into a reliability window, scroll to zoom around the pointer.'}
        </span>
      </div>
    </div>
  );
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState(null);
  const [operationalStats, setOperationalStats] = useState({ insights: { problematic_jobs: [], slowest_jobs: [] } });
  const [scopeOptions, setScopeOptions] = useState({ environments: [], service_groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = useMemo(() => {
    const range = searchParams.get('range');
    const sort = searchParams.get('sort');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    return {
      range: VALID_RANGES.has(range) ? range : '7d',
      start: REPORT_TIME_PATTERN.test(start || '') ? start : '',
      end: REPORT_TIME_PATTERN.test(end || '') ? end : '',
      env: searchParams.get('env') || '',
      service_group: searchParams.get('service_group') || '',
      sort: VALID_SORTS.has(sort) ? sort : 'downtime'
    };
  }, [searchParams]);

  const statsFilters = useMemo(() => ({
    ...(filters.start && filters.end ? { start: filters.start, end: filters.end } : { range: filters.range }),
    ...(filters.env ? { env: filters.env } : {}),
    ...(filters.service_group ? { service_group: filters.service_group } : {})
  }), [filters.range, filters.start, filters.end, filters.env, filters.service_group]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      getReliabilityReport(filters),
      getStats(statsFilters).catch(() => ({ insights: { problematic_jobs: [], slowest_jobs: [] } })),
      getScopeOptions().catch(() => ({ environments: [], service_groups: [] }))
    ])
      .then(([reportData, statsData, scopeData]) => {
        if (cancelled) return;
        setReport(reportData);
        setOperationalStats(normalizeStatsResponse(statsData));
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
  }, [filters, statsFilters]);

  function applyFilters(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();

    if (filters.start && filters.end) {
      query.set('start', filters.start);
      query.set('end', filters.end);
    } else {
      query.set('range', filters.range);
    }

    for (const key of ['env', 'service_group', 'sort']) {
      const value = form.get(key);
      if (value) query.set(key, value);
    }

    router.push(`/reports?${query.toString()}`);
  }

  function applyTimeFilter(nextFilter) {
    const query = new URLSearchParams();
    query.set('range', nextFilter?.value || '7d');
    for (const key of ['env', 'service_group', 'sort']) {
      const value = filters[key];
      if (value) query.set(key, value);
    }
    router.push(`/reports?${query.toString()}`);
  }

  function applyCustomRange(nextRange) {
    const query = new URLSearchParams();
    query.set('start', nextRange.start);
    query.set('end', nextRange.end);
    for (const key of ['env', 'service_group', 'sort']) {
      const value = filters[key];
      if (value) query.set(key, value);
    }
    router.push(`/reports?${query.toString()}`);
  }

  const summary = report?.summary || {};
  const insights = operationalStats?.insights && typeof operationalStats.insights === 'object' ? operationalStats.insights : {};
  const scopeText = metricSubtext(filters.range, filters);
  const problematicCrons = Array.isArray(report?.problematic_crons) ? report.problematic_crons : [];
  const operationalHealthJobs = rankCronHealthJobs(Array.isArray(insights.problematic_jobs) ? insights.problematic_jobs : []);
  const attentionHealthJobs = operationalHealthJobs.filter((job) => Number(job?.health?.score || 0) > 0);
  const slowestJobs = Array.isArray(insights.slowest_jobs) ? insights.slowest_jobs : [];
  const trend = Array.isArray(report?.trend) ? report.trend : [];
  const selectedFilter = filters.start && filters.end ? { type: 'custom' } : { type: 'range', value: filters.range };
  const customRange = normalizeCustomRangeForPicker(filters);
  const activeRangeLabel = rangeLabel(report?.range || filters.range, filters.start, filters.end);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-ink">Reports</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Historical operational analytics across the selected report range. Cron entries here may not appear on the realtime Cron page when they have no executions in that operational window.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <form
        key={`${filters.range}:${filters.start}:${filters.end}:${filters.env}:${filters.service_group}:${filters.sort}`}
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:flex-wrap sm:items-start sm:p-4"
        onSubmit={applyFilters}
      >
        <div className="min-w-0 sm:shrink-0">
          <TimeRangeFilter
            selectedFilter={selectedFilter}
            customRange={customRange}
            options={REPORT_TIME_OPTIONS}
            showRefreshControl={false}
            defaultFilter={DEFAULT_REPORT_FILTER}
            customDescription="Select start and end in WIB. Custom ranges override report presets."
            align="start"
            onFilterChange={applyTimeFilter}
            onCustomRangeChange={applyCustomRange}
          />
        </div>
        <select className={selectClass} name="env" defaultValue={filters.env}>
          <option value="">All environments</option>
          {scopeOptions.environments.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={selectClass} name="service_group" defaultValue={filters.service_group}>
          <option value="">All services</option>
          {scopeOptions.service_groups.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
        </select>
        <select className={selectClass} name="sort" defaultValue={filters.sort}>
          <option value="downtime">Sort by downtime</option>
          <option value="incidents">Sort by incidents</option>
        </select>
        <button className="inline-flex h-12 w-full min-w-32 flex-1 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-offset-slate-950 sm:w-auto" type="submit">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>Apply</span>
        </button>
      </form>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          Loading reliability report...
        </div>
      ) : null}

      {!loading ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard icon={ShieldCheck} label="Availability" value={formatPercent(summary.availability_percent)} subtext={scopeText} />
            <SummaryCard icon={AlertTriangle} label="Total incidents" value={formatNumber(summary.total_incidents)} subtext={`${formatNumber(summary.outage_incidents)} outage / ${formatNumber(summary.degraded_incidents)} degraded`} />
            <SummaryCard icon={Clock3} label="Total downtime" value={formatMinutes(summary.total_downtime_minutes)} subtext="Outage-class incidents only" />
            <SummaryCard icon={TimerReset} label="MTTR" value={formatMinutes(summary.mttr_minutes)} subtext={`${formatNumber(summary.outage_recoveries)} outage recoveries`} />
            <SummaryCard icon={Gauge} label="MTBF" value={formatMinutes(summary.mtbf_minutes)} subtext={scopeText} />
            <SummaryCard icon={Bell} label="Total alerts" value={formatNumber(summary.total_alerts)} subtext="Alert history in range" />
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-ink">Reliability Activity</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Compare triggered operational events against recoveries in WIB to inspect reliability pressure, recovery behavior, and transient anomaly patterns.</p>
            </div>
            <ReliabilityActivityChart trend={trend} />
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Most Problematic Cron</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Ranked by {filters.sort === 'incidents' ? 'incident count' : 'downtime'} for {activeRangeLabel.toLowerCase()} using historical incident activity.
                </p>
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

          <section className="grid min-w-0 gap-4">
            <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-ink">Cron Health Overview</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Aggregated historical cron reliability for {activeRangeLabel.toLowerCase()}.</p>
              </div>
              <div className="space-y-3 sm:hidden">
                {attentionHealthJobs.map((job, index) => (
                  <article key={`${job?.cron_name ?? 'cron'}-${index}-mobile`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-normal text-slate-500 dark:text-slate-400">Cron</p>
                      <p className="min-w-0 break-words text-sm font-semibold text-ink">{job?.cron_name ?? '-'}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Health</p>
                        <span className={`mt-1 inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${job.health.className}`}>{job.health.label}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Scope</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {job?.env ? <EnvironmentBadge env={job.env} /> : null}
                          <ServiceGroupBadge serviceGroup={job?.service_group} />
                        </div>
                      </div>
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
                  <div className="rounded-lg bg-emerald-50 px-3 py-8 text-center text-sm text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">All monitored cron jobs are healthy in this range.</div>
                ) : null}
              </div>
              <div className="hidden min-w-0 overflow-x-auto rounded-md sm:block">
                <table className="w-full table-fixed divide-y divide-slate-200 text-xs dark:divide-slate-800 lg:text-sm">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[14%]" />
                    <col className="w-[20%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
                    <tr>
                      <th className="px-2 py-2 lg:px-3">Cron</th>
                      <th className="px-2 py-2 lg:px-3">Health</th>
                      <th className="px-2 py-2 lg:px-3">Scope</th>
                      <th className="px-2 py-2 lg:px-3">Success</th>
                      <th className="px-2 py-2 lg:px-3">Warnings</th>
                      <th className="px-2 py-2 lg:px-3">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {attentionHealthJobs.map((job, index) => (
                      <tr key={`${job?.cron_name ?? 'cron'}-${index}`}>
                        <td className="break-words px-2 py-2 font-medium leading-5 text-ink lg:px-3">{job?.cron_name ?? '-'}</td>
                        <td className="px-2 py-2 align-top lg:px-3">
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${job.health.className}`}>{job.health.label}</span>
                        </td>
                        <td className="px-2 py-2 align-top lg:px-3">
                          <div className="flex flex-wrap gap-1.5">
                            {job?.env ? <EnvironmentBadge env={job.env} /> : null}
                            <ServiceGroupBadge serviceGroup={job?.service_group} />
                          </div>
                        </td>
                        <td className="break-words px-2 py-2 align-top text-slate-600 dark:text-slate-300 lg:px-3">{formatPercent(job?.success_rate ?? 0)}</td>
                        <td className="break-words px-2 py-2 align-top text-slate-600 dark:text-slate-300 lg:px-3">{formatNumber(job?.warning_count ?? 0)}</td>
                        <td className="break-words px-2 py-2 align-top text-slate-600 dark:text-slate-300 lg:px-3">{formatNumber(job?.failed_count ?? 0)}</td>
                      </tr>
                    ))}
                    {attentionHealthJobs.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-emerald-700 dark:text-emerald-200" colSpan={6}>All monitored cron jobs are healthy in this range.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-ink">Slowest cron jobs</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Highest average duration for {activeRangeLabel.toLowerCase()}. Historical rows may include crons without current-window activity on the Cron page.
                </p>
              </div>
              <div className="space-y-3 sm:hidden">
                {slowestJobs.map((job, index) => {
                  const severity = getPerformanceSeverity(job);

                  return (
                    <article key={`${job?.cron_name ?? 'cron'}-${index}-mobile`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-normal text-slate-500 dark:text-slate-400">Cron</p>
                        <p className="min-w-0 break-words text-sm font-semibold text-ink">{job?.cron_name ?? '-'}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2">
                        <div className="min-w-0 rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                          <p className="text-xs text-slate-500">Status</p>
                          <span className={`mt-1 inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${severity.className}`}>{severity.label}</span>
                        </div>
                        <div className="min-w-0 rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                          <p className="text-xs text-slate-500">Avg Duration</p>
                          <p className="mt-1 break-words font-medium text-slate-700 dark:text-slate-200">{formatDuration(job?.avg_duration ?? 0)}</p>
                        </div>
                        <div className="min-w-0 rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                          <p className="text-xs text-slate-500">Max Duration</p>
                          <p className="mt-1 break-words font-medium text-slate-700 dark:text-slate-200">{formatDuration(job?.max_duration ?? 0)}</p>
                        </div>
                        <div className="min-w-0 rounded-md bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                          <p className="text-xs text-slate-500">Runs</p>
                          <p className="mt-1 break-words font-medium text-slate-700 dark:text-slate-200">{formatNumber(job?.total_runs ?? 0)}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {slowestJobs.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500 dark:bg-slate-950">No duration data in this timeframe.</div>
                ) : null}
              </div>
              <div className="hidden min-w-0 overflow-x-auto rounded-md sm:block">
                <table className="w-full table-fixed divide-y divide-slate-200 text-xs dark:divide-slate-800 lg:text-sm">
                  <colgroup>
                    <col className="w-[46%]" />
                    <col className="w-[20%]" />
                    <col className="w-[20%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900">
                    <tr>
                      <th className="px-2 py-2 lg:px-3">Cron</th>
                      <th className="px-2 py-2 lg:px-3">Avg duration</th>
                      <th className="px-2 py-2 lg:px-3">Max duration</th>
                      <th className="px-2 py-2 lg:px-3">Runs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {slowestJobs.map((job, index) => (
                      <tr key={`${job?.cron_name ?? 'cron'}-${index}`}>
                        <td className="break-words px-2 py-2 font-medium leading-5 text-ink lg:px-3">{job?.cron_name ?? '-'}</td>
                        <td className="break-words px-2 py-2 align-top text-slate-600 dark:text-slate-300 lg:px-3">{formatDuration(job?.avg_duration ?? 0)}</td>
                        <td className="break-words px-2 py-2 align-top text-slate-600 dark:text-slate-300 lg:px-3">{formatDuration(job?.max_duration ?? 0)}</td>
                        <td className="break-words px-2 py-2 align-top text-slate-600 dark:text-slate-300 lg:px-3">{formatNumber(job?.total_runs ?? 0)}</td>
                      </tr>
                    ))}
                    {slowestJobs.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={4}>No duration data in this timeframe.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
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
