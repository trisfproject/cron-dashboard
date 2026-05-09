-- Migration: 017_fix_reliability_classification_priority
-- Description: Reclassify incident events with proper lifecycle and reliability priority ordering.

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

-- Update with alert_events join
SET @sql = IF(
  @incident_events_exists > 0 AND @alert_events_exists > 0,
'
UPDATE incident_events
LEFT JOIN alert_events
  ON alert_events.id = incident_events.alert_event_id

SET

incident_events.impact_type = CASE

  -- PRIORITY 1: Lifecycle / Audit Events
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

  -- PRIORITY 2: Outage lifecycle events
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

  -- PRIORITY 1: Lifecycle / Audit Events
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

  -- PRIORITY 2A: Real outages
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

  -- PRIORITY 2B: Degradation events
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

  -- PRIORITY 3: Severity fallback
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
'SELECT ''017_fix_reliability_classification_priority skipped'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Fallback update without alert_events
SET @sql = IF(
  @incident_events_exists > 0 AND @alert_events_exists = 0,
'
UPDATE incident_events

SET

impact_type = CASE

  -- PRIORITY 1: Lifecycle / Audit Events
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

  -- PRIORITY 2: Outage lifecycle events
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

  -- PRIORITY 1: Lifecycle / Audit Events
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

  -- PRIORITY 2A: Real outages
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

  -- PRIORITY 2B: Degradation events
  WHEN (
    CONVERT(incident_type USING utf8mb4)
  ) IN (
    ''success_rate_degradation'',
    ''retry_storm'',
    ''duration_anomaly'',
    ''warning_threshold''
  )
  THEN ''degraded''

  -- PRIORITY 3: Severity fallback
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
'SELECT ''017_fix_reliability_classification_priority fallback skipped'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Completion log
SELECT '017_fix_reliability_classification_priority completed' AS migration_status;