const JAKARTA_TIME_ZONE = 'Asia/Jakarta';

export function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: digits
  });
}

export function formatPercent(value) {
  return `${formatNumber(value, 2)}%`;
}

export function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) {
    return `${formatNumber(value)} ms`;
  }

  return `${formatNumber(value / 1000, 2)} s`;
}

export function formatDate(value) {
  if (!value) {
    return 'Never';
  }

  const normalizedValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}+07:00`
    : value;
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JAKARTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).format(date);
}

export function statusLabel(status) {
  return {
    0: 'Success',
    1: 'Failed',
    2: 'Warning'
  }[Number(status)] || 'Unknown';
}

export function statusClass(status) {
  return {
    0: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    1: 'bg-rose-50 text-rose-700 ring-rose-200',
    2: 'bg-amber-50 text-amber-700 ring-amber-200'
  }[Number(status)] || 'bg-slate-50 text-slate-700 ring-slate-200';
}
