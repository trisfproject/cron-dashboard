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

export function TimelineChart({ data }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="bucket" tick={{ fontSize: 12 }} stroke="#64748b" minTickGap={28} />
          <YAxis tick={{ fontSize: 12 }} stroke="#64748b" allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="success" stroke="#059669" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="failed" stroke="#e11d48" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="warning" stroke="#d97706" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DurationChart({ data }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
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

