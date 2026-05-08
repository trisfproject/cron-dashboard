-- Migration: 009_add_environment_service_grouping
-- Description: Adds environment and service-group scoping for cron observability.
-- Compatibility: MySQL and MariaDB, including older deployments.
--
-- NYX production schema uses cron_logs, env, and service_group. Do not rename
-- env, and do not rely on column ordering. Every DDL operation checks
-- INFORMATION_SCHEMA first so partially-applied environments can recover by
-- rerunning migrations.

SET @cron_logs_exists = (
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
    AND COLUMN_NAME = 'service_group'
);
SET @sql = IF(@cron_logs_exists > 0 AND @column_exists = 0, 'ALTER TABLE cron_logs ADD COLUMN service_group VARCHAR(120) NOT NULL DEFAULT ''Unassigned''', 'SELECT ''009_add_environment_service_grouping: cron_logs.service_group already present or cron_logs missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND INDEX_NAME = 'idx_cron_logs_env_service_timestamp'
);
SET @index_column_count = (
  SELECT COUNT(DISTINCT COLUMN_NAME)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME IN ('env', 'service_group', 'timestamp')
);
SET @sql = IF(@cron_logs_exists > 0 AND @index_exists = 0 AND @index_column_count = 3, 'CREATE INDEX idx_cron_logs_env_service_timestamp ON cron_logs(env, service_group, timestamp)', 'SELECT ''009_add_environment_service_grouping: idx_cron_logs_env_service_timestamp already present or required columns missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND INDEX_NAME = 'idx_cron_logs_service_timestamp'
);
SET @index_column_count = (
  SELECT COUNT(DISTINCT COLUMN_NAME)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND COLUMN_NAME IN ('service_group', 'timestamp')
);
SET @sql = IF(@cron_logs_exists > 0 AND @index_exists = 0 AND @index_column_count = 2, 'CREATE INDEX idx_cron_logs_service_timestamp ON cron_logs(service_group, timestamp)', 'SELECT ''009_add_environment_service_grouping: idx_cron_logs_service_timestamp already present or required columns missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @alert_rules_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
);

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
    AND COLUMN_NAME = 'env'
);
SET @sql = IF(@alert_rules_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_rules ADD COLUMN env VARCHAR(80) NULL', 'SELECT ''009_add_environment_service_grouping: alert_rules.env already present or alert_rules missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
    AND COLUMN_NAME = 'service_group'
);
SET @sql = IF(@alert_rules_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_rules ADD COLUMN service_group VARCHAR(120) NULL', 'SELECT ''009_add_environment_service_grouping: alert_rules.service_group already present or alert_rules missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
    AND INDEX_NAME = 'idx_alert_rules_scope'
);
SET @index_column_count = (
  SELECT COUNT(DISTINCT COLUMN_NAME)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
    AND COLUMN_NAME IN ('env', 'service_group', 'cron_name')
);
SET @sql = IF(@alert_rules_exists > 0 AND @index_exists = 0 AND @index_column_count = 3, 'CREATE INDEX idx_alert_rules_scope ON alert_rules(env, service_group, cron_name)', 'SELECT ''009_add_environment_service_grouping: idx_alert_rules_scope already present or required columns missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'env'
);
SET @sql = IF(@alert_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_events ADD COLUMN env VARCHAR(80) NULL', 'SELECT ''009_add_environment_service_grouping: alert_events.env already present or alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME = 'service_group'
);
SET @sql = IF(@alert_events_exists > 0 AND @column_exists = 0, 'ALTER TABLE alert_events ADD COLUMN service_group VARCHAR(120) NULL', 'SELECT ''009_add_environment_service_grouping: alert_events.service_group already present or alert_events missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND INDEX_NAME = 'idx_alert_events_scope_state'
);
SET @index_column_count = (
  SELECT COUNT(DISTINCT COLUMN_NAME)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_events'
    AND COLUMN_NAME IN ('env', 'service_group', 'state', 'triggered_at')
);
SET @sql = IF(@alert_events_exists > 0 AND @index_exists = 0 AND @index_column_count = 4, 'CREATE INDEX idx_alert_events_scope_state ON alert_events(env, service_group, state, triggered_at)', 'SELECT ''009_add_environment_service_grouping: idx_alert_events_scope_state already present or required columns missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
