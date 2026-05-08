-- Migration: 004_add_execution_output_fields
-- Description: Add optional execution output fields for troubleshooting.
-- Compatibility: MySQL and MariaDB, including older deployments.
--
-- Older production engines may not support newer conditional column syntax,
-- and column ordering should not be required by NYX.
-- Each column is checked independently so partial migration runs are safe.

SET @table_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
);

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'stdout'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN stdout LONGTEXT NULL', 'SELECT ''004_add_execution_output_fields: stdout already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'stderr'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN stderr LONGTEXT NULL', 'SELECT ''004_add_execution_output_fields: stderr already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'output'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN output LONGTEXT NULL', 'SELECT ''004_add_execution_output_fields: output already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'warning_messages'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN warning_messages TEXT NULL', 'SELECT ''004_add_execution_output_fields: warning_messages already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'exception_trace'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN exception_trace LONGTEXT NULL', 'SELECT ''004_add_execution_output_fields: exception_trace already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'retry_logs'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN retry_logs LONGTEXT NULL', 'SELECT ''004_add_execution_output_fields: retry_logs already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME = 'timeout_info'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN timeout_info TEXT NULL', 'SELECT ''004_add_execution_output_fields: timeout_info already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
