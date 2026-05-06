# Cron Dashboard

Production-ready cron monitoring system built as a Dockerized monorepo:

- Backend: Node.js, Fastify, MySQL
- Frontend: Next.js App Router, Tailwind CSS, Recharts
- Infrastructure: Docker Compose with private MySQL networking

## Folder Structure

```text
cron-dashboard/
  package.json
  backend/
    db/
      init.sql
    src/
      config.js
      db.js
      routes.js
      server.js
    Dockerfile
    package.json
  frontend/
    src/
      app/
      components/
      lib/
    Dockerfile
    next.config.mjs
    package.json
    postcss.config.mjs
    tailwind.config.js
  docker-compose.yml
  .env
  .env.example
  README.md
```

## Quick Start

1. Review `.env` and replace the default secrets before production use.
2. Start the stack:

```bash
docker compose up --build
```

3. Open the dashboard:

```text
http://localhost:3000
```

The backend API is available at:

```text
http://localhost:4000
```

MySQL is not exposed on the host. Only the backend can reach it through the Compose network.

## Ingest Cron Logs

`POST /ingest` requires the `x-api-key` header.

```bash
curl -X POST http://localhost:4000/ingest \
  -H "content-type: application/json" \
  -H "x-api-key: change-me-api-key" \
  -d '{
    "cron_name": "daily-backup",
    "command": "/usr/local/bin/backup.sh",
    "server": "worker-01",
    "env": "production",
    "status": 0,
    "duration": 1832,
    "timestamp": "2026-05-06T03:00:00.000Z"
  }'
```

The backend generates a SHA-256 hash from `cron_name`, normalized `timestamp`, and `server`. Duplicate submissions are idempotent and return `duplicate: true`.

## API

### `POST /ingest`

Body:

```json
{
  "cron_name": "daily-backup",
  "command": "/usr/local/bin/backup.sh",
  "server": "worker-01",
  "env": "production",
  "status": 0,
  "duration": 1832,
  "timestamp": "2026-05-06T03:00:00.000Z"
}
```

`status` values:

- `0`: success
- `1`: fail
- `2`: warning

### `GET /stats`

Returns aggregate totals, success rate, failure count, average duration, and a seven-day hourly timeline.

### `GET /cron-list`

Returns cron jobs grouped by `cron_name` and `server`, including last status, average duration, success rate, and total runs.

### `GET /logs`

Query parameters:

- `cron_name`
- `server`
- `status`
- `limit` from 1 to 500, default 100

Example:

```bash
curl "http://localhost:4000/logs?cron_name=daily-backup&server=worker-01&limit=50"
```

## Cron Wrapper Example

Use this pattern from a cron host to capture exit status and duration:

```bash
#!/usr/bin/env bash
set -o pipefail

API_URL="http://your-dashboard.example.com/ingest"
API_KEY="replace-me"
CRON_NAME="daily-backup"
COMMAND="/usr/local/bin/backup.sh"
SERVER="$(hostname)"
ENVIRONMENT="production"
START_MS="$(date +%s%3N)"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"

eval "$COMMAND"
EXIT_CODE=$?
END_MS="$(date +%s%3N)"
DURATION=$((END_MS - START_MS))

STATUS=0
if [ "$EXIT_CODE" -ne 0 ]; then
  STATUS=1
fi

curl -sS -X POST "$API_URL" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{
    \"cron_name\": \"$CRON_NAME\",
    \"command\": \"$COMMAND\",
    \"server\": \"$SERVER\",
    \"env\": \"$ENVIRONMENT\",
    \"status\": $STATUS,
    \"duration\": $DURATION,
    \"timestamp\": \"$TIMESTAMP\"
  }" >/dev/null

exit "$EXIT_CODE"
```

## Database

The `cron_logs` table is created from `backend/db/init.sql`.

Columns:

- `id`
- `cron_name`
- `command`
- `server`
- `env`
- `status`
- `duration`
- `timestamp`
- `hash`
- `created_at`

Indexes:

- `cron_name`
- `timestamp`
- `status`
- unique `hash`
- composite `cron_name`, `server`, `timestamp`

## Production Notes

- Replace every value in `.env` with strong secrets.
- Put the frontend and backend behind a TLS-terminating reverse proxy.
- Keep MySQL private; the Compose file intentionally does not publish port `3306`.
- Use external persistent storage or managed MySQL for production durability.
- Rotate `API_KEY` periodically and distribute it only to trusted cron hosts.
- Scale the backend horizontally when ingest volume grows. The unique hash keeps duplicate writes safe across replicas.
