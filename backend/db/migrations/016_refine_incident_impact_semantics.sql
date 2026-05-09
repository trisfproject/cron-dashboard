-- Migration: 016_refine_incident_impact_semantics
-- Description: Separates lifecycle event impact from root reliability class for accurate outage/degradation reporting.

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

SET @sql = IF(
  @incident_events_exists > 0 AND @column_exists = 0,
  'ALTER TABLE incident_events ADD COLUMN impact_type VARCHAR(40) NULL AFTER incident_status',
  'SELECT ''016_refine_incident_impact_semantics: incident_events.impact_type already present or incident_events missing'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'reliability_class'
);

SET @sql = IF(
  @incident_events_exists > 0 AND @column_exists = 0,
  'ALTER TABLE incident_events ADD COLUMN reliability_class VARCHAR(40) NULL AFTER impact_type',
  'SELECT ''016_refine_incident_impact_semantics: incident_events.reliability_class already present or incident_events missing'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @incident_events_exists > 0 AND @alert_events_exists > 0,
'
UPDATE incident_events
LEFT JOIN alert_events
  ON alert_events.id = incident_events.alert_event_id

SET

incident_events.impact_type = CASE

  WHEN (
    CONVERT(incident_events.type USING utf8mb4)
  ) IN (
    ''alert_triggered'',
    ''alert_resolved'',
    ''reminder_sent'',
    ''incident_acknowledged'',
    ''incident_note_added'',
    ''maintenance_enabled'',
    ''maintenance_disabled'',
    ''maintenance_expired''
  )
  THEN ''informational''

  WHEN (
    CONVERT(incident_events.type USING utf8mb4)
  ) IN (
    ''missing_detected'',
    ''heartbeat_recovered''
  )
  THEN ''outage''

  ELSE ''informational''

END,

incident_events.reliability_class = CASE

  WHEN (
    CONVERT(
      COALESCE(alert_events.type, incident_events.incident_type)
      USING utf8mb4
    )
  ) IN (
    ''missing_cron'',
    ''failed_threshold'',
    ''cron_silence''
  )
  OR (
    CONVERT(incident_events.type USING utf8mb4)
  ) IN (
    ''missing_detected'',
    ''heartbeat_recovered''
  )
  THEN ''outage''

  WHEN (
    CONVERT(
      COALESCE(alert_events.type, incident_events.incident_type)
      USING utf8mb4
    )
  ) IN (
    ''success_rate_degradation'',
    ''retry_storm'',
    ''duration_anomaly'',
    ''warning_threshold''
  )
  THEN ''degraded''

  WHEN (
    CONVERT(incident_events.type USING utf8mb4)
  ) IN (
    ''incident_acknowledged'',
    ''incident_note_added'',
    ''maintenance_enabled'',
    ''maintenance_disabled'',
    ''maintenance_expired'',
    ''reminder_sent''
  )
  THEN ''informational''

  WHEN (
    CONVERT(incident_events.severity USING utf8mb4)
  ) = ''critical''
  THEN ''outage''

  WHEN (
    CONVERT(incident_events.severity USING utf8mb4)
  ) = ''warning''
  THEN ''degraded''

  ELSE ''informational''

END
',
'SELECT ''016_refine_incident_impact_semantics: skipping joined backfill'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @incident_events_exists > 0 AND @alert_events_exists = 0,
'
UPDATE incident_events

SET

impact_type = CASE

  WHEN (
    CONVERT(type USING utf8mb4)
  ) IN (
    ''alert_triggered'',
    ''alert_resolved'',
    ''reminder_sent'',
    ''incident_acknowledged'',
    ''incident_note_added'',
    ''maintenance_enabled'',
    ''maintenance_disabled'',
    ''maintenance_expired''
  )
  THEN ''informational''

  WHEN (
    CONVERT(type USING utf8mb4)
  ) IN (
    ''missing_detected'',
    ''heartbeat_recovered''
  )
  THEN ''outage''

  ELSE ''informational''

END,

reliability_class = CASE

  WHEN (
    CONVERT(incident_type USING utf8mb4)
  ) IN (
    ''missing_cron'',
    ''failed_threshold'',
    ''cron_silence''
  )
  OR (
    CONVERT(type USING utf8mb4)
  ) IN (
    ''missing_detected'',
    ''heartbeat_recovered''
  )
  THEN ''outage''

  WHEN (
    CONVERT(incident_type USING utf8mb4)
  ) IN (
    ''success_rate_degradation'',
    ''retry_storm'',
    ''duration_anomaly'',
    ''warning_threshold''
  )
  THEN ''degraded''

  WHEN (
    CONVERT(type USING utf8mb4)
  ) IN (
    ''incident_acknowledged'',
    ''incident_note_added'',
    ''maintenance_enabled'',
    ''maintenance_disabled'',
    ''maintenance_expired'',
    ''reminder_sent''
  )
  THEN ''informational''

  WHEN (
    CONVERT(severity USING utf8mb4)
  ) = ''critical''
  THEN ''outage''

  WHEN (
    CONVERT(severity USING utf8mb4)
  ) = ''warning''
  THEN ''degraded''

  ELSE ''informational''

END
',
'SELECT ''016_refine_incident_impact_semantics: alert_events present or incident_events missing for fallback backfill'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND INDEX_NAME = 'idx_incident_events_reliability_time'
);

SET @sql = IF(
  @incident_events_exists > 0 AND @index_exists = 0,
  'CREATE INDEX idx_incident_events_reliability_time ON incident_events(reliability_class, occurred_at)',
  'SELECT ''016_refine_incident_impact_semantics: idx_incident_events_reliability_time already present or incident_events missing'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;