-- Migration: 002_add_time_range_indexes
-- Description: Add indexes for efficient time range queries
-- Created: 2026-05-07
-- Compatibility: MySQL 8.0+

-- These indexes ensure optimal performance for time range filtering:
-- - idx_timestamp_status: composite index for range + status queries
-- - idx_server_timestamp: composite index for range + server queries

-- ===========================================================================
-- Index 1: idx_timestamp_status (timestamp, status)
-- ===========================================================================
-- Purpose: Optimizes queries filtering by date range AND status

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND INDEX_NAME = 'idx_timestamp_status'
);

SET @sql = IF(
  @exists = 0,
  'CREATE INDEX idx_timestamp_status ON cron_logs(timestamp, status)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ===========================================================================
-- Index 2: idx_server_timestamp (server, timestamp)
-- ===========================================================================
-- Purpose: Optimizes queries filtering by server AND date range

SET @exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cron_logs'
    AND INDEX_NAME = 'idx_server_timestamp'
);

SET @sql = IF(
  @exists = 0,
  'CREATE INDEX idx_server_timestamp ON cron_logs(server, timestamp)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ===========================================================================
-- Migration Status
-- ===========================================================================
-- This migration is:
-- ✓ Idempotent (safe to run multiple times)
-- ✓ MySQL 8.0+ compatible
-- ✓ Uses INFORMATION_SCHEMA for existence check
-- ✓ Production-safe (no breaking changes)
