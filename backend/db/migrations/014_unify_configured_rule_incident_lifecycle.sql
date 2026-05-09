-- Migration: 014_unify_configured_rule_incident_lifecycle
-- Description: Backfills configured-rule alert lifecycle events so reports and incident timelines share one persistence path.

SET @alert_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
);

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
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'resolved_at'
);
SET @sql = IF(@alert_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_events ADD COLUMN resolved_at TIMESTAMP NULL AFTER acknowledged_at', 'SELECT ''014_unify_configured_rule_incident_lifecycle: alert_events.resolved_at already present or alert_events missing''');
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
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN downtime_minutes DECIMAL(12, 2) NULL AFTER downtime_seconds', 'SELECT ''014_unify_configured_rule_incident_lifecycle: incident_events.downtime_minutes already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@alert_events_exists > 0 AND @incident_events_exists > 0, '
  INSERT IGNORE INTO incident_events
    (event_key, alert_event_id, rule_id, alert_key, cron_name, env, service_group, severity,
     type, incident_type, incident_status, title, reason, started_at, metadata_json, occurred_at)
  SELECT
    LEFT(CONCAT(alert_events.id, '':alert_triggered:'', DATE_FORMAT(COALESCE(alert_events.started_at, alert_events.triggered_at), ''%Y-%m-%d %H:%i:%s'')), 255),
    alert_events.id,
    alert_events.rule_id,
    alert_events.alert_key,
    COALESCE(alert_events.cron_name, ''All monitored cron jobs''),
    alert_events.env,
    alert_events.service_group,
    alert_events.severity,
    CASE WHEN alert_events.type = ''missing_cron'' THEN ''missing_detected'' ELSE ''alert_triggered'' END,
    alert_events.type,
    ''active'',
    CASE WHEN alert_events.type = ''missing_cron'' THEN ''Missing cron detected'' ELSE ''Alert triggered'' END,
    alert_events.reason,
    COALESCE(alert_events.started_at, alert_events.triggered_at),
    JSON_OBJECT(''alert_type'', alert_events.type, ''lifecycle'', ''triggered'', ''backfilled'', true),
    alert_events.triggered_at
  FROM alert_events
  WHERE alert_events.type <> ''missing_cron''
', 'SELECT ''014_unify_configured_rule_incident_lifecycle: skipping configured-rule trigger backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@alert_events_exists > 0 AND @incident_events_exists > 0, '
  INSERT IGNORE INTO incident_events
    (event_key, alert_event_id, rule_id, alert_key, cron_name, env, service_group, severity,
     type, incident_type, incident_status, title, reason, started_at, resolved_at, downtime_seconds,
     downtime_minutes, metadata_json, occurred_at)
  SELECT
    LEFT(CONCAT(alert_events.id, '':alert_resolved:'', DATE_FORMAT(alert_events.resolved_at, ''%Y-%m-%d %H:%i:%s'')), 255),
    alert_events.id,
    alert_events.rule_id,
    alert_events.alert_key,
    COALESCE(alert_events.cron_name, ''All monitored cron jobs''),
    alert_events.env,
    alert_events.service_group,
    alert_events.severity,
    ''alert_resolved'',
    alert_events.type,
    ''resolved'',
    ''Alert resolved'',
    alert_events.reason,
    COALESCE(alert_events.started_at, alert_events.triggered_at),
    alert_events.resolved_at,
    COALESCE(alert_events.downtime_seconds, GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(alert_events.started_at, alert_events.triggered_at), alert_events.resolved_at))),
    COALESCE(alert_events.downtime_minutes, ROUND(GREATEST(0, TIMESTAMPDIFF(SECOND, COALESCE(alert_events.started_at, alert_events.triggered_at), alert_events.resolved_at)) / 60, 2)),
    JSON_OBJECT(''alert_type'', alert_events.type, ''lifecycle'', ''resolved'', ''backfilled'', true),
    alert_events.resolved_at
  FROM alert_events
  WHERE alert_events.type <> ''missing_cron''
    AND alert_events.state = ''resolved''
    AND alert_events.resolved_at IS NOT NULL
', 'SELECT ''014_unify_configured_rule_incident_lifecycle: skipping configured-rule resolved backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
