import { pool } from './db.js';

const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_SQL_TIMEZONE = '+07:00';

let incidentSchemaReadyPromise;

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
          title VARCHAR(255) NOT NULL,
          reason TEXT NULL,
          downtime_minutes INT NULL,
          metadata_json LONGTEXT NULL,
          occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_incident_events_key (event_key),
          KEY idx_incident_events_cron_time (cron_name, occurred_at),
          KEY idx_incident_events_alert_time (alert_event_id, occurred_at),
          KEY idx_incident_events_scope_time (env, service_group, occurred_at)
        )
      `);

      const columns = await tableColumnSet('incident_events');
      await ensureColumn('incident_events', columns, 'server', 'VARCHAR(255) NULL');
    })().catch((error) => {
      incidentSchemaReadyPromise = null;
      throw error;
    });
  }

  await incidentSchemaReadyPromise;
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
    eventTitle(event.type, event.title),
    event.reason || null,
    Number.isFinite(Number(event.downtime_minutes)) ? Number(event.downtime_minutes) : null,
    metadata
  ];

  if (occurredAt) {
    values.push(occurredAt);
  }

  const [result] = await query(`
    INSERT IGNORE INTO incident_events
      (event_key, alert_event_id, rule_id, alert_key, cron_name, server, env, service_group, severity,
       type, title, reason, downtime_minutes, metadata_json${occurredAtColumns})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${occurredAtPlaceholder})
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
      incident_events.severity, incident_events.type, incident_events.title, incident_events.reason,
      incident_events.downtime_minutes, incident_events.metadata_json,
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
