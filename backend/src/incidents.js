import { pool } from './db.js';
import { assertValidCustomDateRange, resolveDateFilter } from './utils/range-filter.js';

const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_SQL_TIMEZONE = '+07:00';
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const INCIDENT_TYPES = ['alert_triggered', 'missing_detected'];
const RECOVERY_TYPES = ['alert_resolved', 'heartbeat_recovered'];
const VALID_IMPACT_TYPES = new Set(['outage', 'degraded', 'informational']);
const VALID_RELIABILITY_CLASSES = new Set(['outage', 'degraded', 'informational']);
const OUTAGE_INCIDENT_TYPES = new Set(['missing_cron', 'failed_threshold', 'cron_silence']);
const DEGRADED_INCIDENT_TYPES = new Set(['success_rate_degradation', 'retry_storm', 'duration_anomaly', 'warning_threshold']);
const LIFECYCLE_EVENT_TYPES = new Set([
  'alert_triggered',
  'alert_resolved',
  'reminder_sent',
  'incident_acknowledged',
  'incident_note_added',
  'maintenance_enabled',
  'maintenance_disabled',
  'maintenance_expired'
]);

let incidentSchemaReadyPromise;
let reportTimeIndexesReadyPromise;

async function query(sql, values = []) {
  return pool.query(sql, values);
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

async function ensureIncidentSchema() {
  if (!incidentSchemaReadyPromise) {
    incidentSchemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS incident_events (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          event_key VARCHAR(255) NOT NULL,
          alert_event_id BIGINT UNSIGNED NULL,
          rule_id BIGINT UNSIGNED NULL,
          alert_key VARCHAR(512) NULL,
          cron_name VARCHAR(255) NOT NULL,
          server VARCHAR(255) NULL,
          env VARCHAR(80) NULL,
          service_group VARCHAR(120) NULL,
          severity VARCHAR(20) NULL,
          type VARCHAR(40) NOT NULL,
          incident_type VARCHAR(40) NULL,
          incident_status VARCHAR(40) NULL,
          impact_type VARCHAR(40) NULL,
          reliability_class VARCHAR(40) NULL,
          title VARCHAR(255) NOT NULL,
          reason TEXT NULL,
          started_at TIMESTAMP NULL,
          resolved_at TIMESTAMP NULL,
          downtime_seconds INT UNSIGNED NULL,
          downtime_minutes DECIMAL(12, 2) NULL,
          metadata_json LONGTEXT NULL,
          occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_incident_events_key (event_key),
          KEY idx_incident_events_occurred_at (occurred_at),
          KEY idx_incident_events_cron_time (cron_name, occurred_at),
          KEY idx_incident_events_alert_time (alert_event_id, occurred_at),
          KEY idx_incident_events_scope_time (env, service_group, occurred_at)
        )
      `);

      const columns = await tableColumnSet('incident_events');
      await ensureColumn('incident_events', columns, 'server', 'VARCHAR(255) NULL');
      await ensureColumn('incident_events', columns, 'incident_type', 'VARCHAR(40) NULL');
      await ensureColumn('incident_events', columns, 'incident_status', 'VARCHAR(40) NULL');
      await ensureColumn('incident_events', columns, 'impact_type', 'VARCHAR(40) NULL');
      await ensureColumn('incident_events', columns, 'reliability_class', 'VARCHAR(40) NULL');
      await ensureColumn('incident_events', columns, 'started_at', 'TIMESTAMP NULL');
      await ensureColumn('incident_events', columns, 'resolved_at', 'TIMESTAMP NULL');
      await ensureColumn('incident_events', columns, 'downtime_seconds', 'INT UNSIGNED NULL');
      await ensureColumn('incident_events', columns, 'downtime_minutes', 'DECIMAL(12, 2) NULL');

      const indexes = await tableIndexSet('incident_events');
      await ensureIndex('incident_events', indexes, 'idx_incident_events_occurred_at', '(occurred_at)');
      await ensureIndex('incident_events', indexes, 'idx_incident_events_impact_time', '(impact_type, occurred_at)');
      await ensureIndex('incident_events', indexes, 'idx_incident_events_reliability_time', '(reliability_class, occurred_at)');
    })().catch((error) => {
      incidentSchemaReadyPromise = null;
      throw error;
    });
  }

  await incidentSchemaReadyPromise;
}

async function ensureReportTimeIndexes() {
  if (!reportTimeIndexesReadyPromise) {
    reportTimeIndexesReadyPromise = (async () => {
      const alertIndexes = await tableIndexSet('alert_events');
      await ensureIndex('alert_events', alertIndexes, 'idx_alert_events_triggered_at', '(triggered_at)');
    })().catch((error) => {
      reportTimeIndexesReadyPromise = null;
      throw error;
    });
  }

  await reportTimeIndexesReadyPromise;
}

function eventTitle(type, fallback) {
  if (fallback) {
    return fallback;
  }

  return {
    triggered: 'Alert triggered',
    alert_triggered: 'Alert triggered',
    reminder_sent: 'Reminder sent',
    resolved: 'Alert resolved',
    alert_resolved: 'Alert resolved',
    missing_detected: 'Missing detected',
    heartbeat_recovered: 'Heartbeat recovered',
    maintenance_enabled: 'Maintenance enabled',
    maintenance_disabled: 'Maintenance disabled',
    maintenance_expired: 'Maintenance expired',
    incident_acknowledged: 'Incident acknowledged',
    incident_note_added: 'Incident note added'
  }[type] || String(type || 'Incident event').replaceAll('_', ' ');
}

function eventKeyFor(event) {
  const base = [
    event.alert_event_id || 'alert',
    event.type,
    event.occurred_at || 'now',
    event.notification_count ?? ''
  ].join(':');

  return event.event_key || base.slice(0, 255);
}

function inferImpactType(event = {}) {
  if (VALID_IMPACT_TYPES.has(event.impact_type)) {
    return event.impact_type;
  }

  const type = String(event.type || '').toLowerCase();

  if (LIFECYCLE_EVENT_TYPES.has(type)) {
    return 'informational';
  }

  if (type === 'missing_detected' || type === 'heartbeat_recovered') {
    return 'outage';
  }

  return 'informational';
}

function inferReliabilityClass(event = {}) {
  if (VALID_RELIABILITY_CLASSES.has(event.reliability_class)) {
    return event.reliability_class;
  }

  const incidentType = String(event.incident_type || event.type || '').toLowerCase();
  const type = String(event.type || '').toLowerCase();
  const severity = String(event.severity || '').toLowerCase();

  if (OUTAGE_INCIDENT_TYPES.has(incidentType) || type === 'missing_detected' || type === 'heartbeat_recovered') {
    return 'outage';
  }

  if (DEGRADED_INCIDENT_TYPES.has(incidentType)) {
    return 'degraded';
  }

  if (LIFECYCLE_EVENT_TYPES.has(type)) {
    return 'informational';
  }

  if (severity === 'critical') {
    return 'outage';
  }

  if (severity === 'warning') {
    return 'degraded';
  }

  return 'informational';
}

export async function recordIncidentEvent(event = {}) {
  if (!event.cron_name || !event.type) {
    return null;
  }

  await ensureIncidentSchema();

  const eventKey = eventKeyFor(event);
  const metadata = event.metadata ? JSON.stringify(event.metadata) : null;
  const occurredAt = event.occurred_at || null;
  const occurredAtColumns = occurredAt ? ', occurred_at' : '';
  const occurredAtPlaceholder = occurredAt ? ', ?' : '';
  const downtimeSeconds = Number.isFinite(Number(event.downtime_seconds))
    ? Math.max(0, Math.round(Number(event.downtime_seconds)))
    : null;
  const downtimeMinutes = Number.isFinite(Number(event.downtime_minutes))
    ? Math.max(0, Number(event.downtime_minutes))
    : downtimeSeconds === null ? null : Math.round((downtimeSeconds / 60) * 100) / 100;
  const values = [
    eventKey,
    event.alert_event_id || null,
    event.rule_id || null,
    event.alert_key || null,
    event.cron_name,
    event.server || null,
    event.env || null,
    event.service_group || null,
    event.severity || null,
    event.type,
    event.incident_type || event.type,
    event.incident_status || null,
    inferImpactType(event),
    inferReliabilityClass(event),
    eventTitle(event.type, event.title),
    event.reason || null,
    event.started_at || null,
    event.resolved_at || null,
    downtimeSeconds,
    downtimeMinutes,
    metadata
  ];

  if (occurredAt) {
    values.push(occurredAt);
  }

  const [result] = await query(`
    INSERT IGNORE INTO incident_events
      (event_key, alert_event_id, rule_id, alert_key, cron_name, server, env, service_group, severity,
       type, incident_type, incident_status, impact_type, reliability_class, title, reason, started_at, resolved_at, downtime_seconds,
       downtime_minutes, metadata_json${occurredAtColumns})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${occurredAtPlaceholder})
  `, values);

  return result.insertId || null;
}

export async function listIncidentEvents({ cron, env, service_group, limit = 20, offset = 0 } = {}) {
  await ensureIncidentSchema();

  const filters = [];
  const values = [];
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const safeOffset = Math.max(Number(offset || 0), 0);

  if (cron) {
    filters.push('incident_events.cron_name = ?');
    values.push(cron);
  }

  if (env) {
    filters.push('incident_events.env = ?');
    values.push(env);
  }

  if (service_group) {
    filters.push('incident_events.service_group = ?');
    values.push(service_group);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  values.push(safeLimit + 1, safeOffset);

  const [rows] = await query(`
    SELECT incident_events.id, incident_events.alert_event_id, incident_events.rule_id, incident_events.alert_key,
      incident_events.cron_name, incident_events.server, incident_events.env, incident_events.service_group,
      incident_events.severity, incident_events.type, incident_events.incident_type, incident_events.incident_status,
      ${incidentImpactSql()} AS impact_type,
      ${incidentReliabilitySql()} AS reliability_class,
      incident_events.title, incident_events.reason,
      incident_events.downtime_seconds, incident_events.downtime_minutes, incident_events.metadata_json,
      DATE_FORMAT(CONVERT_TZ(incident_events.started_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS started_at,
      DATE_FORMAT(CONVERT_TZ(incident_events.resolved_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS resolved_at,
      alert_events.state AS alert_state,
      alert_events.acknowledged_by_name,
      alert_events.acknowledged_by_email,
      alert_events.acknowledgement_note,
      DATE_FORMAT(CONVERT_TZ(alert_events.acknowledged_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS acknowledged_at,
      DATE_FORMAT(CONVERT_TZ(incident_events.occurred_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS occurred_at,
      DATE_FORMAT(CONVERT_TZ(incident_events.created_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS created_at
    FROM incident_events
    LEFT JOIN alert_events ON alert_events.id = incident_events.alert_event_id
    ${where}
    ORDER BY incident_events.occurred_at DESC, incident_events.id DESC
    LIMIT ? OFFSET ?
  `, values);

  const pageRows = rows.slice(0, safeLimit).map((row) => {
    let metadata = row.metadata_json || null;

    if (typeof row.metadata_json === 'string') {
      try {
        metadata = JSON.parse(row.metadata_json || '{}');
      } catch {
        metadata = null;
      }
    }

    return {
      ...row,
      event_type: row.type,
      metadata,
      metadata_json: undefined
    };
  });

  return {
    incidents: pageRows,
    limit: safeLimit,
    offset: safeOffset,
    next_offset: safeOffset + pageRows.length,
    has_more: rows.length > safeLimit
  };
}

function addReportScopeFilters(filters, values, { env, service_group } = {}) {
  if (env) {
    filters.push('incident_events.env = ?');
    values.push(env);
  }

  if (service_group) {
    filters.push('incident_events.service_group = ?');
    values.push(service_group);
  }
}

function incidentPlaceholders(values) {
  return values.map(() => '?').join(', ');
}

function incidentImpactSql() {
  return `CASE
    WHEN incident_events.type IN ('alert_triggered', 'alert_resolved', 'reminder_sent', 'incident_acknowledged', 'incident_note_added', 'maintenance_enabled', 'maintenance_disabled', 'maintenance_expired')
      THEN 'informational'
    WHEN incident_events.type IN ('missing_detected', 'heartbeat_recovered')
      THEN 'outage'
    WHEN incident_events.impact_type IN ('outage', 'degraded', 'informational')
      THEN incident_events.impact_type
    ELSE 'informational'
  END`;
}

function incidentReliabilitySql() {
  return `COALESCE(
    incident_events.reliability_class,
    CASE
      WHEN incident_events.incident_type IN ('missing_cron', 'failed_threshold', 'cron_silence')
        OR incident_events.type IN ('missing_detected', 'heartbeat_recovered')
        THEN 'outage'
      WHEN incident_events.incident_type IN ('success_rate_degradation', 'retry_storm', 'duration_anomaly', 'warning_threshold')
        THEN 'degraded'
      WHEN incident_events.type IN ('incident_acknowledged', 'incident_note_added', 'maintenance_enabled', 'maintenance_disabled', 'maintenance_expired', 'reminder_sent')
        THEN 'informational'
      WHEN incident_events.severity = 'critical'
        THEN 'outage'
      WHEN incident_events.severity = 'warning'
        THEN 'degraded'
      ELSE 'informational'
    END
  )`;
}

function availabilityPercent(totalDowntimeMinutes, periodMinutes) {
  if (!periodMinutes || periodMinutes <= 0) {
    return 100;
  }

  const uptimeMinutes = Math.max(periodMinutes - totalDowntimeMinutes, 0);
  return Math.round((uptimeMinutes / periodMinutes) * 10000) / 100;
}

function jakartaDateOnly(date) {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

function normalizeDailyTrend(rows, startDate, endDate) {
  const rowMap = new Map(rows.map((row) => [row.day, row]));
  const days = [];
  const cursor = new Date(`${jakartaDateOnly(startDate)}T00:00:00.000+07:00`);
  const end = new Date(`${jakartaDateOnly(endDate)}T00:00:00.000+07:00`);

  while (cursor <= end) {
    const day = jakartaDateOnly(cursor);
    const row = rowMap.get(day);
    days.push({
      day,
      incidents: Number(row?.incidents || 0),
      outage_incidents: Number(row?.outage_incidents || 0),
      degraded_incidents: Number(row?.degraded_incidents || 0),
      recoveries: Number(row?.recoveries || 0)
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export async function getReliabilityReport({ range = '7d', start, end, env, service_group, sort = 'downtime' } = {}) {
  await ensureIncidentSchema();
  await ensureReportTimeIndexes();

  assertValidCustomDateRange({ start, end });
  const dateFilter = resolveDateFilter({ range, start, end });
  const filters = ['incident_events.occurred_at BETWEEN ? AND ?'];
  const values = [...dateFilter.values];
  addReportScopeFilters(filters, values, { env, service_group });
  const where = filters.join(' AND ');
  const eventTypes = [...INCIDENT_TYPES, ...RECOVERY_TYPES];
  const reliabilitySql = incidentReliabilitySql();
  const periodMinutes = Math.max(1, Math.ceil((dateFilter.endDate.getTime() - dateFilter.startDate.getTime()) / 60000));

  const [[summary]] = await query(`
    SELECT
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) THEN 1 ELSE 0 END) AS total_incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'outage' THEN 1 ELSE 0 END) AS outage_incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'degraded' THEN 1 ELSE 0 END) AS degraded_incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'informational' THEN 1 ELSE 0 END) AS informational_incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) THEN 1 ELSE 0 END) AS total_recoveries,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) AND ${reliabilitySql} = 'outage' THEN 1 ELSE 0 END) AS outage_recoveries,
      COALESCE(SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) AND ${reliabilitySql} = 'outage' THEN COALESCE(incident_events.downtime_seconds, incident_events.downtime_minutes * 60, 0) ELSE 0 END), 0) AS total_downtime_seconds,
      COALESCE(AVG(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) AND ${reliabilitySql} = 'outage' AND COALESCE(incident_events.downtime_seconds, incident_events.downtime_minutes * 60) IS NOT NULL THEN COALESCE(incident_events.downtime_seconds, incident_events.downtime_minutes * 60) END), 0) AS mttr_seconds,
      COUNT(*) AS total_events
    FROM incident_events
    WHERE ${where}
      AND incident_events.type IN (${incidentPlaceholders(eventTypes)})
  `, [
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...RECOVERY_TYPES,
    ...RECOVERY_TYPES,
    ...RECOVERY_TYPES,
    ...RECOVERY_TYPES,
    ...values,
    ...eventTypes
  ]);

  const alertFilters = ['alert_events.triggered_at BETWEEN ? AND ?'];
  const alertValues = [...dateFilter.values];
  if (env) {
    alertFilters.push('alert_events.env = ?');
    alertValues.push(env);
  }
  if (service_group) {
    alertFilters.push('alert_events.service_group = ?');
    alertValues.push(service_group);
  }
  const [[alertSummary]] = await query(`
    SELECT COUNT(*) AS total_alerts
    FROM alert_events
    WHERE ${alertFilters.join(' AND ')}
  `, alertValues);

  const [problematicRows] = await query(`
    SELECT
      incident_events.cron_name,
      MAX(incident_events.env) AS env,
      MAX(incident_events.service_group) AS service_group,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) THEN 1 ELSE 0 END) AS incident_count,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'outage' THEN 1 ELSE 0 END) AS outage_incident_count,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'degraded' THEN 1 ELSE 0 END) AS degraded_incident_count,
      COALESCE(SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) AND ${reliabilitySql} = 'outage' THEN COALESCE(incident_events.downtime_seconds, incident_events.downtime_minutes * 60, 0) ELSE 0 END), 0) AS total_downtime_seconds,
      COALESCE(AVG(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) AND ${reliabilitySql} = 'outage' AND COALESCE(incident_events.downtime_seconds, incident_events.downtime_minutes * 60) IS NOT NULL THEN COALESCE(incident_events.downtime_seconds, incident_events.downtime_minutes * 60) END), 0) AS avg_recovery_seconds,
      MAX(incident_events.occurred_at) AS latest_event
    FROM incident_events
    WHERE ${where}
      AND incident_events.type IN (${incidentPlaceholders(eventTypes)})
    GROUP BY incident_events.cron_name
    HAVING incident_count > 0 OR total_downtime_seconds > 0
    ORDER BY ${sort === 'incidents' ? 'incident_count DESC, total_downtime_seconds DESC' : 'total_downtime_seconds DESC, incident_count DESC'}, latest_event DESC
    LIMIT 10
  `, [
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...RECOVERY_TYPES,
    ...RECOVERY_TYPES,
    ...values,
    ...eventTypes
  ]);

  const [trendRows] = await query(`
    SELECT
      DATE_FORMAT(CONVERT_TZ(incident_events.occurred_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d') AS day,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) THEN 1 ELSE 0 END) AS incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'outage' THEN 1 ELSE 0 END) AS outage_incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(INCIDENT_TYPES)}) AND ${reliabilitySql} = 'degraded' THEN 1 ELSE 0 END) AS degraded_incidents,
      SUM(CASE WHEN incident_events.type IN (${incidentPlaceholders(RECOVERY_TYPES)}) THEN 1 ELSE 0 END) AS recoveries
    FROM incident_events
    WHERE ${where}
      AND incident_events.type IN (${incidentPlaceholders(eventTypes)})
    GROUP BY day
    ORDER BY day ASC
  `, [
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...INCIDENT_TYPES,
    ...RECOVERY_TYPES,
    ...values,
    ...eventTypes
  ]);

  const totalDowntimeMinutes = Math.round((Number(summary?.total_downtime_seconds || 0) / 60) * 100) / 100;
  const totalIncidents = Number(summary?.total_incidents || 0);
  const outageIncidents = Number(summary?.outage_incidents || 0);
  const uptimeMinutes = Math.max(periodMinutes - totalDowntimeMinutes, 0);

  return {
    summary: {
      availability_percent: availabilityPercent(totalDowntimeMinutes, periodMinutes),
      total_incidents: totalIncidents,
      outage_incidents: outageIncidents,
      degraded_incidents: Number(summary?.degraded_incidents || 0),
      informational_incidents: Number(summary?.informational_incidents || 0),
      total_recoveries: Number(summary?.total_recoveries || 0),
      outage_recoveries: Number(summary?.outage_recoveries || 0),
      total_downtime_minutes: totalDowntimeMinutes,
      mttr_minutes: Math.round((Number(summary?.mttr_seconds || 0) / 60) * 100) / 100,
      mtbf_minutes: outageIncidents > 0 ? Math.round((uptimeMinutes / outageIncidents) * 100) / 100 : periodMinutes,
      total_alerts: Number(alertSummary?.total_alerts || 0)
    },
    problematic_crons: problematicRows.map((row) => ({
      cron_name: row.cron_name,
      env: row.env,
      service_group: row.service_group,
      incident_count: Number(row.incident_count || 0),
      outage_incident_count: Number(row.outage_incident_count || 0),
      degraded_incident_count: Number(row.degraded_incident_count || 0),
      total_downtime_minutes: Math.round((Number(row.total_downtime_seconds || 0) / 60) * 100) / 100,
      avg_recovery_minutes: Math.round((Number(row.avg_recovery_seconds || 0) / 60) * 100) / 100
    })),
    trend: normalizeDailyTrend(trendRows, dateFilter.startDate, dateFilter.endDate),
    range: dateFilter.mode === 'custom' ? 'custom' : (dateFilter.range || range),
    start: dateFilter.values[0],
    end: dateFilter.values[1],
    timezone: 'Asia/Jakarta'
  };
}
