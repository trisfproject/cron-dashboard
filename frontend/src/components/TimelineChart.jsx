'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

function normalizeTimeline(data) {
  return Array.isArray(data)
    ? data.map((item) => ({
        ...item,
        bucket: item?.bucket || item?.date || item?.timestamp || '',
        total: Number(item?.total ?? 0),
        success: Number(item?.success ?? 0),
        failed: Number(item?.failed ?? 0),
        warning: Number(item?.warning ?? 0)
      }))
    : [];
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
    '5m': '5-minute interval',
    hour: 'hour',
    day: 'day',
    month: 'month'
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

export function TimelineChart({ data = [], interval = 'hour' }) {
  const chartData = normalizeTimeline(data);

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
        <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="bucket" tick={{ fontSize: 12 }} stroke="#64748b" minTickGap={28} />
          <YAxis tick={{ fontSize: 12 }} stroke="#64748b" allowDecimals={false} />
          <Tooltip content={<TimelineTooltip interval={interval} />} />
          <Legend />
          <Line type="linear" dataKey="success" name="Success" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="failed" name="Failed" stroke="#e11d48" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="warning" name="Warning" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
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
