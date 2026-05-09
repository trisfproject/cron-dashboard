import { pool } from './db.js';
import { recordIncidentEvent } from './incidents.js';

const UTC_SQL_TIMEZONE = '+00:00';
const JAKARTA_SQL_TIMEZONE = '+07:00';

let maintenanceSchemaReadyPromise;

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

export async function ensureMaintenanceSchema() {
  if (!maintenanceSchemaReadyPromise) {
    maintenanceSchemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS maintenance_windows (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          cron_name VARCHAR(255) NULL,
          server VARCHAR(255) NULL,
          env VARCHAR(80) NULL,
          service_group VARCHAR(120) NULL,
          reason TEXT NULL,
          starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          ended_at TIMESTAMP NULL,
          created_by_user_id BIGINT UNSIGNED NULL,
          created_by_email VARCHAR(255) NULL,
          expiration_event_recorded_at TIMESTAMP NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_maintenance_scope_active (cron_name, env, service_group, expires_at, ended_at),
          KEY idx_maintenance_expiry (expires_at, ended_at, expiration_event_recorded_at)
        )
      `);

      const columns = await tableColumnSet('maintenance_windows');
      await ensureColumn('maintenance_windows', columns, 'server', 'VARCHAR(255) NULL');
      await ensureColumn('maintenance_windows', columns, 'expiration_event_recorded_at', 'TIMESTAMP NULL');
    })().catch((error) => {
      maintenanceSchemaReadyPromise = null;
      throw error;
    });
  }

  await maintenanceSchemaReadyPromise;
}

function normalizeScope(payload = {}) {
  return {
    cron_name: payload.cron_name ? String(payload.cron_name).trim() : null,
    server: payload.server ? String(payload.server).trim() : null,
    env: payload.env ? String(payload.env).trim() : null,
    service_group: payload.service_group ? String(payload.service_group).trim() : null
  };
}

function maintenanceScopeLabel(window) {
  return [
    window.cron_name || 'all cron jobs',
    window.env || null,
    window.service_group || null
  ].filter(Boolean).join(' · ');
}

function minutesUntil(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60000));
}

function mapMaintenanceRow(row) {
  return {
    ...row,
    active: !row.ended_at && new Date(`${row.expires_at.replace(' ', 'T')}+07:00`).getTime() > Date.now(),
    remaining_minutes: minutesUntil(`${row.expires_at.replace(' ', 'T')}+07:00`)
  };
}

async function recordMaintenanceEvent(window, type, title) {
  await recordIncidentEvent({
    event_key: `maintenance:${window.id}:${type}`,
    alert_event_id: null,
    rule_id: null,
    cron_name: window.cron_name || 'all monitored cron jobs',
    server: window.server,
    env: window.env,
    service_group: window.service_group,
    severity: 'info',
    type,
    title,
    reason: window.reason || maintenanceScopeLabel(window),
    metadata: {
      maintenance_window_id: window.id,
      expires_at: window.expires_at,
      scope: {
        cron_name: window.cron_name,
        server: window.server,
        env: window.env,
        service_group: window.service_group
      }
    }
  });
}

async function recordExpiredMaintenanceWindows() {
  await ensureMaintenanceSchema();

  const [rows] = await query(`
    SELECT id, cron_name, server, env, service_group, reason,
      DATE_FORMAT(CONVERT_TZ(expires_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS expires_at
    FROM maintenance_windows
    WHERE ended_at IS NULL
      AND expires_at <= UTC_TIMESTAMP()
      AND expiration_event_recorded_at IS NULL
    LIMIT 100
  `);

  for (const row of rows) {
    await recordMaintenanceEvent(row, 'maintenance_expired', 'Maintenance expired');
  }

  if (rows.length > 0) {
    await query(
      `UPDATE maintenance_windows
       SET expiration_event_recorded_at = UTC_TIMESTAMP(),
         updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${rows.map(() => '?').join(',')})`,
      rows.map((row) => row.id)
    );
  }
}

export async function createMaintenanceWindow(payload = {}, user = {}) {
  await ensureMaintenanceSchema();

  const scope = normalizeScope(payload);
  const durationMinutes = Math.min(Math.max(Number(payload.duration_minutes || 60), 1), 10080);
  const reason = payload.reason ? String(payload.reason).trim() : null;

  const [result] = await query(`
    INSERT INTO maintenance_windows
      (cron_name, server, env, service_group, reason, expires_at, created_by_user_id, created_by_email)
    VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?)
  `, [
    scope.cron_name,
    scope.server,
    scope.env,
    scope.service_group,
    reason,
    durationMinutes,
    user.id || null,
    user.email || null
  ]);

  const window = await getMaintenanceWindowById(result.insertId);
  await recordMaintenanceEvent(window, 'maintenance_enabled', 'Maintenance enabled');

  return window;
}

async function getMaintenanceWindowById(id) {
  const [[row]] = await query(`
    SELECT id, cron_name, server, env, service_group, reason,
      DATE_FORMAT(CONVERT_TZ(starts_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS starts_at,
      DATE_FORMAT(CONVERT_TZ(expires_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS expires_at,
      DATE_FORMAT(CONVERT_TZ(ended_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS ended_at,
      created_by_user_id, created_by_email
    FROM maintenance_windows
    WHERE id = ?
    LIMIT 1
  `, [id]);

  return row ? mapMaintenanceRow(row) : null;
}

export async function endMaintenanceWindow(id) {
  await ensureMaintenanceSchema();

  const window = await getMaintenanceWindowById(id);
  const [result] = await query(`
    UPDATE maintenance_windows
    SET ended_at = UTC_TIMESTAMP(),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND ended_at IS NULL
      AND expires_at > UTC_TIMESTAMP()
  `, [id]);

  if (window && result.affectedRows > 0) {
    await recordMaintenanceEvent(window, 'maintenance_disabled', 'Maintenance disabled');
  }

  return getMaintenanceWindowById(id);
}

export async function listMaintenanceWindows(filters = {}) {
  await recordExpiredMaintenanceWindows();

  const scope = normalizeScope(filters);
  const values = [];
  const clauses = [];

  if (scope.cron_name) {
    clauses.push('(cron_name = ? OR cron_name IS NULL)');
    values.push(scope.cron_name);
  }

  if (scope.server) {
    clauses.push('(server = ? OR server IS NULL)');
    values.push(scope.server);
  }

  if (scope.env) {
    clauses.push('(env = ? OR env IS NULL)');
    values.push(scope.env);
  }

  if (scope.service_group) {
    clauses.push('(service_group = ? OR service_group IS NULL)');
    values.push(scope.service_group);
  }

  if (filters.active !== false) {
    clauses.push('ended_at IS NULL');
    clauses.push('expires_at > UTC_TIMESTAMP()');
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await query(`
    SELECT id, cron_name, server, env, service_group, reason,
      DATE_FORMAT(CONVERT_TZ(starts_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS starts_at,
      DATE_FORMAT(CONVERT_TZ(expires_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS expires_at,
      DATE_FORMAT(CONVERT_TZ(ended_at, '${UTC_SQL_TIMEZONE}', '${JAKARTA_SQL_TIMEZONE}'), '%Y-%m-%d %H:%i:%s') AS ended_at,
      created_by_user_id, created_by_email
    FROM maintenance_windows
    ${where}
    ORDER BY expires_at ASC, id DESC
    LIMIT 50
  `, values);

  return rows.map(mapMaintenanceRow);
}

export async function getActiveMaintenanceWindow(scope = {}) {
  const windows = await listMaintenanceWindows({ ...scope, active: true });
  return windows[0] || null;
}

export async function isNotificationSilenced(scope = {}) {
  return getActiveMaintenanceWindow(scope);
}

