ALTER TABLE cron_logs
  ADD COLUMN IF NOT EXISTS service_group VARCHAR(120) NOT NULL DEFAULT 'Unassigned' AFTER env,
  ADD INDEX idx_cron_logs_env_service_timestamp (env, service_group, timestamp),
  ADD INDEX idx_cron_logs_service_timestamp (service_group, timestamp);

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS env VARCHAR(80) NULL AFTER cron_name,
  ADD COLUMN IF NOT EXISTS service_group VARCHAR(120) NULL AFTER env,
  ADD INDEX idx_alert_rules_scope (env, service_group, cron_name);

ALTER TABLE alert_events
  ADD COLUMN IF NOT EXISTS env VARCHAR(80) NULL AFTER cron_name,
  ADD COLUMN IF NOT EXISTS service_group VARCHAR(120) NULL AFTER env,
  ADD INDEX idx_alert_events_scope_state (env, service_group, state, triggered_at);
