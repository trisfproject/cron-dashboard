const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JAKARTA_OFFSET_HOURS = 7;
const MAX_CUSTOM_DAYS = 365;

const WINDOWS = {
  '5m': 5 * MINUTE_MS,
  '15m': 15 * MINUTE_MS,
  '30m': 30 * MINUTE_MS,
  '1h': HOUR_MS,
  '4h': 4 * HOUR_MS
};

const PRESET_RANGES = {
  today: 'today',
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS
};

const MYSQL_CONVERTED_TS = "CONVERT_TZ(timestamp, '+00:00', '+07:00')";
const MYSQL_BUCKET_EXPRESSIONS = {
  '30s': `DATE_FORMAT(DATE_SUB(${MYSQL_CONVERTED_TS}, INTERVAL MOD(SECOND(${MYSQL_CONVERTED_TS}), 30) SECOND), '%Y-%m-%d %H:%i:%s')`,
  '1m': `DATE_FORMAT(${MYSQL_CONVERTED_TS}, '%Y-%m-%d %H:%i:00')`,
  '5m': `DATE_FORMAT(DATE_SUB(${MYSQL_CONVERTED_TS}, INTERVAL MOD(MINUTE(${MYSQL_CONVERTED_TS}), 5) MINUTE), '%Y-%m-%d %H:%i:00')`,
  '15m': `DATE_FORMAT(DATE_SUB(${MYSQL_CONVERTED_TS}, INTERVAL MOD(MINUTE(${MYSQL_CONVERTED_TS}), 15) MINUTE), '%Y-%m-%d %H:%i:00')`,
  hour: `DATE_FORMAT(${MYSQL_CONVERTED_TS}, '%Y-%m-%d %H:00:00')`,
  day: `DATE_FORMAT(${MYSQL_CONVERTED_TS}, '%Y-%m-%d')`
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function getJakartaParts(date = new Date()) {
  const jakartaDate = new Date(date.getTime() + JAKARTA_OFFSET_HOURS * HOUR_MS);
  return {
    year: jakartaDate.getUTCFullYear(),
    month: jakartaDate.getUTCMonth() + 1,
    day: jakartaDate.getUTCDate(),
    hour: jakartaDate.getUTCHours(),
    minute: jakartaDate.getUTCMinutes(),
    second: jakartaDate.getUTCSeconds()
  };
}

function getJakartaDateOnly(date = new Date()) {
  const parts = getJakartaParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
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

function parseJakartaDateTime(value, boundary = 'start') {
  if (!value || typeof value !== 'string') {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return boundary === 'end' ? endOfJakartaDay(value) : startOfJakartaDay(value);
  }

  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return null;
  }

  const normalized = value.replace(' ', 'T');
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const date = new Date(`${withSeconds}.000+07:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getGroupingForWindow(window) {
  return {
    '5m': '30s',
    '15m': '1m',
    '30m': '1m',
    '1h': '5m',
    '4h': '15m'
  }[window] || '1m';
}

function getGroupingForRange(range) {
  return {
    today: 'hour',
    '7d': 'hour',
    '30d': 'day'
  }[range] || 'hour';
}

function getGroupingForCustom(start, end) {
  const duration = end.getTime() - start.getTime();

  if (duration <= 30 * MINUTE_MS) {
    return '1m';
  }

  if (duration <= HOUR_MS) {
    return '5m';
  }

  if (duration <= 4 * HOUR_MS) {
    return '15m';
  }

  if (duration <= 7 * DAY_MS) {
    return 'hour';
  }

  return 'day';
}

function addStep(date, interval) {
  const next = new Date(date);

  if (interval === '30s') {
    next.setUTCSeconds(next.getUTCSeconds() + 30);
    return next;
  }

  if (interval === '1m') {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    return next;
  }

  if (interval === '5m') {
    next.setUTCMinutes(next.getUTCMinutes() + 5);
    return next;
  }

  if (interval === '15m') {
    next.setUTCMinutes(next.getUTCMinutes() + 15);
    return next;
  }

  if (interval === 'hour') {
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function floorToBucket(date, interval) {
  const parts = getJakartaParts(date);

  if (interval === '30s') {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, Math.floor(parts.second / 30) * 30) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  if (interval === '1m') {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  if (interval === '5m') {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, Math.floor(parts.minute / 5) * 5) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  if (interval === '15m') {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, Math.floor(parts.minute / 15) * 15) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  if (interval === 'hour') {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  return startOfJakartaDay(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`);
}

function formatBucket(date, interval) {
  const parts = getJakartaParts(date);
  const datePart = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;

  if (['30s', '1m', '5m', '15m', 'hour'].includes(interval)) {
    return `${datePart} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
  }

  return datePart;
}

export function normalizeTimelineBuckets(rows = [], dateFilter) {
  const interval = dateFilter.timelineInterval;
  const rowMap = new Map(
    rows.map((row) => [
      row.bucket,
      {
        bucket: row.bucket,
        total: Number(row.total || 0),
        success: Number(row.success || 0),
        failed: Number(row.failed || 0),
        warning: Number(row.warning || 0),
        average_duration: Number(row.average_duration || 0)
      }
    ])
  );
  const buckets = [];
  let cursor = floorToBucket(dateFilter.startDate, interval);
  const end = floorToBucket(dateFilter.endDate, interval);

  while (cursor <= end) {
    const bucket = formatBucket(cursor, interval);
    buckets.push(rowMap.get(bucket) || {
      bucket,
      total: 0,
      success: 0,
      failed: 0,
      warning: 0,
      average_duration: 0
    });
    cursor = addStep(cursor, interval);
  }

  return buckets;
}

export function isValidWindow(window) {
  return Object.hasOwn(WINDOWS, window);
}

export function isValidRange(range) {
  return Object.hasOwn(PRESET_RANGES, range);
}

export function getDefaultWindow() {
  return '30m';
}

export function resolveDateFilter(query = {}) {
  const now = new Date();
  const customStart = parseJakartaDateTime(query.start, 'start');
  const customEnd = parseJakartaDateTime(query.end, 'end');

  if (customStart && customEnd) {
    const duration = customEnd.getTime() - customStart.getTime();
    const days = Math.max(1, Math.ceil(duration / DAY_MS));

    if (duration > 0 && duration <= MAX_CUSTOM_DAYS * DAY_MS) {
      const interval = getGroupingForCustom(customStart, customEnd);

      return {
        clause: 'timestamp BETWEEN ? AND ?',
        values: [toMysqlDateTime(customStart), toMysqlDateTime(customEnd)],
        mode: 'custom',
        start: query.start,
        end: query.end,
        days,
        startDate: customStart,
        endDate: customEnd,
        timelineBucketSql: MYSQL_BUCKET_EXPRESSIONS[interval],
        timelineInterval: interval
      };
    }
  }

  if (isValidWindow(query.window)) {
    const interval = getGroupingForWindow(query.window);
    const start = new Date(now.getTime() - WINDOWS[query.window]);

    return {
      clause: 'timestamp BETWEEN ? AND ?',
      values: [toMysqlDateTime(start), toMysqlDateTime(now)],
      mode: 'window',
      window: query.window,
      startDate: start,
      endDate: now,
      timelineBucketSql: MYSQL_BUCKET_EXPRESSIONS[interval],
      timelineInterval: interval
    };
  }

  if (isValidRange(query.range)) {
    const range = query.range;
    const todayJakarta = getJakartaDateOnly(now);
    const start = range === 'today'
      ? startOfJakartaDay(todayJakarta)
      : new Date(now.getTime() - PRESET_RANGES[range]);
    const interval = getGroupingForRange(range);

    return {
      clause: 'timestamp BETWEEN ? AND ?',
      values: [toMysqlDateTime(start), toMysqlDateTime(now)],
      mode: 'range',
      range,
      startDate: start,
      endDate: now,
      timelineBucketSql: MYSQL_BUCKET_EXPRESSIONS[interval],
      timelineInterval: interval
    };
  }

  return resolveDateFilter({ window: getDefaultWindow() });
}

export function getRangeDescription(value = getDefaultWindow()) {
  const descriptions = {
    '5m': 'Last 5 minutes',
    '15m': 'Last 15 minutes',
    '30m': 'Last 30 minutes',
    '1h': 'Last 1 hour',
    '4h': 'Last 4 hours',
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    custom: 'Custom range'
  };

  return descriptions[value] || descriptions[getDefaultWindow()];
}
