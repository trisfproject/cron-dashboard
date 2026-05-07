# Cron Dashboard — Time Range Filter Implementation

## Overview

The time range filter feature enables users to dynamically analyze cron job metrics across different time periods. Users can switch between predefined ranges (Today, 7D, 30D, Quarter, Year) to view:

- Summary statistics (success rate, failed count, average duration)
- Timeline charts (with adaptive grouping)
- Recent logs (filtered by date range)

---

## Architecture

### Components

```
Dashboard (page.jsx) — Client Component
  ├── TimeRangeFilter — UI Control
  ├── MetricCard — Summary Statistics
  ├── TimelineChart — Aggregated Timeline
  └── LogsTable — Recent Logs

Backend Routes
  ├── /stats?range=7d — Summary + Timeline
  ├── /logs?range=7d — Filtered Logs
  └── /cron-list — Job List (optional)

Utilities
  └── range-filter.js — Date Range Helpers
```

---

## Backend Implementation

### 1. Range Filter Utility (`backend/src/utils/range-filter.js`)

Provides date range calculation and timeline aggregation logic:

```javascript
// Date range calculation
buildDateWhereClause(range)  // Returns: timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL X DAY)

// Timeline grouping (adaptive)
getTimelineGroupFormat(range)  // Returns: MySQL DATE_FORMAT pattern
  // today / 7d  → '%Y-%m-%d %H:00:00'  (hourly)
  // 30d / quarter → '%Y-%m-%d'         (daily)
  // year        → '%Y-%m-01'          (monthly)

// Validation
isValidRange(range)     // true if range in ['today', '7d', '30d', 'quarter', 'year']
getDefaultRange()       // Returns: '7d'
```

### 2. Updated `/stats` Endpoint

**Query Parameters:**
```
GET /stats?range=7d
```

**Valid ranges:** `today`, `7d`, `30d`, `quarter`, `year` (default: `7d`)

**Response:**
```json
{
  "summary": {
    "total_runs": 1250,
    "total_jobs": 42,
    "success_count": 1225,
    "failed_count": 15,
    "warning_count": 10,
    "average_duration": 2.5,
    "success_rate": 98.0
  },
  "timeline": [
    {
      "bucket": "2026-05-07 10:00:00",
      "total": 180,
      "success": 175,
      "failed": 3,
      "warning": 2,
      "average_duration": 2.3
    }
    // ... more buckets
  ],
  "range": "7d"
}
```

**SQL Logic:**
- Summary applies date filter to all aggregate functions
- Timeline groups by adaptive format based on range
- Default: last 7 days, hourly grouping

### 3. Updated `/logs` Endpoint

**Query Parameters:**
```
GET /logs?range=7d&cron_name=backup&limit=50
```

**Valid ranges:** `today`, `7d`, `30d`, `quarter`, `year` (default: `7d`)  
**Limit:** 1-500 (default: 50, reduced from 100 for better performance)

**Response:**
```json
{
  "logs": [
    {
      "id": 12345,
      "cron_name": "backup-database",
      "command": "/opt/backup.sh",
      "server": "production-01",
      "env": "prod",
      "status": 0,
      "duration": 125,
      "timestamp": "2026-05-07 14:30:22.123",
      "hash": "abc123...",
      "created_at": "2026-05-07 14:30:30"
    }
    // ... more logs
  ]
}
```

**SQL Logic:**
- Combines date range filter with existing filters (cron_name, server, status)
- Orders by timestamp DESC
- Limited to 50 rows (configurable, max 500)

---

## Frontend Implementation

### 1. API Layer (`frontend/src/lib/api.js`)

Updated functions to accept range parameter:

```javascript
// Now accepts params object
getStats({ range: '7d' })
getLogs({ range: '7d', cron_name: 'backup', limit: 50 })

// URL generation
/stats?range=7d
/logs?range=30d&cron_name=backup
```

### 2. Time Range Filter Component (`frontend/src/components/TimeRangeFilter.jsx`)

**Props:**
- `selectedRange` (string) — current range
- `onRangeChange` (function) — callback on selection

**UI:**
- Button group: [T] [7D] [30D] [Q] [Y]
- Selected: blue background
- Unselected: light gray background
- Icons: Calendar icon prefix

**Usage:**
```jsx
<TimeRangeFilter 
  selectedRange={range} 
  onRangeChange={setRange} 
/>
```

### 3. Dashboard Page (`frontend/src/app/page.jsx`)

**Changes:**
- Converted to client component ('use client')
- State management: `range`, `stats`, `logs`, `loading`
- Effect hook: fetches data when range changes
- Renders TimeRangeFilter in header
- Dynamic description based on range

**Features:**
- URL query parameter support: `/?range=30d`
- Loading state: shows "Loading dashboard..."
- Error handling: logs errors, doesn't crash
- Descriptions update based on selected range

---

## Database Optimization

### Migration: `backend/db/migrations/002_add_time_range_indexes.sql`

Ensures efficient range queries:

```sql
ALTER TABLE cron_logs ADD INDEX idx_timestamp_status (timestamp, status);
ALTER TABLE cron_logs ADD INDEX idx_server_timestamp (server, timestamp);
```

**Existing Indexes (from init.sql):**
- `idx_cron_logs_timestamp` — Primary range filter
- `idx_cron_logs_cron_server_timestamp` — Composite for job + date range
- `idx_cron_logs_status` — Status filtering
- `uq_cron_logs_hash` — Deduplication

---

## Range Mapping Reference

| Range | Duration | Timeline Grouping | Use Case |
|-------|----------|-------------------|----------|
| **today** | 1 day | Hourly | Detailed daily monitoring |
| **7d** | 7 days | Hourly | Default weekly view |
| **30d** | 30 days | Daily | Monthly trend analysis |
| **quarter** | 90 days | Daily | Quarterly performance |
| **year** | 365 days | Monthly | Annual trend & SLA |

---

## SQL Query Examples

### Daily Summary (Last 7 Days)

```sql
SELECT
  COUNT(*) AS total_runs,
  SUM(status = 0) AS success_count,
  ROUND((SUM(status = 0) / COUNT(*)) * 100, 2) AS success_rate,
  AVG(duration) AS average_duration
FROM cron_logs
WHERE timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY);
```

### Hourly Timeline (Last 7 Days)

```sql
SELECT
  DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') AS bucket,
  COUNT(*) AS total,
  SUM(status = 0) AS success
FROM cron_logs
WHERE timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY bucket
ORDER BY bucket ASC;
```

### Monthly Timeline (Last Year)

```sql
SELECT
  DATE_FORMAT(timestamp, '%Y-%m-01') AS bucket,
  COUNT(*) AS total,
  SUM(status = 0) AS success
FROM cron_logs
WHERE timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 365 DAY)
GROUP BY bucket
ORDER BY bucket ASC;
```

---

## Testing Guide

### Backend API Tests

```bash
# Test /stats endpoint with different ranges
curl "http://127.0.0.1:3000/stats?range=today"
curl "http://127.0.0.1:3000/stats?range=7d"
curl "http://127.0.0.1:3000/stats?range=30d"
curl "http://127.0.0.1:3000/stats?range=quarter"
curl "http://127.0.0.1:3000/stats?range=year"

# Test /logs endpoint with range + filters
curl "http://127.0.0.1:3000/logs?range=7d&limit=20"
curl "http://127.0.0.1:3000/logs?range=30d&status=1"  # Failed only
curl "http://127.0.0.1:3000/logs?range=quarter&cron_name=backup"

# Invalid range (should default to 7d)
curl "http://127.0.0.1:3000/stats?range=invalid"
```

### Frontend Testing

```bash
# Test with different URL parameters
http://localhost:3101/?range=today
http://localhost:3101/?range=7d
http://localhost:3101/?range=30d
http://localhost:3101/?range=quarter
http://localhost:3101/?range=year

# Default (no param) should use 7d
http://localhost:3101/
```

### Performance Benchmarks

**Expected query times (with indexes):**
- Summary (7d): ~50-100ms
- Timeline (30d): ~100-150ms
- Logs (50 rows): ~30-50ms

**Monitor with:**
```bash
docker-compose logs -f backend | grep -i "error\|slow"
```

---

## Future Enhancements

### 1. Custom Date Range
```
GET /stats?startDate=2026-05-01&endDate=2026-05-07
```

### 2. Service/Server Filters
```
GET /stats?range=7d&service=im3&server=oms-webadmin
```

### 3. Status Filter
```
GET /logs?range=7d&status=1  // Failed only
```

### 4. Auto Refresh
- Refresh stats every 30-60 seconds
- Use React hooks: `setInterval` in `useEffect`

### 5. Live Mode
- WebSocket updates: `ws://localhost:3000/live?range=7d`
- Real-time stats streaming

### 6. Failure Heatmap
- Visualize failures by hour of day
- Identify recurring issues

### 7. SLA Dashboard
- Track uptime percentage
- Alert thresholds
- Service level agreements

---

## Configuration Reference

### Default Values

| Setting | Value | Note |
|---------|-------|------|
| Default Range | 7d | Used if not specified |
| Max Logs per Query | 500 | API limit |
| Default Logs Returned | 50 | Reduced for performance |
| Revalidation Time | 15s | Next.js ISR |
| API Timeout | 5s | Connection timeout |

### Environment Variables

```bash
# Frontend
INTERNAL_API_URL=http://127.0.0.1:3000  # Backend URL

# Backend
PORT=3000
DB_HOST=mysql
DB_PORT=3306
NODE_ENV=production
TZ=Asia/Jakarta
```

---

## Troubleshooting

### Issue: Slow queries on large datasets

**Solution:**
- Verify indexes are created: `SHOW INDEX FROM cron_logs;`
- Run migration: `mysql < backend/db/migrations/002_add_time_range_indexes.sql`
- Reduce retention (archive old logs)

### Issue: No data shown for selected range

**Solution:**
- Check backend logs: `docker-compose logs backend`
- Verify database has data: `SELECT COUNT(*) FROM cron_logs;`
- Test with `curl "http://127.0.0.1:3000/stats?range=7d"`

### Issue: Frontend stuck on loading

**Solution:**
- Check browser console for errors
- Verify backend is accessible: `curl http://127.0.0.1:3000/health`
- Check NGINX logs: `docker-compose logs nginx`

### Issue: Range parameter not working

**Solution:**
- Clear browser cache: Ctrl+Shift+Delete
- Check URL: Should be `/?range=30d` (not `/30d`)
- Verify backend accepts range: `curl -v "http://127.0.0.1:3000/stats?range=30d"`

---

## Deployment Checklist

- [x] Database migration created
- [x] Backend /stats endpoint updated with range support
- [x] Backend /logs endpoint updated with range support
- [x] Range filter utility implemented
- [x] Frontend API functions updated
- [x] TimeRangeFilter component created
- [x] Dashboard page updated to use filter
- [ ] Deploy to production
- [ ] Monitor performance
- [ ] Collect user feedback
- [ ] Plan next enhancements

---

## Performance Notes

**Query Optimization:**
- All queries use indexed timestamp column
- Timeline grouping done in SQL (not application)
- Logs limited to 50 rows by default
- Revalidation set to 15s (ISR)

**Estimated Performance:**
- Dashboard load: 200-400ms
- Range filter change: 500-800ms (client-side fetch)
- API response time: 50-150ms

---

**Implementation Complete ✅**  
**Date:** 2026-05-07  
**Status:** Production Ready
