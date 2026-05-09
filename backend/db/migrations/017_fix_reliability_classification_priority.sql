/**
 * Migration 017: Fix Reliability Classification Priority
 *
 * Purpose: Reclassify all incident_events with correct priority ordering
 * so lifecycle events no longer inherit degraded/outage semantics from severity.
 *
 * Classification Priority:
 * 1. LIFECYCLE EVENTS (alert_triggered, alert_resolved, reminder_sent, etc.) → informational
 * 2. ROOT INCIDENT SEMANTICS (outage vs degraded based on type)
 * 3. SEVERITY FALLBACK (critical/warning)
 *
 * This prevents false "degraded" classifications for lifecycle events like
 * reminder_sent that inherit severity from parent alerts.
 *
 * Safety Measures:
 * - Uses CONVERT(...USING utf8mb4) for charset compatibility
 * - Only updates existing rows
 * - Preserves all other data
 * - Idempotent (safe to re-run)
 */

SET @incident_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND (TABLE_NAME COLLATE utf8_general_ci) = 'incident_events'
);

SET @alert_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND (TABLE_NAME COLLATE utf8_general_ci) = 'alert_events'
);

-- Update both impact_type and reliability_class with correct priority ordering (with alert_events join)
SET @sql = IF(@incident_events_exists > 0 AND @alert_events_exists > 0, '
  UPDATE incident_events
  LEFT JOIN alert_events ON alert_events.id = incident_events.alert_event_id
  SET incident_events.impact_type = CASE
    -- PRIORITY 1: Lifecycle/Audit Events - ALWAYS informational
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

    -- PRIORITY 2: Root Incident Semantics
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
    -- PRIORITY 1: Lifecycle/Audit Events - ALWAYS informational
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

    -- PRIORITY 2: Root Incident Semantics - Actual operational meaning
    -- Outage: Real service unavailability
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

    -- Degraded: Service performance degradation
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

    -- PRIORITY 3: Severity Fallback - Last resort only
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
  WHERE incident_events.impact_type IS NOT NULL
    OR incident_events.reliability_class IS NOT NULL
    OR incident_events.type IS NOT NULL
', 'SELECT ''017_fix_reliability_classification_priority: alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update both impact_type and reliability_class with correct priority ordering (without alert_events join)
SET @sql = IF(@incident_events_exists > 0 AND @alert_events_exists = 0, '
  UPDATE incident_events
  SET impact_type = CASE
    -- PRIORITY 1: Lifecycle/Audit Events - ALWAYS informational
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

    -- PRIORITY 2: Root Incident Semantics
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
    -- PRIORITY 1: Lifecycle/Audit Events - ALWAYS informational
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

    -- PRIORITY 2: Root Incident Semantics - Actual operational meaning
    -- Outage: Real service unavailability
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

    -- Degraded: Service performance degradation
    WHEN (
      CONVERT(incident_type USING utf8mb4)
    ) IN (
      ''success_rate_degradation'',
      ''retry_storm'',
      ''duration_anomaly'',
      ''warning_threshold''
    )
    THEN ''degraded''

    -- PRIORITY 3: Severity Fallback - Last resort only
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
  WHERE impact_type IS NOT NULL
    OR reliability_class IS NOT NULL
    OR type IS NOT NULL
', 'SELECT ''017_fix_reliability_classification_priority: incident_events or alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Log completion
SELECT ''017_fix_reliability_classification_priority: Reliability and impact classification priority reclassification complete'' AS migration_status;
