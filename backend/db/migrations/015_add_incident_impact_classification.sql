-- Migration: 015_add_incident_impact_classification
-- Description: Classifies incident events so degradation alerts do not count as outage downtime.

SET @incident_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
);

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
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'impact_type'
);
SET @sql = IF(@incident_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE incident_events ADD COLUMN impact_type VARCHAR(40) NULL AFTER incident_status', 'SELECT ''015_add_incident_impact_classification: incident_events.impact_type already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@incident_events_exists > 0 AND @alert_events_exists > 0, '
  UPDATE incident_events
  LEFT JOIN alert_events ON alert_events.id = incident_events.alert_event_id
  SET incident_events.impact_type = CASE
    WHEN COALESCE(alert_events.type, incident_events.incident_type) IN (''missing_cron'', ''failed_threshold'', ''cron_silence'')
      OR incident_events.type IN (''missing_detected'', ''heartbeat_recovered'')
      THEN ''outage''
    WHEN COALESCE(alert_events.type, incident_events.incident_type) IN (''success_rate_degradation'', ''retry_storm'', ''duration_anomaly'', ''warning_threshold'')
      THEN ''degraded''
    WHEN incident_events.type IN (''incident_acknowledged'', ''incident_note_added'', ''maintenance_enabled'', ''maintenance_disabled'', ''maintenance_expired'', ''reminder_sent'')
      THEN ''informational''
    WHEN incident_events.severity = ''critical''
      THEN ''outage''
    WHEN incident_events.severity = ''warning''
      THEN ''degraded''
    ELSE ''informational''
  END
  WHERE incident_events.impact_type IS NULL
', 'SELECT ''015_add_incident_impact_classification: incident_events missing for impact backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@incident_events_exists > 0 AND @alert_events_exists = 0, '
  UPDATE incident_events
  SET impact_type = CASE
    WHEN incident_type IN (''missing_cron'', ''failed_threshold'', ''cron_silence'')
      OR type IN (''missing_detected'', ''heartbeat_recovered'')
      THEN ''outage''
    WHEN incident_type IN (''success_rate_degradation'', ''retry_storm'', ''duration_anomaly'', ''warning_threshold'')
      THEN ''degraded''
    WHEN type IN (''incident_acknowledged'', ''incident_note_added'', ''maintenance_enabled'', ''maintenance_disabled'', ''maintenance_expired'', ''reminder_sent'')
      THEN ''informational''
    WHEN severity = ''critical''
      THEN ''outage''
    WHEN severity = ''warning''
      THEN ''degraded''
    ELSE ''informational''
  END
  WHERE impact_type IS NULL
', 'SELECT ''015_add_incident_impact_classification: alert_events present or incident_events missing for fallback backfill''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND INDEX_NAME = 'idx_incident_events_impact_time'
);
SET @sql = IF(@incident_events_exists > 0 AND @index_exists = 0, 'CREATE INDEX idx_incident_events_impact_time ON incident_events(impact_type, occurred_at)', 'SELECT ''015_add_incident_impact_classification: idx_incident_events_impact_time already present or incident_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
