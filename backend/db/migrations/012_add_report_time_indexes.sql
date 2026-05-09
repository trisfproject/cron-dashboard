-- Migration: 012_add_report_time_indexes
-- Description: Adds narrow timestamp indexes for custom report range scans.

SET @incident_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
);

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND INDEX_NAME = 'idx_incident_events_occurred_at'
);
SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'incident_events'
    AND COLUMN_NAME = 'occurred_at'
);
SET @sql = IF(@incident_events_exists > 0 AND @index_exists = 0 AND @column_exists = 1, 'CREATE INDEX idx_incident_events_occurred_at ON incident_events(occurred_at)', 'SELECT ''012_add_report_time_indexes: idx_incident_events_occurred_at already present or required column missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @alert_events_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
);

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND INDEX_NAME = 'idx_alert_events_triggered_at'
);
SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'triggered_at'
);
SET @sql = IF(@alert_events_exists > 0 AND @index_exists = 0 AND @column_exists = 1, 'CREATE INDEX idx_alert_events_triggered_at ON alert_events(triggered_at)', 'SELECT ''012_add_report_time_indexes: idx_alert_events_triggered_at already present or required column missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
