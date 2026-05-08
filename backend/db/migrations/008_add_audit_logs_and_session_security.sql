-- Migration: 008_add_audit_logs_and_session_security
-- Description: Adds append-only operational audit logs and session invalidation fields.
-- Compatibility: MySQL and MariaDB, including older deployments.
--
-- Authentication installations may already have a users table from an earlier
-- release. Check each column separately to make reruns and partial migrations
-- safe without newer conditional column syntax or column placement.

SET @table_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
);

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'locked_until'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL', 'SELECT ''008_add_audit_logs_and_session_security: locked_until already present or users missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'failed_login_count'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE users ADD COLUMN failed_login_count INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT ''008_add_audit_logs_and_session_security: failed_login_count already present or users missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'session_version'
);
SET @sql = IF(@table_exists > 0 AND @column_exists = 0, 'ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1', 'SELECT ''008_add_audit_logs_and_session_security: session_version already present or users missing''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
