#!/usr/bin/env bash
# ==============================================================================
# cgu-playbook.sh — Production Cloud Server Management & Deployment CLI
# Target: sh-online-clients (GCP e2-standard-2 · 136.118.46.53 · ssh cgu)
# ==============================================================================
set -euo pipefail

HOST="${CGU_SSH_HOST:-cgu}"

# ANSI Colors
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

log_info() {
  echo -e "${BLUE}ℹ${RESET} ${BOLD}$1${RESET}"
}

log_success() {
  echo -e "${GREEN}✔${RESET} ${BOLD}$1${RESET}"
}

log_warn() {
  echo -e "${YELLOW}⚠${RESET} ${BOLD}$1${RESET}"
}

log_error() {
  echo -e "${RED}✖${RESET} ${BOLD}$1${RESET}"
}

check_ssh_connection() {
  if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$HOST" "true" 2>/dev/null; then
    log_error "Failed to connect to cloud server '$HOST'. Check your network and ~/.ssh/config."
    exit 1
  fi
}

cmd_status() {
  check_ssh_connection
  echo -e "\n${BOLD}${CYAN}=== CLOUD SERVER STATUS & ASSET DIAGNOSTICS ===${RESET}"
  echo -e "Host: ${BOLD}$HOST (sh-online-clients · 136.118.46.53 · GCP Debian 13)${RESET}\n"

  ssh "$HOST" bash -s << 'EOF'
    set -euo pipefail
    echo "--- 1. SYSTEM HEALTH & RESOURCES ---"
    uptime | sed 's/^/  Uptime: /'
    echo "  RAM:"
    free -h | sed 's/^/    /'
    echo "  Disk Usage:"
    df -h / | tail -n 1 | awk '{printf "    Root Partition: %s used / %s total (%s full, %s free)\n", $3, $2, $5, $4}'

    echo -e "\n--- 2. CORE SYSTEMD SERVICES ---"
    for s in apache2 appreesh-web england mariadb php8.2-fpm; do
      status=$(systemctl is-active "$s" 2>/dev/null || echo "inactive")
      if [ "$status" = "active" ]; then
        echo -e "  \033[0;32m●\033[0m $s: active running"
      else
        echo -e "  \033[0;31m○\033[0m $s: $status"
      fi
    done

    echo -e "\n--- 3. PM2 PROCESSES (Creatives Guide Us) ---"
    sudo -u sean_halls pm2 list 2>/dev/null | grep -E '(cgu_master|online|status)' || echo "  No PM2 processes"

    echo -e "\n--- 4. ACTIVE PORT LISTENERS ---"
    ss -tulpn 2>/dev/null | grep -E ':(80|443|3000|3002|3003|3306) ' | awk '{printf "  Port %-6s -> %s\n", $5, $1}'

    echo -e "\n--- 5. SSL CERTIFICATES EXPIRATION (Certbot) ---"
    sudo certbot certificates 2>/dev/null | grep -E '(Certificate Name|Expiry Date)' | sed 's/^[ \t]*/  /'
EOF
  echo ""
}

cmd_health() {
  check_ssh_connection
  echo -e "\n${BOLD}${CYAN}=== CLOUD SERVER LIVE HTTP/HTTPS ENDPOINT HEALTH ===${RESET}\n"

  echo -e "${BOLD}Local Ports (internal reverse-proxy targets):${RESET}"
  ssh "$HOST" bash -s << 'EOF'
    for port in 3000 3002 3003; do
      code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "http://127.0.0.1:$port" 2>/dev/null || echo "000")
      time=$(curl -s -o /dev/null -w "%{time_total}s" -m 3 "http://127.0.0.1:$port" 2>/dev/null || echo "timeout")
      app="unknown"
      case "$port" in
        3000) app="creativesguide.us (cgu_master Next.js v16)";;
        3002) app="appreesh.org (appreesh-web Next.js v15)";;
        3003) app="christianenglander.com (england Node)";;
      esac
      if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ] || [ "$code" = "304" ]; then
        echo -e "  \033[0;32m✔\033[0m Port $port ($app): HTTP $code ($time)"
      else
        echo -e "  \033[0;31m✖\033[0m Port $port ($app): HTTP $code ($time)"
      fi
    done
EOF

  echo -e "\n${BOLD}Public HTTPS Ingress Endpoints:${RESET}"
  for site in "https://creativesguide.us" "https://appreesh.org" "https://seanhalls.online" "https://christianenglander.com" "https://occ.consulting"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$site" 2>/dev/null || echo "000")
    time=$(curl -s -o /dev/null -w "%{time_total}s" -m 5 "$site" 2>/dev/null || echo "timeout")
    if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
      echo -e "  ${GREEN}✔${RESET} ${BOLD}$site${RESET}: HTTP $code ($time)"
    else
      echo -e "  ${RED}✖${RESET} ${BOLD}$site${RESET}: HTTP $code ($time)"
    fi
  done
  echo ""
}

deploy_cgu() {
  check_ssh_connection
  log_info "Deploying Creatives Guide Us (creativesguide.us) on $HOST..."
  ssh "$HOST" bash -s << 'EOF'
    set -euo pipefail
    cd /var/www/cg
    echo "1. Pulling latest code..."
    sudo -u sean_halls git pull origin feature/epic-baseline || sudo -u sean_halls git pull
    echo "2. Building Next.js production bundle..."
    sudo -u sean_halls npm run build
    echo "3. Zero-downtime PM2 reload..."
    sudo -u sean_halls pm2 reload cgu_master || sudo -u sean_halls pm2 restart cgu_master
    echo "4. Probing local port 3000..."
    sleep 2
    curl -sI http://127.0.0.1:3000 | head -n 1
EOF
  log_success "Creatives Guide Us deployed successfully!"
  cmd_health
}

deploy_appreesh() {
  check_ssh_connection
  log_info "Deploying Appreesh (appreesh.org) on $HOST..."
  ssh "$HOST" bash -s << 'EOF'
    set -euo pipefail
    cd /var/www/appreesh/appreesh-web
    echo "1. Pulling latest code..."
    sudo -u sean_halls git pull origin main || sudo git pull origin main
    echo "2. Building Next.js production bundle..."
    sudo npm run build
    echo "3. Restarting systemd service appreesh-web..."
    sudo systemctl restart appreesh-web
    echo "4. Probing local port 3002..."
    sleep 2
    curl -sI http://127.0.0.1:3002 | head -n 1
EOF
  log_success "Appreesh deployed successfully!"
  cmd_health
}

deploy_seanhalls() {
  check_ssh_connection
  log_info "Deploying Sean Halls Online (seanhalls.online origin) on $HOST..."
  ssh "$HOST" bash -s << 'EOF'
    set -euo pipefail
    cd /var/www/seanhalls
    echo "1. Pulling latest code..."
    sudo -u sean_halls git pull origin master || sudo -u sean_halls git pull
    echo "2. Building React production bundle..."
    sudo -u sean_halls npm run build
    echo "3. Verifying build output..."
    test -f /var/www/seanhalls/build/index.html
    echo "4. Reloading Apache2..."
    sudo systemctl reload apache2
EOF
  log_success "Sean Halls Online origin deployed successfully!"
  cmd_health
}

deploy_england() {
  check_ssh_connection
  log_info "Deploying Christian Englander on $HOST..."
  ssh "$HOST" bash -s << 'EOF'
    set -euo pipefail
    cd /var/www/england
    echo "1. Pulling latest code..."
    sudo git pull origin main
    echo "2. Restarting england service..."
    sudo systemctl restart england
    echo "3. Probing local port 3003..."
    sleep 1
    curl -sI http://127.0.0.1:3003 | head -n 1
EOF
  log_success "Christian Englander deployed successfully!"
  cmd_health
}

cmd_restart() {
  check_ssh_connection
  TARGET="${1:-all}"
  log_info "Restarting service '$TARGET' on $HOST..."
  case "$TARGET" in
    cgu|cgu_master|creativesguideus)
      ssh "$HOST" "sudo -u sean_halls pm2 restart cgu_master"
      log_success "PM2 process cgu_master restarted."
      ;;
    appreesh)
      ssh "$HOST" "sudo systemctl restart appreesh-web"
      log_success "appreesh-web service restarted."
      ;;
    england)
      ssh "$HOST" "sudo systemctl restart england"
      log_success "england service restarted."
      ;;
    apache|apache2)
      ssh "$HOST" "sudo systemctl restart apache2"
      log_success "Apache2 web server restarted."
      ;;
    mariadb|mysql)
      ssh "$HOST" "sudo systemctl restart mariadb"
      log_success "MariaDB database server restarted."
      ;;
    all)
      ssh "$HOST" "sudo -u sean_halls pm2 restart cgu_master && sudo systemctl restart appreesh-web england apache2"
      log_success "All application services and Apache restarted."
      ;;
    *)
      log_error "Unknown restart target: $TARGET. Choose: cgu, appreesh, england, apache, mariadb, all"
      exit 1
      ;;
  esac
  cmd_health
}

cmd_logs() {
  check_ssh_connection
  TARGET="${1:-cgu}"
  LINES="${2:-50}"
  case "$TARGET" in
    cgu|cgu_master)
      ssh -t "$HOST" "sudo -u sean_halls pm2 logs cgu_master --lines $LINES"
      ;;
    appreesh)
      ssh -t "$HOST" "sudo journalctl -u appreesh-web -n $LINES -f"
      ;;
    england)
      ssh -t "$HOST" "sudo journalctl -u england -n $LINES -f"
      ;;
    apache|apache2)
      ssh -t "$HOST" "sudo tail -n $LINES -f /var/log/apache2/error.log"
      ;;
    *)
      log_error "Unknown logs target: $TARGET. Choose: cgu, appreesh, england, apache"
      exit 1
      ;;
  esac
}

cmd_backup() {
  check_ssh_connection
  log_info "Performing cloud database backup on $HOST..."
  ssh "$HOST" bash -s << 'EOF'
    set -euo pipefail
    BACKUP_DIR="/home/seanhalls/appreesh-backups"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    TARGET_FILE="$BACKUP_DIR/mariadb_backup_$TIMESTAMP.sql.gz"
    echo "Dumping MariaDB databases (career_local, sh_online_clients)..."
    sudo mysqldump --databases career_local sh_online_clients | gzip > "$TARGET_FILE"
    echo "Backup completed: $TARGET_FILE ($(du -h "$TARGET_FILE" | awk '{print $1}'))"
    echo "Retaining recent backups (pruning files older than 30 days)..."
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete 2>/dev/null || true
    ls -lh "$BACKUP_DIR" | tail -n 5
EOF
  log_success "Database backup completed successfully!"
}

cmd_ssl() {
  check_ssh_connection
  log_info "Checking and verifying SSL certificates on $HOST..."
  ssh "$HOST" bash -s << 'EOF'
    echo "=== Active Certbot SSL Certificates ==="
    sudo certbot certificates
    echo -e "\n=== Testing Dry-Run Renewal ==="
    sudo certbot renew --dry-run
EOF
  log_success "SSL certificates verification completed!"
}

usage() {
  cat << EOF
${BOLD}cgu-playbook.sh — Production Cloud Server Management CLI${RESET}
Target: ${BOLD}$HOST (sh-online-clients · 136.118.46.53)${RESET}

${BOLD}USAGE:${RESET}
  ./scripts/cgu-playbook.sh <command> [arguments]

${BOLD}COMMANDS:${RESET}
  ${GREEN}status${RESET}                 Display server resource usage, systemd units, PM2 apps, ports, and SSL certs.
  ${GREEN}health${RESET}                 Probe all local application ports (3000, 3002, 3003) and 5 public HTTPS domains.
  ${GREEN}deploy cgu${RESET}             Deploy Creatives Guide Us (git pull, npm build, zero-downtime PM2 reload).
  ${GREEN}deploy appreesh${RESET}        Deploy Appreesh (git pull, npm build, systemctl restart appreesh-web).
  ${GREEN}deploy seanhalls${RESET}       Deploy Sean Halls Online origin (git pull, npm build, verify bundle).
  ${GREEN}deploy england${RESET}         Deploy Christian Englander (git pull, systemctl restart england).
  ${GREEN}deploy all${RESET}             Deploy all applications sequentially with health checks.
  ${GREEN}restart <app>${RESET}          Restart service (cgu | appreesh | england | apache | mariadb | all).
  ${GREEN}logs <app> [lines]${RESET}    Stream live application logs (cgu | appreesh | england | apache).
  ${GREEN}backup${RESET}                 Dump and compress MariaDB databases to timestamped archive.
  ${GREEN}ssl${RESET}                    Inspect certbot certificates and run dry-run renewal test.
  ${GREEN}ssh${RESET}                    Open interactive shell session into the cloud host.

EOF
}

# Main routing
ACTION="${1:-help}"

case "$ACTION" in
  status)
    cmd_status
    ;;
  health)
    cmd_health
    ;;
  deploy)
    SUB="${2:-cgu}"
    case "$SUB" in
      cgu|cgu_master|creativesguideus)
        deploy_cgu
        ;;
      appreesh|appreesh-web)
        deploy_appreesh
        ;;
      seanhalls|seanhalls_online)
        deploy_seanhalls
        ;;
      england)
        deploy_england
        ;;
      all)
        deploy_cgu
        deploy_appreesh
        deploy_seanhalls
        deploy_england
        ;;
      *)
        log_error "Unknown deployment target '$SUB'. Choose: cgu, appreesh, seanhalls, england, all"
        exit 1
        ;;
    esac
    ;;
  restart)
    cmd_restart "${2:-all}"
    ;;
  logs)
    cmd_logs "${2:-cgu}" "${3:-50}"
    ;;
  backup)
    cmd_backup
    ;;
  ssl)
    cmd_ssl
    ;;
  ssh)
    exec ssh "$HOST"
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    log_error "Unknown command '$ACTION'"
    usage
    exit 1
    ;;
esac
