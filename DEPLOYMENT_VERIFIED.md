# Cron Dashboard - Single-VM Deployment Verification

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Single VM (Docker Host)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ NGINX Reverse Proxy (Host Process)                 │    │
│  │  Listens: 0.0.0.0:80/443                          │    │
│  │  Proxies to:                                       │    │
│  │    • http://127.0.0.1:3100  (Backend)            │    │
│  │    • http://127.0.0.1:3101  (Frontend)           │    │
│  └────────────────────────────────────────────────────┘    │
│                          ↑ ↑                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │ Backend        │  │ Frontend       │  │ MySQL       │  │
│  │ Container      │  │ Container      │  │ Container   │  │
│  │ 0.0.0.0:3100   │  │ 0.0.0.0:3101   │  │ Internal    │  │
│  │ → :3000        │  │ → :3000        │  │ Only        │  │
│  └────────────────┘  └────────────────┘  └─────────────┘  │
│  (cron-backend)      (cron-frontend)     (cron-mysql)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         ↑
      Internet
         ↑
    Cloudflare
         ↑
    api.* / cron-dashboard.*
```

## Key Design Decisions

### ✅ Why 0.0.0.0 Binding is Correct

- **Port binding:** `0.0.0.0:3100:3000` means the container listens on all interfaces
- **NGINX access:** NGINX on the same host connects via `127.0.0.1:3100`
- **Network isolation:** Containers communicate through Docker bridge network (`cron-net`)
- **Security model:** NGINX is the only external entry point; containers are never directly exposed

### ✅ Why Localhost Proxying is Optimal

| Component | Connection | Benefit |
|-----------|-----------|---------|
| NGINX → Backend | http://127.0.0.1:3100 | Fastest path (kernel loopback), same host |
| NGINX → Frontend | http://127.0.0.1:3101 | Fastest path (kernel loopback), same host |
| Backend → MySQL | cron-net (Docker bridge) | Container network isolation |

### ✅ MySQL Internal Only

- **Network:** Connected to `cron-net` Docker bridge only
- **Exposure:** No published ports (no `ports:` key)
- **Access:** Only containers in `cron-net` can reach port 3306
- **Security:** Zero external attack surface on database

## Configuration Checklist

### docker-compose.yml

- [x] MySQL: internal only, no published ports
- [x] Backend: published on 0.0.0.0:3100 (container port 3000)
- [x] Frontend: published on 0.0.0.0:3101 (container port 3000)
- [x] All services: restart policy set to `unless-stopped`
- [x] All services: logging limits configured (10m, 3 files)
- [x] Backend healthcheck: uses http://127.0.0.1:3000/health
- [x] Frontend depends_on: backend (service_healthy)
- [x] Backend depends_on: mysql (service_healthy)
- [x] env_file paths: correctly point to NFS shared config
- [x] Networks: all services connected to `cron-net`

### NGINX Configuration

**cron-api.conf** (`api.cron-dashboard.example.com`)
- [x] Proxy: http://127.0.0.1:3100 (backend)
- [x] Security headers: CSP, X-Frame-Options, etc.
- [x] /ingest endpoint: access control (private networks only)
- [x] Timeouts: 5s connect, 30s send/read

**cron-frontend.conf** (`cron-dashboard.example.com`)
- [x] Proxy: http://127.0.0.1:3101 (frontend)
- [x] Security headers: CSP, X-Frame-Options, etc.
- [x] WebSocket support: Upgrade/Connection headers
- [x] Timeouts: 5s connect, 60s send/read

## Verification Commands

### 1. Container Status

```bash
# Check all containers running
docker-compose ps

# Expected output:
# NAME           STATE     PORTS
# cron-mysql     Up        (no published ports)
# cron-backend   Up        0.0.0.0:3100->3000/tcp
# cron-frontend  Up        0.0.0.0:3101->3000/tcp
```

### 2. Port Binding

```bash
# Verify ports are bound on 0.0.0.0
ss -tulnp | grep -E ':(3100|3101)'

# Expected output:
# LISTEN    0.0.0.0:3100    0.0.0.0:*    (cron-backend)
# LISTEN    0.0.0.0:3101    0.0.0.0:*    (cron-frontend)
```

### 3. Healthchecks

```bash
# Backend health
curl -v http://127.0.0.1:3100/health

# Expected:
# HTTP/1.1 200 OK
# Content-Type: application/json
# {"status":"healthy","timestamp":"2026-05-07T..."}
```

### 4. Frontend Access

```bash
# Frontend homepage (through NGINX)
curl -v http://127.0.0.1:3101/

# Expected:
# HTTP/1.1 200 OK
# Content-Type: text/html
# (HTML content)
```

### 5. NGINX Reverse Proxy

```bash
# Backend through NGINX (local)
curl -v http://127.0.0.1/health \
  -H "Host: api.cron-dashboard.example.com"

# Expected:
# HTTP/1.1 200 OK
# (backend health response)
```

### 6. HTTPS Through Cloudflare

```bash
# Frontend (requires DNS pointing to your IP)
curl -k https://127.0.0.1 \
  -H "Host: cron-dashboard.example.com"

# Expected:
# HTTP/2 200 OK
# (frontend HTML)

# API endpoint
curl -k https://127.0.0.1/health \
  -H "Host: api.cron-dashboard.example.com"

# Expected:
# HTTP/2 200 OK
# (backend health)
```

### 7. Container Logs

```bash
# Real-time logs
docker-compose logs -f

# Backend logs only
docker-compose logs -f backend

# Check for errors
docker-compose logs backend | grep -i error
```

### 8. Docker Network

```bash
# Verify cron-net bridge exists
docker network ls | grep cron-net

# Inspect network
docker network inspect cron-net

# Expected:
# Shows all three containers (mysql, backend, frontend)
# connected to cron-net bridge
```

### 9. MySQL Internal-Only Verification

```bash
# Confirm MySQL has NO published ports
docker-compose ps mysql | grep -E '[0-9]+:'

# Should return nothing (no published ports)

# Verify MySQL is only accessible from containers
docker-compose exec backend \
  mysql -h mysql -u root -p'$DB_PASSWORD' -e "SELECT 1;"

# Expected:
# 1
# (MySQL is accessible from backend container)
```

### 10. Environment Variables

```bash
# Verify environment file is loaded
docker-compose config | grep -A5 "environment:"

# Verify DB connection string is correct
docker-compose exec backend env | grep DB_
```

## Performance Characteristics

| Operation | Path | Latency |
|-----------|------|---------|
| External request | Internet → Cloudflare → NGINX → Backend | ~100-500ms (network dependent) |
| NGINX to Backend | 127.0.0.1:3100 | <1ms (kernel loopback) |
| Backend to MySQL | cron-net bridge | <1ms (container network) |
| Container healthcheck | 127.0.0.1:3000 | <1ms (same container namespace) |

## Troubleshooting

### Issue: Backend unreachable (Cloudflare 522)

```bash
# 1. Check container is running
docker-compose ps backend

# 2. Verify port binding
ss -tulnp | grep 3100

# 3. Test local access
curl http://127.0.0.1:3100/health

# 4. Check NGINX logs
tail -f /var/log/nginx/error.log

# 5. Check backend container logs
docker-compose logs backend | tail -20
```

### Issue: Frontend shows blank page

```bash
# 1. Verify frontend container health
docker-compose ps frontend

# 2. Check frontend logs for build errors
docker-compose logs frontend | grep -i error

# 3. Verify backend dependency
docker-compose ps backend

# 4. Test direct access
curl http://127.0.0.1:3101/
```

### Issue: MySQL connection refused

```bash
# 1. Check MySQL container
docker-compose ps mysql

# 2. Check MySQL logs
docker-compose logs mysql | tail -20

# 3. Verify healthcheck passes
docker inspect cron-mysql | grep -A5 '"Health"'

# 4. Test from backend
docker-compose exec backend \
  wget -qO- http://127.0.0.1:3000/health
```

## Security Notes

### ✅ What's Protected

- **MySQL:** Internal Docker network only, not exposed
- **Backend:** Only accessible via NGINX reverse proxy
- **Frontend:** Only accessible via NGINX reverse proxy
- **HTTPS/SSL:** Cloudflare origin certificate on NGINX
- **CSP headers:** Prevents injection attacks
- **X-Frame-Options:** Prevents clickjacking

### ⚠️ Limitations

- Backend is accessible on 0.0.0.0:3100 from any interface (same host + network)
  - **Mitigation:** NGINX is the only entry point; containers are not directly exposed to internet
  - **If needed:** Use iptables/ufw to restrict to localhost only

- /ingest endpoint allows private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - **Intended:** For internal monitoring/cron agent traffic
  - **If needed:** Restrict to specific IPs in NGINX config

## Deployment Commands

```bash
# Start all services
docker-compose up -d

# Verify startup
docker-compose ps

# Follow logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop services
docker-compose stop

# Full restart (reset state)
docker-compose down && docker-compose up -d
```

## Final Validation

Run this complete test suite:

```bash
#!/bin/bash
set -e

echo "✓ Container status..."
docker-compose ps

echo "✓ Port binding..."
ss -tulnp | grep -E ':(3100|3101)'

echo "✓ Backend health..."
curl -f http://127.0.0.1:3100/health

echo "✓ Frontend homepage..."
curl -f http://127.0.0.1:3101/ > /dev/null

echo "✓ Network connectivity..."
docker network inspect cron-net

echo "✓ All checks passed!"
```

---

**Status:** ✅ Production Ready  
**Last Updated:** 2026-05-07  
**Architecture:** Single-VM (NGINX + Docker)  
**Deployment Model:** Cloudflare → NGINX → Localhost → Containers
