CREATE TABLE IF NOT EXISTS cron_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cron_name VARCHAR(255) NOT NULL,
  command TEXT NOT NULL,
  stdout LONGTEXT NULL,
  stderr LONGTEXT NULL,
  output LONGTEXT NULL,
  warning_messages TEXT NULL,
  exception_trace LONGTEXT NULL,
  retry_logs LONGTEXT NULL,
  timeout_info TEXT NULL,
  server VARCHAR(255) NOT NULL,
  env VARCHAR(80) NOT NULL,
  service_group VARCHAR(120) NOT NULL DEFAULT 'Unassigned',
  status TINYINT NOT NULL,
  duration INT UNSIGNED NOT NULL,
  timestamp DATETIME(3) NOT NULL,
  hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cron_logs_hash (hash),
  KEY idx_cron_logs_cron_name (cron_name),
  KEY idx_cron_logs_timestamp (timestamp),
  KEY idx_cron_logs_status (status),
  KEY idx_cron_logs_cron_server_timestamp (cron_name, server, timestamp),
  KEY idx_cron_logs_env_service_timestamp (env, service_group, timestamp),
  KEY idx_cron_logs_service_timestamp (service_group, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP NULL,
  locked_until TIMESTAMP NULL,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  user_email VARCHAR(255) NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_id VARCHAR(255) NULL,
  target_label VARCHAR(255) NULL,
  ip_address VARCHAR(255) NULL,
  status ENUM('success', 'failed') NOT NULL DEFAULT 'success',
  metadata LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_action_created (action, created_at),
  KEY idx_audit_logs_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  type ENUM(
    'failed_threshold',
    'warning_threshold',
    'success_rate_degradation',
    'duration_anomaly',
    'retry_storm',
    'cron_silence',
    'missing_cron'
  ) NOT NULL,
  cron_name VARCHAR(255) NULL,
  env VARCHAR(80) NULL,
  service_group VARCHAR(120) NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'warning',
  threshold DECIMAL(12, 2) NOT NULL DEFAULT 1,
  timeframe_minutes INT UNSIGNED NOT NULL DEFAULT 5,
  cooldown_minutes INT UNSIGNED NOT NULL DEFAULT 10,
  expected_interval_minutes INT UNSIGNED NULL,
  duration_spike_percent INT UNSIGNED NULL,
  channels LONGTEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alert_rules_enabled_type (enabled, type),
  KEY idx_alert_rules_cron_name (cron_name),
  KEY idx_alert_rules_scope (env, service_group, cron_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id BIGINT UNSIGNED NOT NULL,
  alert_key VARCHAR(512) NOT NULL,
  cron_name VARCHAR(255) NULL,
  env VARCHAR(80) NULL,
  service_group VARCHAR(120) NULL,
  type VARCHAR(80) NOT NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL,
  reason TEXT NOT NULL,
  state ENUM('active', 'acknowledged', 'resolved') NOT NULL DEFAULT 'active',
  triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  last_notified_at TIMESTAMP NULL,
  notification_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_notification_status ENUM('pending', 'success', 'failed', 'skipped') NULL,
  last_notification_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert_events_key (alert_key),
  KEY idx_alert_events_triggered_at (triggered_at),
  KEY idx_alert_events_state_triggered (state, triggered_at),
  KEY idx_alert_events_rule_state (rule_id, state),
  KEY idx_alert_events_scope_state (env, service_group, state, triggered_at),
  CONSTRAINT fk_alert_events_rule_id
    FOREIGN KEY (rule_id) REFERENCES alert_rules(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Cron failed 3 times within 5 minutes', 'failed_threshold', 'critical', 3, 5, 10, '["telegram"]', 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Cron failed 3 times within 5 minutes');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Warnings exceed 5 runs within 15 minutes', 'warning_threshold', 'warning', 5, 15, 15, '["telegram"]', 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Warnings exceed 5 runs within 15 minutes');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Success rate below 80%', 'success_rate_degradation', 'critical', 80, 15, 10, '["telegram"]', 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Success rate below 80%');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, duration_spike_percent, channels, enabled)
SELECT 'Duration spike over 300%', 'duration_anomaly', 'warning', 300, 15, 20, 300, '["telegram"]', 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Duration spike over 300%');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Retry storm detected', 'retry_storm', 'warning', 3, 5, 10, '["telegram"]', 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Retry storm detected');

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

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Missing Cron Alert', 'missing_cron', 'critical', 1, 5, 30, '["telegram"]', 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Missing Cron Alert');
