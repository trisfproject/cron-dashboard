CREATE TABLE IF NOT EXISTS cron_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cron_name VARCHAR(255) NOT NULL,
  command TEXT NOT NULL,
  server VARCHAR(255) NOT NULL,
  env VARCHAR(80) NOT NULL,
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
  KEY idx_cron_logs_cron_server_timestamp (cron_name, server, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

