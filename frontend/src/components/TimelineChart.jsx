'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useState } from 'react';

const MAX_RENDERED_POINTS = 720;

function normalizeTimeline(data) {
  const normalized = Array.isArray(data)
    ? data.map((item) => ({
        ...item,
        bucket: item?.bucket || item?.date || item?.timestamp || '',
        total: Number(item?.total ?? 0),
        success: Number(item?.success ?? 0),
        failed: Number(item?.failed ?? 0),
        warning: Number(item?.warning ?? 0)
      }))
    : [];

  if (normalized.length <= MAX_RENDERED_POINTS) {
    return normalized;
  }

  const step = Math.ceil(normalized.length / MAX_RENDERED_POINTS);
  return normalized.filter((_, index) => index % step === 0);
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

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <p className="font-medium text-ink">{label} WIB</p>
      <p className="mt-1 text-xs text-slate-500">Runs during this {intervalLabel}</p>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span style={{ color: item.color }}>{labels[item.dataKey] || item.name}</span>
            <span className="font-semibold text-ink">{Number(item.value || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimelineChart({ data = [], interval = 'hour', onRangeSelect }) {
  const chartData = normalizeTimeline(data);
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
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={resetSelection}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="bucket" tick={{ fontSize: 12 }} stroke="#64748b" minTickGap={28} />
          <YAxis tick={{ fontSize: 12 }} stroke="#64748b" allowDecimals={false} />
          <Tooltip content={<TimelineTooltip interval={interval} />} />
          <Legend />
          <Line type="linear" dataKey="success" name="Success" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="failed" name="Failed" stroke="#e11d48" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="warning" name="Warning" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
          {selectionStart && selectionEnd ? (
            <ReferenceArea x1={selectionStart} x2={selectionEnd} strokeOpacity={0.2} fill="#2563eb" fillOpacity={0.14} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DurationChart({ data = [] }) {
  const chartData = Array.isArray(data) ? data : [];

  if (chartData.length === 0) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
        No duration data available
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="durationFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} stroke="#64748b" minTickGap={28} />
          <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
          <Tooltip />
          <Area type="monotone" dataKey="duration" stroke="#2563eb" fill="url(#durationFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
