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

const MYSQL_BUCKET_EXPRESSIONS = {
  '5m': "DATE_FORMAT(DATE_SUB(CONVERT_TZ(timestamp, '+00:00', '+07:00'), INTERVAL MOD(MINUTE(CONVERT_TZ(timestamp, '+00:00', '+07:00')), 5) MINUTE), '%Y-%m-%d %H:%i:00')",
  hour: "DATE_FORMAT(CONVERT_TZ(timestamp, '+00:00', '+07:00'), '%Y-%m-%d %H:00:00')",
  day: "DATE_FORMAT(CONVERT_TZ(timestamp, '+00:00', '+07:00'), '%Y-%m-%d')",
  month: "DATE_FORMAT(CONVERT_TZ(timestamp, '+00:00', '+07:00'), '%Y-%m-01')"
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

function getTimelineGrouping(range, days) {
  if (range === 'today') {
    return {
      interval: '5m',
      bucketSql: MYSQL_BUCKET_EXPRESSIONS['5m']
    };
  }

  if (days <= 7) {
    return {
      interval: 'hour',
      bucketSql: MYSQL_BUCKET_EXPRESSIONS.hour
    };
  }

  if (days <= 30) {
    return {
      interval: 'day',
      bucketSql: MYSQL_BUCKET_EXPRESSIONS.day
    };
  }

  return {
    interval: 'month',
    bucketSql: MYSQL_BUCKET_EXPRESSIONS.month
  };
}

function addStep(date, interval) {
  const next = new Date(date);

  if (interval === '5m') {
    next.setUTCMinutes(next.getUTCMinutes() + 5);
    return next;
  }

  if (interval === 'hour') {
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  if (interval === 'day') {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  const jakarta = new Date(date.getTime() + JAKARTA_OFFSET_HOURS * HOUR_MS);
  const nextMonth = new Date(Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth() + 1, 1));
  return new Date(nextMonth.getTime() - JAKARTA_OFFSET_HOURS * HOUR_MS);
}

function floorToBucket(date, interval) {
  const jakarta = new Date(date.getTime() + JAKARTA_OFFSET_HOURS * HOUR_MS);

  if (interval === '5m') {
    const minute = Math.floor(jakarta.getUTCMinutes() / 5) * 5;
    return new Date(Date.UTC(
      jakarta.getUTCFullYear(),
      jakarta.getUTCMonth(),
      jakarta.getUTCDate(),
      jakarta.getUTCHours(),
      minute
    ) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  if (interval === 'hour') {
    return new Date(Date.UTC(
      jakarta.getUTCFullYear(),
      jakarta.getUTCMonth(),
      jakarta.getUTCDate(),
      jakarta.getUTCHours()
    ) - JAKARTA_OFFSET_HOURS * HOUR_MS);
  }

  if (interval === 'day') {
    return startOfJakartaDay(`${jakarta.getUTCFullYear()}-${pad(jakarta.getUTCMonth() + 1)}-${pad(jakarta.getUTCDate())}`);
  }

  return startOfJakartaDay(`${jakarta.getUTCFullYear()}-${pad(jakarta.getUTCMonth() + 1)}-01`);
}

function formatBucket(date, interval) {
  const jakarta = new Date(date.getTime() + JAKARTA_OFFSET_HOURS * HOUR_MS);
  const datePart = `${jakarta.getUTCFullYear()}-${pad(jakarta.getUTCMonth() + 1)}-${pad(jakarta.getUTCDate())}`;

  if (interval === '5m' || interval === 'hour') {
    return `${datePart} ${pad(jakarta.getUTCHours())}:${pad(jakarta.getUTCMinutes())}:00`;
  }

  if (interval === 'day') {
    return datePart;
  }

  return `${jakarta.getUTCFullYear()}-${pad(jakarta.getUTCMonth() + 1)}-01`;
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

export function isValidRange(range) {
  return Object.hasOwn(PRESET_RANGES, range);
}

export function getDefaultRange() {
  return 'today';
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
      const grouping = getTimelineGrouping('custom', days);

      return {
        clause: 'timestamp BETWEEN ? AND ?',
        values: [toMysqlDateTime(start), toMysqlDateTime(end)],
        range: 'custom',
        start: query.start,
        end: query.end,
        days,
        startDate: start,
        endDate: end,
        timelineBucketSql: grouping.bucketSql,
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
  const grouping = getTimelineGrouping(range, days);

  return {
    clause: 'timestamp BETWEEN ? AND ?',
    values: [toMysqlDateTime(presetStart), toMysqlDateTime(presetEnd)],
    range,
    days,
    startDate: presetStart,
    endDate: presetEnd,
    timelineBucketSql: grouping.bucketSql,
    timelineInterval: grouping.interval
  };
}

export function getRangeDescription(range = 'today') {
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
