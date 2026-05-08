-- Migration: 010_add_user_soft_delete
-- Description: Adds soft-delete support to users table for audit trail preservation.
-- Adds archived_at field and index for querying active users.

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
    AND COLUMN_NAME = 'archived_at'
);

-- Add archived_at column if it doesn't exist
SET @sql = IF(
  @table_exists > 0 AND @column_exists = 0,
  'ALTER TABLE users ADD COLUMN archived_at TIMESTAMP NULL',
  'SELECT "010_add_user_soft_delete: archived_at already present or users missing"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for active users queries (archived_at IS NULL)
SET @index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'idx_users_archived_at'
);

SET @sql = IF(
  @table_exists > 0 AND @index_exists = 0,
  'ALTER TABLE users ADD INDEX idx_users_archived_at (archived_at, is_active)',
  'SELECT "010_add_user_soft_delete: idx_users_archived_at already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
