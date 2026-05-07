-- Migration: 005_add_alerting_tables
-- Description: Alert rules, alert lifecycle events, and default observability rules
-- Compatibility: MySQL 8.0+

CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  type ENUM(
    'failed_threshold',
    'warning_threshold',
    'success_rate_degradation',
    'duration_anomaly',
    'retry_storm',
    'cron_silence'
  ) NOT NULL,
  cron_name VARCHAR(255) NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'warning',
  threshold DECIMAL(12, 2) NOT NULL DEFAULT 1,
  timeframe_minutes INT UNSIGNED NOT NULL DEFAULT 5,
  cooldown_minutes INT UNSIGNED NOT NULL DEFAULT 10,
  expected_interval_minutes INT UNSIGNED NULL,
  duration_spike_percent INT UNSIGNED NULL,
  channels JSON NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alert_rules_enabled_type (enabled, type),
  KEY idx_alert_rules_cron_name (cron_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id BIGINT UNSIGNED NOT NULL,
  alert_key VARCHAR(512) NOT NULL,
  cron_name VARCHAR(255) NULL,
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
  KEY idx_alert_events_state_triggered (state, triggered_at),
  KEY idx_alert_events_rule_state (rule_id, state),
  CONSTRAINT fk_alert_events_rule_id
    FOREIGN KEY (rule_id) REFERENCES alert_rules(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Cron failed 3 times within 5 minutes', 'failed_threshold', 'critical', 3, 5, 10, JSON_ARRAY('telegram'), 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Cron failed 3 times within 5 minutes');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Warnings exceed 5 runs within 15 minutes', 'warning_threshold', 'warning', 5, 15, 15, JSON_ARRAY('telegram'), 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Warnings exceed 5 runs within 15 minutes');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Success rate below 80%', 'success_rate_degradation', 'critical', 80, 15, 10, JSON_ARRAY('telegram'), 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Success rate below 80%');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, duration_spike_percent, channels, enabled)
SELECT 'Duration spike over 300%', 'duration_anomaly', 'warning', 300, 15, 20, 300, JSON_ARRAY('telegram'), 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Duration spike over 300%');

INSERT INTO alert_rules
  (name, type, severity, threshold, timeframe_minutes, cooldown_minutes, channels, enabled)
SELECT 'Retry storm detected', 'retry_storm', 'warning', 3, 5, 10, JSON_ARRAY('telegram'), 1
WHERE NOT EXISTS (SELECT 1 FROM alert_rules WHERE name = 'Retry storm detected');
