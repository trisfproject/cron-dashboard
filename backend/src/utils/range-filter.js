const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const JAKARTA_OFFSET_HOURS = 7;
const MAX_CUSTOM_DAYS = 365;

const PRESET_RANGES = {
  today: 1,
  '7d': 7,
  '30d': 30,
  quarter: 90,
  year: 365
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function getJakartaDateOnly(date = new Date()) {
  const jakartaDate = new Date(date.getTime() + JAKARTA_OFFSET_HOURS * HOUR_MS);
  return `${jakartaDate.getUTCFullYear()}-${pad(jakartaDate.getUTCMonth() + 1)}-${pad(jakartaDate.getUTCDate())}`;
}

function addDaysToDateOnly(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function startOfJakartaDay(value) {
  return new Date(`${value}T00:00:00.000+07:00`);
}

function endOfJakartaDay(value) {
  return new Date(`${value}T23:59:59.999+07:00`);
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenInclusive(startDateOnly, endDateOnly) {
  const start = new Date(`${startDateOnly}T00:00:00.000Z`);
  const end = new Date(`${endDateOnly}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function getTimelineGroupFormatForDays(days) {
  if (days <= 7) {
    return {
      format: '%Y-%m-%d %H:00:00',
      interval: 'hour'
    };
  }

  if (days <= 90) {
    return {
      format: '%Y-%m-%d',
      interval: 'day'
    };
  }

  return {
    format: '%Y-%m-01',
    interval: 'month'
  };
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
    const start = startOfJakartaDay(query.start);
    const end = endOfJakartaDay(query.end);
    const days = daysBetweenInclusive(query.start, query.end);

    if (end >= start && days <= MAX_CUSTOM_DAYS) {
      const grouping = getTimelineGroupFormatForDays(days);

      return {
        clause: 'timestamp BETWEEN ? AND ?',
        values: [toMysqlDateTime(start), toMysqlDateTime(end)],
        range: 'custom',
        start: query.start,
        end: query.end,
        days,
        timelineFormat: grouping.format,
        timelineInterval: grouping.interval
      };
    }
  }

  const range = isValidRange(query.range) ? query.range : getDefaultRange();
  const days = PRESET_RANGES[range];
  const presetEnd = now;
  const todayJakarta = getJakartaDateOnly(now);
  const presetStartDate = addDaysToDateOnly(todayJakarta, -(days - 1));
  const presetStart = startOfJakartaDay(presetStartDate);
  const grouping = getTimelineGroupFormatForDays(days);

  return {
    clause: 'timestamp BETWEEN ? AND ?',
    values: [toMysqlDateTime(presetStart), toMysqlDateTime(presetEnd)],
    range,
    days,
    timelineFormat: grouping.format,
    timelineInterval: grouping.interval
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
