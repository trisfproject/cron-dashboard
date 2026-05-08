-- Migration: 002_add_time_range_indexes
-- Description: Add indexes for efficient time range queries.
-- Compatibility: MySQL and MariaDB, including older deployments.
--
-- Production databases can drift or receive partial migrations. Avoid
-- version-specific conditional index syntax and check
-- INFORMATION_SCHEMA before every DDL statement.

SET @table_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
);

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND INDEX_NAME = 'idx_timestamp_status'
);
SET @index_column_count = (
  SELECT COUNT(DISTINCT COLUMN_NAME)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME IN ('timestamp', 'status')
);

SET @sql = IF(
  @table_exists > 0 AND @index_exists = 0 AND @index_column_count = 2,
  'CREATE INDEX idx_timestamp_status ON cron_logs(timestamp, status)',
  'SELECT ''002_add_time_range_indexes: idx_timestamp_status already present or required columns missing'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND INDEX_NAME = 'idx_server_timestamp'
);
SET @index_column_count = (
  SELECT COUNT(DISTINCT COLUMN_NAME)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME IN ('server', 'timestamp')
);

SET @sql = IF(
  @table_exists > 0 AND @index_exists = 0 AND @index_column_count = 2,
  'CREATE INDEX idx_server_timestamp ON cron_logs(server, timestamp)',
  'SELECT ''002_add_time_range_indexes: idx_server_timestamp already present or required columns missing'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
