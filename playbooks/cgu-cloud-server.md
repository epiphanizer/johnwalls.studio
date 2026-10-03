# Cloud Server Operations & Deployment Playbook

## System Blueprint: `sh-online-clients` (`cgu`)

- **Host Alias**: `ssh cgu`
- **Hostname**: `sh-online-clients`
- **Public IP**: `136.118.46.53`
- **Infrastructure Provider**: Google Cloud Platform (Compute Engine `e2-standard-2`, `us-central1`)
- **Operational Cost**: ~$40.00 / month
- **Hardware Profile**: 2 vCPUs, 8.0 GB RAM, 25 GB NVMe SSD
- **Operating System**: Debian GNU/Linux 13 (Trixie), Kernel 6.12
- **Reverse Proxy**: Apache 2.4.68 (`mod_proxy`, `mod_ssl`, `mod_rewrite`, `mod_headers`)
- **SSL Engine**: Certbot Let's Encrypt (Automated renewal via `snap.certbot.renew.service`)
- **Database Engine**: MariaDB 11.8.6 (Databases: `career_local`, `sh_online_clients`)
- **User Accounts**:
  - `seanhalls`: Primary operator user with full `sudo` privileges. Accepts SSH key `~/.ssh/epiphanizer`.
  - `sean_halls`: Service account owning `/var/www/cg`, `/var/www/seanhalls`, PM2 processes, and GitHub deployment SSH key.
  - `www-data`: Web server process runner for Apache and PHP-FPM.

---

## 1. Application Inventory & Topology

| Application | Domain | Local Directory | Internal Target | Runtime & Process Manager | Primary Technology |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Creatives Guide Us** | `creativesguide.us`<br>`www.creativesguide.us` | `/var/www/cg` | `http://127.0.0.1:3000` | PM2 (`cgu_master` under user `sean_halls`) | Next.js v16, React, Node.js v20 |
| **John Walls Rocks** | `johnwalls.rocks`<br>`www.johnwalls.rocks` | `/var/www/cg` | `http://127.0.0.1:3000` (`/johnwalls-rocks`) | PM2 (`cgu_master` under user `sean_halls`) | Next.js v16, React, Host-rewritten |
| **John Walls Studio** | `johnwalls.studio`<br>`www.johnwalls.studio` | `/var/www/cg` | `http://127.0.0.1:3000` (`/johnwalls-studio`) | PM2 (`cgu_master` under user `sean_halls`) | Next.js v16, React, Host-rewritten |
| **Appreesh** | `appreesh.org`<br>`www.appreesh.org` | `/var/www/appreesh/appreesh-web` | `http://127.0.0.1:3002` | systemd (`appreesh-web.service`) | Next.js v15, Solana SPL, Framer Motion |
| **Sean Halls Online** | `seanhalls.online`<br>`www.seanhalls.online` | `/var/www/seanhalls` | Static DocumentRoot `/var/www/seanhalls/build` | Apache2 static file serving | React 18 SPA, Webpack, CSS3 |
| **Christian Englander** | `christianenglander.com`<br>`www.christianenglander.com` | `/var/www/england` | `http://127.0.0.1:3003` | systemd (`england.service`) | Node.js Express server |
| **OCC Consulting** | `occ.consulting` | `/var/www/ramone` | Static/PHP DocumentRoot | Apache2 + PHP 8.2-FPM + MariaDB | WordPress, WooCommerce |

---

## 2. Fast-Path Command Reference (`cgu-playbook.sh`)

All operations can be executed from your Mac workstation using the included CLI helper:

```bash
# Diagnostic & Live Health Checks
./scripts/cgu-playbook.sh status       # Server load, RAM, disk, services, ports, SSL certs
./scripts/cgu-playbook.sh health       # Live HTTP probe across all internal ports & public domains

# Deployment Playbooks
./scripts/cgu-playbook.sh deploy cgu        # Deploy Creatives Guide Us (git pull, build, PM2 reload)
./scripts/cgu-playbook.sh deploy appreesh    # Deploy Appreesh (git pull, build, systemctl restart)
./scripts/cgu-playbook.sh deploy seanhalls   # Deploy Sean Halls Online origin (git pull, build, verify)
./scripts/cgu-playbook.sh deploy england     # Deploy Christian Englander (git pull, restart)
./scripts/cgu-playbook.sh deploy all         # Sequentially deploy all 4 web applications

# Process & Service Restarts
./scripts/cgu-playbook.sh restart cgu       # Restart PM2 cgu_master
./scripts/cgu-playbook.sh restart appreesh   # Restart appreesh-web.service
./scripts/cgu-playbook.sh restart apache     # Restart Apache2 web server
./scripts/cgu-playbook.sh restart mariadb    # Restart MariaDB database
./scripts/cgu-playbook.sh restart all        # Restart all application runtimes

# Live Logs & Operations
./scripts/cgu-playbook.sh logs cgu          # Tail PM2 logs for Creatives Guide Us
./scripts/cgu-playbook.sh logs appreesh      # Tail journalctl for Appreesh
./scripts/cgu-playbook.sh logs apache        # Tail Apache error logs
./scripts/cgu-playbook.sh backup             # Dump and compress MariaDB databases to timestamped archive
./scripts/cgu-playbook.sh ssl                # Inspect certbot expiration and run dry-run renewal test
./scripts/cgu-playbook.sh ssh                # Open an interactive SSH shell on the cloud box
```

---

## 3. Detailed Deployment Runbooks

### Runbook A: Deploying Creatives Guide Us (`cgu_master`)

- **Code Location**: `/var/www/cg`
- **Git Branch**: `feature/epic-baseline` (or `main`)
- **Process Manager**: PM2 under user `sean_halls` (zero-downtime cluster reload)

#### Manual Execution Steps:
```bash
ssh cgu
cd /var/www/cg

# 1. Pull latest code using GitHub deploy key
sudo -u sean_halls git pull origin feature/epic-baseline

# 2. Install dependencies (if package.json changed)
sudo -u sean_halls npm install --prefer-offline --no-audit

# 3. Compile production Next.js build
sudo -u sean_halls npm run build

# 4. Zero-downtime PM2 reload
sudo -u sean_halls pm2 reload cgu_master

# 5. Verify local listener and public domain
curl -sI http://127.0.0.1:3000 | head -n 3
curl -sI https://creativesguide.us | head -n 3
```

---

### Runbook B: Deploying Appreesh (`appreesh.org`)

- **Code Location**: `/var/www/appreesh/appreesh-web`
- **Git Branch**: `main`
- **Process Manager**: systemd service `appreesh-web.service` on port `3002`

#### Manual Execution Steps:
```bash
ssh cgu
cd /var/www/appreesh/appreesh-web

# 1. Pull latest code
sudo -u sean_halls git pull origin main

# 2. Install dependencies & build
sudo npm install --prefer-offline --no-audit
sudo npm run build

# 3. Restart systemd service
sudo systemctl restart appreesh-web

# 4. Verify local listener and public domain
curl -sI http://127.0.0.1:3002 | head -n 3
curl -sI https://appreesh.org | head -n 3
```

---

### Runbook C: Deploying Sean Halls Online Origin (`seanhalls.online`)

- **Code Location**: `/var/www/seanhalls`
- **Git Branch**: `master`
- **Serving Mechanism**: Apache2 DocumentRoot `/var/www/seanhalls/build`

#### Manual Execution Steps:
```bash
ssh cgu
cd /var/www/seanhalls

# 1. Pull latest code
sudo -u sean_halls git pull origin master

# 2. Build production React bundle
sudo -u sean_halls npm run build

# 3. Confirm build artifact
test -f /var/www/seanhalls/build/index.html && echo "Build confirmed"

# 4. Reload Apache (graceful)
sudo systemctl reload apache2

# 5. Verify public response
curl -sI https://seanhalls.online | head -n 3
```

---

### Runbook D: Deploying Christian Englander (`christianenglander.com`)

- **Code Location**: `/var/www/england`
- **Git Branch**: `main`
- **Process Manager**: systemd service `england.service` on port `3003`

#### Manual Execution Steps:
```bash
ssh cgu
cd /var/www/england

# 1. Pull latest code
sudo git pull origin main

# 2. Restart systemd unit
sudo systemctl restart england

# 3. Verify local port and domain
curl -sI http://127.0.0.1:3003 | head -n 3
curl -sI https://christianenglander.com | head -n 3
```

---

## 4. Maintenance & Routine Operations

### Database Backups (`MariaDB`)
To generate a compressed, timestamped backup of the production MariaDB databases (`career_local` and `sh_online_clients`):
```bash
./scripts/cgu-playbook.sh backup
```
Backups are archived into `/home/seanhalls/appreesh-backups/mariadb_backup_<timestamp>.sql.gz`. Old backups (>30 days) are pruned automatically.

### SSL Certificate Inspection & Auto-Renewal
Certificates are managed by `certbot` through the Apache plugin. They renew automatically via snap timer. To verify:
```bash
./scripts/cgu-playbook.sh ssl
```

### Disk Space & Journal Log Pruning
To inspect and prune systemd logs if disk space exceeds 80%:
```bash
ssh cgu
# Check disk usage
df -h /
# Clean systemd journals older than 14 days
sudo journalctl --vacuum-time=14d
# Clean npm caches if needed
sudo npm cache clean --force 2>/dev/null || true
```

---

## 5. Security & Network Boundary

1. **Firewall Ingress**:
   - Only TCP ports `22` (SSH), `80` (HTTP -> 301 HTTPS), and `443` (HTTPS) accept inbound connections.
   - Internal ports `3000`, `3002`, `3003`, and `3306` listen strictly on `127.0.0.1`.
2. **Local Fleet DMZ**:
   - `sh_hub` running on your local Mac Studio operates in push/pull mode to Firebase Firestore.
   - The cloud box does not initiate inbound connections into your home or office network.
