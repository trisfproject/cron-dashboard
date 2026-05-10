import * as cronParser from 'cron-parser';
import { pool } from './db.js';
import { recordIncidentEvent } from './incidents.js';
import { isNotificationSilenced } from './maintenance.js';

const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const DEFAULT_GRACE_MINUTES = 10;
const DEFAULT_COOLDOWN_MINUTES = 30;
const MIN_RECOVERY_WINDOW_MINUTES = 15;
const MAX_RECOVERY_WINDOW_MINUTES = 60;
const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_SQL_TIMEZONE = '+07:00';
const JAKARTA_NOW_SQL = `DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s')`;

let heartbeatSchemaReadyPromise;
let heartbeatEvaluatorStarted = false;
let heartbeatEvaluatorTimer = null;
let heartbeatEvaluatorInFlight = false;

function cronExpressionParser() {
  return cronParser?.CronExpressionParser || cronParser?.default?.CronExpressionParser || null;
}

function parseCronExpression(expression, options) {
  const parser = cronExpressionParser();

  if (parser?.parse) {
    return parser.parse(expression, options);
  }

  if (cronParser?.parseExpression) {
    return cronParser.parseExpression(expression, options);
  }

  if (cronParser?.default?.parseExpression) {
    return cronParser.default.parseExpression(expression, options);
  }

  throw new Error('Unsupported cron-parser API');
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toJakartaDate(value) {
  if (!value) {
    return null;
  }

  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}+07:00`
    : value;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(left, right) {
  return Math.max(0, Math.floor((left.getTime() - right.getTime()) / 60000));
}

function secondsBetween(left, right) {
  return Math.max(0, Math.round((left.getTime() - right.getTime()) / 1000));
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 0) * 60000);
}

function minutesLate(actual, expected) {
  if (!actual || !expected) {
    return 0;
  }

  return Math.max(0, Math.floor((actual.getTime() - expected.getTime()) / 60000));
}

function formatWibDate(date) {
  if (!date) {
    return null;
  }

  const jakarta = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');

  return `${jakarta.getUTCFullYear()}-${pad(jakarta.getUTCMonth() + 1)}-${pad(jakarta.getUTCDate())} ${pad(jakarta.getUTCHours())}:${pad(jakarta.getUTCMinutes())}:${pad(jakarta.getUTCSeconds())}`;
}

function humanMinutes(minutes) {
  const safeMinutes = Math.max(Number(minutes || 0), 0);

  if (safeMinutes < 60) {
    return `${safeMinutes} minutes`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  return remainder ? `${hours}h ${remainder}m` : `${hours} hours`;
}

function compactWibTime(value) {
  return String(value).padStart(2, '0') === '24' ? '00:00' : `${String(value).padStart(2, '0')}:00`;
}

function compactRecoveredTime(value) {
  const text = String(value || '').trim();
  const timeMatch = text.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);

  return timeMatch ? timeMatch[1] : text || formatWibDate(new Date()).slice(11, 16);
}

function describeField(value, unit, rangeFormatter = (item) => item) {
  if (value === '*') {
    return `every ${unit}`;
  }

  const stepMatch = value.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    return `every ${stepMatch[1]} ${unit}s`;
  }

  const rangeStepMatch = value.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (rangeStepMatch) {
    return `every ${rangeStepMatch[3]} ${unit}s from ${rangeFormatter(rangeStepMatch[1])} to ${rangeFormatter(rangeStepMatch[2])}`;
  }

  const rangeMatch = value.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    return `${rangeFormatter(rangeMatch[1])}-${rangeFormatter(rangeMatch[2])}`;
  }

  return value.split(',').map(rangeFormatter).join(', ');
}

export function describeSchedule(expression, timezone = DEFAULT_TIMEZONE) {
  const parts = String(expression || '').trim().split(/\s+/);

  if (parts.length !== 5) {
    return `${expression} (${timezone})`;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const minuteText = describeField(minute, 'minute', (item) => String(item).padStart(2, '0'));
  const hourText = describeField(hour, 'hour', compactWibTime);
  const dayNames = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday'
  };
  const dayText = dayOfWeek === '*'
    ? 'every day'
    : dayOfWeek === '1-5'
      ? 'Monday-Friday'
      : dayOfWeek === '0,6' || dayOfWeek === '6,0'
        ? 'weekends'
        : dayOfWeek.split(',').map((item) => dayNames[item] || item).join(', ');

  const timezoneLabel = timezone === DEFAULT_TIMEZONE ? 'WIB' : timezone;
  const hourLabel = hour === '*' ? '' : ` (${hourText} ${timezoneLabel})`;
  const dayLabel = dayText === 'every day' ? '' : ` ${dayText}`;

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `${minuteText} (${timezoneLabel})`;
  }

  return `${minuteText}${hourLabel}${dayLabel}`;
}

export function validateScheduleExpression(expression, timezone = DEFAULT_TIMEZONE) {
  const value = String(expression || '').trim();

  if (!value) {
    throw Object.assign(new Error('Schedule expression is required'), { statusCode: 400 });
  }

  try {
    parseCronExpression(value, {
      currentDate: new Date(),
      tz: timezone || DEFAULT_TIMEZONE
    }).next();
  } catch (error) {
    throw Object.assign(new Error(`Invalid cron schedule expression: ${error.message}`), { statusCode: 400 });
  }

  return value;
}

function scheduleRuntime(schedule, now = new Date()) {
  const timezone = schedule.timezone || DEFAULT_TIMEZONE;
  const interval = parseCronExpression(schedule.schedule_expression, {
    currentDate: now,
    tz: timezone
  });
  const previousDueAt = interval.prev().toDate();
  const previousInterval = parseCronExpression(schedule.schedule_expression, {
    currentDate: previousDueAt,
    tz: timezone
  });
  const priorDueAt = previousInterval.prev().toDate();
  const nextInterval = parseCronExpression(schedule.schedule_expression, {
    currentDate: previousDueAt,
    tz: timezone
  });
  const nextDueAt = nextInterval.next().toDate();
  const cadenceMinutes = Math.max(1, Math.round((previousDueAt.getTime() - priorDueAt.getTime()) / 60000));
  const nextGapMinutes = Math.max(1, Math.round((nextDueAt.getTime() - previousDueAt.getTime()) / 60000));
  const graceMinutes = Number(schedule.grace_period_minutes || DEFAULT_GRACE_MINUTES);
  const minutesSinceExpected = minutesBetween(now, previousDueAt);
  const inactiveGap = nextGapMinutes > cadenceMinutes * 1.5;
  const activeWindowLimit = inactiveGap
    ? graceMinutes + Math.min(cadenceMinutes, 60)
    : cadenceMinutes + graceMinutes;
  const activeWindow = minutesSinceExpected <= activeWindowLimit;

  return {
    previousDueAt,
    nextDueAt,
    cadenceMinutes,
    nextGapMinutes,
    graceMinutes,
    activeWindow,
    schedule_description: describeSchedule(schedule.schedule_expression, timezone)
  };
}

function nextExpectedAfter(schedule, date) {
  const timezone = schedule.timezone || DEFAULT_TIMEZONE;
  return parseCronExpression(schedule.schedule_expression, {
    currentDate: date,
    tz: timezone
  }).next().toDate();
}

async function query(sql, values = []) {
  return pool.query(sql, values);
}

export function startHeartbeatEvaluator(app, intervalMs) {
  if (heartbeatEvaluatorStarted) {
    app?.log?.debug('Heartbeat evaluator already started; skipping duplicate startup');
    return heartbeatEvaluatorTimer;
  }

  heartbeatEvaluatorStarted = true;
  const run = async (reason) => {
    if (heartbeatEvaluatorInFlight) {
      app?.log?.debug({ reason }, 'Heartbeat evaluator tick skipped; previous evaluation still running');
      return;
    }

    heartbeatEvaluatorInFlight = true;
    app?.log?.debug({ reason }, 'Heartbeat evaluator tick');

    try {
      await evaluateHeartbeatSchedules({ persist: true, app });
    } catch (error) {
      app?.log?.warn({ err: error, error: error.message }, 'Heartbeat evaluation failed');
    } finally {
      heartbeatEvaluatorInFlight = false;
    }
  };

  app?.log?.info({ interval_ms: intervalMs }, 'Heartbeat evaluator started');
  run('startup');

  if (intervalMs > 0) {
    heartbeatEvaluatorTimer = setInterval(() => {
      run('interval');
    }, intervalMs);
  }

  return heartbeatEvaluatorTimer;
}

export function stopHeartbeatEvaluator(app) {
  if (!heartbeatEvaluatorStarted) {
    return;
  }

  if (heartbeatEvaluatorTimer) {
    clearInterval(heartbeatEvaluatorTimer);
  }

  heartbeatEvaluatorTimer = null;
  heartbeatEvaluatorStarted = false;
  app?.log?.info('Heartbeat evaluator stopped');
}

async function tableColumnSet(tableName) {
  const [rows] = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function tableIndexSet(tableName) {
  const [rows] = await query(
    `SELECT DISTINCT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map((row) => row.INDEX_NAME));
}

async function ensureColumn(tableName, columns, columnName, definition) {
  if (columns.has(columnName)) {
    return;
  }

  try {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  columns.add(columnName);
}

async function ensureIndex(tableName, indexes, indexName, definition) {
  if (indexes.has(indexName)) {
    return;
  }

  try {
    await query(`CREATE INDEX ${indexName} ON ${tableName} ${definition}`);
  } catch (error) {
    if (error.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }

  indexes.add(indexName);
}

async function ensureMissingCronRuleType() {
  const [columns] = await query(
    `SELECT COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_rules'
       AND COLUMN_NAME = 'type'
     LIMIT 1`
  );
  const columnType = columns[0]?.COLUMN_TYPE || '';

  if (!columnType.includes('missing_cron')) {
    await query(`
      ALTER TABLE alert_rules
      MODIFY COLUMN type ENUM(
        'failed_threshold',
        'warning_threshold',
        'success_rate_degradation',
        'duration_anomaly',
        'retry_storm',
        'cron_silence',
        'missing_cron'
      ) NOT NULL
    `);
  }

  await query(`
    INSERT INTO alert_rules
      (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
    SELECT 'Missing Cron Alert', 'missing_cron', 'critical', 1, 5, 30, '["telegram"]', 1
    WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE type = 'missing_cron' AND name = 'Missing Cron Alert')
  `);
}

export async function ensureHeartbeatSchema() {
  if (!heartbeatSchemaReadyPromise) {
    heartbeatSchemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS cron_schedules (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          cron_name VARCHAR(255) NOT NULL,
          schedule_expression VARCHAR(120) NOT NULL,
          timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Jakarta',
          grace_period_minutes INT UNSIGNED NOT NULL DEFAULT 10,
          cooldown_minutes INT UNSIGNED NOT NULL DEFAULT 30,
          severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'critical',
          enabled TINYINT(1) NOT NULL DEFAULT 1,
          environment VARCHAR(80) NOT NULL DEFAULT 'Production',
          service_group VARCHAR(120) NULL,
          description TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_cron_schedules_scope (cron_name, environment),
          KEY idx_cron_schedules_enabled_env_service (enabled, environment, service_group),
          KEY idx_cron_schedules_cron_name (cron_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const scheduleColumns = await tableColumnSet('cron_schedules');
      await ensureColumn('cron_schedules', scheduleColumns, 'cooldown_minutes', 'INT UNSIGNED NOT NULL DEFAULT 30');
      const alertEventColumns = await tableColumnSet('alert_events');
      await ensureColumn('alert_events', alertEventColumns, 'started_at', 'TIMESTAMP NULL');
      await ensureColumn('alert_events', alertEventColumns, 'downtime_seconds', 'INT UNSIGNED NULL');
      await ensureColumn('alert_events', alertEventColumns, 'downtime_minutes', 'DECIMAL(12, 2) NULL');
      const scheduleIndexes = await tableIndexSet('cron_schedules');
      await ensureIndex('cron_schedules', scheduleIndexes, 'idx_cron_schedules_enabled_env_service', '(enabled, environment, service_group)');
      await ensureIndex('cron_schedules', scheduleIndexes, 'idx_cron_schedules_cron_name', '(cron_name)');
      await ensureMissingCronRuleType();
    })().catch((error) => {
      heartbeatSchemaReadyPromise = null;
      throw error;
    });
  }

  await heartbeatSchemaReadyPromise;
}

export async function listCronSchedules({ enabled, env, service_group } = {}) {
  await ensureHeartbeatSchema();

  const filters = [];
  const values = [];

  if (enabled !== undefined) {
    filters.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }

  if (env) {
    filters.push('environment = ?');
    values.push(env);
  }

  if (service_group) {
    filters.push('service_group = ?');
    values.push(service_group);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [rows] = await query(`
    SELECT id, cron_name, schedule_expression, timezone, grace_period_minutes,
      cooldown_minutes, severity, enabled, environment, service_group, description,
      DATE_FORMAT(CONVERT_TZ(created_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(CONVERT_TZ(updated_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM cron_schedules
    ${where}
    ORDER BY enabled DESC, environment ASC, service_group ASC, cron_name ASC
  `, values);

  return rows.map((row) => ({
    ...row,
    enabled: Boolean(row.enabled),
    schedule_description: describeSchedule(row.schedule_expression, row.timezone)
  }));
}

function normalizeSchedulePayload(payload = {}, existing = {}) {
  const timezone = String(payload.timezone || existing.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
  const scheduleExpression = validateScheduleExpression(payload.schedule_expression ?? existing.schedule_expression, timezone);
  const cronName = String(payload.cron_name || existing.cron_name || '').trim();
  const environment = String(payload.environment || payload.env || existing.environment || 'Production').trim() || 'Production';

  if (!cronName) {
    throw Object.assign(new Error('Cron name is required'), { statusCode: 400 });
  }

  return {
    cron_name: cronName,
    schedule_expression: scheduleExpression,
    timezone,
    grace_period_minutes: Math.max(1, Number(payload.grace_period_minutes ?? existing.grace_period_minutes ?? DEFAULT_GRACE_MINUTES)),
    cooldown_minutes: Math.max(1, Number(payload.cooldown_minutes ?? existing.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES)),
    severity: ['warning', 'critical'].includes(payload.severity || existing.severity) ? (payload.severity || existing.severity) : 'critical',
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : existing.enabled !== undefined ? Boolean(existing.enabled) : true,
    environment,
    service_group: payload.service_group !== undefined ? String(payload.service_group || '').trim() || null : existing.service_group || null,
    description: payload.description !== undefined ? String(payload.description || '').trim() || null : existing.description || null
  };
}

export async function getCronScheduleByScope({ cron_name, env, environment } = {}) {
  await ensureHeartbeatSchema();

  const cronName = String(cron_name || '').trim();
  const scheduleEnv = String(environment || env || 'Production').trim() || 'Production';

  if (!cronName) {
    throw Object.assign(new Error('Cron name is required'), { statusCode: 400 });
  }

  const [[schedule]] = await query(`
    SELECT id, cron_name, schedule_expression, timezone, grace_period_minutes,
      cooldown_minutes, severity, enabled, environment, service_group, description,
      DATE_FORMAT(CONVERT_TZ(created_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(CONVERT_TZ(updated_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM cron_schedules
    WHERE cron_name = ? AND environment = ?
    LIMIT 1
  `, [cronName, scheduleEnv]);

  return schedule
    ? { ...schedule, enabled: Boolean(schedule.enabled), schedule_description: describeSchedule(schedule.schedule_expression, schedule.timezone) }
    : null;
}

export async function createCronSchedule(payload = {}) {
  await ensureHeartbeatSchema();

  const schedule = normalizeSchedulePayload(payload);
  const [result] = await query(`
    INSERT INTO cron_schedules
      (cron_name, schedule_expression, timezone, grace_period_minutes, cooldown_minutes,
       severity, enabled, environment, service_group, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    schedule.cron_name,
    schedule.schedule_expression,
    schedule.timezone,
    schedule.grace_period_minutes,
    schedule.cooldown_minutes,
    schedule.severity,
    schedule.enabled ? 1 : 0,
    schedule.environment,
    schedule.service_group,
    schedule.description
  ]).catch((error) => {
    if (error.code === 'ER_DUP_ENTRY') {
      throw Object.assign(new Error('Heartbeat schedule already exists for this cron and environment'), { statusCode: 409 });
    }

    throw error;
  });

  return getCronScheduleById(result.insertId);
}

export async function getCronScheduleById(id) {
  await ensureHeartbeatSchema();

  const [[schedule]] = await query(`
    SELECT id, cron_name, schedule_expression, timezone, grace_period_minutes,
      cooldown_minutes, severity, enabled, environment, service_group, description,
      DATE_FORMAT(CONVERT_TZ(created_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(CONVERT_TZ(updated_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM cron_schedules
    WHERE id = ?
    LIMIT 1
  `, [Number(id)]);

  if (!schedule) {
    return null;
  }

  return { ...schedule, enabled: Boolean(schedule.enabled), schedule_description: describeSchedule(schedule.schedule_expression, schedule.timezone) };
}

export async function updateCronSchedule(id, payload = {}) {
  await ensureHeartbeatSchema();

  const existing = await getCronScheduleById(id);

  if (!existing) {
    throw Object.assign(new Error('Heartbeat schedule not found'), { statusCode: 404 });
  }

  const schedule = normalizeSchedulePayload(payload, existing);

  await query(`
    UPDATE cron_schedules
    SET cron_name = ?,
      schedule_expression = ?,
      timezone = ?,
      grace_period_minutes = ?,
      cooldown_minutes = ?,
      severity = ?,
      enabled = ?,
      environment = ?,
      service_group = ?,
      description = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    schedule.cron_name,
    schedule.schedule_expression,
    schedule.timezone,
    schedule.grace_period_minutes,
    schedule.cooldown_minutes,
    schedule.severity,
    schedule.enabled ? 1 : 0,
    schedule.environment,
    schedule.service_group,
    schedule.description,
    Number(id)
  ]).catch((error) => {
    if (error.code === 'ER_DUP_ENTRY') {
      throw Object.assign(new Error('Heartbeat schedule already exists for this cron and environment'), { statusCode: 409 });
    }

    throw error;
  });

  return getCronScheduleById(id);
}

export async function setCronScheduleEnabled(id, enabled) {
  await ensureHeartbeatSchema();

  await query(`
    UPDATE cron_schedules
    SET enabled = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [enabled ? 1 : 0, Number(id)]);

  const schedule = await getCronScheduleById(id);

  if (!schedule) {
    throw Object.assign(new Error('Heartbeat schedule not found'), { statusCode: 404 });
  }

  return schedule;
}

async function getMissingCronRule() {
  await ensureHeartbeatSchema();

  const [[rule]] = await query(`
    SELECT id, name, type, severity, cooldown_minutes, channels
    FROM alert_rules
    WHERE type = 'missing_cron' AND name = 'Missing Cron Alert'
    LIMIT 1
  `);

  return rule;
}

async function latestHeartbeats(schedules) {
  if (schedules.length === 0) {
    return new Map();
  }

  const names = [...new Set(schedules.map((schedule) => schedule.cron_name))];
  const [rows] = await query(`
    SELECT latest.cron_name, latest.env, latest.service_group, latest.timestamp AS last_heartbeat_at,
      latest.server
    FROM cron_logs latest
    INNER JOIN (
      SELECT cron_name, env, MAX(timestamp) AS last_heartbeat_at
      FROM cron_logs
      WHERE cron_name IN (${names.map(() => '?').join(',')})
      GROUP BY cron_name, env
    ) grouped
      ON grouped.cron_name = latest.cron_name
      AND grouped.env <=> latest.env
      AND grouped.last_heartbeat_at = latest.timestamp
  `, names);
  const byCron = new Map();

  for (const row of rows) {
    const scopedKey = `${row.cron_name}:${String(row.env || '').toLowerCase()}`;

    if (!byCron.has(scopedKey)) {
      byCron.set(scopedKey, row);
    }

    if (!byCron.has(row.cron_name)) {
      byCron.set(row.cron_name, row);
    }
  }

  return byCron;
}

async function recentMissingRecoveries(rule, schedules) {
  if (!rule || schedules.length === 0) {
    return new Map();
  }

  const keys = [...new Set(schedules.map((schedule) => missingAlertKey(rule, schedule)))];

  if (keys.length === 0) {
    return new Map();
  }

  const [rows] = await query(`
    SELECT alert_key, resolved_at
    FROM alert_events
    WHERE alert_key IN (${keys.map(() => '?').join(',')})
      AND type = 'missing_cron'
      AND state = 'resolved'
      AND resolved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${MAX_RECOVERY_WINDOW_MINUTES} MINUTE)
  `, keys);

  return new Map(rows.map((row) => [row.alert_key, row.resolved_at]));
}

function classifyHeartbeatState({
  missing,
  runtime,
  now,
  lastHeartbeatAt,
  missedExpectedAt,
  overdueAt,
  recentlyResolvedAt
}) {
  if (missing) {
    return {
      status: 'missing',
      reason: 'No heartbeat received beyond the configured tolerance window',
      lagMinutes: minutesBetween(now, missedExpectedAt)
    };
  }

  if (!runtime.activeWindow) {
    return {
      status: 'healthy',
      reason: 'Schedule is outside its active heartbeat window',
      lagMinutes: 0
    };
  }

  const delayed = missedExpectedAt
    && overdueAt
    && now.getTime() > missedExpectedAt.getTime()
    && now.getTime() <= overdueAt.getTime();

  if (delayed) {
    return {
      status: 'delayed',
      reason: 'Expected heartbeat window is open and not yet past tolerance',
      lagMinutes: minutesBetween(now, missedExpectedAt)
    };
  }

  const recoveryWindowMinutes = Math.min(
    MAX_RECOVERY_WINDOW_MINUTES,
    Math.max(MIN_RECOVERY_WINDOW_MINUTES, runtime.cadenceMinutes * 2)
  );
  const recentRecoveryAt = toDate(recentlyResolvedAt);

  if (recentRecoveryAt && minutesBetween(now, recentRecoveryAt) <= recoveryWindowMinutes) {
    return {
      status: 'recovering',
      reason: 'Missing heartbeat incident recently resolved',
      lagMinutes: minutesBetween(now, recentRecoveryAt)
    };
  }

  const previousOverdueAt = addMinutes(runtime.previousDueAt, runtime.graceMinutes);
  const arrivedAfterMissingWindow = lastHeartbeatAt
    && lastHeartbeatAt.getTime() > previousOverdueAt.getTime()
    && minutesBetween(now, lastHeartbeatAt) <= recoveryWindowMinutes;

  if (arrivedAfterMissingWindow) {
    return {
      status: 'recovering',
      reason: 'Heartbeat recently returned after crossing the missing threshold',
      lagMinutes: minutesLate(lastHeartbeatAt, runtime.previousDueAt)
    };
  }

  const arrivalLagMinutes = minutesLate(lastHeartbeatAt, runtime.previousDueAt);
  const unstableLagThreshold = Math.max(2, Math.ceil(runtime.cadenceMinutes * 0.25));
  const arrivedLateInsideTolerance = lastHeartbeatAt
    && lastHeartbeatAt.getTime() >= runtime.previousDueAt.getTime()
    && arrivalLagMinutes >= unstableLagThreshold;

  if (arrivedLateInsideTolerance) {
    return {
      status: 'unstable',
      reason: 'Heartbeat arrived with notable schedule jitter inside tolerance',
      lagMinutes: arrivalLagMinutes
    };
  }

  return {
    status: 'healthy',
    reason: 'Heartbeat received within the expected schedule window',
    lagMinutes: 0
  };
}

export async function evaluateHeartbeatSchedules({ persist = false, app } = {}) {
  await ensureHeartbeatSchema();

  const schedules = await listCronSchedules({ enabled: true });
  const heartbeatByCron = await latestHeartbeats(schedules);
  const missingRule = await getMissingCronRule();
  const recentRecoveriesByKey = await recentMissingRecoveries(missingRule, schedules);
  const now = new Date();
  const health = [];

  for (const schedule of schedules) {
    try {
      const runtime = scheduleRuntime(schedule, now);
      const scheduleEnvKey = `${schedule.cron_name}:${String(schedule.environment || '').toLowerCase()}`;
      const heartbeat = heartbeatByCron.get(scheduleEnvKey) || heartbeatByCron.get(schedule.cron_name);
      const lastHeartbeatAt = toDate(heartbeat?.last_heartbeat_at);
      const missedExpectedAt = lastHeartbeatAt
        ? nextExpectedAfter(schedule, lastHeartbeatAt)
        : runtime.previousDueAt;
      const overdueAt = addMinutes(missedExpectedAt, runtime.graceMinutes);
      const missing = runtime.activeWindow && now.getTime() > overdueAt.getTime();
      const heartbeatRestored = Boolean(lastHeartbeatAt && runtime.activeWindow && !missing);
      const missingMinutes = lastHeartbeatAt
        ? minutesBetween(now, missedExpectedAt)
        : minutesBetween(now, missedExpectedAt);
      const heartbeatState = classifyHeartbeatState({
        missing,
        runtime,
        now,
        lastHeartbeatAt,
        missedExpectedAt,
        overdueAt,
        recentlyResolvedAt: missingRule ? recentRecoveriesByKey.get(missingAlertKey(missingRule, schedule)) : null
      });

      health.push({
        ...schedule,
        heartbeat_status: heartbeatState.status,
        schedule_window_state: runtime.activeWindow ? 'active_window' : 'outside_window',
        last_heartbeat_at: formatWibDate(lastHeartbeatAt),
        last_heartbeat_at_utc: lastHeartbeatAt ? lastHeartbeatAt.toISOString() : null,
        last_heartbeat_minutes_ago: lastHeartbeatAt ? minutesBetween(now, lastHeartbeatAt) : null,
        expected_at: formatWibDate(missedExpectedAt),
        overdue_at: formatWibDate(overdueAt),
        next_expected_at: formatWibDate(runtime.nextDueAt),
        cadence_minutes: runtime.cadenceMinutes,
        heartbeat_lag_minutes: heartbeatState.lagMinutes,
        heartbeat_state_reason: heartbeatState.reason,
        missing_duration_minutes: missing ? missingMinutes : 0,
        heartbeat_restored: heartbeatRestored,
        server: heartbeat?.server || null,
        env: heartbeat?.env || schedule.environment,
        service_group: schedule.service_group || heartbeat?.service_group || null,
        schedule_description: runtime.schedule_description
      });
    } catch (error) {
      health.push({
        ...schedule,
        heartbeat_status: 'invalid_schedule',
        error: error.message,
        schedule_description: `${schedule.schedule_expression} (${schedule.timezone || DEFAULT_TIMEZONE})`
      });
    }
  }

  if (persist) {
    await persistHeartbeatAlerts(app, health);
  }

  return health;
}

function missingAlertKey(rule, schedule) {
  return `${rule.id}:missing_cron:${schedule.id}:${schedule.cron_name}:${schedule.environment}`;
}

function missingReason(item) {
  const lastSeen = item.last_heartbeat_minutes_ago === null
    ? 'no heartbeat recorded'
    : `last seen ${humanMinutes(item.last_heartbeat_minutes_ago)} ago`;

  const missingDuration = item.missing_duration_minutes
    ? `; missing for ${humanMinutes(item.missing_duration_minutes)}`
    : '';

  return `${item.cron_name} missed expected heartbeat at ${item.expected_at || 'unknown'} WIB; ${lastSeen}${missingDuration}`;
}

export function buildMissingCronTelegramMessage(alert, rule, lifecycle = 'triggered') {
  if (lifecycle === 'resolved') {
    return [
      '✅ <b>NYX Cron Recovered</b>',
      '',
      `<b>Cron:</b> ${escapeTelegramHtml(alert.cron_name || '-')}`,
      `<b>Status:</b> Heartbeat restored`,
      '',
      `<b>Recovered At:</b> ${escapeTelegramHtml(compactRecoveredTime(alert.recovered_at))} WIB`,
      `<b>Downtime:</b> ${escapeTelegramHtml(alert.downtime_duration_label || '-')}`
    ].join('\n');
  }

  const title = lifecycle === 'reminder'
    ? 'NYX Missing Cron Reminder'
    : 'NYX Missing Cron Alert';

  return [
    `🚨 <b>${escapeTelegramHtml(title)}</b>`,
    '',
    `<b>Cron:</b> ${escapeTelegramHtml(alert.cron_name || '-')}`,
    '<b>Issue:</b> Cron heartbeat missing',
    '',
    `<b>Schedule:</b> ${escapeTelegramHtml(alert.schedule_description || rule.name || '-')}`,
    `<b>Last Seen:</b> ${escapeTelegramHtml(alert.last_seen_label || '-')}`,
    '',
    `<b>Missing:</b> ${escapeTelegramHtml(alert.missing_duration_label || '-')}`
  ].join('\n');
}

function escapeTelegramHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function persistHeartbeatAlerts(app, health) {
  const rule = await getMissingCronRule();

  if (!rule) {
    return;
  }

  const activeKeys = new Set();
  const healthByKey = new Map(health.map((item) => [missingAlertKey(rule, item), item]));
  const missingItems = health.filter((item) => item.heartbeat_status === 'missing');

  for (const item of missingItems) {
    const key = missingAlertKey(rule, item);
    activeKeys.add(key);

    const [[existing]] = await query(
      `SELECT id, state, severity, last_notified_at
       FROM alert_events
       WHERE alert_key = ?
       LIMIT 1`,
      [key]
    );

    const severity = item.severity || rule.severity || 'critical';
    const env = item.environment || item.env || null;
    const serviceGroup = item.service_group || null;
    const reason = missingReason(item);
    const alertPayload = {
      cron_name: item.cron_name,
      env,
      service_group: serviceGroup,
      server: item.server,
      expected_at: item.expected_at,
      last_heartbeat_at: item.last_heartbeat_at,
      schedule_description: item.schedule_description,
      missing_duration_label: item.missing_duration_minutes ? `${humanMinutes(item.missing_duration_minutes)}` : '-',
      last_seen_label: item.last_heartbeat_minutes_ago === null ? 'Never' : `${humanMinutes(item.last_heartbeat_minutes_ago)} ago`
    };

    if (!existing) {
      try {
        const [result] = await query(`
          INSERT INTO alert_events
            (rule_id, alert_key, cron_name, env, service_group, type, severity, reason, state, triggered_at, started_at)
          VALUES (?, ?, ?, ?, ?, 'missing_cron', ?, ?, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
        `, [rule.id, key, item.cron_name, env, serviceGroup, severity, reason]);

        await recordHeartbeatIncidentEvent({ id: result.insertId, severity, ...alertPayload }, rule, 'triggered', item.cooldown_minutes || rule.cooldown_minutes);
        await notifyMissingCron(app, { id: result.insertId, severity, ...alertPayload }, rule, null, 'triggered');
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
          throw error;
        }

        app?.log?.debug({ alert_key: key, cron_name: item.cron_name }, 'Missing cron alert already exists; duplicate insert suppressed');
      }
      continue;
    }

    const reactivated = existing.state === 'resolved';
    const lifecycle = reactivated ? 'triggered' : 'reminder';

    const [updateResult] = await query(`
      UPDATE alert_events
      SET reason = ?,
        env = ?,
        service_group = ?,
        severity = ?,
        state = CASE WHEN state = 'resolved' THEN 'active' ELSE state END,
        triggered_at = CASE WHEN state = 'resolved' THEN UTC_TIMESTAMP() ELSE triggered_at END,
        started_at = CASE WHEN state = 'resolved' THEN UTC_TIMESTAMP() ELSE COALESCE(started_at, triggered_at) END,
        resolved_at = NULL,
        downtime_seconds = NULL,
        downtime_minutes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        ${reactivated ? "AND state = 'resolved'" : ''}
    `, [reason, env, serviceGroup, severity, existing.id]);

    if (reactivated && updateResult.affectedRows === 0) {
      app?.log?.debug({ alert_id: existing.id, alert_key: key }, 'Missing cron reactivation suppressed; incident already active');
      continue;
    }

    if (reactivated) {
      await recordHeartbeatIncidentEvent({ id: existing.id, severity, ...alertPayload }, rule, 'triggered', item.cooldown_minutes || rule.cooldown_minutes);
    }

    await notifyMissingCron(app, { id: existing.id, severity, ...alertPayload }, {
      ...rule,
      cooldown_minutes: item.cooldown_minutes || rule.cooldown_minutes
    }, existing.last_notified_at, lifecycle);
  }

  const [activeRows] = await query(
    `SELECT id, alert_key, cron_name, env, service_group, severity, last_notified_at, triggered_at,
       COALESCE(started_at, triggered_at) AS started_at,
       DATE_FORMAT(CONVERT_TZ(triggered_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS triggered_at_wib
     FROM alert_events
     WHERE state IN ('active', 'acknowledged')
       AND rule_id = ?`,
    [rule.id]
  );
  const resolvedRows = activeRows.filter((row) => {
    if (activeKeys.has(row.alert_key)) {
      return false;
    }

    const currentHealth = healthByKey.get(row.alert_key);

    if (!currentHealth || currentHealth.heartbeat_status === 'invalid_schedule') {
      return false;
    }

    if (currentHealth.heartbeat_restored) {
      return true;
    }

    const lastHeartbeatAt = currentHealth.last_heartbeat_at_utc
      ? new Date(currentHealth.last_heartbeat_at_utc)
      : toJakartaDate(currentHealth.last_heartbeat_at);
    const incidentOpenedAt = toDate(row.triggered_at);

    return Boolean(lastHeartbeatAt && incidentOpenedAt && lastHeartbeatAt.getTime() >= incidentOpenedAt.getTime());
  });

  if (resolvedRows.length === 0) {
    return;
  }

  for (const row of resolvedRows) {
    const incidentOpenedAt = toDate(row.started_at || row.triggered_at);
    const resolvedAt = new Date();
    const downtimeSeconds = incidentOpenedAt ? secondsBetween(resolvedAt, incidentOpenedAt) : null;
    const downtimeMinutes = downtimeSeconds === null ? null : Math.round((downtimeSeconds / 60) * 100) / 100;
    const [updateResult] = await query(
      `UPDATE alert_events
       SET state = 'resolved',
         started_at = COALESCE(started_at, triggered_at),
         resolved_at = ?,
         downtime_seconds = ?,
         downtime_minutes = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND state IN ('active', 'acknowledged')`,
      [toMysqlDateTime(resolvedAt), downtimeSeconds, downtimeMinutes, row.id]
    );

    if (updateResult.affectedRows === 0) {
      app?.log?.debug({ alert_id: row.id, alert_key: row.alert_key }, 'Missing cron recovery suppressed; incident already resolved');
      continue;
    }

    const currentHealth = healthByKey.get(row.alert_key) || {};
    const resolvedAlert = {
      ...row,
      recovered_at: formatWibDate(resolvedAt),
      resolved_at: toMysqlDateTime(resolvedAt),
      started_at: incidentOpenedAt ? toMysqlDateTime(incidentOpenedAt) : null,
      downtime_seconds: downtimeSeconds,
      downtime_minutes: downtimeMinutes,
      downtime_duration_label: downtimeMinutes === null ? '-' : humanMinutes(downtimeMinutes),
      last_heartbeat_at: currentHealth.last_heartbeat_at || null,
      schedule_description: currentHealth.schedule_description || null
    };

    await recordHeartbeatIncidentEvent(resolvedAlert, rule, 'resolved', rule.cooldown_minutes);
    await notifyMissingCron(app, resolvedAlert, rule, null, 'resolved');
  }
}

async function notifyMissingCron(app, alert, rule, lastNotifiedAt, lifecycle) {
  const repeatMinutes = repeatIntervalMinutes(alert.severity, rule.cooldown_minutes);
  const claimed = await claimMissingCronNotification(alert.id, lifecycle, repeatMinutes);

  if (!claimed) {
    app?.log?.debug({
      alert_id: alert.id,
      cron_name: alert.cron_name,
      lifecycle,
      repeat_interval_minutes: repeatMinutes,
      last_notified_at: lastNotifiedAt || null
    }, lifecycle === 'reminder' ? 'Missing cron reminder suppressed' : 'Missing cron notification suppressed');
    return;
  }

  const maintenance = await isNotificationSilenced({
    cron_name: alert.cron_name,
    server: alert.server,
    env: alert.env,
    service_group: alert.service_group
  });

  if (maintenance) {
    await query(`
      UPDATE alert_events
      SET last_notification_status = 'skipped',
        last_notification_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [`Suppressed by maintenance until ${maintenance.expires_at} WIB`, alert.id]);
    app?.log?.info({
      alert_id: alert.id,
      cron_name: alert.cron_name,
      maintenance_window_id: maintenance.id,
      lifecycle
    }, 'Missing cron notification suppressed by maintenance');
    return;
  }

  const channels = parseChannels(rule.channels);
  const text = buildMissingCronTelegramMessage(alert, rule, lifecycle);
  let delivered = false;
  const errors = [];

  await Promise.all(channels.map(async (channel) => {
    try {
      if (channel === 'telegram') {
        const result = await sendTelegram(text, { severity: alert.severity });
        delivered = delivered || Boolean(result.sent);
        if (!result.sent && result.error) {
          errors.push(result.error);
        }
      }
    } catch (error) {
      errors.push(`${channel}: ${error.message}`);
      app?.log?.warn({ channel, alert_id: alert.id, error: error.message }, 'Missing cron notification failed');
    }
  }));

  const status = delivered ? 'success' : channels.length === 0 ? 'skipped' : 'failed';

  await query(`
    UPDATE alert_events
    SET last_notification_status = ?,
      last_notification_error = ?,
      notification_count = CASE WHEN ? = 'success' THEN notification_count + 1 ELSE notification_count END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    status,
    errors.join('; ').slice(0, 1000) || null,
    status,
    alert.id
  ]);

  const logPayload = {
    alert_id: alert.id,
    cron_name: alert.cron_name,
    lifecycle,
    notification_status: status,
    repeat_interval_minutes: repeatMinutes
  };

  if (status === 'success') {
    if (lifecycle === 'reminder') {
      await recordHeartbeatIncidentEvent(alert, rule, lifecycle, repeatMinutes);
    }

    const message = lifecycle === 'resolved'
      ? 'Missing cron recovery notification sent'
      : lifecycle === 'reminder'
        ? 'Missing cron reminder sent'
        : 'Missing cron alert sent';
    app?.log?.info(logPayload, message);
  } else {
    app?.log?.warn({ ...logPayload, errors }, 'Missing cron notification was not delivered');
  }
}

async function recordHeartbeatIncidentEvent(alert, rule, lifecycle, repeatMinutes) {
  const type = lifecycle === 'resolved'
    ? 'heartbeat_recovered'
    : lifecycle === 'reminder'
      ? 'reminder_sent'
      : 'missing_detected';
  const downtimeMatch = String(alert.downtime_duration_label || '').match(/^(\d+)/);
  const downtimeSeconds = Number.isFinite(Number(alert.downtime_seconds))
    ? Math.max(0, Math.round(Number(alert.downtime_seconds)))
    : null;
  const downtimeMinutes = Number.isFinite(Number(alert.downtime_minutes))
    ? Math.max(0, Number(alert.downtime_minutes))
    : downtimeSeconds === null && downtimeMatch ? Number(downtimeMatch[1]) : downtimeSeconds === null ? null : Math.round((downtimeSeconds / 60) * 100) / 100;

  await recordIncidentEvent({
    event_key: [
      alert.id,
      type,
      lifecycle === 'resolved' ? alert.recovered_at : alert.expected_at,
      lifecycle === 'reminder' ? alert.missing_duration_label : ''
    ].join(':').slice(0, 255),
    alert_event_id: alert.id,
    rule_id: rule.id,
    cron_name: alert.cron_name,
    server: alert.server,
    env: alert.env,
    service_group: alert.service_group,
    severity: alert.severity,
    type,
    incident_type: 'missing_cron',
    incident_status: lifecycle === 'resolved' ? 'resolved' : 'active',
    title: lifecycle === 'resolved'
      ? 'Heartbeat recovered'
      : lifecycle === 'reminder'
        ? 'Reminder sent'
        : 'Missing detected',
    reason: lifecycle === 'resolved' ? 'Heartbeat restored' : 'Cron heartbeat missing',
    started_at: alert.started_at || null,
    resolved_at: alert.resolved_at || null,
    downtime_seconds: downtimeSeconds,
    downtime_minutes: downtimeMinutes,
    metadata: {
      lifecycle,
      schedule: alert.schedule_description || null,
      expected_at: alert.expected_at || null,
      last_heartbeat_at: alert.last_heartbeat_at || null,
      missing_duration: alert.missing_duration_label || null,
      repeat_interval_minutes: repeatMinutes
    }
  });
}

async function claimMissingCronNotification(alertId, lifecycle, repeatMinutes) {
  if (lifecycle === 'reminder') {
    const [result] = await query(`
      UPDATE alert_events
      SET last_notified_at = UTC_TIMESTAMP(),
        last_notification_status = 'pending',
        last_notification_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND (
          last_notification_status IS NULL
          OR last_notification_status <> 'pending'
          OR last_notified_at <= UTC_TIMESTAMP() - INTERVAL ? MINUTE
        )
        AND (last_notified_at IS NULL OR last_notified_at <= UTC_TIMESTAMP() - INTERVAL ? MINUTE)
    `, [alertId, repeatMinutes, repeatMinutes]);

    return result.affectedRows > 0;
  }

  // Triggered and resolved notifications are guarded by incident state transitions
  // before this point, so they must bypass reminder cooldown/pending suppression.
  const [result] = await query(`
    UPDATE alert_events
    SET last_notified_at = UTC_TIMESTAMP(),
      last_notification_status = 'pending',
      last_notification_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [alertId]);

  return result.affectedRows > 0;
}

function repeatIntervalMinutes(severity, configuredMinutes) {
  const minimumBySeverity = {
    critical: 10,
    warning: 15,
    info: 30
  };
  const minimum = minimumBySeverity[severity] || DEFAULT_COOLDOWN_MINUTES;
  const configured = Number(configuredMinutes || 0);

  return Math.max(configured || minimum, minimum);
}

function parseChannels(value) {
  if (Array.isArray(value)) {
    return uniqueList(value.filter(Boolean));
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? uniqueList(parsed.filter(Boolean)) : [];
  } catch {
    return uniqueList(String(value).split(',').map((item) => item.trim()).filter(Boolean));
  }
}

function uniqueList(values) {
  return [...new Set(values)];
}

function telegramChatIds() {
  return uniqueList(String(process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((chatId) => chatId.trim())
    .filter(Boolean));
}

function normalizeTelegramTopicId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const topicId = Number(value);
  return Number.isFinite(topicId) && topicId > 0 ? topicId : null;
}

function telegramTopicIdForSeverity(severity) {
  const normalizedSeverity = String(severity || '').toUpperCase();
  return normalizeTelegramTopicId(process.env[`TELEGRAM_${normalizedSeverity}_TOPIC_ID`])
    || normalizeTelegramTopicId(process.env.TELEGRAM_TOPIC_ID)
    || normalizeTelegramTopicId(process.env.TELEGRAM_MESSAGE_THREAD_ID);
}

async function sendTelegram(text, { severity } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = telegramChatIds();
  const topicId = telegramTopicIdForSeverity(severity);

  if (!token || chatIds.length === 0) {
    return { sent: false, error: 'Telegram credentials are not configured' };
  }

  await Promise.all(chatIds.map(async (chatId) => {
    const basePayload = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    const payload = topicId ? { ...basePayload, message_thread_id: topicId } : basePayload;
    let response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok && topicId) {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(basePayload)
      });
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Telegram API ${response.status}: ${responseText.slice(0, 300)}`);
    }
  }));

  return { sent: true, count: chatIds.length, topic_id: topicId };
}

export async function heartbeatSummary({ env, service_group } = {}) {
  const health = await evaluateHeartbeatSchedules();
  const normalizedEnv = String(env || '').toLowerCase();
  const scoped = health.filter((item) => {
    if (normalizedEnv && String(item.environment || '').toLowerCase() !== normalizedEnv && String(item.env || '').toLowerCase() !== normalizedEnv) return false;
    if (service_group && item.service_group !== service_group) return false;
    return true;
  });
  const missing = scoped.filter((item) => item.heartbeat_status === 'missing');
  const delayed = scoped.filter((item) => item.heartbeat_status === 'delayed');
  const unstable = scoped.filter((item) => item.heartbeat_status === 'unstable');
  const recovering = scoped.filter((item) => item.heartbeat_status === 'recovering');
  const healthy = scoped.filter((item) => item.heartbeat_status === 'healthy');
  const outsideWindow = scoped.filter((item) => item.schedule_window_state === 'outside_window');
  const invalid = scoped.filter((item) => item.heartbeat_status === 'invalid_schedule');

  return {
    summary: {
      monitored_schedules: scoped.length,
      healthy: healthy.length,
      delayed: delayed.length,
      unstable: unstable.length,
      missing: missing.length,
      recovering: recovering.length,
      outside_window: outsideWindow.length,
      invalid_schedule: invalid.length
    },
    schedules: scoped.sort((left, right) => {
      const rank = { missing: 0, delayed: 1, unstable: 2, recovering: 3, invalid_schedule: 4, healthy: 5 };
      return (rank[left.heartbeat_status] ?? 9) - (rank[right.heartbeat_status] ?? 9)
        || String(left.cron_name).localeCompare(String(right.cron_name));
    }),
    now_wib: (await query(`SELECT ${JAKARTA_NOW_SQL} AS now_wib`))[0][0]?.now_wib || null
  };
}
