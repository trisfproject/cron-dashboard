# Cron Dashboard - Networking Configuration

## Architecture

```
Cloudflare (HTTPS)
    ↓
NGINX Load Balancer (external VM)
    ↓
App Server (this VM)
    ├── Backend Container (0.0.0.0:3100)
    ├── Frontend Container (0.0.0.0:3101)
    └── MySQL (internal only, 127.0.0.1)
```

## Port Mappings

| Service | Host Port | Container Port | Exposure | Access |
|---------|-----------|----------------|----------|--------|
| Backend | 3100 | 3000 | 0.0.0.0 | External LB only |
| Frontend | 3101 | 3000 | 0.0.0.0 | External LB only |
| MySQL | — | 3306 | Internal (cron-net) | Containers only |

## Firewall Rules (Required Security)

### UFW (Ubuntu/Debian)

```bash
# Allow NGINX LB VM (replace with actual LB IP)
ufw allow from 10.0.0.10 to any port 3100 proto tcp
ufw allow from 10.0.0.10 to any port 3101 proto tcp

# Deny public access to application ports (implicit with above)
ufw deny from any to any port 3100 proto tcp
ufw deny from any to any port 3101 proto tcp

# Verify rules
ufw status numbered
```

### iptables (Manual)

```bash
# Flush existing rules for ports 3100-3101 (optional)
iptables -F INPUT

# Allow SSH (critical: do this first!)
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow LB VM only
LB_IP="10.0.0.10"
iptables -A INPUT -p tcp -s $LB_IP --dport 3100 -j ACCEPT
iptables -A INPUT -p tcp -s $LB_IP --dport 3101 -j ACCEPT

# Drop all other traffic to app ports
iptables -A INPUT -p tcp --dport 3100 -j DROP
iptables -A INPUT -p tcp --dport 3101 -j DROP

# Allow loopback (important for system services)
iptables -A INPUT -i lo -j ACCEPT

# Default policy: ACCEPT (avoid lockouts)
iptables -P INPUT ACCEPT

# Save rules (install iptables-persistent first)
iptables-save > /etc/iptables/rules.v4
```

### Cloud Security Groups (AWS/GCP/Azure)

```
Inbound Rules:
├── TCP 22 (SSH): 0.0.0.0/0 (or restrictive CIDR)
├── TCP 3100: LB_VM_SECURITY_GROUP
├── TCP 3101: LB_VM_SECURITY_GROUP
└── TCP 443 (HTTPS): 0.0.0.0/0 (for NGINX LB)

Outbound Rules:
└── All (default)
```

## Verification Commands

### Check port binding

```bash
ss -tulnp | grep -E ':(3100|3101)'
# Output should show:
# LISTEN 0.0.0.0:3100
# LISTEN 0.0.0.0:3101
```

### Test from LB VM

```bash
# Replace APP_IP with actual App VM IP
APP_IP="10.0.0.5"

curl -v http://$APP_IP:3100/health
curl -v http://$APP_IP:3101/

# Expected:
# - 200 OK from /health
# - 200 OK frontend page
```

### Monitor active connections

```bash
# Watch connections to app ports
watch 'netstat -tup | grep -E :(3100|3101)'

# Track NEW connections
tcpdump -n port 3100 or port 3101
```

## MySQL Security (Internal Only)

✅ Correctly bound to **internal Docker network only**
- No external port exposure
- Cannot be accessed from LB VM or public internet
- Only accessible from backend/frontend containers
- Connection string: `mysql://user:pass@mysql:3306/db_name`

## Troubleshooting

### Cloudflare Returns 522 (Connection Timeout)

1. **Check port binding:**
   ```bash
   ss -tulnp | grep -E ':(3100|3101)'
   ```
   Must show `0.0.0.0:3100` and `0.0.0.0:3101`

2. **Verify firewall allows LB:**
   ```bash
   ufw status | grep -E '3100|3101'
   ```

3. **Test LB connectivity:**
   ```bash
   # From LB VM, replace IP with App VM
   nc -zv 10.0.0.5 3100
   curl -v http://10.0.0.5:3100/health
   ```

4. **Check container logs:**
   ```bash
   docker-compose logs backend
   docker-compose logs frontend
   ```

### Containers Cannot Reach Services

**Cause:** Healthcheck uses `127.0.0.1` (correct—containers see themselves as 127.0.0.1)

No action needed. Healthchecks work because:
- Each container's `localhost` (127.0.0.1) = its own network interface
- Cross-container communication uses Docker network (cron-net)
- External access uses 0.0.0.0 binding

## Deployment Checklist

- [ ] Update `docker-compose.yml` with new port mappings (done)
- [ ] Configure firewall rules (ufw/iptables/security groups)
- [ ] Set NGINX LB to forward to `http://APP_IP:3100` and `http://APP_IP:3101`
- [ ] Test connectivity from LB VM: `curl http://APP_IP:3100/health`
- [ ] Verify Cloudflare health checks pass
- [ ] Monitor logs: `docker-compose logs -f`

## References

- Docker Networking: https://docs.docker.com/network/
- UFW Firewall: https://help.ubuntu.com/community/UFW
- iptables Guide: https://www.digitalocean.com/community/tutorials/iptables-essentials-common-firewall-rules-and-commands
