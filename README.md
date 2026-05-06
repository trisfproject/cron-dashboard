# Cron Dashboard

Production-ready cron monitoring MVP with a Fastify API, Next.js dashboard, Google Cloud SQL for MySQL, Docker Compose, and host-based NGINX reverse proxy configs.

## Folder Structure

```text
cron-dashboard/
  package.json
  backend/
    db/
      init.sql
      migrations/
        001_create_cron_logs.sql
    src/
      config.js
      db.js
      routes.js
      server.js
    Dockerfile
    package.json
  frontend/
    public/
    src/
      app/
      components/
      lib/
    Dockerfile
    jsconfig.json
    next.config.mjs
    package.json
    postcss.config.mjs
    tailwind.config.js
  nginx/
    cron-api.conf
    cron-frontend.conf
  docker-compose.yml
  .env.example
  README.md
```

## Services

- Backend API: Fastify on container port `3000`, bound on host `127.0.0.1:3000`
- Frontend: Next.js on container port `3000`, bound on host `127.0.0.1:3001`
- Database: external Google Cloud SQL for MySQL
- NGINX: host reverse proxy to `127.0.0.1:3000` and `127.0.0.1:3001`

## Runtime Layout

This deployment expects the host to have NFS mounted at:

```text
/mnt/nfs/docker/
```

Project runtime configuration and optional logs live under:

```text
/mnt/nfs/docker/cron-dashboard/
  .env
  logs/
```

Application source code stays in this repository and is built into Docker images from `./backend` and `./frontend`. Do not mount application code from NFS into the containers.

The MySQL data directory is managed by Google Cloud SQL. This Compose stack does not run a local MySQL container and does not mount `/var/lib/mysql`.

## Cloud SQL Connectivity

The backend connects to Cloud SQL using normal MySQL environment variables and a connection pool.

Supported modes:

- Private IP: set `DB_HOST` to the Cloud SQL private IP address.
- Cloud SQL Auth Proxy: run the proxy on the host or as a sidecar reachable from the backend container, then set `DB_HOST` and `DB_PORT` to the proxy endpoint.

For a host-level Cloud SQL Auth Proxy, the Compose file includes `host.docker.internal` mapping for the backend. Set:

```text
DB_HOST=host.docker.internal
DB_PORT=3306
```

Ensure the proxy listener is reachable from Docker’s bridge network and protected by host firewall rules. Do not expose the proxy publicly.

## Quick Start

Create the host directories:

```bash
sudo mkdir -p /mnt/nfs/docker/cron-dashboard/logs
```

Create the runtime environment file outside the source repo:

```bash
sudo cp .env.example /mnt/nfs/docker/cron-dashboard/.env
sudo chmod 600 /mnt/nfs/docker/cron-dashboard/.env
```

Edit `/mnt/nfs/docker/cron-dashboard/.env` and replace every placeholder with a real value generated for your environment, especially `API_KEY`, `MYSQL_USER`, and `MYSQL_PASSWORD`.

Apply the database migration to your Cloud SQL database before ingesting logs:

```bash
mysql \
  -h "$DB_HOST" \
  -P "${DB_PORT:-3306}" \
  -u "$MYSQL_USER" \
  -p"$MYSQL_PASSWORD" \
  "$MYSQL_DATABASE" \
  < backend/db/migrations/001_create_cron_logs.sql
```

Start the stack:

```bash
docker compose up --build
```

Local service checks:

```bash
curl http://127.0.0.1:3000/health
open http://127.0.0.1:3001
```

## NGINX Setup

Copy the generated configs into your NGINX sites directory:

```bash
sudo cp nginx/cron-api.conf /etc/nginx/sites-available/cron-api.conf
sudo cp nginx/cron-frontend.conf /etc/nginx/sites-available/cron-frontend.conf
sudo ln -s /etc/nginx/sites-available/cron-api.conf /etc/nginx/sites-enabled/cron-api.conf
sudo ln -s /etc/nginx/sites-available/cron-frontend.conf /etc/nginx/sites-enabled/cron-frontend.conf
```

Edit the `server_name` values:

```text
api.cron-dashboard.example.com
cron-dashboard.example.com
```

Point DNS records for those domains to the host running Docker and NGINX.

Validate and reload NGINX:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

For TLS, install certificates with your preferred tool, for example Certbot:

```bash
sudo certbot --nginx -d api.cron-dashboard.example.com -d cron-dashboard.example.com
```

## Security Model

- `POST /ingest` requires `x-api-key`.
- `nginx/cron-api.conf` restricts `/ingest` to private/internal IP ranges by default.
- Backend and frontend bind only to localhost on the Docker host.
- Database credentials are only loaded into the backend container from `/mnt/nfs/docker/cron-dashboard/.env`.
- The frontend container does not receive database credentials.
- NGINX configs include proxy headers, security headers, request size limits, and timeout settings.

Update the `allow` rules in `nginx/cron-api.conf` to match the real CIDRs used by your cron servers.

## API

### `POST /ingest`

```bash
curl -X POST https://api.cron-dashboard.example.com/ingest \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
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

`status` values:

- `0`: success
- `1`: fail
- `2`: warning

The API generates a SHA-256 hash from `cron_name`, normalized `timestamp`, and `server`. Duplicate submissions return `duplicate: true` instead of creating another row.

### `GET /stats`

Returns total jobs, run counts, success rate, failed count, warning count, average duration, and a seven-day hourly timeline.

### `GET /cron-list`

Returns cron jobs grouped by `cron_name` and `server`, including last status, last run, average duration, success rate, and total runs.

### `GET /logs`

Filters:

- `cron_name`
- `server`
- `status`
- `limit`, from `1` to `500`

Example:

```bash
curl "https://api.cron-dashboard.example.com/logs?cron_name=daily-backup&server=worker-01&limit=50"
```

## Database

Migration file:

```text
backend/db/migrations/001_create_cron_logs.sql
```

`backend/db/init.sql` is kept for local/manual initialization compatibility, but Docker Compose no longer starts a MySQL container.

Table: `cron_logs`

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

## Cron Wrapper Example

```bash
#!/usr/bin/env bash
set -o pipefail

API_URL="https://api.cron-dashboard.example.com/ingest"
API_KEY="${API_KEY:?API_KEY is required}"
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

## Production Notes

- Keep `/mnt/nfs/docker/cron-dashboard/.env` out of source control and rotate `API_KEY` periodically.
- Use Cloud SQL automated backups and point-in-time recovery for production data.
- Keep Cloud SQL private IP or Cloud SQL Auth Proxy access restricted to trusted hosts and networks.
- Adjust NGINX `server_name`, TLS, and `/ingest` CIDR allowlists before going live.
- Scale backend replicas behind a local load balancer if ingest volume grows; the unique hash keeps duplicate writes idempotent.
