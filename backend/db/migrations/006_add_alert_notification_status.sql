-- Migration: 006_add_alert_notification_status
-- Description: Track notification delivery status for alert events.
-- Compatibility: MySQL and MariaDB, including older deployments.
--
-- Schema checks make this safe after partial deployments. Avoid column order
-- assumptions and newer conditional column syntax.

SET @table_exists = (
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
    AND COLUMN_NAME = 'last_notification_status'
);
SET @sql = IF(
  @table_exists > 0 AND @column_exists = 0,
  'ALTER TABLE alert_events ADD COLUMN last_notification_status ENUM(''pending'', ''success'', ''failed'', ''skipped'') NULL',
  'SELECT ''006_add_alert_notification_status: last_notification_status already present or alert_events missing'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'last_notification_error'
);
SET @sql = IF(
  @table_exists > 0 AND @column_exists = 0,
  'ALTER TABLE alert_events ADD COLUMN last_notification_error TEXT NULL',
  'SELECT ''006_add_alert_notification_status: last_notification_error already present or alert_events missing'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
