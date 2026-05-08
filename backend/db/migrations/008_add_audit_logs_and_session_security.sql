-- Migration: 008_add_audit_logs_and_session_security
-- Description: Adds append-only operational audit logs and session invalidation fields.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL AFTER last_login_at,
  ADD COLUMN IF NOT EXISTS failed_login_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER locked_until,
  ADD COLUMN IF NOT EXISTS session_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER failed_login_count;

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
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_action_created (action, created_at),
  KEY idx_audit_logs_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
