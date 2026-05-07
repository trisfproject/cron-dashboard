-- Migration: 006_add_alert_notification_status
-- Description: Track notification delivery status for alert events
-- Compatibility: MySQL 8.0+

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'last_notification_status'
);
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE alert_events ADD COLUMN last_notification_status ENUM(''pending'', ''success'', ''failed'', ''skipped'') NULL AFTER notification_count',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'last_notification_error'
);
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE alert_events ADD COLUMN last_notification_error TEXT NULL AFTER last_notification_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
