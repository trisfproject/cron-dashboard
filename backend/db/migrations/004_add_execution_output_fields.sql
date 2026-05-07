-- Migration: 004_add_execution_output_fields
-- Description: Add optional execution output fields for troubleshooting
-- Compatibility: MySQL 8.0+

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'stdout'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN stdout LONGTEXT NULL AFTER command', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'stderr'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN stderr LONGTEXT NULL AFTER stdout', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'output'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN output LONGTEXT NULL AFTER stderr', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'warning_messages'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN warning_messages TEXT NULL AFTER output', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'exception_trace'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN exception_trace LONGTEXT NULL AFTER warning_messages', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'retry_logs'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN retry_logs LONGTEXT NULL AFTER exception_trace', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'timeout_info'
);
SET @sql = IF(@exists = 0, 'ALTER TABLE cron_logs ADD COLUMN timeout_info TEXT NULL AFTER retry_logs', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
