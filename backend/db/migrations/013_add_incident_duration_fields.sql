-- Migration: 013_add_incident_duration_fields
-- Description: Persists incident start, resolution, and downtime durations for reliability reporting.

SET @alert_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
);

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'started_at'
);
SET @sql = IF(@alert_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_events ADD COLUMN started_at TIMESTAMP NULL AFTER triggered_at', 'SELECT ''013_add_incident_duration_fields: alert_events.started_at already present or alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'downtime_seconds'
);
SET @sql = IF(@alert_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_events ADD COLUMN downtime_seconds INT UNSIGNED NULL AFTER resolved_at', 'SELECT ''013_add_incident_duration_fields: alert_events.downtime_seconds already present or alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'downtime_minutes'
);
SET @sql = IF(@alert_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_events ADD COLUMN downtime_minutes DECIMAL(12, 2) NULL AFTER downtime_seconds', 'SELECT ''013_add_incident_duration_fields: alert_events.downtime_minutes already present or alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@alert_events_exists > 0, 'UPDATE alert_events SET started_at = COALESCE(started_at, triggered_at)', 'SELECT ''013_add_incident_duration_fields: alert_events missing for started_at backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@alert_events_exists > 0, 'UPDATE alert_events SET downtime_seconds = COALESCE(downtime_seconds, GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(started_at, triggered_at), resolved_at))), downtime_minutes = COALESCE(downtime_minutes, ROUND(GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(started_at, triggered_at), resolved_at)) / 60, 2)) WHERE state = ''resolved'' AND resolved_at IS NOT NULL', 'SELECT ''013_add_incident_duration_fields: alert_events missing for duration backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @incident_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
);

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'incident_type'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN incident_type VARCHAR(40) NULL AFTER type', 'SELECT ''013_add_incident_duration_fields: incident_events.incident_type already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'incident_status'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN incident_status VARCHAR(40) NULL AFTER incident_type', 'SELECT ''013_add_incident_duration_fields: incident_events.incident_status already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'started_at'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN started_at TIMESTAMP NULL AFTER reason', 'SELECT ''013_add_incident_duration_fields: incident_events.started_at already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'resolved_at'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN resolved_at TIMESTAMP NULL AFTER started_at', 'SELECT ''013_add_incident_duration_fields: incident_events.resolved_at already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'downtime_seconds'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN downtime_seconds INT UNSIGNED NULL AFTER resolved_at', 'SELECT ''013_add_incident_duration_fields: incident_events.downtime_seconds already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'downtime_minutes'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 1, 'ALTER TABLE incident_events MODIFY COLUMN downtime_minutes DECIMAL(12, 2) NULL', 'SELECT ''013_add_incident_duration_fields: incident_events.downtime_minutes missing or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@incident_events_exists > 0 AND @alert_events_exists > 0, 'UPDATE incident_events LEFT JOIN alert_events ON alert_events.id = incident_events.alert_event_id SET incident_events.incident_type = COALESCE(incident_events.incident_type, incident_events.type), incident_events.incident_status = COALESCE(incident_events.incident_status, CASE WHEN incident_events.type IN (''alert_resolved'', ''heartbeat_recovered'') THEN ''resolved'' WHEN incident_events.type IN (''alert_triggered'', ''missing_detected'', ''reminder_sent'') THEN ''active'' ELSE NULL END), incident_events.started_at = COALESCE(incident_events.started_at, alert_events.started_at, alert_events.triggered_at), incident_events.resolved_at = COALESCE(incident_events.resolved_at, CASE WHEN incident_events.type IN (''alert_resolved'', ''heartbeat_recovered'') THEN alert_events.resolved_at ELSE NULL END), incident_events.downtime_seconds = COALESCE(incident_events.downtime_seconds, CASE WHEN incident_events.type IN (''alert_resolved'', ''heartbeat_recovered'') THEN alert_events.downtime_seconds ELSE NULL END), incident_events.downtime_minutes = COALESCE(incident_events.downtime_minutes, CASE WHEN incident_events.type IN (''alert_resolved'', ''heartbeat_recovered'') THEN alert_events.downtime_minutes ELSE NULL END)', 'SELECT ''013_add_incident_duration_fields: incident_events or alert_events missing for duration backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
