-- Migration: 011_add_cron_schedule_heartbeat_monitoring
-- Description: Adds schedule-aware heartbeat monitoring for missing cron detection.
-- Compatibility: MySQL and MariaDB, including older deployments.

CREATE TABLE IF NOT EXISTS cron_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cron_name VARCHAR(255) NOT NULL,
  schedule_expression VARCHAR(120) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Jakarta',
  grace_period_minutes INT UNSIGNED NOT NULL DEFAULT 10,
  cooldown_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'critical',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  environment VARCHAR(80) NOT NULL DEFAULT 'Production',
  service_group VARCHAR(120) NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cron_schedules_scope (cron_name, environment),
  KEY idx_cron_schedules_enabled_env_service (enabled, environment, service_group),
  KEY idx_cron_schedules_cron_name (cron_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @alert_rules_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
);

SET @missing_type_present = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'alert_rules'
    AND COLUMN_NAME = 'type'
    AND COLUMN_TYPE LIKE '%missing_cron%'
);

SET @sql = IF(
  @alert_rules_exists > 0 AND @missing_type_present = 0,
  'ALTER TABLE alert_rules MODIFY COLUMN type ENUM(''failed_threshold'', ''warning_threshold'', ''success_rate_degradation'', ''duration_anomaly'', ''retry_storm'', ''cron_silence'', ''missing_cron'') NOT NULL',
  'SELECT ''011_add_cron_schedule_heartbeat_monitoring: alert_rules.type already supports missing_cron or alert_rules missing'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Missing Cron Alert', 'missing_cron', 'critical', 1, 5, 30, '["telegram"]', 1
WHERE @alert_rules_exists > 0
  AND NOT EXISTS (SELECT 1 FROM alert_rules WHERE type = 'missing_cron' AND name = 'Missing Cron Alert');
