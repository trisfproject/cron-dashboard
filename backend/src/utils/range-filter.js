const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_DAYS = 365;

const PRESET_RANGES = {
  today: 1,
  '7d': 7,
  '30d': 30,
  quarter: 90,
  year: 365
};

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenInclusive(start, end) {
  return Math.floor((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / DAY_MS) + 1;
}

function getTimelineGroupFormatForDays(days) {
  if (days <= 7) {
    return '%Y-%m-%d %H:00:00';
  }

  if (days <= 90) {
    return '%Y-%m-%d';
  }

  return '%Y-%m-01';
}

export function isValidRange(range) {
  return Object.hasOwn(PRESET_RANGES, range);
}

export function getDefaultRange() {
  return '7d';
}

export function resolveDateFilter(query = {}) {
  const now = new Date();
  const customStart = parseDateOnly(query.start);
  const customEnd = parseDateOnly(query.end);

  if (customStart && customEnd) {
    const start = startOfUtcDay(customStart);
    const end = endOfUtcDay(customEnd);
    const days = daysBetweenInclusive(start, end);

    if (end >= start && days <= MAX_CUSTOM_DAYS) {
      return {
        clause: 'timestamp BETWEEN ? AND ?',
        values: [toMysqlDateTime(start), toMysqlDateTime(end)],
        range: 'custom',
        start: query.start,
        end: query.end,
        days,
        timelineFormat: getTimelineGroupFormatForDays(days)
      };
    }
  }

  const range = isValidRange(query.range) ? query.range : getDefaultRange();
  const days = PRESET_RANGES[range];
  const presetEnd = now;
  const presetStart = startOfUtcDay(new Date(now.getTime() - (days - 1) * DAY_MS));

  return {
    clause: 'timestamp BETWEEN ? AND ?',
    values: [toMysqlDateTime(presetStart), toMysqlDateTime(presetEnd)],
    range,
    days,
    timelineFormat: getTimelineGroupFormatForDays(days)
  };
}

export function getRangeDescription(range = '7d') {
  const descriptions = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    quarter: 'Last 90 days',
    year: 'Last 365 days',
    custom: 'Custom range'
  };

  return descriptions[range] || descriptions[getDefaultRange()];
}
