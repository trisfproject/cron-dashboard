-- Migration: 002_add_time_range_indexes
-- Description: Add indexes for efficient time range queries
-- Created: 2026-05-07

-- Already exists in init.sql but documented here for reference:
-- These indexes ensure optimal performance for time range filtering:
-- - timestamp index: filters by date range (range queries)
-- - composite (cron_name, server, timestamp): filters by job/server + date range
-- - status index: filters by execution status

-- The following statement is idempotent and can be safely re-run:
ALTER TABLE cron_logs ADD INDEX IF NOT EXISTS idx_timestamp_status (timestamp, status);
ALTER TABLE cron_logs ADD INDEX IF NOT EXISTS idx_server_timestamp (server, timestamp);
