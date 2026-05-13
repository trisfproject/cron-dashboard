'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useState } from 'react';

const MAX_RENDERED_POINTS = 720;
const MAX_RENDERED_MARKERS = 14;

function markerPriority(marker) {
  return {
    failure_spike: 0,
    warning_surge: 1,
    recovery: 2,
    maintenance: 3
  }[marker?.type] ?? 9;
}

function normalizeMarkers(markers = [], renderedBuckets = new Set()) {
  const grouped = new Map();

  if (!Array.isArray(markers)) {
    return [];
  }

  markers.forEach((marker) => {
    if (!marker?.bucket || !renderedBuckets.has(marker.bucket)) {
      return;
    }

    const current = grouped.get(marker.bucket) || [];
    current.push(marker);
    grouped.set(marker.bucket, current);
  });

  return [...grouped.entries()]
    .map(([bucket, bucketMarkers]) => {
      const sortedMarkers = bucketMarkers.sort((left, right) => markerPriority(left) - markerPriority(right));

      return {
        bucket,
        markers: sortedMarkers,
        primary: sortedMarkers[0]
      };
    })
    .sort((left, right) => String(left.bucket).localeCompare(String(right.bucket)))
    .slice(-MAX_RENDERED_MARKERS);
}

function normalizeTimeline(data, markers = []) {
  const normalized = Array.isArray(data)
    ? data
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        ...item,
        bucket: item?.bucket || item?.date || item?.timestamp || '',
        total: Number(item?.total ?? 0),
        success: Number(item?.success ?? 0),
        failed: Number(item?.failed ?? 0),
        warning: Number(item?.warning ?? 0)
      }))
      .filter((item) => item.bucket)
    : [];

  const rendered = normalized.length <= MAX_RENDERED_POINTS
    ? normalized
    : normalized.filter((_, index) => index % Math.ceil(normalized.length / MAX_RENDERED_POINTS) === 0);
  const bucketSet = new Set(rendered.map((item) => item.bucket).filter(Boolean));
  const normalizedMarkers = normalizeMarkers(markers, bucketSet);
  const markersByBucket = new Map(normalizedMarkers.map((item) => [item.bucket, item.markers]));

  return rendered.map((item) => ({
    ...item,
    markers: markersByBucket.get(item.bucket) || []
  }));
}

function toJakartaOffsetTimestamp(label) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label || '')) {
    return `${label}T00:00:00+07:00`;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(label || '')) {
    return `${label.replace(' ', 'T')}+07:00`;
  }

  return null;
}

function TimelineTooltip({ active, payload, label, interval = 'hour' }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const labels = {
    success: 'Success runs',
    failed: 'Failed runs',
    warning: 'Warning runs'
  };
  const intervalLabel = {
    '10s': '10-second interval',
    '30s': '30-second interval',
    '1m': '1-minute interval',
    '5m': '5-minute interval',
    '15m': '15-minute interval',
    hour: 'hour',
    day: 'day'
  }[interval] || interval;
  const safePayload = payload.filter((item) => item && typeof item === 'object');
  const markerItems = Array.isArray(safePayload?.[0]?.payload?.markers)
    ? safePayload[0].payload.markers.filter((marker) => marker && typeof marker === 'object')
    : [];

  return (
    <div className="rounded-md border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 text-sm text-[var(--chart-tooltip-text)] shadow-lg">
      <p className="font-medium">{label} WIB</p>
      <p className="mt-1 text-xs text-[var(--chart-tooltip-muted)]">Runs during this {intervalLabel}</p>
      <div className="mt-2 space-y-1">
        {safePayload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span style={{ color: item.color }}>{labels[item.dataKey] || item.name}</span>
            <span className="font-semibold">{Number(item.value || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
      {markerItems.length > 0 ? (
        <div className="mt-3 border-t border-[var(--chart-tooltip-border)] pt-2">
          <p className="text-xs font-semibold text-[var(--chart-tooltip-muted)]">Operational context</p>
          <div className="mt-1 space-y-1.5">
            {markerItems.map((marker, index) => (
              <div key={`${marker.type}-${marker.title}-${marker.bucket}-${index}`} className="flex gap-2 text-xs">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: marker.color }} aria-hidden="true" />
                <div>
                  <p className="font-medium">{marker.title}</p>
                  {marker.description ? <p className="text-[var(--chart-tooltip-muted)]">{marker.description}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TimelineChart({ data = [], interval = 'hour', markers = [], onRangeSelect }) {
  const chartData = normalizeTimeline(data, markers);
  const markerGroups = chartData
    .filter((item) => Array.isArray(item.markers) && item.markers.length > 0)
    .map((item) => ({
      bucket: item.bucket,
      markers: item.markers,
      primary: item.markers[0]
    }))
    .filter((group) => group.bucket && group.primary);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);

  function resetSelection() {
    setSelectionStart(null);
    setSelectionEnd(null);
  }

  function handleMouseDown(event) {
    if (!event?.activeLabel) {
      return;
    }

    setSelectionStart(event.activeLabel);
    setSelectionEnd(null);
  }

  function handleMouseMove(event) {
    if (!selectionStart || !event?.activeLabel) {
      return;
    }

    setSelectionEnd(event.activeLabel);
  }

  function handleMouseUp() {
    if (!selectionStart || !selectionEnd || selectionStart === selectionEnd) {
      resetSelection();
      return;
    }

    const ordered = [selectionStart, selectionEnd].sort();
    const start = toJakartaOffsetTimestamp(ordered[0]);
    const end = toJakartaOffsetTimestamp(ordered[1]);

    resetSelection();

    if (start && end) {
      onRangeSelect?.({ start, end });
    }
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
        No timeline data available
      </div>
    );
  }

  return (
    <div className="h-64 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={resetSelection}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="var(--chart-axis)" minTickGap={42} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--chart-axis)" allowDecimals={false} width={36} />
          <Tooltip content={<TimelineTooltip interval={interval} />} />
          <Legend />
          <Line type="linear" dataKey="success" name="Success" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="failed" name="Failed" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="warning" name="Warning" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
          {markerGroups.map((group) => (
            <ReferenceLine
              key={`timeline-marker-${group.bucket}-${group.primary.type}`}
              x={group.bucket}
              stroke={group.primary.color}
              strokeDasharray="4 4"
              strokeOpacity={0.72}
              ifOverflow="extendDomain"
              label={{
                value: group.markers.length > 1 ? `${group.primary.shortLabel}+${group.markers.length - 1}` : group.primary.shortLabel,
                position: 'top',
                fill: group.primary.color,
                fontSize: 10,
                fontWeight: 600
              }}
            />
          ))}
          {selectionStart && selectionEnd ? (
            <ReferenceArea x1={selectionStart} x2={selectionEnd} strokeOpacity={0.2} fill="#2563eb" fillOpacity={0.14} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DurationChart({ data = [] }) {
  const chartData = Array.isArray(data)
    ? data.filter((item) => item && typeof item === 'object').map((item) => ({
        ...item,
        duration: Number(item?.duration ?? item?.average_duration ?? 0)
      }))
    : [];

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
        No duration data available
      </div>
    );
  }

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="durationFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} stroke="var(--chart-axis)" minTickGap={42} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--chart-axis)" width={36} />
          <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', borderColor: 'var(--chart-tooltip-border)', color: 'var(--chart-tooltip-text)' }} labelStyle={{ color: 'var(--chart-tooltip-text)' }} />
          <Area type="monotone" dataKey="duration" stroke="#3b82f6" fill="url(#durationFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ThroughputChart({ data = [] }) {
  const chartData = normalizeTimeline(data);

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
        No throughput data available
      </div>
    );
  }

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.26} />
              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="var(--chart-axis)" minTickGap={42} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--chart-axis)" allowDecimals={false} width={36} />
          <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', borderColor: 'var(--chart-tooltip-border)', color: 'var(--chart-tooltip-text)' }} labelStyle={{ color: 'var(--chart-tooltip-text)' }} />
          <Area type="linear" dataKey="total" name="Runs" stroke="#10b981" fill="url(#throughputFill)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FailureWarningChart({ data = [] }) {
  const chartData = normalizeTimeline(data);

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
        No warning or failure data available
      </div>
    );
  }

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="var(--chart-axis)" minTickGap={42} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--chart-axis)" allowDecimals={false} width={36} />
          <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', borderColor: 'var(--chart-tooltip-border)', color: 'var(--chart-tooltip-text)' }} labelStyle={{ color: 'var(--chart-tooltip-text)' }} />
          <Legend />
          <Line type="linear" dataKey="failed" name="Failed" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="warning" name="Warning" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
